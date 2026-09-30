/* ---------------------------------------------------------------------------
 * bench/manyfiles.mjs — load test for "lots of single fastq files across many
 * barcodes". Exercises the real Sample -> Classifier -> scheduler -> protocol
 * path (no kraken2 is spawned: the PQueue is never started).
 *
 * Measures:
 *   1. time to discover/enqueue B barcodes x N files
 *   2. frames/bytes sent to a client while reports keep arriving mid-run
 *      (the queue-seeding path used to resend the WHOLE queue every time the
 *      known file count grew -> O(n^2) bytes)
 *
 * Run:  node server/bench/manyfiles.mjs [barcodes] [filesPerBarcode]
 * ------------------------------------------------------------------------- */
import os from 'os'
import path from 'path'
import fs from 'fs'
import PQueue from 'p-queue'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtx-bench-'))
process.env.reports = tmp

const { storage } = await import('../storage.mjs')
const { Sample } = await import('../sample.mjs')
const { protocol } = await import('../protocol.mjs')
const { scheduler } = await import('../scheduler.mjs')

const B = Number(process.argv[2] || 24)
const N = Number(process.argv[3] || 400)
const RUN = 'bench-run'
storage.queue = new PQueue({ concurrency: 1, autoStart: false })

const socket = {
  frames: 0, bytes: 0, jobs: 0,
  emit(ev, p) {
    if (ev !== 'mtx:frame') return
    this.frames++
    this.bytes += JSON.stringify(p).length
    this.jobs += (p.jobs || []).length
    setImmediate(() => protocol.ack('bench', p.seq))
  }
}
protocol.attach('bench', socket).selectRun(RUN)

function report(nTaxa, scale) {
  const lines = []
  for (let i = 0; i < nTaxa; i++) {
    const c = Math.max(1, Math.round((nTaxa - i) * scale))
    const depth = 1 + (i % 5)
    lines.push(`${(c / 100).toFixed(2)}\t${c}\t${c}\tG\t${7000 + i}\t${' '.repeat(depth * 2)}Taxon ${i}`)
  }
  return lines.join('\n')
}

const samples = []
for (let b = 0; b < B; b++) {
  samples.push(new Sample({ run: RUN, sample: `barcode${String(b + 1).padStart(2, '0')}`, outrun: tmp, path_1: tmp, database: null }, storage.queue))
}

// Phase 1: discovery. Every file of every barcode lands at once (initial scan).
let t0 = performance.now()
for (let i = 0; i < N; i++) for (const s of samples) s.addFile(`/data/${s.sample}/reads_${i}.fastq`)
const tEnqueue = performance.now() - t0

// Phase 2: live run. Reports keep arriving while the queue is still growing:
// each round every barcode gets one more file AND an updated report.
const ROUNDS = 40
const tick = () => new Promise((r) => setImmediate(r))
const b0 = socket.bytes, f0 = socket.frames, j0 = socket.jobs
t0 = performance.now()
for (let r = 0; r < ROUNDS; r++) {
  for (const s of samples) {
    s.addFile(`/data/${s.sample}/late_${r}.fastq`)
    s.data = report(200 + r * 5, 1 + r / 10)
    s.sendData()
  }
  protocol.flush()
  await tick(); await tick()
}
protocol.flush(); await tick()
const tLive = performance.now() - t0

const pend = scheduler.totalPending()
console.log(`barcodes x files          ${B} x ${N} (+${ROUNDS} live) = ${pend + scheduler.active} jobs`)
console.log(`enqueue time              ${tEnqueue.toFixed(0)} ms`)
console.log(`live phase time           ${tLive.toFixed(0)} ms`)
console.log(`live phase frames         ${socket.frames - f0}`)
console.log(`live phase job entries    ${socket.jobs - j0}`)
console.log(`live phase bytes          ${((socket.bytes - b0) / 1048576).toFixed(2)} MB`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(0)
