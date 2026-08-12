/* ---------------------------------------------------------------------------
 * store/taxa.js — the browser-side columnar taxon store.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every sample used to be held as two arrays of plain row objects: `fullData`
 * (the whole parsed report) and `data` (the filtered view). A dense metagenome
 * report is ~30k rows; a row object with ten fields costs roughly 300-400 bytes
 * once you count the object header, the hidden class, and the fact that every
 * row carried its own copy of the taxon name and lineage string. Multiply by
 * two arrays and by every barcode in the run and you are at a gigabyte before
 * any chart has drawn a pixel.
 *
 * THE SHAPE NOW
 * -------------
 * Immutable per-taxon attributes (taxid, rank, depth, name, lineage, parent)
 * are interned ONCE per run in a dictionary, because they are identical across
 * every sample classified against the same database. Mutable per-sample
 * attributes (clade count, assigned count, percent) live in three Int32Arrays
 * indexed by dictionary position.
 *
 *   dictionary:  ~30k entries, ~3 MB, shared by every sample
 *   per sample:  3 x Int32Array + 1 x Uint8Array over the dict  ≈ 400 KB
 *
 * A 24-barcode run is therefore ~13 MB of taxon data instead of ~1 GB, and it
 * does not grow when a new fastq lands — the numbers in the arrays just change.
 *
 * REACTIVITY
 * ----------
 * None of the bulk data is reactive, and it must never become reactive: Vue 2
 * walks every object it is handed and installs a getter/setter pair plus a Dep
 * per key. Instead this module exposes a tiny reactive surface — a per-sample
 * version counter and a global tick — and components recompute from it. Row
 * objects are materialised only for what is actually about to be drawn, and
 * cached against the sample's version so repeated reads are free.
 *
 * Wire format is produced by server/taxonstore.mjs; keep the two in sync.
 * ------------------------------------------------------------------------- */

import Vue from 'vue'

// Hydrated-row cache budget. Generous enough that every visible panel stays
// warm, small enough that it can never become the memory problem it replaced.
const MAX_CACHED_ROWS = 60000

class TaxaStore {
  constructor() {
    // ---- reactive surface (small scalars only) ----------------------------
    // `tick` bumps on every applied frame; `samples` holds per-sample scalars.
    // Components watch these, then pull bulk data through the plain methods
    // below. Nothing here ever holds a taxon row.
    this.state = Vue.observable({
      tick: 0,
      run: null,
      dictSize: 0,
      samples: {}   // name -> { ver, total, count }
    })

    // ---- non-reactive bulk storage ---------------------------------------
    this.dict = {
      byTaxid: new Map(),
      taxid: [],
      rank: [],
      depth: [],
      name: [],
      lineage: [],
      parent: [],
      size: 0
    }
    this.tables = new Map()   // sample -> { clade, assigned, pct, present, cap, total, count, ver }

    // query cache: `${sample}|${ver}|${queryKey}` -> rows
    this._cache = new Map()
    this._cacheRows = 0
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  // Drop everything. Called when the selected run changes — the server resets
  // its delta cursors at the same moment, so the two stay in lockstep.
  reset(run) {
    this.dict = {
      byTaxid: new Map(), taxid: [], rank: [], depth: [],
      name: [], lineage: [], parent: [], size: 0
    }
    this.tables = new Map()
    this._cache = new Map()
    this._cacheRows = 0
    this.state.run = run || null
    this.state.dictSize = 0
    Vue.set(this.state, 'samples', {})
    this.state.tick += 1
  }

  dropSample(sample) {
    this.tables.delete(sample)
    Vue.delete(this.state.samples, sample)
    this._invalidate(sample)
    this.state.tick += 1
  }

  // -------------------------------------------------------------------------
  // Frame application
  // -------------------------------------------------------------------------

  // Apply one `mtx:frame`. Returns true if anything taxon-related changed, so
  // the caller can decide whether a redraw is warranted.
  applyFrame(frame) {
    if (!frame) return false
    if (frame.reset) this.reset(frame.run)
    let changed = false

    if (frame.dict && frame.dict.length) {
      this._applyDict(frame.dict)
      changed = true
    }
    if (frame.taxa && frame.taxa.length) {
      for (const section of frame.taxa) {
        if (this._applyTaxa(section)) changed = true
      }
    }
    if (changed) this.state.tick += 1
    return changed
  }

  // Dictionary entries arrive as flat 7-tuples:
  //   [ idx, taxid, rank, depth, parentIdx, name, lineage ]
  _applyDict(flat) {
    const d = this.dict
    for (let i = 0; i < flat.length; i += 7) {
      const idx = flat[i]
      d.taxid[idx] = flat[i + 1]
      d.rank[idx] = flat[i + 2]
      d.depth[idx] = flat[i + 3]
      d.parent[idx] = flat[i + 4]
      d.name[idx] = flat[i + 5]
      d.lineage[idx] = flat[i + 6]
      d.byTaxid.set(flat[i + 1], idx)
      if (idx + 1 > d.size) d.size = idx + 1
    }
    this.state.dictSize = d.size
  }

  _table(sample) {
    let t = this.tables.get(sample)
    if (!t) {
      const cap = Math.max(1024, this.dict.size)
      t = {
        cap,
        clade: new Int32Array(cap),
        assigned: new Int32Array(cap),
        pct: new Int32Array(cap),
        present: new Uint8Array(cap),
        idx: [],        // dense list of present dict indices, kept sorted-ish
        total: 0,
        count: 0,
        ver: 0
      }
      this.tables.set(sample, t)
    }
    if (t.cap < this.dict.size) this._growTable(t, this.dict.size)
    return t
  }

  _growTable(t, minCap) {
    let cap = t.cap
    while (cap < minCap) cap *= 2
    const clade = new Int32Array(cap)
    const assigned = new Int32Array(cap)
    const pct = new Int32Array(cap)
    const present = new Uint8Array(cap)
    clade.set(t.clade); assigned.set(t.assigned); pct.set(t.pct); present.set(t.present)
    t.clade = clade; t.assigned = assigned; t.pct = pct; t.present = present
    t.cap = cap
  }

  // A taxon section: { sample, full, ver, total, count, upd: [idx,clade,assigned,pct,...], del: [idx,...] }
  _applyTaxa(section) {
    if (!section || !section.sample) return false
    const t = this._table(section.sample)

    // A `full` section is authoritative: anything not mentioned is gone. This
    // is what a client that fell behind, or newly focused a sample, receives.
    if (section.full) {
      t.present.fill(0)
      t.idx = []
      t.count = 0
    }

    const upd = section.upd || []
    for (let i = 0; i < upd.length; i += 4) {
      const idx = upd[i]
      if (idx >= t.cap) this._growTable(t, idx + 1)
      if (!t.present[idx]) { t.present[idx] = 1; t.idx.push(idx); t.count += 1 }
      t.clade[idx] = upd[i + 1]
      t.assigned[idx] = upd[i + 2]
      t.pct[idx] = upd[i + 3]
    }

    const del = section.del || []
    if (del.length) {
      const gone = new Set(del)
      for (const idx of del) {
        if (t.present[idx]) { t.present[idx] = 0; t.count -= 1 }
        t.clade[idx] = 0; t.assigned[idx] = 0; t.pct[idx] = 0
      }
      t.idx = t.idx.filter((i) => !gone.has(i))
    }

    t.total = section.total || t.total
    t.ver = section.ver || (t.ver + 1)

    Vue.set(this.state.samples, section.sample, {
      ver: t.ver,
      total: t.total,
      count: t.count
    })
    this._invalidate(section.sample)
    return true
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  hasSample(sample) { return this.tables.has(sample) }

  // Does this sample report this taxon? Answered from the dictionary index and
  // the presence bitmap, so linked zoom can ask it for every loaded sample
  // without hydrating a single row.
  hasTaxon(sample, taxid) {
    const t = this.tables.get(sample)
    if (!t || taxid == null) return false
    const idx = this.dict.byTaxid.get(String(taxid))
    if (idx === undefined) return false
    return !!t.present[idx]
  }
  sampleNames() { return Array.from(this.tables.keys()) }
  version(sample) { const t = this.tables.get(sample); return t ? t.ver : 0 }
  total(sample) { const t = this.tables.get(sample); return t ? t.total : 0 }
  count(sample) { const t = this.tables.get(sample); return t ? t.count : 0 }

  // Materialise ONE row. This is the only place a taxon row object is created,
  // and the shape deliberately matches what the old d3 code consumed so the
  // chart internals did not have to be rewritten around a new field naming.
  row(sample, idx) {
    const t = this.tables.get(sample)
    if (!t || !t.present[idx]) return null
    const d = this.dict
    const parentIdx = d.parent[idx]
    return {
      taxid: d.taxid[idx],
      target: d.name[idx],
      rank_code: d.rank[idx],
      depth: d.depth[idx],
      value: t.pct[idx] / 100,
      num_fragments_clade: t.clade[idx],
      num_fragments_assigned: t.assigned[idx],
      full: d.lineage[idx] ? `${d.taxid[idx]} ${d.lineage[idx]}` : `${d.taxid[idx]} ${d.name[idx]}`,
      objfull: null,
      source: parentIdx >= 0 ? d.name[parentIdx] : null,
      parenttaxid: parentIdx >= 0 ? d.taxid[parentIdx] : null,
      _idx: idx
    }
  }

  /* -------------------------------------------------------------------------
   * query() — the workhorse.
   *
   * Filters over typed arrays (no allocation), sorts an index array (numbers
   * only), and hydrates ONLY the slice that survives the limit. Asking for the
   * top 20 genera out of a 30k-row report allocates 20 objects, not 30k.
   *
   * opts:
   *   ranks       Set/array of rank codes to keep (omit = all)
   *   minPercent  minimum percent (0-100)
   *   depthRange  [lo, hi] indentation depth bounds
   *   search      case-insensitive substring on the taxon name
   *   sort        'clade' (default) | 'assigned' | 'pct' | 'name'
   *   limit       max rows returned (default 500)
   *   offset      rows to skip after sorting (for pagination)
   * ---------------------------------------------------------------------- */
  query(sample, opts) {
    const t = this.tables.get(sample)
    if (!t) return []
    const o = opts || {}
    const key = this._queryKey(o)
    const cacheKey = `${sample}|${t.ver}|${key}`
    const hit = this._cache.get(cacheKey)
    if (hit) return hit

    const d = this.dict
    const ranks = o.ranks ? (o.ranks instanceof Set ? o.ranks : new Set(o.ranks)) : null
    const lo = o.depthRange ? o.depthRange[0] : -Infinity
    const hi = o.depthRange ? o.depthRange[1] : Infinity
    const minPct = (o.minPercent || 0)
    const search = o.search ? String(o.search).toLowerCase() : null

    // Pass 1: filter to a plain array of dict indices. Numbers only.
    const keep = []
    for (let n = 0; n < t.idx.length; n++) {
      const idx = t.idx[n]
      if (!t.present[idx]) continue
      if (ranks && !ranks.has(d.rank[idx])) continue
      const depth = d.depth[idx]
      if (depth < lo || depth > hi) continue
      if (t.pct[idx] / 100 < minPct) continue
      if (search) {
        const name = d.name[idx]
        if (!name || name.toLowerCase().indexOf(search) === -1) continue
      }
      keep.push(idx)
    }

    // Pass 2: sort the index array.
    const sort = o.sort || 'clade'
    if (sort === 'name') keep.sort((a, b) => String(d.name[a]).localeCompare(String(d.name[b])))
    else if (sort === 'assigned') keep.sort((a, b) => t.assigned[b] - t.assigned[a])
    else if (sort === 'pct') keep.sort((a, b) => t.pct[b] - t.pct[a])
    else keep.sort((a, b) => t.clade[b] - t.clade[a])

    // Pass 3: hydrate only the requested window.
    const offset = o.offset || 0
    const limit = o.limit === undefined ? 500 : o.limit
    const slice = limit === null ? keep.slice(offset) : keep.slice(offset, offset + limit)
    const rows = slice.map((idx) => this.row(sample, idx))

    this._remember(cacheKey, rows)
    return rows
  }

  // Number of rows a query WOULD return, without hydrating any of them. Used
  // for pagination counts and "N taxa" badges.
  countMatching(sample, opts) {
    const t = this.tables.get(sample)
    if (!t) return 0
    const o = opts || {}
    const d = this.dict
    const ranks = o.ranks ? (o.ranks instanceof Set ? o.ranks : new Set(o.ranks)) : null
    const lo = o.depthRange ? o.depthRange[0] : -Infinity
    const hi = o.depthRange ? o.depthRange[1] : Infinity
    const minPct = (o.minPercent || 0)
    const search = o.search ? String(o.search).toLowerCase() : null
    let n = 0
    for (let i = 0; i < t.idx.length; i++) {
      const idx = t.idx[i]
      if (!t.present[idx]) continue
      if (ranks && !ranks.has(d.rank[idx])) continue
      const depth = d.depth[idx]
      if (depth < lo || depth > hi) continue
      if (t.pct[idx] / 100 < minPct) continue
      if (search && String(d.name[idx] || '').toLowerCase().indexOf(search) === -1) continue
      n++
    }
    return n
  }

  // Every rank code present across the loaded samples, in taxonomic order.
  ranksPresent() {
    const present = new Set()
    const d = this.dict
    for (const t of this.tables.values()) {
      for (let i = 0; i < t.idx.length; i++) {
        const idx = t.idx[i]
        if (t.present[idx]) present.add(d.rank[idx])
      }
    }
    return sortRankCodes(Array.from(present))
  }

  // Hierarchy for a sunburst/sankey: a nested tree built from the dictionary's
  // parent pointers, pruned to `maxNodes` by clade count. Building this from
  // the columnar store means the tree is created on demand for ONE sample
  // rather than being permanently resident for all of them.
  hierarchy(sample, opts) {
    const t = this.tables.get(sample)
    if (!t) return null
    const o = opts || {}
    const maxNodes = o.maxNodes || 2000
    const d = this.dict

    const ranked = t.idx.filter((i) => t.present[i]).sort((a, b) => t.clade[b] - t.clade[a])
    const keep = new Set(ranked.slice(0, maxNodes))
    // Pull in ancestors so the tree stays connected.
    for (const idx of Array.from(keep)) {
      let p = d.parent[idx]
      while (p >= 0 && !keep.has(p)) { keep.add(p); p = d.parent[p] }
    }

    const nodes = new Map()
    for (const idx of keep) {
      nodes.set(idx, {
        taxid: d.taxid[idx],
        name: d.name[idx],
        rank_code: d.rank[idx],
        depth: d.depth[idx],
        value: t.clade[idx],
        assigned: t.assigned[idx],
        pct: t.pct[idx] / 100,
        children: []
      })
    }
    const roots = []
    for (const idx of keep) {
      const node = nodes.get(idx)
      const p = d.parent[idx]
      if (p >= 0 && nodes.has(p)) nodes.get(p).children.push(node)
      else roots.push(node)
    }
    if (roots.length === 1) return roots[0]
    return { taxid: -1, name: sample, rank_code: 'R', depth: -1, value: t.total, assigned: 0, pct: 100, children: roots }
  }

  // -------------------------------------------------------------------------
  // Local (non-server) ingestion: drag-and-dropped or demo kraken2 reports.
  // Parsed with exactly the same rules the server uses so uploads and live
  // samples are indistinguishable downstream.
  // -------------------------------------------------------------------------
  ingestReport(sample, text) {
    if (!text || typeof text !== 'string') return false
    const d = this.dict
    const lastAtDepth = []
    const upd = []
    let total = 0

    for (const rawLine of text.split('\n')) {
      const line = rawLine.charCodeAt(rawLine.length - 1) === 13 ? rawLine.slice(0, -1) : rawLine
      if (!line) continue
      const parts = line.split('\t')
      if (parts.length < 6) continue

      const pct = Math.round(parseFloat(parts[0]) * 100) || 0
      const clade = parseInt(parts[1], 10) || 0
      const assigned = parseInt(parts[2], 10) || 0
      const rank = parts[3] ? parts[3].trim() : 'U'
      const taxid = parts[4] ? parts[4].trim() : '-1'
      const rawName = parts[5] != null ? parts[5] : 'Unknown'

      let depth = 0
      while (depth < rawName.length && rawName.charCodeAt(depth) === 32) depth++
      const nameFull = rawName.slice(depth).trim()
      const semi = nameFull.indexOf(';')
      const leaf = semi === -1 ? nameFull : nameFull.slice(0, semi)
      const lineage = semi === -1 ? null : nameFull

      let parentIdx = -1
      for (let dd = depth - 1; dd >= 0; dd--) {
        if (lastAtDepth[dd] !== undefined && lastAtDepth[dd] !== -1) { parentIdx = lastAtDepth[dd]; break }
      }

      let idx = d.byTaxid.get(taxid)
      if (idx === undefined) {
        idx = d.size
        d.byTaxid.set(taxid, idx)
        d.taxid[idx] = taxid
        d.rank[idx] = rank
        d.depth[idx] = depth
        d.name[idx] = leaf
        d.lineage[idx] = lineage
        d.parent[idx] = parentIdx
        d.size = idx + 1
      }
      lastAtDepth[depth] = idx
      for (let dd = depth + 1; dd < lastAtDepth.length; dd++) lastAtDepth[dd] = -1

      upd.push(idx, clade, assigned, pct)
      total += assigned
    }

    this.state.dictSize = d.size
    const changed = this._applyTaxa({
      sample, full: true, ver: (this.version(sample) + 1), total,
      count: upd.length / 4, upd, del: []
    })
    if (changed) this.state.tick += 1
    return changed
  }

  // -------------------------------------------------------------------------
  // Cache plumbing
  // -------------------------------------------------------------------------

  _queryKey(o) {
    return [
      o.ranks ? Array.from(o.ranks).join(',') : '*',
      o.minPercent || 0,
      o.depthRange ? o.depthRange.join('-') : '*',
      o.search || '',
      o.sort || 'clade',
      o.limit === undefined ? 500 : o.limit,
      o.offset || 0
    ].join('|')
  }

  _remember(key, rows) {
    // Evict oldest-first when the row budget is blown. Map preserves insertion
    // order, so this is a serviceable FIFO without a second data structure.
    this._cache.set(key, rows)
    this._cacheRows += rows.length
    while (this._cacheRows > MAX_CACHED_ROWS && this._cache.size > 1) {
      const oldest = this._cache.keys().next().value
      const evicted = this._cache.get(oldest)
      this._cache.delete(oldest)
      this._cacheRows -= evicted ? evicted.length : 0
    }
  }

  _invalidate(sample) {
    const prefix = `${sample}|`
    for (const key of Array.from(this._cache.keys())) {
      if (key.startsWith(prefix)) {
        const rows = this._cache.get(key)
        this._cacheRows -= rows ? rows.length : 0
        this._cache.delete(key)
      }
    }
  }

  // Rough resident size, for the diagnostics panel. Counting this explicitly is
  // the only way to notice a regression before a user does.
  stats() {
    let bytes = 0
    for (const t of this.tables.values()) bytes += t.cap * (4 + 4 + 4 + 1) + t.idx.length * 8
    // dictionary strings: rough average, names dominate
    bytes += this.dict.size * 120
    return {
      samples: this.tables.size,
      dictSize: this.dict.size,
      cachedRows: this._cacheRows,
      approxBytes: bytes
    }
  }
}

// Shared rank ordering, used by the store and by anything rendering a rank
// selector. Subspecies depths (S1, S2, ...) sort after S, numerically.
export function sortRankCodes(codes) {
  const baseOrder = ['U', 'R', 'R1', 'D', 'D1', 'K', 'P', 'C', 'O', 'F', 'F1', 'F2', 'G', 'G1', 'S']
  const uniq = Array.from(new Set((codes || []).filter(Boolean)))
  return uniq.sort((a, b) => {
    const as = /^S\d+$/.test(a)
    const bs = /^S\d+$/.test(b)
    if (as && bs) return Number(a.slice(1)) - Number(b.slice(1))
    if (as) return 1
    if (bs) return -1
    const ia = baseOrder.indexOf(a)
    const ib = baseOrder.indexOf(b)
    if (ia > -1 && ib > -1) return ia - ib
    if (ia > -1) return -1
    if (ib > -1) return 1
    return String(a).localeCompare(String(b))
  })
}

export const taxaStore = new TaxaStore()
export default taxaStore
