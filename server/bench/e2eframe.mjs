/* ---------------------------------------------------------------------------
 * bench/e2eframe.mjs — integration test for the server-side frame pipeline.
 *
 * Drives the REAL chain, in process, with a mock socket standing in for a
 * browser:
 *
 *     queueSampleUpdate()  ->  taxonStore (parse + diff)
 *                          ->  protocol (coalesce, scope to viewport, encode)
 *                          ->  socket.emit('mtx:frame')
 *
 * and asserts the properties that a delta protocol lives or dies by:
 *
 *   1. Report text never reaches the socket. (The whole point.)
 *   2. Sequence numbers are strictly increasing — a gap means silent divergence.
 *   3. Every taxon index referenced by a frame already has a dictionary entry.
 *   4. Off-screen samples receive their baseline and then go quiet — NOT total
 *      silence, which would deadlock against a client that cannot mark a sample
 *      visible until it has data (see protocol.mjs, modeFor).
 *   5. Backpressure engages: a client that stops acking stops receiving, and
 *      resumes cleanly (with a bigger delta, not a lost one) once it acks.
 *
 * Run:  node server/bench/e2eframe.mjs
 * ------------------------------------------------------------------------- */

import { protocol } from '../protocol.mjs'
import { taxonStore } from '../taxonstore.mjs'
import { queueSampleUpdate, queueJobUpdate } from '../messenger.mjs'

const RUN = 'e2e-run'
const SAMPLES = ['barcode01', 'barcode02', 'barcode03']

let failures = 0
function check(name, cond, detail) {
  if (cond) { console.log(`  ok    ${name}`) }
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

// ---- mock socket -----------------------------------------------------------
class MockSocket {
  constructor() { this.frames = []; this.events = [] }
  emit(event, payload) {
    this.events.push(event)
    if (event === 'mtx:frame') this.frames.push(payload)
  }
  get bytes() {
    return this.frames.reduce((a, f) => a + Buffer.byteLength(JSON.stringify(f)), 0)
  }
}

function makeReport(nTaxa, scale) {
  const lines = []
  for (let i = 0; i < nTaxa; i++) {
    const c = Math.max(1, Math.round((nTaxa - i) * scale))
    const depth = 1 + (i % 6)
    const rank = ['D', 'P', 'C', 'O', 'F', 'G'][depth - 1]
    lines.push(`${(c / 1000).toFixed(2)}\t${c}\t${c}\t${rank}\t${9000 + i}\t${' '.repeat(depth * 2)}Taxon ${i}`)
  }
  return lines.join('\n')
}

// ---- set up a connection ---------------------------------------------------
const socket = new MockSocket()
const conn = protocol.attach('e2e-user', socket)
conn.selectRun(RUN)
// barcode03 is deliberately NOT in the viewport.
protocol.setView('e2e-user', { visible: ['barcode01', 'barcode02'], focus: 'barcode01', topN: 200 })

console.log('\n1. steady streaming, client acking normally')
for (let i = 1; i <= 15; i++) {
  for (const s of SAMPLES) {
    queueSampleUpdate(RUN, s, {
      data: makeReport(500, i * (s === 'barcode02' ? 0.7 : 1)),
      status: { running: true, total: i, done: i - 1 }
    })
    queueJobUpdate(RUN, s, i, { status: { running: true, waiting: false } })
  }
  protocol.flush()
  // Client applies and acks each frame.
  for (const f of socket.frames.slice(-1)) protocol.ack('e2e-user', f.seq)
}

// --- property 1: no report text on the wire ---------------------------------
const wire = JSON.stringify(socket.frames)
check('report text never reaches the socket', wire.indexOf('Taxon 0\t') === -1 && !/\t\d+\t\d+\t[DPCOFG]\t/.test(wire))

// --- property 2: strictly increasing sequence -------------------------------
let seqOk = true
for (let i = 1; i < socket.frames.length; i++) {
  if (socket.frames[i].seq <= socket.frames[i - 1].seq) seqOk = false
}
check('sequence numbers strictly increase', seqOk)

// --- property 3: dictionary precedes the taxa that use it -------------------
const known = new Set()
let dictErrors = 0
for (const frame of socket.frames) {
  for (let i = 0; i < (frame.dict || []).length; i += 7) known.add(frame.dict[i])
  for (const section of frame.taxa || []) {
    for (let i = 0; i < (section.upd || []).length; i += 4) {
      if (!known.has(section.upd[i])) dictErrors++
    }
  }
}
check('every taxon index has a dictionary entry first', dictErrors === 0, `${dictErrors} orphaned indices`)

// --- property 4: off-screen samples cost (almost) nothing --------------------
//
// CONTRACT: an off-screen sample receives exactly ONE payload -- its baseline --
// and nothing after that until it enters the viewport.
//
// The baseline is not optional. Withholding it entirely deadlocks against the
// client, which cannot report a sample as visible until it has data to render.
// That deadlock is what made new samples appear only after a tab switch. So the
// assertion here is "one payload, then silence", not "no payloads".
let offscreenSections = 0
for (const frame of socket.frames) {
  for (const section of frame.taxa || []) {
    if (section.sample === 'barcode03') offscreenSections++
  }
}
check('off-screen sample gets exactly one baseline payload', offscreenSections === 1,
  `${offscreenSections} sections`)
check('off-screen sample IS still tracked server-side', taxonStore.hasSample(RUN, 'barcode03'))

// --- property 5: backpressure ------------------------------------------------
console.log('\n2. client stops acking (backpressure)')
const before = socket.frames.length
for (let i = 16; i <= 40; i++) {
  for (const s of ['barcode01', 'barcode02']) {
    queueSampleUpdate(RUN, s, { data: makeReport(500, i), status: { running: true } })
  }
  protocol.flush()   // no acks
}
const during = socket.frames.length - before
check('server stops sending to a stalled client', during <= 2, `${during} frames sent while unacked`)

console.log('\n3. client resumes acking')
for (const f of socket.frames.slice(-2)) protocol.ack('e2e-user', f.seq)
protocol.flush()
const after = socket.frames.length - before - during
check('server resumes once acks arrive', after >= 1, `${after} frames after resume`)

// The resumed frame must carry everything that changed while we were stalled,
// not just the newest generation — otherwise the client is permanently behind.
const resumed = socket.frames[socket.frames.length - 1]
const resumedSection = (resumed.taxa || []).find((t) => t.sample === 'barcode01')
check('resumed frame carries the accumulated delta', !!resumedSection && (resumedSection.upd || []).length > 0)

// --- viewport change --------------------------------------------------------
console.log('\n4. sample scrolls into view')
protocol.setView('e2e-user', { visible: ['barcode01', 'barcode02', 'barcode03'], focus: 'barcode01', topN: 200 })
const mark = socket.frames.length
protocol.flush()
const catchUp = socket.frames.slice(mark)
  .flatMap((f) => (f.taxa || []).filter((t) => t.sample === 'barcode03'))[0]
check('newly visible sample is caught up', !!catchUp)
// It already holds a baseline, so this is a delta rather than a fresh snapshot —
// and it must land on the server's CURRENT version, not replay the intervening
// generations one at a time.
const b3 = taxonStore.tables.get(`${RUN}::barcode03`)
check('catch-up lands on the server\'s current version',
  catchUp && b3 && catchUp.ver === b3.version,
  catchUp && b3 ? `client ${catchUp.ver} vs server ${b3.version}` : 'no payload')

// ---- summary ---------------------------------------------------------------
const bytes = socket.bytes
console.log(`
frames emitted       ${socket.frames.length}
bytes on the wire    ${(bytes / 1024).toFixed(1)} KB
mean frame           ${(bytes / Math.max(1, socket.frames.length) / 1024).toFixed(2)} KB
non-frame events     ${socket.events.filter((e) => e !== 'mtx:frame').length}
`)

process.exit(failures ? 1 : 0)
