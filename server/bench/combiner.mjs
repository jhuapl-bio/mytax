/* ---------------------------------------------------------------------------
 * bench/combiner.mjs — correctness + cost of the per-sample report combiner.
 *
 * Needs KrakenTools' combine_kreports.py on PATH (or MYTAX_COMBINE_CMD).
 * Checks that incremental/coalesced/chunked merging produces exactly what a
 * single full combine of every per-file report produces.
 *
 * Run:  node server/bench/combiner.mjs [files]
 * ------------------------------------------------------------------------- */
import os from 'os'
import path from 'path'
import fs from 'fs'
import { spawnSync } from 'child_process'
import { ReportCombiner } from '../combiner.mjs'

const CMD = process.env.MYTAX_COMBINE_CMD || 'combine_kreports.py'
if (spawnSync(CMD, ['-h']).error) {
  console.log(`skipped: ${CMD} not found on PATH`)
  process.exit(0)
}
let failures = 0
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok    ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

const N = Number(process.argv[2] || 650)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtx-comb-'))
const full = path.join(dir, 'full.report')

// deterministic little taxonomy
let seed = 7
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
const tree = { 1: [2, 2759], 2: [10, 11], 10: [100, 101], 11: [110], 2759: [40674], 40674: [9606, 9755] }
const rank = { 1: 'R', 2: 'D', 10: 'G', 11: 'G', 100: 'S', 101: 'S', 110: 'S', 2759: 'D', 40674: 'C', 9606: 'S', 9755: 'S' }
const name = { 1: 'root', 2: 'Bacteria', 10: 'GenA', 11: 'GenB', 100: 'Sp a1', 101: 'Sp a2', 110: 'Sp b1', 2759: 'Eukaryota', 40674: 'Mammalia', 9606: 'Homo sapiens', 9755: 'Physeter catodon' }
function writeReport(file) {
  const direct = {}
  for (const t of Object.keys(rank)) direct[t] = rnd(10) < 7 ? rnd(20) : 0
  const unc = rnd(50)
  const clade = (t) => direct[t] + (tree[t] || []).reduce((a, c) => a + clade(c), 0)
  const tot = clade(1) + unc
  const lines = []
  if (unc) lines.push(`${(100 * unc / tot).toFixed(2)}\t${unc}\t${unc}\tU\t0\tunclassified`)
  const walk = (t, d) => {
    const c = clade(t); if (!c) return
    lines.push(`${(100 * c / tot).toFixed(2)}\t${c}\t${direct[t]}\t${rank[t]}\t${t}\t${'  '.repeat(d)}${name[t]}`)
    for (const ch of tree[t] || []) walk(ch, d + 1)
  }
  walk(1, 0)
  fs.writeFileSync(file, lines.join('\n') + '\n')
}
const reference = (files) => {
  const out = path.join(dir, 'reference.out')
  const r = spawnSync(CMD, ['--only-combined', '--no-headers', '-o', out, '-r', ...files])
  if (r.status !== 0) throw new Error(String(r.stderr))
  return fs.readFileSync(out, 'utf8')
}

let published = 0
const comb = new ReportCombiner({ outputdir: dir, fullreport: full, label: 'bench', onCombined: () => { published++ } })
const files = []
const t0 = Date.now()
// Jobs finish in bursts while combines are running.
for (let i = 0; i < N; i++) {
  const f = path.join(dir, `reads_${i}.report`)
  writeReport(f); files.push(f)
  comb.request(f)
  if (i % 25 === 0) await comb.running
}
await comb.running
const tLive = Date.now() - t0
console.log(`\n${N} per-file reports, merged live in ${tLive} ms using ${comb.stats.runs} combine pass(es) (${comb.stats.full} full, ${comb.stats.incremental} incremental)`)
console.log(`old behaviour: ${N} combines reading ${(N * (N + 1) / 2).toLocaleString()} report files in total\n`)
check('coalesced: far fewer combines than files', comb.stats.runs < N / 5)
check('live result equals one full combine of every report', fs.readFileSync(full, 'utf8') === reference(files))
check('published after combining', published === comb.stats.runs)

// A rerun overwrites an already-merged report: must rebuild, not double count.
writeReport(files[3])
await comb.request(files[3], { rebuild: true })
check('rerun of a merged file => full rebuild, no double counting', fs.readFileSync(full, 'utf8') === reference(files))

// Same file finishing again WITHOUT the rebuild hint is still detected.
writeReport(files[5])
await comb.request(files[5])
check('re-merged file detected even without the hint', fs.readFileSync(full, 'utf8') === reference(files))

// Server restart: a fresh combiner doesn't know what full.report holds.
const comb2 = new ReportCombiner({ outputdir: dir, fullreport: full, label: 'bench2' })
const extra = path.join(dir, 'reads_extra.report'); writeReport(extra); files.push(extra)
await comb2.request(extra)
check('first combine after restart is a full rebuild', comb2.stats.full === 1)
check('...and correct', fs.readFileSync(full, 'utf8') === reference(files))
check('no temp files left behind', fs.readdirSync(dir).every((n) => !n.endsWith('.tmp') && !n.includes('.part')))

fs.rmSync(dir, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
