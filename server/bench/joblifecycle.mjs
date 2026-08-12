/* ---------------------------------------------------------------------------
 * bench/joblifecycle.mjs — does the client ever SEE a job as running?
 *
 * The status badge pulses while `sample.status.running` is true. That flag is
 * derived on the client from per-job frames, so "the badge never animates" has
 * exactly three possible causes:
 *
 *   1. the server never emits a running state,
 *   2. the frame coalescer collapses start+finish into one payload before the
 *      window flushes, so the client only ever sees the finished state, or
 *   3. the client's aggregate mis-derives it.
 *
 * This drives the real server pipeline through a job's real lifecycle and
 * mirrors the client's aggregate logic, so it can tell those three apart
 * instead of guessing.
 *
 * Run:  node server/bench/joblifecycle.mjs
 * ------------------------------------------------------------------------- */

import { protocol } from '../protocol.mjs'
import { queueJobUpdate, queueSampleUpdate } from '../messenger.mjs'

const RUN = 'lifecycle-run'
const SAMPLE = 'barcode01'
let failures = 0
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok    ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

class MockSocket {
  constructor() { this.frames = [] }
  emit(event, payload) { if (event === 'mtx:frame') this.frames.push(payload) }
}

// ---------------------------------------------------------------------------
// Faithful mirror of App.vue's queue aggregate + publishQueueStatus.
// Kept in lockstep with the real thing; if you change one, change both.
// ---------------------------------------------------------------------------
class ClientMirror {
  constructor() {
    this.queueList = {}
    this.agg = {}
    this.status = {}
    this.runningSeen = false
  }

  contribution(job) {
    if (!job) return null
    const s = (job && job.status) || {}
    const ok = s.success === true || s.success === 0
    return {
      total: 1,
      running: s.running ? 1 : 0,
      waiting: s.waiting ? 1 : 0,
      success: ok ? 1 : 0,
      error: (s.success === false) ? 1 : 0
    }
  }

  apply(agg, c, sign) {
    if (!c) return
    for (const k of Object.keys(c)) agg[k] = (agg[k] || 0) + sign * c[k]
  }

  ensureAgg(sample) {
    if (this.agg[sample]) return this.agg[sample]
    const a = { total: 0, running: 0, waiting: 0, success: 0, error: 0 }
    for (const job of (this.queueList[sample] || [])) this.apply(a, this.contribution(job), 1)
    this.agg[sample] = a
    return a
  }

  applyJobFrames(jobs) {
    const touched = new Set()
    for (const j of jobs) {
      const sample = j.sample || j.samplename
      if (!sample) continue
      if (!this.queueList[sample]) this.queueList[sample] = []
      const idx = (j.index != null) ? j.index : this.queueList[sample].length
      const before = this.queueList[sample][idx]
      const merged = { ...(before || {}), ...(j.job || {}) }
      if (j.status) merged.status = j.status
      if (!merged.status) merged.status = { running: false, waiting: true, success: null }
      const a = this.ensureAgg(sample)
      this.apply(a, this.contribution(before), -1)
      this.apply(a, this.contribution(merged), 1)
      this.queueList[sample][idx] = merged
      touched.add(sample)
    }
    for (const sample of touched) {
      const a = this.ensureAgg(sample)
      this.status[sample] = {
        running: a.running > 0,
        total: a.total,
        done: a.success,
        pending: a.running + a.waiting
      }
      if (this.status[sample].running) this.runningSeen = true
    }
  }

  consume(frames) {
    for (const f of frames) {
      if (f.jobs && f.jobs.length) this.applyJobFrames(f.jobs)
    }
  }
}

const socket = new MockSocket()
protocol.attach('lc-user', socket)
protocol.get('lc-user').selectRun(RUN)
const client = new ClientMirror()

let cursor = 0
const pump = () => {
  protocol.flush()
  const fresh = socket.frames.slice(cursor)
  cursor = socket.frames.length
  client.consume(fresh)
  for (const f of fresh) protocol.ack('lc-user', f.seq)
  return fresh
}

// --- a realistic job: queued, then running for a few flush windows, then done
console.log('\n1. a normal job (runs across several flush windows)')
queueJobUpdate(RUN, SAMPLE, 0, { job: { index: 0 }, status: { running: false, waiting: true, success: null } })
pump()
check('queued state reaches the client', client.status[SAMPLE] && client.status[SAMPLE].total === 1)
check('not running yet', client.status[SAMPLE] && client.status[SAMPLE].running === false)

// classifier spawns -> sendJobStatus()
queueJobUpdate(RUN, SAMPLE, 0, { status: { running: true, waiting: false, success: null } })
pump()
check('RUNNING state reaches the client', client.status[SAMPLE] && client.status[SAMPLE].running === true,
  'the badge pulse is bound to exactly this flag')

// a couple more windows go by while kraken2 works
pump(); pump()
check('still running across later windows', client.status[SAMPLE].running === true)

// exit
queueJobUpdate(RUN, SAMPLE, 0, { status: { running: false, waiting: false, success: true } })
pump()
check('finished state reaches the client', client.status[SAMPLE].running === false && client.status[SAMPLE].done === 1)

// --- the pathological case: job starts AND finishes inside one window -------
console.log('\n2. a very fast job (starts and finishes within one flush window)')
const client2 = new ClientMirror()
const socket2Start = socket.frames.length
queueJobUpdate(RUN, SAMPLE, 1, { job: { index: 1 }, status: { running: false, waiting: true, success: null } })
queueJobUpdate(RUN, SAMPLE, 1, { status: { running: true, waiting: false, success: null } })
queueJobUpdate(RUN, SAMPLE, 1, { status: { running: false, waiting: false, success: true } })
protocol.flush()
const fast = socket.frames.slice(socket2Start)
cursor = socket.frames.length
client2.consume(fast)
for (const f of fast) protocol.ack('lc-user', f.seq)
console.log(`     (coalesced into ${fast.length} frame(s); running observed: ${client2.runningSeen})`)
check('fast job still reports a correct FINAL state',
  client2.status[SAMPLE] && client2.status[SAMPLE].done === 1 && client2.status[SAMPLE].running === false)

console.log(`\n${failures ? failures + ' FAILURES' : 'all passed'}\n`)
process.exit(failures ? 1 : 0)
