/* ---------------------------------------------------------------------------
 * bench/deltaparity.mjs — correctness check for the delta protocol.
 *
 * A delta-encoded channel that silently desyncs is worse than no optimisation
 * at all: the numbers on screen would just quietly stop matching the numbers on
 * disk, and nothing would ever complain. So this replays a realistic run
 * through the server encoder and the client applier, then asserts that the
 * client's reconstructed table is byte-for-byte identical to the server's after
 * every single push — including the awkward cases:
 *
 *   * a client that falls far enough behind to blow the delta history and must
 *     be re-snapshotted,
 *   * a client whose viewport changes mid-run (top-N -> full detail), which
 *     invalidates the delta chain,
 *   * taxa that disappear between reports (a rerun against another database),
 *   * a sample that is off-screen for a while and then scrolls back in.
 *
 * Run:  node server/bench/deltaparity.mjs
 * ------------------------------------------------------------------------- */

import { taxonStore } from '../taxonstore.mjs'

// ---------------------------------------------------------------------------
// Minimal stand-in for the client store's apply path.
//
// This mirrors src/store/taxa.js exactly (same field semantics, same handling
// of `full` vs incremental sections). Duplicating ~60 lines here rather than
// importing the real module keeps the check runnable under plain node without
// dragging Vue and the webpack alias resolver into a server-side script.
// ---------------------------------------------------------------------------
class ClientMirror {
  constructor() {
    this.dict = { taxid: [], rank: [], depth: [], name: [], lineage: [], parent: [], size: 0 }
    this.tables = new Map()
  }

  applyDict(flat) {
    for (let i = 0; i < flat.length; i += 7) {
      const idx = flat[i]
      this.dict.taxid[idx] = flat[i + 1]
      this.dict.rank[idx] = flat[i + 2]
      this.dict.depth[idx] = flat[i + 3]
      this.dict.parent[idx] = flat[i + 4]
      this.dict.name[idx] = flat[i + 5]
      this.dict.lineage[idx] = flat[i + 6]
      if (idx + 1 > this.dict.size) this.dict.size = idx + 1
    }
  }

  table(sample) {
    let t = this.tables.get(sample)
    if (!t) {
      t = { clade: new Map(), assigned: new Map(), pct: new Map(), total: 0, ver: 0 }
      this.tables.set(sample, t)
    }
    return t
  }

  applyTaxa(section) {
    const t = this.table(section.sample)
    if (section.full) { t.clade.clear(); t.assigned.clear(); t.pct.clear() }
    const upd = section.upd || []
    for (let i = 0; i < upd.length; i += 4) {
      t.clade.set(upd[i], upd[i + 1])
      t.assigned.set(upd[i], upd[i + 2])
      t.pct.set(upd[i], upd[i + 3])
    }
    for (const idx of section.del || []) {
      t.clade.delete(idx); t.assigned.delete(idx); t.pct.delete(idx)
    }
    t.total = section.total
    t.ver = section.ver
  }
}

// ---- report generation (same shape as frameload.mjs) -----------------------
const TAXA = 4000
const RUN = 'parity-run'
const SAMPLES = ['barcode01', 'barcode02', 'barcode03']

const taxonomy = Array.from({ length: TAXA }, (_, i) => ({
  taxid: String(200000 + i),
  rank: ['D', 'P', 'C', 'O', 'F', 'G', 'S'][i % 7],
  depth: 1 + (i % 7),
  name: `Organism ${i}`
}))

function render(counts, total, skip) {
  const lines = []
  for (let i = 0; i < taxonomy.length; i++) {
    if (skip && skip.has(i)) continue
    const c = counts[i]
    if (!c) continue
    const t = taxonomy[i]
    lines.push(`${((c / total) * 100).toFixed(2)}\t${c}\t${c}\t${t.rank}\t${t.taxid}\t${' '.repeat(t.depth * 2)}${t.name}`)
  }
  return lines.join('\n')
}

// ---- harness ---------------------------------------------------------------
const mirror = new ClientMirror()
const dictCursor = { sent: 0 }
const cursors = new Map(SAMPLES.map((s) => [s, { version: 0, mode: 'top', topN: 500, sentMode: null }]))

const counts = new Map(SAMPLES.map((s) => [s, new Int32Array(TAXA)]))
const totals = new Map(SAMPLES.map((s) => [s, 0]))

let checks = 0
let failures = 0

// Compare the client's reconstruction against the server's authoritative table,
// restricted to what this client was entitled to receive.
function verify(sample, cursor, label) {
  checks += 1
  const server = taxonStore.tables.get(`${RUN}::${sample}`)
  const client = mirror.table(sample)
  const visible = server.visibleSet(cursor.mode, cursor.topN)

  const expected = new Map()
  const source = visible ? Array.from(visible) : server.ranked()
  for (const idx of source) {
    if (server.present[idx]) expected.set(idx, [server.clade[idx], server.assigned[idx], server.pct[idx]])
  }

  const problems = []
  if (client.clade.size !== expected.size) {
    problems.push(`row count ${client.clade.size} != ${expected.size}`)
  }
  for (const [idx, [clade, assigned, pct]] of expected) {
    if (client.clade.get(idx) !== clade) { problems.push(`taxon ${idx} clade ${client.clade.get(idx)} != ${clade}`); break }
    if (client.assigned.get(idx) !== assigned) { problems.push(`taxon ${idx} assigned mismatch`); break }
    if (client.pct.get(idx) !== pct) { problems.push(`taxon ${idx} pct mismatch`); break }
  }
  if (client.total !== server.total) problems.push(`total ${client.total} != ${server.total}`)

  if (problems.length) {
    failures += 1
    console.log(`  FAIL [${label}] ${sample}: ${problems.join('; ')}`)
    return false
  }
  return true
}

function push(sample, skip) {
  const c = counts.get(sample)
  for (let r = 0; r < 2000; r++) c[Math.floor(Math.pow(Math.random(), 3) * TAXA)] += 1
  totals.set(sample, totals.get(sample) + 2000)
  return taxonStore.ingest(RUN, sample, render(c, totals.get(sample), skip))
}

function deliver(sample) {
  const dict = taxonStore.encodeDict(RUN, dictCursor)
  if (dict) mirror.applyDict(dict)
  const section = taxonStore.encodeFor(RUN, sample, cursors.get(sample))
  if (section) mirror.applyTaxa(section)
}

console.log('\nscenario 1: steady streaming, client keeps up')
for (let i = 0; i < 60; i++) {
  const sample = SAMPLES[i % SAMPLES.length]
  if (push(sample)) deliver(sample)
  verify(sample, cursors.get(sample), 'steady')
}

console.log('scenario 2: client stalls past the delta history, then resumes')
{
  const sample = 'barcode01'
  // 80 pushes with no delivery — deeper than DELTA_HISTORY (64), so the encoder
  // must fall back to a full snapshot rather than emit an unpatchable delta.
  for (let i = 0; i < 80; i++) push(sample)
  deliver(sample)
  verify(sample, cursors.get(sample), 'post-stall')
}

console.log('scenario 3: viewport change (top-N -> full detail) mid-run')
{
  const sample = 'barcode02'
  push(sample); deliver(sample)
  cursors.get(sample).mode = 'full'
  deliver(sample)
  verify(sample, cursors.get(sample), 'mode-change')
  // and back again
  cursors.get(sample).mode = 'top'
  push(sample); deliver(sample)
  verify(sample, cursors.get(sample), 'mode-restore')
}

console.log('scenario 4: taxa disappear (rerun against a different database)')
{
  const sample = 'barcode03'
  const skip = new Set()
  for (let i = 0; i < TAXA; i += 3) skip.add(i)
  push(sample, skip)
  deliver(sample)
  verify(sample, cursors.get(sample), 'removals')
}

console.log('scenario 5: sample off-screen, then scrolls back into view')
{
  const sample = 'barcode01'
  for (let i = 0; i < 10; i++) push(sample)   // no deliver: off-screen
  deliver(sample)
  verify(sample, cursors.get(sample), 'rescroll')
}

console.log(`\n${checks - failures}/${checks} parity checks passed`)
process.exit(failures ? 1 : 0)
