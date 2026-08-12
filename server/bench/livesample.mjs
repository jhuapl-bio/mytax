/* ---------------------------------------------------------------------------
 * bench/livesample.mjs — regression test for LIVE updates during a run.
 *
 * Reproduces the reported failure: start a run, let the client report its
 * viewport, then have a NEW sample appear (a new barcode directory, or the
 * first fastq of a run that was created after the client connected) and check
 * that the client actually hears about it.
 *
 * The bug this exists to prevent is a deadlock between two reasonable-looking
 * rules:
 *
 *   * the server only encodes taxa for samples the client says are on screen,
 *   * the client only puts a sample on screen once it has data to draw.
 *
 * A sample that appears after the last viewport report satisfies neither, so it
 * is starved forever — until something unrelated (switching tabs) causes the
 * client to republish a viewport, at which point it springs to life. That is
 * exactly the "go to Heatmap and back and it renders" symptom.
 *
 * Run:  node server/bench/livesample.mjs
 * ------------------------------------------------------------------------- */

import { protocol } from '../protocol.mjs'
import { taxonStore } from '../taxonstore.mjs'
import { queueSampleUpdate, queueJobUpdate } from '../messenger.mjs'

const RUN = 'live-run'
let failures = 0
function check(name, cond, detail) {
  if (cond) console.log(`  ok    ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

class MockSocket {
  constructor() { this.frames = [] }
  emit(event, payload) { if (event === 'mtx:frame') this.frames.push(payload) }
}

function report(nTaxa, scale) {
  const lines = []
  for (let i = 0; i < nTaxa; i++) {
    const c = Math.max(1, Math.round((nTaxa - i) * scale))
    const depth = 1 + (i % 5)
    const rank = ['D', 'P', 'C', 'F', 'G'][depth - 1]
    lines.push(`${(c / 100).toFixed(2)}\t${c}\t${c}\t${rank}\t${7000 + i}\t${' '.repeat(depth * 2)}Taxon ${i}`)
  }
  return lines.join('\n')
}

// Helpers to interrogate what the client would have seen.
const taxaFor = (socket, sample, from = 0) =>
  socket.frames.slice(from).flatMap((f) => (f.taxa || []).filter((t) => t.sample === sample))
const jobsFor = (socket, sample, from = 0) =>
  socket.frames.slice(from).flatMap((f) => (f.jobs || []).filter((j) => j.sample === sample))

// ---------------------------------------------------------------------------
const socket = new MockSocket()
const conn = protocol.attach('live-user', socket)
conn.selectRun(RUN)

// Client loads the run with one sample and reports its viewport, exactly as
// Explore does once its cards have mounted.
queueSampleUpdate(RUN, 'barcode01', { data: report(300, 1), status: { running: true } })
queueJobUpdate(RUN, 'barcode01', 0, { job: { index: 0 }, status: { running: true } })
protocol.flush()
for (const f of socket.frames) protocol.ack('live-user', f.seq)
protocol.setView('live-user', { visible: ['barcode01'], focus: 'barcode01', topN: 200 })
protocol.flush()
for (const f of socket.frames) protocol.ack('live-user', f.seq)

console.log('\n1. a NEW sample appears after the viewport was reported')
const mark = socket.frames.length
queueJobUpdate(RUN, 'barcode02', 0, { job: { index: 0 }, status: { waiting: true } })
queueSampleUpdate(RUN, 'barcode02', { data: report(300, 1), status: { running: true, total: 1 } })
protocol.flush()
for (const f of socket.frames.slice(mark)) protocol.ack('live-user', f.seq)

check('client is told about the new sample\'s job', jobsFor(socket, 'barcode02', mark).length > 0)
check('client receives the new sample\'s taxa', taxaFor(socket, 'barcode02', mark).length > 0,
  'starved by the viewport gate — this is the tab-switch bug')
check('new sample\'s first payload is a full snapshot',
  (taxaFor(socket, 'barcode02', mark)[0] || {}).full === true)

console.log('\n2. further fastqs for that new sample keep flowing')
// The client has now rendered a card for barcode02 (it has data), so Explore's
// IntersectionObserver reports it and the viewport is republished. This is the
// step the real client performs automatically; from here on barcode02 is a
// normal on-screen sample.
protocol.setView('live-user', { visible: ['barcode01', 'barcode02'], focus: 'barcode01', topN: 200 })
protocol.flush()
for (const f of socket.frames) protocol.ack('live-user', f.seq)
const mark2 = socket.frames.length
for (let i = 1; i <= 3; i++) {
  queueJobUpdate(RUN, 'barcode02', i, { job: { index: i }, status: { running: true } })
  queueSampleUpdate(RUN, 'barcode02', { data: report(300, 1 + i), status: { running: true, total: i + 1 } })
  protocol.flush()
  for (const f of socket.frames.slice(mark2)) protocol.ack('live-user', f.seq)
}
check('subsequent jobs arrive', jobsFor(socket, 'barcode02', mark2).length >= 3,
  `${jobsFor(socket, 'barcode02', mark2).length} job updates`)
check('subsequent taxa updates arrive', taxaFor(socket, 'barcode02', mark2).length >= 1,
  `${taxaFor(socket, 'barcode02', mark2).length} taxa sections`)

console.log('\n3. an existing, on-screen sample still updates live')
const mark3 = socket.frames.length
queueSampleUpdate(RUN, 'barcode01', { data: report(300, 9), status: { running: true } })
protocol.flush()
for (const f of socket.frames.slice(mark3)) protocol.ack('live-user', f.seq)
check('on-screen sample updates', taxaFor(socket, 'barcode01', mark3).length > 0)

console.log('\n4. a sample the client has a baseline for, but scrolled away from')
// Client scrolls barcode02 off screen. It already has a baseline, so dropping
// its updates is the intended optimisation — but they must resume on scroll-in,
// not be lost.
protocol.setView('live-user', { visible: ['barcode01'], focus: 'barcode01', topN: 200 })
protocol.flush()
for (const f of socket.frames) protocol.ack('live-user', f.seq)
const mark4 = socket.frames.length
for (let i = 4; i <= 8; i++) {
  queueSampleUpdate(RUN, 'barcode02', { data: report(300, 10 + i), status: { running: true } })
  protocol.flush()
}
for (const f of socket.frames.slice(mark4)) protocol.ack('live-user', f.seq)
check('off-screen sample is not encoded (the optimisation still works)',
  taxaFor(socket, 'barcode02', mark4).length === 0,
  `${taxaFor(socket, 'barcode02', mark4).length} sections leaked`)

const mark5 = socket.frames.length
protocol.setView('live-user', { visible: ['barcode01', 'barcode02'], focus: 'barcode01', topN: 200 })
protocol.flush()
check('scrolling back in delivers the accumulated update', taxaFor(socket, 'barcode02', mark5).length > 0)

// The catch-up payload must reflect the LATEST state, not the state as of the
// moment it went off screen.
const catchUp = taxaFor(socket, 'barcode02', mark5)[0]
const serverTable = taxonStore.tables.get(`${RUN}::barcode02`)
check('catch-up payload is at the server\'s current version',
  catchUp && catchUp.ver === serverTable.version,
  catchUp ? `client ${catchUp.ver} vs server ${serverTable.version}` : 'no payload')

// ---------------------------------------------------------------------------
console.log('\n5. resync heals a sample whose job frames were missed')
//
// The exact failure this covers: a sample has taxon data (so its charts and
// reports work) but an empty job queue, because the frames describing that
// queue were produced at a moment this connection could not receive them --
// before it selected the run, or before the sample had a queue to report. The
// row then reads "nothing analyzed yet" forever even though it plainly has.
{
  const RUN2 = 'resync-run'
  const sock2 = new MockSocket()
  const conn2 = protocol.attach('resync-user', sock2)

  // Jobs are created BEFORE this connection selects the run, so they are
  // dropped -- there is no viewer to receive them.
  queueJobUpdate(RUN2, 'barcode09', 0, { job: { index: 0 }, status: { success: true, running: false } })
  queueJobUpdate(RUN2, 'barcode09', 1, { job: { index: 1 }, status: { success: true, running: false } })
  protocol.flush()

  // Now the client selects the run, and only the report lands.
  conn2.selectRun(RUN2)
  queueSampleUpdate(RUN2, 'barcode09', { data: report(300, 5), status: { total: 0 } })
  protocol.flush()
  for (const f of sock2.frames) protocol.ack('resync-user', f.seq)

  const gotTaxa = sock2.frames.some((f) => (f.taxa || []).some((t) => t.sample === 'barcode09'))
  const gotJobs = sock2.frames.some((f) => (f.jobs || []).some((j) => j.sample === 'barcode09'))
  check('reproduces the symptom: taxa but no jobs', gotTaxa && !gotJobs,
    `taxa=${gotTaxa} jobs=${gotJobs}`)

  // A stand-in orchestrator exposing the shape resync() reads.
  const fakeOrchestrator = {
    runs: [{
      run: RUN2,
      samples: {
        barcode09: {
          formatQueueInfo: () => ([
            { index: 0, sample: 'barcode09', status: { success: true, running: false, waiting: false } },
            { index: 1, sample: 'barcode09', status: { success: true, running: false, waiting: false } }
          ]),
          getStatus: () => ({ total: 2, done: 2, running: false, runningCount: 0, waiting: 0, errorCount: 0 })
        }
      }
    }]
  }

  const mark6 = sock2.frames.length
  const healed = protocol.resync('resync-user', RUN2, ['barcode09'], fakeOrchestrator)
  protocol.flush()
  check('resync reports it healed the sample', healed === 1, `healed=${healed}`)

  const jobs = sock2.frames.slice(mark6).flatMap((f) => (f.jobs || []).filter((j) => j.sample === 'barcode09'))
  check('resync delivers the whole queue', jobs.length === 2, `${jobs.length} jobs`)
  check('resync carries each job\'s real status',
    jobs.every((j) => j.job && j.job.status && j.job.status.success === true))

  const statuses = sock2.frames.slice(mark6).flatMap((f) => (f.samples || []).filter((x) => x.sample === 'barcode09'))
  check('resync delivers the sample rollup', statuses.length > 0 && statuses[0].status.total === 2,
    statuses.length ? `total=${statuses[0].status.total}` : 'none')

  check('resync is a no-op for a run this connection is not viewing',
    protocol.resync('resync-user', 'some-other-run', ['barcode09'], fakeOrchestrator) === 0)
}

// ---------------------------------------------------------------------------
console.log('\n6. the queue rides the FIRST taxa payload (no visible gap)')
//
// Resync repairs the contradiction, but only after the client has noticed it —
// a second or so of showing the wrong thing. The bus can prevent it instead: on
// a sample's first taxa payload it attaches that sample's queue, so the row is
// correct the moment it appears.
{
  const RUN3 = 'seed-run'
  const sock3 = new MockSocket()
  const conn3 = protocol.attach('seed-user', sock3)
  conn3.selectRun(RUN3)

  protocol.sampleProvider = (run, sample) => {
    if (run !== RUN3 || sample !== 'barcode11') return null
    return {
      queue: [
        { index: 0, sample, status: { success: true, running: false, waiting: false } },
        { index: 1, sample, status: { success: true, running: false, waiting: false } },
        { index: 2, sample, status: { running: true, waiting: false } }
      ],
      status: { total: 3, done: 2, runningCount: 1, running: true }
    }
  }

  // Only a report arrives — no job frames at all, the failing scenario.
  queueSampleUpdate(RUN3, 'barcode11', { data: report(300, 3) })
  protocol.flush()

  const jobs3 = sock3.frames.flatMap((f) => (f.jobs || []).filter((j) => j.sample === 'barcode11'))
  const taxa3 = sock3.frames.flatMap((f) => (f.taxa || []).filter((t) => t.sample === 'barcode11'))
  check('taxa arrive', taxa3.length > 0)
  check('the queue arrives WITH them, unprompted', jobs3.length === 3, `${jobs3.length} jobs`)
  const roll3 = sock3.frames.flatMap((f) => (f.samples || []).filter((x) => x.sample === 'barcode11'))
  check('so does the rollup', roll3.length > 0 && roll3[0].status.total === 3)

  // ...and it seeds once, not on every subsequent update.
  const mark7 = sock3.frames.length
  queueSampleUpdate(RUN3, 'barcode11', { data: report(300, 4) })
  protocol.flush()
  const again = sock3.frames.slice(mark7).flatMap((f) => (f.jobs || []).filter((j) => j.sample === 'barcode11'))
  check('seeding happens once, not on every update', again.length === 0, `${again.length} redundant jobs`)

  protocol.sampleProvider = null
}

console.log(`\n${failures ? failures + ' FAILURES' : 'all passed'}\n`)
process.exit(failures ? 1 : 0)
