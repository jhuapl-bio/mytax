// ---------------------------------------------------------------------------
// combiner.mjs — per-sample merge of per-file kraken reports into full.report.
//
// WHY THIS EXISTS
// ---------------
// Every classify job used to end with
//
//     combine_kreports.py -o full.report -r <EVERY *.report in the sample dir>
//
// chained onto the kraken2 command, i.e. INSIDE the single-concurrency job
// queue. For a barcode with N fastqs that is 1 + 2 + ... + N report reads —
// O(N^2) — and all of it blocked the queue: file #400 of a barcode had to
// re-read 399 reports before the next barcode's file could even start. The
// file list also went on the command line, which eventually runs into ARG_MAX
// on a big barcode.
//
// Now each job only writes its own per-file report. This class merges finished
// reports into full.report on the side:
//
//   * single-flight per sample: at most one combine running per sample; files
//     that finish meanwhile are batched into the next pass.
//   * incremental: full.report + just the new reports. combine_kreports output
//     is itself a valid kreport and summing is associative, so this is
//     byte-identical to re-combining everything (verified against KrakenTools).
//   * full rebuild whenever we can't prove what full.report contains: first
//     combine after (re)start, a rerun overwriting an already-merged report,
//     a previous failure, or full.report missing on disk.
//   * chunked: huge rebuilds are combined in batches, then the partials merged.
//   * atomic: written to a temp file and renamed, so readers never see a
//     half-written full.report.
// ---------------------------------------------------------------------------
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { logger } from './logger.js'

const COMBINE_CMD = process.env.MYTAX_COMBINE_CMD || 'combine_kreports.py'
// Max report paths per combine_kreports invocation (ARG_MAX headroom).
const CHUNK = 300

function exists(p) {
    try { return fs.statSync(p).size > 0 } catch (e) { return false }
}
function fingerprint(p) {
    try { const st = fs.statSync(p); return st.size > 0 ? `${st.size}:${st.mtimeMs}` : null } catch (e) { return null }
}

export class ReportCombiner {
    constructor({ outputdir, fullreport, label, onCombined }) {
        this.outputdir = outputdir
        this.fullreport = fullreport
        this.label = label || path.basename(outputdir || '')
        this.onCombined = onCombined || (() => {})
        this.included = null       // Set of per-file reports merged into full.report; null = unknown
        this.pending = new Set()   // finished per-file reports not merged yet
        this.needFull = false
        this.running = null
        this.again = false
        this.generation = 0        // bumped by reset(); stale results are discarded
        this.stats = { runs: 0, full: 0, incremental: 0, lastMs: 0 }
    }

    // A job finished and wrote `reportPath`. `rebuild` forces a full re-merge
    // (a rerun replaced a report whose old counts are already in full.report).
    request(reportPath, { rebuild = false } = {}) {
        if (rebuild || this.included === null || (reportPath && this.included.has(reportPath))) {
            this.needFull = true
        }
        if (reportPath) this.pending.add(reportPath)
        if (this.running) { this.again = true; return this.running }
        // Start on the next microtask so `running` is assigned before the loop
        // can possibly finish (and clear it).
        this.running = Promise.resolve().then(() => this._loop())
        return this.running
    }

    // Output directory was wiped / sample re-pointed: forget everything.
    reset() {
        this.generation += 1
        this.included = null
        this.pending.clear()
        this.needFull = false
    }

    async _loop() {
        let guard = 0
        try {
            while (true) {
                this.again = false
                const ok = await this._runOnce()
                if (!ok) break              // don't spin on a broken combine
                if (++guard > 10000) break
                if (!(this.again || this.pending.size || this.needFull)) break
            }
        } finally {
            // Synchronous with the final check above: a request() can't slip in
            // between "nothing left" and "not running" and be stranded.
            this.running = null
        }
    }

    async _runOnce() {
        const gen = this.generation
        const full = this.needFull || this.included === null || !exists(this.fullreport)
        const batch = Array.from(this.pending)
        this.pending.clear()
        this.needFull = false

        // What each per-file input looked like when we read it. A job can finish
        // (and request a merge of its report) WHILE this pass is reading that
        // very report -- e.g. a full rebuild's directory listing picked it up.
        // Afterwards such a request must not merge the report a second time;
        // if the file is unchanged it's already counted, if it changed since
        // we read it we rebuild. (Without this, one report could be counted
        // twice under load.)
        const seen = new Map()
        let inputs
        if (full) {
            let names = []
            try { names = await fs.promises.readdir(this.outputdir) } catch (e) { names = [] }
            const fullName = path.basename(this.fullreport)
            inputs = []
            for (const n of names) {
                if (!n.endsWith('.report') || n === fullName) continue
                const p = path.join(this.outputdir, n)
                const fp = fingerprint(p)
                if (fp) { inputs.push(p); seen.set(p, fp) }
            }
        } else {
            const fresh = []
            for (const p of batch) {
                const fp = fingerprint(p)
                if (fp) { fresh.push(p); seen.set(p, fp) }
            }
            if (!fresh.length) return true
            inputs = [this.fullreport, ...fresh]
        }
        if (!inputs.length) return true

        const tmp = `${this.fullreport}.${process.pid}.${Date.now()}.tmp`
        const started = Date.now()
        try {
            await this._combineChunked(inputs, tmp)
            if (gen !== this.generation) {           // reset while we were running
                await fs.promises.rm(tmp, { force: true })
                return true
            }
            await fs.promises.rename(tmp, this.fullreport)
        } catch (err) {
            logger.error(`[${this.label}] combine_kreports failed (${full ? 'full' : 'incremental'}, ${inputs.length} input(s)): ${err && err.message ? err.message : err}`)
            try { await fs.promises.rm(tmp, { force: true }) } catch (e) { /* ignore */ }
            // We no longer know what full.report holds; next request rebuilds.
            this.included = null
            return false
        }

        if (full) {
            this.included = new Set(inputs)
        } else {
            for (const p of inputs) if (p !== this.fullreport) this.included.add(p)
        }
        // Requests that arrived during this pass for reports it just merged.
        for (const p of Array.from(this.pending)) {
            if (!seen.has(p)) continue
            this.pending.delete(p)
            if (fingerprint(p) !== seen.get(p)) this.needFull = true
        }
        this.stats.runs += 1
        this.stats[full ? 'full' : 'incremental'] += 1
        this.stats.lastMs = Date.now() - started
        try { await this.onCombined() } catch (err) { logger.error(`[${this.label}] onCombined: ${err}`) }
        return true
    }

    async _combineChunked(inputs, out) {
        if (inputs.length <= CHUNK) return this._combine(inputs, out)
        const parts = []
        try {
            for (let i = 0; i < inputs.length; i += CHUNK) {
                const part = `${out}.part${parts.length}`
                await this._combine(inputs.slice(i, i + CHUNK), part)
                parts.push(part)
            }
            await this._combineChunked(parts, out)
        } finally {
            for (const p of parts) { try { await fs.promises.rm(p, { force: true }) } catch (e) { /* ignore */ } }
        }
    }

    _combine(inputs, out) {
        return new Promise((resolve, reject) => {
            let stderr = ''
            let child
            try {
                child = spawn(COMBINE_CMD, ['--only-combined', '--no-headers', '-o', out, '-r', ...inputs], {
                    stdio: ['ignore', 'ignore', 'pipe']
                })
            } catch (err) { reject(err); return }
            child.stderr.on('data', (d) => {
                stderr += d
                if (stderr.length > 4000) stderr = stderr.slice(-4000)
            })
            child.on('error', reject)
            child.on('close', (code) => {
                if (code === 0) resolve()
                else reject(new Error(`exit ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`))
            })
        })
    }
}
