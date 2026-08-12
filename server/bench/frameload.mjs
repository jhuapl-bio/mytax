/* ---------------------------------------------------------------------------
 * bench/frameload.mjs — synthetic 800-file sequencing run.
 *
 * Simulates the exact traffic pattern that made the browser tab reach 1.5 GB:
 * 24 barcodes, 800 fastqs, each one growing its sample's full.report and
 * triggering a push. Measures what the OLD path would have put on the wire
 * (the whole report, every time) against what the new delta path actually
 * sends, plus resident memory in both stores.
 *
 * Run:  node server/bench/frameload.mjs [--files 800] [--samples 24] [--taxa 30000]
 * ------------------------------------------------------------------------- */

import { taxonStore } from '../taxonstore.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, Number(v)])
)
const FILES = args.files || 800
const SAMPLES = args.samples || 24
const TAXA = args.taxa || 30000
const RUN = 'bench-run'

// ---------------------------------------------------------------------------
// A plausible kraken2 report generator.
//
// Real reports are heavy-tailed: a handful of taxa carry most reads and a long
// tail sits at 1-2. That matters here, because the delta path's whole thesis is
// that only a small, changing subset of taxa moves between consecutive files.
// A uniform distribution would flatter it unrealistically.
// ---------------------------------------------------------------------------
function makeTaxonomy(n) {
  const taxa = []
  for (let i = 0; i < n; i++) {
    const depth = 1 + (i % 7)
    const rank = ['D', 'P', 'C', 'O', 'F', 'G', 'S'][depth - 1]
    taxa.push({
      taxid: String(100000 + i),
      rank,
      depth,
      name: `Synthetic organism ${i} subsp. variant ${i % 17}`,
      // Zipf-ish weight
      weight: 1 / Math.pow(i + 1, 1.1)
    })
  }
  return taxa
}

function renderReport(taxonomy, counts, total) {
  const lines = []
  for (let i = 0; i < taxonomy.length; i++) {
    const c = counts[i]
    if (!c) continue
    const t = taxonomy[i]
    const pct = ((c / total) * 100).toFixed(2)
    lines.push(`${pct}\t${c}\t${c}\t${t.rank}\t${t.taxid}\t${' '.repeat(t.depth * 2)}${t.name}`)
  }
  return lines.join('\n')
}

function fmtBytes(b) {
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b > 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

const taxonomy = makeTaxonomy(TAXA)
const cumWeights = []
{
  let acc = 0
  for (const t of taxonomy) { acc += t.weight; cumWeights.push(acc) }
  for (let i = 0; i < cumWeights.length; i++) cumWeights[i] /= acc
}
function pickTaxon(r) {
  let lo = 0, hi = cumWeights.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumWeights[mid] < r) lo = mid + 1
    else hi = mid
  }
  return lo
}

// Per-sample cumulative counts.
const sampleNames = Array.from({ length: SAMPLES }, (_, i) => `barcode${String(i + 1).padStart(2, '0')}`)
const counts = new Map(sampleNames.map((s) => [s, new Int32Array(TAXA)]))
const totals = new Map(sampleNames.map((s) => [s, 0]))

// Cursors, one per "connection", so we exercise the real delta encoder.
const cursors = new Map(sampleNames.map((s) => [s, { version: 0, mode: 'top', topN: 500, sentMode: null }]))
const fullCursors = new Map(sampleNames.map((s) => [s, { version: 0, mode: 'full', topN: 0, sentMode: null }]))
const dictCursor = { sent: 0 }

let legacyBytes = 0     // what the old path would have sent: whole report, every push
let deltaBytesTop = 0   // new path, top-500 viewer
let deltaBytesFull = 0  // new path, viewer focused on every sample (worst case)
let dictBytes = 0
let parseMs = 0
let encodeMs = 0
let pushes = 0

const READS_PER_FILE = 4000
const t0 = Date.now()

for (let f = 0; f < FILES; f++) {
  const sample = sampleNames[f % SAMPLES]
  const c = counts.get(sample)

  // Add one file's worth of reads.
  for (let r = 0; r < READS_PER_FILE; r++) {
    c[pickTaxon(Math.random())] += 1
  }
  totals.set(sample, totals.get(sample) + READS_PER_FILE)

  const text = renderReport(taxonomy, c, totals.get(sample))
  legacyBytes += Buffer.byteLength(text)

  const p0 = process.hrtime.bigint()
  const changed = taxonStore.ingest(RUN, sample, text)
  parseMs += Number(process.hrtime.bigint() - p0) / 1e6
  if (!changed) continue
  pushes += 1

  const e0 = process.hrtime.bigint()
  const dict = taxonStore.encodeDict(RUN, dictCursor)
  if (dict) dictBytes += Buffer.byteLength(JSON.stringify(dict))
  const secTop = taxonStore.encodeFor(RUN, sample, cursors.get(sample))
  if (secTop) deltaBytesTop += Buffer.byteLength(JSON.stringify(secTop))
  const secFull = taxonStore.encodeFor(RUN, sample, fullCursors.get(sample))
  if (secFull) deltaBytesFull += Buffer.byteLength(JSON.stringify(secFull))
  encodeMs += Number(process.hrtime.bigint() - e0) / 1e6

  if ((f + 1) % 200 === 0) {
    process.stdout.write(`  ...${f + 1}/${FILES} files\n`)
  }
}

const wall = Date.now() - t0
const mem = process.memoryUsage()

console.log(`
================================================================
 ${FILES} files · ${SAMPLES} samples · ${TAXA} taxa · ${READS_PER_FILE} reads/file
================================================================

WIRE VOLUME
  old path (full report per push)      ${fmtBytes(legacyBytes).padStart(12)}
  new path, top-500 viewer             ${fmtBytes(deltaBytesTop + dictBytes).padStart(12)}   (${(legacyBytes / (deltaBytesTop + dictBytes)).toFixed(1)}x less)
  new path, full-detail viewer         ${fmtBytes(deltaBytesFull + dictBytes).padStart(12)}   (${(legacyBytes / (deltaBytesFull + dictBytes)).toFixed(1)}x less)
    of which shared dictionary         ${fmtBytes(dictBytes).padStart(12)}   (sent once)

  mean frame, top-500 viewer           ${fmtBytes(Math.round(deltaBytesTop / Math.max(1, pushes))).padStart(12)}
  mean frame, old path                 ${fmtBytes(Math.round(legacyBytes / Math.max(1, pushes))).padStart(12)}

SERVER COST
  total wall time                      ${String(wall).padStart(9)} ms
  parse + diff                         ${parseMs.toFixed(0).padStart(9)} ms  (${(parseMs / Math.max(1, pushes)).toFixed(2)} ms/push)
  delta encode                         ${encodeMs.toFixed(0).padStart(9)} ms  (${(encodeMs / Math.max(1, pushes)).toFixed(2)} ms/push)

SERVER MEMORY
  heap used                            ${fmtBytes(mem.heapUsed).padStart(12)}
  columnar tables                      ${SAMPLES} samples x ${fmtBytes(TAXA * 13)} = ${fmtBytes(SAMPLES * TAXA * 13)}
  shared dictionary                    ${taxonStore.dictFor(RUN).size} taxa

CLIENT PROJECTION (what the browser now holds)
  columnar tables                      ${fmtBytes(SAMPLES * TAXA * 13)}
  shared dictionary (strings)          ${fmtBytes(TAXA * 120)}
  ------------------------------------------------
  total                                ${fmtBytes(SAMPLES * TAXA * 13 + TAXA * 120)}

  For comparison, the old client held two arrays of row objects per sample:
  ${SAMPLES} x ${TAXA} x 2 x ~350 B = ${fmtBytes(SAMPLES * TAXA * 2 * 350)}
`)
