/* ---------------------------------------------------------------------------
 * bench/e2erun.mjs — end-to-end: directory of fastqs -> jobs -> full.report.
 *
 * Drives a real Sample through: initial directory scan (incl. files still
 * being written), live watcher pickup of files that arrive later, the
 * round-robin scheduler + PQueue, the classify command (a stand-in `kraken2`
 * that writes a deterministic report), the per-sample ReportCombiner, and the
 * frame bus. Verifies every file ran exactly once and full.report equals a
 * single combine of every per-file report.
 *
 * Needs KrakenTools' combine_kreports.py on PATH (or MYTAX_COMBINE_CMD).
 * Run:  node server/bench/e2erun.mjs [files]
 * ------------------------------------------------------------------------- */
import os from 'os'
import path from 'path'
import fs from 'fs'
import { spawnSync } from 'child_process'
import PQueue from 'p-queue'

const CMD = process.env.MYTAX_COMBINE_CMD || 'combine_kreports.py'
if (spawnSync(CMD, ['-h']).error) { console.log(`skipped: ${CMD} not found on PATH`); process.exit(0) }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mtx-e2e-'))
const bin = path.join(root, 'bin'); fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin, 'kraken2'), `#!/bin/bash
report=""; input=""
while [ $# -gt 0 ]; do case "$1" in --report) report="$2"; shift 2;; --out|--db) shift 2;; --*) shift;; *) input="$1"; shift;; esac; done
n=$(( $(printf %s "$input" | cksum | cut -d' ' -f1) % 50 + 1 ))
{ printf "10.00\\t5\\t5\\tU\\t0\\tunclassified\\n"
  printf "90.00\\t%d\\t1\\tR\\t1\\troot\\n" $((n+3))
  printf "60.00\\t%d\\t2\\tC\\t40674\\t  Mammalia\\n" $((n+2))
  printf "50.00\\t%d\\t%d\\tS\\t9755\\t    Physeter catodon\\n" $n $n; } > "$report"
echo "$n sequences classified (90.00%)" >&2
`, { mode: 0o755 })
process.env.PATH = `${bin}:${process.env.PATH}`
process.env.reports = path.join(root, 'reports')

const { storage } = await import('../storage.mjs')
const { Sample } = await import('../sample.mjs')
const { protocol } = await import('../protocol.mjs')
const { scheduler } = await import('../scheduler.mjs')
const { taxonStore } = await import('../taxonstore.mjs')
storage.queue = new PQueue({ concurrency: 1 })

let failures = 0
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok    ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const N = Number(process.argv[2] || 60)
const indir = path.join(root, 'barcode01'); fs.mkdirSync(indir)
const past = new Date(Date.now() - 60000)
for (let i = 0; i < N; i++) {
  const f = path.join(indir, `reads_${i}.fastq`)
  fs.writeFileSync(f, '@r\nACGT\n+\nIIII\n'); fs.utimesSync(f, past, past)
}
// still "being written" when the scan runs
for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(indir, `fresh_${i}.fastq`), '@r\nACGT\n+\nIIII\n')

const socket = { frames: 0, emit(ev, p) { if (ev === 'mtx:frame') { this.frames++; setImmediate(() => protocol.ack('e2e', p.seq)) } } }
protocol.attach('e2e', socket).selectRun('e2e-run')
protocol.start()

const t0 = Date.now()
const sample = new Sample({ run: 'e2e-run', sample: 'barcode01', outrun: path.join(process.env.reports, 'e2e-run'), path_1: indir, database: path.join(root, 'db'), watch: true }, storage.queue)
await sample.initialize()
await sleep(1500)
// files arriving later, through the live watcher
for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(indir, `late_${i}.fastq`), '@r\nACGT\n+\nIIII\n')

const expected = N + 3 + 5
const deadline = Date.now() + 90000
const done = () => sample.queueList.filter((q) => q.job && q.job.status && q.job.status.success === true).length
while (Date.now() < deadline) {
  if (done() >= expected && scheduler.totalPending() === 0 && scheduler.active === 0 && !sample.combiner.running) break
  await sleep(250)
}
await sleep(300)
const elapsed = Date.now() - t0

const reports = fs.readdirSync(sample.outputdir).filter((n) => n.endsWith('.report') && n !== 'full.report').map((n) => path.join(sample.outputdir, n))
const ref = path.join(root, 'ref.out')
spawnSync(CMD, ['--only-combined', '--no-headers', '-o', ref, '-r', ...reports])

console.log(`\n${expected} files processed in ${elapsed} ms; ${sample.combiner.stats.runs} combine pass(es), ${socket.frames} frame(s)\n`)
check('every file queued exactly once', sample.queueList.length === expected, `queued ${sample.queueList.length}`)
check('every job succeeded', done() === expected, `done ${done()}`)
check('one per-file report per fastq', reports.length === expected, `${reports.length}`)
check('full.report == combine of all per-file reports', fs.readFileSync(sample.fullreport, 'utf8') === fs.readFileSync(ref, 'utf8'))
check('combines were coalesced', sample.combiner.stats.runs <= expected)
check('taxon store holds the latest report', taxonStore.hasSample('e2e-run', 'barcode01') && sample.data === fs.readFileSync(sample.fullreport, 'utf8'))
check('status rollup reports success', sample.getStatus().success === true)

sample.cleanup()
protocol.stop()
fs.rmSync(root, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
