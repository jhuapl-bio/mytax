/* ---------------------------------------------------------------------------
 * bench/preprocess.mjs — demux / basecall pipeline end-to-end.
 *
 * Uses whatever `dorado` is on PATH (a real one, or a stand-in for CI) to:
 *   1. demultiplex a watched FASTQ directory (existing + late-arriving files)
 *      and check each barcode folder becomes a classified sample input,
 *   2. basecall a POD5 file with a kit and check barcodes come out.
 *
 * Run:  node server/bench/preprocess.mjs
 * ------------------------------------------------------------------------- */
import os from 'os'
import path from 'path'
import fs from 'fs'
import { spawnSync } from 'child_process'

if (spawnSync('dorado', ['--version']).error) { console.log('skipped: dorado not on PATH'); process.exit(0) }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mtx-pre-'))
process.env.HOME = root   // tools.json / managed tools live under a throwaway HOME
const { Preprocessor, preprocessQueue } = await import('../preprocess.mjs')

let failures = 0
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok    ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fastq = (n, seed) => Array.from({ length: n }, (_, i) => `@r${seed}_${i}\nACGTACGTAC\n+\nIIIIIIIIII`).join('\n') + '\n'

// ---- 1. demux a watched directory ------------------------------------------
const indir = path.join(root, 'fastq_pass'); fs.mkdirSync(indir)
const past = new Date(Date.now() - 60000)
for (let i = 0; i < 3; i++) { const f = path.join(indir, `run_${i}.fastq`); fs.writeFileSync(f, fastq(200, i)); fs.utimesSync(f, past, past) }
const announced = []
const pp = new Preprocessor(
  { group: 'RunX', input: indir, mode: 'demux', tool: 'dorado', kit: 'SQK-NBD114-24', device: 'auto' },
  { outdir: path.join(root, 'out', 'RunX', '_preprocess'), onReads: (label, dir) => announced.push({ label, dir }) }
)
await pp.start()
await sleep(4500)                        // chokidar awaitWriteFinish (3s)
fs.writeFileSync(path.join(indir, 'run_late.fastq'), fastq(120, 99))
for (let t = 0; t < 60 && !(pp.summary().files.done >= 4 && preprocessQueue.size === 0 && preprocessQueue.pending === 0); t++) await sleep(250)
const s1 = pp.summary()
console.log(`\ndemux: ${JSON.stringify(s1.files)} barcodes=${s1.barcodes.join(',')} device=${s1.device}`)
check('all 4 input files demultiplexed (incl. late arrival)', s1.files.done === 4, JSON.stringify(s1.files))
check('barcode folders announced once each', announced.length === 3 && new Set(announced.map((a) => a.label)).size === 3, announced.map((a) => a.label).join(','))
check('unclassified reads dropped by default', !announced.some((a) => a.label === 'unclassified'))
const bc1 = path.join(root, 'out', 'RunX', '_preprocess', 'reads', 'barcode01')
const files = fs.existsSync(bc1) ? fs.readdirSync(bc1) : []
check('one fastq per input file per barcode, named after the input', files.length === 4 && files.includes('run_late.fastq'), files.join(','))
const reads = files.reduce((n, f) => n + fs.readFileSync(path.join(bc1, f), 'utf8').split('\n').filter((l) => l.startsWith('@')).length, 0)
check('reads landed in barcode01', reads > 0, String(reads))
check('work dirs cleaned up', fs.readdirSync(path.join(root, 'out', 'RunX', '_preprocess', 'work')).length === 0)
await pp.stop()

// restart: nothing reprocessed, folders re-announced
const again = []
const pp2 = new Preprocessor(
  { group: 'RunX', input: indir, mode: 'demux', tool: 'dorado', kit: 'SQK-NBD114-24', watch: false },
  { outdir: path.join(root, 'out', 'RunX', '_preprocess'), onReads: (label) => again.push(label) }
)
await pp2.start(); await sleep(4500)
check('restart re-announces existing barcode folders', again.length === 3, again.join(','))
check('restart skips already-processed inputs', pp2.summary().files.done === 4 && pp2.summary().files.running === 0, JSON.stringify(pp2.summary().files))
await pp2.stop()

// ---- 2. basecall pod5 with a kit ------------------------------------------
const pod = path.join(root, 'pod5'); fs.mkdirSync(pod)
fs.writeFileSync(path.join(pod, 'reads_0.pod5'), 'x'); fs.utimesSync(path.join(pod, 'reads_0.pod5'), past, past)
const got = []
const bc = new Preprocessor(
  { group: 'Pod', input: pod, mode: 'basecall', tool: 'dorado', kit: 'SQK-NBD114-24', model: 'hac', device: 'cpu', watch: false },
  { outdir: path.join(root, 'out', 'Pod', '_preprocess'), onReads: (label) => got.push(label) }
)
await bc.start()
for (let t = 0; t < 60 && bc.summary().files.done < 1 && !bc.summary().files.failed; t++) await sleep(250)
console.log(`basecall: ${JSON.stringify(bc.summary().files)} barcodes=${bc.summary().barcodes.join(',')} device=${bc.summary().device}`)
check('pod5 basecalled + split by barcode', bc.summary().files.done === 1 && got.length === 3, `${JSON.stringify(bc.summary().files)} ${got.join(',')} ${bc.summary().lastError || ''}`)
await bc.stop()

// ---- 3. missing kit is reported, not crashed --------------------------------
const bad = new Preprocessor({ group: 'NoKit', input: indir, mode: 'demux', tool: 'dorado', kit: '', watch: false },
  { outdir: path.join(root, 'out', 'NoKit', '_preprocess') })
await bad.start(); for (let t = 0; t < 40 && bad.summary().files.failed < 4; t++) await sleep(250)
check('demux without a kit fails with a clear message', /kit is required/.test(bad.summary().lastError || ''), bad.summary().lastError)
await bad.stop()

fs.rmSync(root, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
