// ---------------------------------------------------------------------------
// taxonstore.mjs — server-side canonical taxon tables + delta encoding.
//
// WHY THIS EXISTS
// ---------------
// The old hot path shipped each sample's ENTIRE full.report as TSV text to the
// browser every time a fastq finished classifying. For a run of 800 files
// spread over ~24 barcodes that is:
//
//   * the same growing multi-hundred-KB document re-sent hundreds of times,
//   * a full d3.tsvParseRows() re-parse per push in the browser,
//   * ~30k freshly allocated row objects per sample retained in the tab, and
//   * every taxon NAME repeated in every sample and in every push.
//
// That is where the 1.5 GB went.
//
// The fix has three parts, all implemented here:
//
//   1. Parse ONCE, on the server, into a columnar table (typed arrays).
//   2. Intern every taxon's immutable attributes (taxid, rank, depth, name,
//      lineage string, parent) into a RUN-LEVEL dictionary. A kraken2 report
//      built from a given database always places a taxid at the same depth with
//      the same parent, so 24 barcodes share one dictionary instead of carrying
//      24 copies of 30k names.
//   3. Emit DELTAS. Between two consecutive fastqs only a few hundred taxa
//      change counts; we send those, keyed by a dense dictionary index, as flat
//      integer quads. A steady-state update is a few KB instead of a few
//      hundred KB.
//
// The wire shapes produced here are consumed by src/store/taxa.js. Keep the two
// in sync — the encoding is deliberately dumb (flat arrays of numbers) so that
// JSON.stringify/parse stays cheap and the client can splat straight into typed
// arrays without allocating per-row objects.
// ---------------------------------------------------------------------------

import { logger } from './logger.js'

// How many past delta generations we retain per sample. A client that has
// fallen further behind than this is served a fresh snapshot instead. 64
// generations at the flush interval is many seconds of slack — far more than a
// healthy client ever needs, and bounded memory if one stalls.
const DELTA_HISTORY = 64

// Default cap on how many taxa a client gets for a sample it is not focused on.
// Ranked by clade count, so the interesting organisms always survive the cut.
const DEFAULT_TOP_N = 500

// ---------------------------------------------------------------------------
// RunDict — run-level intern table for the immutable half of a taxon row.
//
// Assigns each taxid a dense index. Every downstream structure (sample tables,
// deltas, the client store) refers to taxa by that index, never by name.
// ---------------------------------------------------------------------------
class RunDict {
    constructor(run) {
        this.run = run
        this.byTaxid = new Map()   // taxid(string) -> idx
        this.taxid = []            // idx -> taxid (string; kraken2 taxids can be non-numeric)
        this.rank = []             // idx -> rank code ('S', 'G', 'S1', ...)
        this.depth = []            // idx -> indentation depth in the report
        this.name = []             // idx -> display name (leaf name, whitespace trimmed)
        this.lineage = []          // idx -> full lineage string when the report carries one
        this.parent = []           // idx -> parent idx (-1 for root)
        this.version = 0           // bumped once per newly interned taxon
    }

    get size() { return this.taxid.length }

    // Intern a taxon. Returns its dense index. Immutable attributes are written
    // once; later sightings only read. `depth`/`parent` come from the first
    // report that mentions the taxid, which is authoritative for the run.
    intern(taxid, rank, depth, name, lineage, parentIdx) {
        let idx = this.byTaxid.get(taxid)
        if (idx !== undefined) {
            // Repair a parent we could not resolve on first sight (can happen if
            // a child row is seen before its ancestor in a partial report).
            if (this.parent[idx] === -1 && parentIdx !== -1 && this.depth[idx] > 0) {
                this.parent[idx] = parentIdx
            }
            return idx
        }
        idx = this.taxid.length
        this.byTaxid.set(taxid, idx)
        this.taxid.push(taxid)
        this.rank.push(rank)
        this.depth.push(depth)
        this.name.push(name)
        this.lineage.push(lineage || null)
        this.parent.push(parentIdx)
        this.version += 1
        return idx
    }

    // Wire form of every entry interned at or after `fromIdx`. Flat tuples keep
    // the JSON small: no repeated object keys.
    //   [ idx, taxid, rank, depth, parentIdx, name, lineage ]
    entriesFrom(fromIdx) {
        const out = []
        for (let i = Math.max(0, fromIdx); i < this.taxid.length; i++) {
            out.push(
                i,
                this.taxid[i],
                this.rank[i],
                this.depth[i],
                this.parent[i],
                this.name[i],
                this.lineage[i]
            )
        }
        return out
    }
}

// ---------------------------------------------------------------------------
// SampleTable — the mutable half: per-sample counts, indexed by dict index.
//
// Three parallel Int32Arrays instead of 30k objects. Growth is amortised
// doubling. `present` marks which dict indices this sample actually reports, so
// a sample that only saw 200 taxa does not pretend to have the run's full tree.
// ---------------------------------------------------------------------------
class SampleTable {
    constructor(run, sample, dict) {
        this.run = run
        this.sample = sample
        this.dict = dict
        this.cap = 1024
        this.clade = new Int32Array(this.cap)      // reads assigned to this clade
        this.assigned = new Int32Array(this.cap)   // reads assigned directly to this taxon
        this.pct = new Int32Array(this.cap)        // percent * 100, as reported by kraken2
        this.present = new Uint8Array(this.cap)
        this.count = 0                             // number of present taxa
        this.total = 0                             // total directly-assigned reads
        this.version = 0
        // Ring of { version, idx: Int32Array } describing what changed in each
        // generation. Used to answer "what changed since version V" without
        // rescanning the whole table.
        this.history = []
        this.lastHash = null
        // Cached ranking (dict indices sorted by clade desc) for top-N slicing.
        this._ranked = null
        this._rankedVersion = -1
    }

    _grow(minCap) {
        if (minCap <= this.cap) return
        let cap = this.cap
        while (cap < minCap) cap *= 2
        const clade = new Int32Array(cap)
        const assigned = new Int32Array(cap)
        const pct = new Int32Array(cap)
        const present = new Uint8Array(cap)
        clade.set(this.clade)
        assigned.set(this.assigned)
        pct.set(this.pct)
        present.set(this.present)
        this.clade = clade
        this.assigned = assigned
        this.pct = pct
        this.present = present
        this.cap = cap
    }

    // Apply a freshly parsed report. `rows` is the flat output of parseReport:
    // groups of [idx, clade, assigned, pct100]. Returns the set of dict indices
    // whose numbers actually moved (empty => nothing to send).
    applyRows(rows, total) {
        this._grow(this.dict.size)
        const changed = []
        const seen = new Set()
        for (let i = 0; i < rows.length; i += 4) {
            const idx = rows[i]
            const clade = rows[i + 1]
            const assigned = rows[i + 2]
            const pct = rows[i + 3]
            seen.add(idx)
            if (!this.present[idx]) {
                this.present[idx] = 1
                this.count += 1
                this.clade[idx] = clade
                this.assigned[idx] = assigned
                this.pct[idx] = pct
                changed.push(idx)
                continue
            }
            if (this.clade[idx] !== clade || this.assigned[idx] !== assigned || this.pct[idx] !== pct) {
                this.clade[idx] = clade
                this.assigned[idx] = assigned
                this.pct[idx] = pct
                changed.push(idx)
            }
        }
        // Taxa that vanished (a rerun with a different database, say). Rare, but
        // if we skip this the client keeps ghosts forever.
        const removed = []
        for (let idx = 0; idx < this.dict.size; idx++) {
            if (this.present[idx] && !seen.has(idx)) {
                this.present[idx] = 0
                this.clade[idx] = 0
                this.assigned[idx] = 0
                this.pct[idx] = 0
                this.count -= 1
                removed.push(idx)
            }
        }
        this.total = total
        if (changed.length === 0 && removed.length === 0) return null

        this.version += 1
        this.history.push({
            version: this.version,
            idx: Int32Array.from(changed),
            removed: Int32Array.from(removed)
        })
        if (this.history.length > DELTA_HISTORY) this.history.shift()
        this._ranked = null
        return { changed, removed }
    }

    // Dict indices sorted by clade count, descending. Cached per version so the
    // per-connection top-N slice is a cheap array read.
    ranked() {
        if (this._ranked && this._rankedVersion === this.version) return this._ranked
        const idx = []
        for (let i = 0; i < this.dict.size; i++) if (this.present[i]) idx.push(i)
        idx.sort((a, b) => this.clade[b] - this.clade[a])
        this._ranked = idx
        this._rankedVersion = this.version
        return idx
    }

    // The set of dict indices a connection at `mode` is entitled to see.
    // 'full' => everything, otherwise the top-N by clade count.
    visibleSet(mode, topN) {
        if (mode === 'full') return null // null == unrestricted
        const ranked = this.ranked()
        const n = Math.min(topN || DEFAULT_TOP_N, ranked.length)
        const set = new Set()
        for (let i = 0; i < n; i++) set.add(ranked[i])
        return set
    }

    // Union of everything that changed strictly after `sinceVersion`.
    // Returns null when the client is too far behind to be patched.
    changesSince(sinceVersion) {
        if (sinceVersion >= this.version) return { changed: [], removed: [] }
        if (this.history.length === 0) return null
        if (sinceVersion < this.history[0].version - 1) return null
        const changed = new Set()
        const removed = new Set()
        for (const gen of this.history) {
            if (gen.version <= sinceVersion) continue
            for (const i of gen.idx) { changed.add(i); removed.delete(i) }
            for (const i of gen.removed) { removed.add(i); changed.delete(i) }
        }
        return { changed: Array.from(changed), removed: Array.from(removed) }
    }

    // Flat quads [idx, clade, assigned, pct100] for the given dict indices,
    // filtered through the connection's visibility set.
    encode(indices, visible) {
        const out = []
        for (const idx of indices) {
            if (visible && !visible.has(idx)) continue
            if (!this.present[idx]) continue
            out.push(idx, this.clade[idx], this.assigned[idx], this.pct[idx])
        }
        return out
    }

    // Everything this connection is entitled to see, as quads. Used for the
    // initial snapshot and whenever a client falls too far behind.
    encodeAll(visible) {
        const out = []
        const source = visible ? Array.from(visible) : this.ranked()
        for (const idx of source) {
            if (!this.present[idx]) continue
            out.push(idx, this.clade[idx], this.assigned[idx], this.pct[idx])
        }
        return out
    }
}

// ---------------------------------------------------------------------------
// TaxonStore — the singleton the rest of the server talks to.
// ---------------------------------------------------------------------------
class TaxonStore {
    constructor() {
        this.dicts = new Map()   // run -> RunDict
        this.tables = new Map()  // `${run}::${sample}` -> SampleTable
        this.hashes = new Map()  // `${run}::${sample}` -> last parsed report hash
    }

    dictFor(run) {
        let d = this.dicts.get(run)
        if (!d) { d = new RunDict(run); this.dicts.set(run, d) }
        return d
    }

    tableFor(run, sample) {
        const key = `${run}::${sample}`
        let t = this.tables.get(key)
        if (!t) { t = new SampleTable(run, sample, this.dictFor(run)); this.tables.set(key, t) }
        return t
    }

    hasSample(run, sample) {
        return this.tables.has(`${run}::${sample}`)
    }

    samplesFor(run) {
        const prefix = `${run}::`
        const out = []
        for (const key of this.tables.keys()) {
            if (key.startsWith(prefix)) out.push(key.slice(prefix.length))
        }
        return out
    }

    drop(run, sample) {
        if (sample === undefined) {
            for (const key of Array.from(this.tables.keys())) {
                if (key.startsWith(`${run}::`)) this.tables.delete(key)
            }
            this.dicts.delete(run)
            return
        }
        this.tables.delete(`${run}::${sample}`)
        this.hashes.delete(`${run}::${sample}`)
    }

    // FNV-1a over the raw report text. Only used to skip re-parsing a report
    // that has not actually changed — very common, since full.report is
    // rewritten after every fastq even when the new reads added no new taxa.
    _hash(str) {
        let h = 0x811c9dc5
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i)
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
        }
        return `${h}:${str.length}`
    }

    // -----------------------------------------------------------------------
    // Parse a kraken2-style report into dict indices + count quads.
    //
    // Columns: pct, clade reads, assigned reads, rank code, taxid, name.
    // Indentation (leading spaces before the name) encodes tree depth; we track
    // the most recent taxon at each depth to resolve parents, exactly like the
    // client's old parseData() did — except once, here, instead of on every
    // push in every browser.
    // -----------------------------------------------------------------------
    _parse(run, text) {
        const dict = this.dictFor(run)
        const rows = []
        const lastAtDepth = []       // depth -> dict idx of the most recent taxon there
        let total = 0

        let start = 0
        const len = text.length
        while (start < len) {
            let end = text.indexOf('\n', start)
            if (end === -1) end = len
            if (end > start) {
                const line = end > start && text.charCodeAt(end - 1) === 13
                    ? text.slice(start, end - 1)
                    : text.slice(start, end)
                if (line.length) {
                    const parts = line.split('\t')
                    if (parts.length >= 6) {
                        const pct = Math.round(parseFloat(parts[0]) * 100) || 0
                        const clade = parseInt(parts[1], 10) || 0
                        const assigned = parseInt(parts[2], 10) || 0
                        const rank = parts[3] ? parts[3].trim() : 'U'
                        const taxid = parts[4] ? parts[4].trim() : '-1'
                        const rawName = parts[5] != null ? parts[5] : 'Unknown'

                        // depth == count of leading whitespace, as kraken2 emits it
                        let depth = 0
                        while (depth < rawName.length && rawName.charCodeAt(depth) === 32) depth++

                        const nameFull = rawName.slice(depth).trim()
                        // Some pipelines pack a ";"-separated lineage into the
                        // name column. Keep the leaf for display, the whole
                        // string for search/alias lookups.
                        const semi = nameFull.indexOf(';')
                        const leaf = semi === -1 ? nameFull : nameFull.slice(0, semi)
                        const lineage = semi === -1 ? null : nameFull

                        let parentIdx = -1
                        for (let d = depth - 1; d >= 0; d--) {
                            if (lastAtDepth[d] !== undefined && lastAtDepth[d] !== -1) {
                                parentIdx = lastAtDepth[d]
                                break
                            }
                        }

                        const idx = dict.intern(taxid, rank, depth, leaf, lineage, parentIdx)
                        lastAtDepth[depth] = idx
                        // Anything deeper than this row is no longer a valid parent.
                        for (let d = depth + 1; d < lastAtDepth.length; d++) lastAtDepth[d] = -1

                        rows.push(idx, clade, assigned, pct)
                        total += assigned
                    }
                }
            }
            start = end + 1
        }
        return { rows, total }
    }

    // Ingest a report. Returns true when something actually changed (and thus
    // when a frame is worth scheduling), false when the report was a no-op.
    ingest(run, sample, text) {
        if (typeof text !== 'string' || text === '') return false
        const key = `${run}::${sample}`
        const hash = this._hash(text)
        if (this.hashes.get(key) === hash) return false
        this.hashes.set(key, hash)
        try {
            const dictBefore = this.dictFor(run).size
            const { rows, total } = this._parse(run, text)
            const table = this.tableFor(run, sample)
            const result = table.applyRows(rows, total)
            return !!result || this.dictFor(run).size !== dictBefore
        } catch (err) {
            logger.error(`${err} error ingesting report for ${run}/${sample}`)
            return false
        }
    }

    // -----------------------------------------------------------------------
    // Build the taxon section of a frame for ONE connection.
    //
    // `cursor` is the connection's per-sample bookkeeping:
    //   { version, mode, topN }
    // It is mutated in place on success so the next call encodes the next delta.
    // -----------------------------------------------------------------------
    encodeFor(run, sample, cursor) {
        const table = this.tables.get(`${run}::${sample}`)
        if (!table || table.version === 0) return null

        const mode = cursor.mode || 'top'
        const visible = table.visibleSet(mode, cursor.topN)
        // A mode change (user focused this sample) invalidates the delta chain:
        // the client is missing rows it was never entitled to before.
        const modeChanged = cursor.sentMode !== mode
        const behind = cursor.version || 0

        const snapshot = () => {
            const upd = table.encodeAll(visible)
            cursor.version = table.version
            cursor.sentMode = mode
            cursor.visible = visible ? new Set(visible) : null
            return {
                sample, full: true, ver: table.version,
                total: table.total, count: table.count, upd, del: []
            }
        }

        // The delta path below diffs the current window against the one we last
        // sent, so it is only valid if we HAVE a recorded window of the same
        // kind (bounded vs unbounded). Anything else starts from a snapshot.
        const windowKindChanged = (cursor.visible == null) !== (visible == null)
        if (modeChanged || behind === 0 || windowKindChanged) {
            const frame = snapshot()
            return frame.upd.length ? frame : null
        }

        if (behind >= table.version) return null

        const diff = table.changesSince(behind)
        if (diff === null) {
            // Too far behind for the history ring to patch — resend everything
            // rather than desync.
            return snapshot()
        }

        // ------------------------------------------------------------------
        // THE WINDOW ITSELF IS A DELTA.
        //
        // In `top` mode the client holds the N highest-count taxa. That set is
        // not stable: as reads accumulate, a taxon can climb into the window or
        // fall out of it without its OWN counts having changed in this
        // generation. Sending only `diff.changed` therefore leaks — the client
        // keeps every taxon that was ever in the window and its row count grows
        // without bound, quietly diverging from the server.
        //
        // So we diff the window as well as the values:
        //   entering  -> send in full (the client has never seen them)
        //   leaving   -> send as deletions (the client must drop them)
        //   remaining -> send only if their counts moved
        // ------------------------------------------------------------------
        const prev = cursor.visible
        const send = new Set()
        const del = []

        if (visible) {
            for (const idx of visible) {
                if (!prev.has(idx)) send.add(idx)          // entered the window
            }
            for (const idx of prev) {
                if (!visible.has(idx)) del.push(idx)       // fell out of the window
            }
            for (const idx of diff.changed) {
                if (visible.has(idx)) send.add(idx)        // still in window, value moved
            }
        } else {
            for (const idx of diff.changed) send.add(idx)
        }
        // Genuinely removed taxa (gone from the report entirely) always drop.
        for (const idx of diff.removed) {
            if (!visible || prev.has(idx)) del.push(idx)
        }

        cursor.version = table.version
        cursor.sentMode = mode
        cursor.visible = visible ? new Set(visible) : null

        const upd = table.encode(Array.from(send), visible)
        const dedupedDel = Array.from(new Set(del))
        if (!upd.length && !dedupedDel.length) return null
        return {
            sample,
            full: false,
            ver: table.version,
            total: table.total,
            count: table.count,
            upd,
            del: dedupedDel
        }
    }

    // Dictionary entries this connection has not yet received.
    encodeDict(run, dictCursor) {
        const dict = this.dicts.get(run)
        if (!dict) return null
        const from = dictCursor.sent || 0
        if (from >= dict.size) return null
        const entries = dict.entriesFrom(from)
        dictCursor.sent = dict.size
        return entries
    }
}

export const taxonStore = new TaxonStore()
export { DEFAULT_TOP_N }
