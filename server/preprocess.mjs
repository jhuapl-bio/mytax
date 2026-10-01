// ---------------------------------------------------------------------------
// preprocess.mjs — basecalling and/or demultiplexing ahead of classification.
//
// One Preprocessor per samplesheet entry that asked for it. It watches the
// entry's input (a file, or a directory the sequencer keeps writing to) and,
// for each new input file, runs ONE of:
//
//   demux     (FASTQ in)      dorado demux --kit-name K --emit-fastq
//                             or guppy_barcoder --barcode_kits K
//   basecall  (POD5/FAST5 in) dorado basecaller MODEL [--kit-name K]
//                             (+ dorado demux --no-classify when a kit is set)
//
// Output is normalised to  <run reports>/<entry>/_preprocess/reads/<barcodeNN>/
// no matter how the tool/version lays out its own output, and every barcode
// folder that appears is handed to the Run, which adds it as a normal sample
// (watching that folder), so classification starts as soon as reads land.
// Basecalling without a kit writes to reads/all/ and becomes one sample.
//
// Jobs run on their own single-slot queue, separate from classification: a
// long GPU basecall must not stall kraken2 for every other barcode.
// ---------------------------------------------------------------------------
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import chokidar from 'chokidar'
import PQueue from 'p-queue'
import { logger } from './logger.js'
import { killProcessTree } from './controllers.mjs'
import { resolveTool, deviceFlags } from './tools.mjs'

// Shared across every run: one basecall/demux at a time (GPU-bound work).
export const preprocessQueue = new PQueue({ concurrency: 1 })

const FASTQ_RE = /\.(fastq|fq)(\.gz)?$/i
const SIGNAL_RE = /\.(pod5|fast5)$/i
const BARCODE_RE = /(barcode\d+|unclassified)/i
const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

export const COMMON_KITS = [
    'SQK-NBD114-24', 'SQK-NBD114-96', 'SQK-RBK114-24', 'SQK-RBK114-96',
    'SQK-RPB114-24', 'SQK-PCB114-24', 'SQK-16S114-24',
    'SQK-NBD111-24', 'SQK-NBD111-96', 'SQK-RBK110-96', 'SQK-RBK004',
    'SQK-16S024', 'EXP-NBD104', 'EXP-NBD114', 'EXP-NBD196'
]

function listFilesRecursive(dir) {
    const out = []
    const walk = (d) => {
        let entries = []
        try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
        for (const e of entries) {
            const p = path.join(d, e.name)
            if (e.isDirectory()) walk(p)
            else out.push(p)
        }
    }
    walk(dir)
    return out
}

export class Preprocessor {
    /**
     * @param {object} cfg
     *   group      entry name (becomes the sample group)
     *   input      file or directory to watch
     *   mode       'demux' | 'basecall'
     *   tool       'dorado' | 'guppy'
     *   kit        barcode kit (required for demux; optional for basecall)
     *   model      'fast' | 'hac' | 'sup' | explicit model name (basecall)
     *   device     'auto' | 'gpu' | 'cpu'
     *   watch      keep watching for new files (default true)
     *   keepUnclassified  also classify reads with no barcode (default false)
     * @param {object} opts
     *   outdir     where this entry's output goes
     *   onReads(barcode, dir)  called once per new output folder
     *   onStatus()             called whenever the summary changes
     */
    constructor(cfg, { outdir, onReads, onStatus }) {
        this.cfg = { watch: true, keepUnclassified: false, tool: 'dorado', model: 'hac', device: 'auto', ...cfg }
        this.group = cfg.group
        this.outdir = outdir
        this.readsDir = path.join(outdir, 'reads')
        this.workDir = path.join(outdir, 'work')
        this.ledgerFile = path.join(outdir, 'processed.json')
        this.onReads = onReads || (() => {})
        this.onStatus = onStatus || (() => {})
        this.files = new Map()        // input path -> { state, error, startedAt, finishedAt }
        this.barcodes = new Set()
        this.ledger = {}
        this.stopped = false
        this.current = null           // running child process
        this.lastError = null
        this.deviceLabel = null
        this.toolPath = null
        this.toolVersion = null
    }

    get inputRe() { return this.cfg.mode === 'basecall' ? SIGNAL_RE : FASTQ_RE }

    async start() {
        fs.mkdirSync(this.readsDir, { recursive: true })
        try { this.ledger = JSON.parse(fs.readFileSync(this.ledgerFile, 'utf8')) } catch (e) { this.ledger = {} }
        // Output folders from a previous session become samples again.
        for (const name of this.listOutputFolders()) this.announce(name)

        const tool = await resolveTool(this.cfg.tool)
        this.toolPath = tool.path
        if (!tool.path) {
            this.lastError = `${this.cfg.tool === 'guppy' ? 'guppy_barcoder' : 'dorado'} was not found. Download it or set its path in Backend dependencies → Basecalling & demultiplexing.`
            logger.error(`[preprocess ${this.group}] ${this.lastError}`)
        }
        if (this.cfg.mode === 'basecall' && this.cfg.tool !== 'dorado') {
            this.lastError = 'Basecalling requires dorado (guppy is only supported for demultiplexing).'
        }
        const dev = await deviceFlags(this.cfg.device)
        this.deviceLabel = dev.label
        if (dev.warning) logger.warn(`[preprocess ${this.group}] ${dev.warning}`)

        const input = this.cfg.input
        let isDir = false
        try { isDir = fs.statSync(input).isDirectory() } catch (e) {
            this.lastError = `Input not found: ${input}`
            this.emit()
            return
        }
        const onFile = (p) => {
            if (this.stopped || !this.inputRe.test(p) || path.basename(p).startsWith('.')) return
            this.enqueue(p)
        }
        this.watcher = chokidar.watch(isDir ? input : [input], {
            persistent: true,
            depth: 0,
            ignoreInitial: false,
            usePolling: false,
            awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 300 }
        }).on('add', onFile).on('ready', () => {
            if (this.cfg.watch === false && this.watcher) { this.watcher.close(); this.watcher = null; this.emit() }
        }).on('error', (err) => logger.error(`[preprocess ${this.group}] watcher: ${err}`))
        this.emit()
    }

    listOutputFolders() {
        try {
            return fs.readdirSync(this.readsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
        } catch (e) { return [] }
    }

    announce(name) {
        if (this.barcodes.has(name)) return
        if (name === 'unclassified' && !this.cfg.keepUnclassified) return
        this.barcodes.add(name)
        try { this.onReads(name, path.join(this.readsDir, name)) } catch (e) { logger.error(`[preprocess ${this.group}] onReads: ${e}`) }
    }

    fingerprint(p) {
        try { const st = fs.statSync(p); return `${st.size}:${Math.round(st.mtimeMs)}` } catch (e) { return null }
    }

    enqueue(p) {
        const prev = this.files.get(p)
        if (prev && (prev.state === 'queued' || prev.state === 'running')) return
        const key = path.basename(p)
        if (this.ledger[key] && this.ledger[key] === this.fingerprint(p)) {
            this.files.set(p, { state: 'done', historical: true })
            this.emit()
            return
        }
        this.files.set(p, { state: 'queued' })
        this.emit()
        preprocessQueue.add(() => this.process(p)).catch((err) => logger.error(`[preprocess ${this.group}] ${err}`))
    }

    buildCommand(input, work) {
        const dev = this._dev
        const tool = quote(this.toolPath)
        const kit = this.cfg.kit ? String(this.cfg.kit).trim() : ''
        if (this.cfg.mode === 'basecall') {
            const model = quote(this.cfg.model || 'hac')
            if (kit) {
                return `${tool} basecaller ${model} ${quote(input)} ${dev.dorado} --kit-name ${quote(kit)} > ${quote(path.join(work, 'calls.bam'))}` +
                    ` && ${tool} demux --no-classify --emit-fastq --output-dir ${quote(path.join(work, 'out'))} ${quote(path.join(work, 'calls.bam'))}`
            }
            return `mkdir -p ${quote(path.join(work, 'out', 'all'))} && ${tool} basecaller ${model} ${quote(input)} ${dev.dorado} --emit-fastq > ${quote(path.join(work, 'out', 'all', path.basename(input).replace(SIGNAL_RE, '') + '.fastq'))}`
        }
        // demux
        if (this.cfg.tool === 'guppy') {
            const stage = path.join(work, 'in')
            return `mkdir -p ${quote(stage)} && ln -sf ${quote(input)} ${quote(path.join(stage, path.basename(input)))}` +
                ` && ${tool} -i ${quote(stage)} -s ${quote(path.join(work, 'out'))} --barcode_kits ${quote(kit)} --compress_fastq --disable_pings ${dev.guppy}`
        }
        return `${tool} demux --kit-name ${quote(kit)} --emit-fastq --output-dir ${quote(path.join(work, 'out'))} ${quote(input)}`
    }

    // Move every FASTQ the tool produced into reads/<barcode>/, whatever layout
    // that tool/version used (flat `KIT_barcode01.fastq`, nested
    // `.../fastq_pass/barcode01/...`, guppy's `barcode01/fastq_runid_*.fastq.gz`).
    collect(input, work) {
        const outRoot = path.join(work, 'out')
        const base = path.basename(input).replace(SIGNAL_RE, '').replace(FASTQ_RE, '')
        const produced = listFilesRecursive(outRoot).filter((f) => FASTQ_RE.test(f))
        const touched = new Set()
        let n = 0
        for (const f of produced) {
            const rel = path.relative(outRoot, f)
            let label = 'unclassified'
            const m = rel.match(BARCODE_RE)
            if (m) label = m[1].toLowerCase()
            else if (rel.split(path.sep)[0] === 'all') label = 'all'
            if (label === 'unclassified' && !this.cfg.keepUnclassified) continue
            const destDir = path.join(this.readsDir, label)
            fs.mkdirSync(destDir, { recursive: true })
            const gz = /\.gz$/i.test(f) ? '.gz' : ''
            const dest = path.join(destDir, `${base}${n ? `_${n}` : ''}.fastq${gz}`)
            n += 1
            try {
                fs.renameSync(f, dest)                       // atomic: sample watchers see complete files
            } catch (e) {
                fs.copyFileSync(f, dest + '.part'); fs.renameSync(dest + '.part', dest)
            }
            touched.add(label)
        }
        for (const label of touched) this.announce(label)
        return { files: n, barcodes: touched.size }
    }

    async process(input) {
        if (this.stopped) return
        const rec = this.files.get(input) || {}
        // Re-resolve each time: the tool may have been downloaded or its path
        // set after this entry was created.
        const tool = await resolveTool(this.cfg.tool)
        this.toolPath = tool.path
        if (this.toolPath && this.lastError && /not found/.test(this.lastError)) this.lastError = null
        if (!this.toolPath) {
            this.files.set(input, { state: 'failed', error: this.lastError })
            this.emit()
            return
        }
        if (this.cfg.mode !== 'basecall' && !this.cfg.kit) {
            this.lastError = 'A barcode kit is required for demultiplexing.'
            this.files.set(input, { state: 'failed', error: this.lastError })
            this.emit()
            return
        }
        this._dev = await deviceFlags(this.cfg.device)
        this.deviceLabel = this._dev.label
        const work = path.join(this.workDir, `${Date.now()}_${path.basename(input)}`)
        fs.mkdirSync(work, { recursive: true })
        const cmd = this.buildCommand(input, work)
        this.files.set(input, { ...rec, state: 'running', startedAt: Date.now() })
        this.emit()
        logger.info(`[preprocess ${this.group}] ${this.cfg.mode} ${path.basename(input)} (${this.deviceLabel})`)

        const result = await new Promise((resolve) => {
            let stderr = ''
            const child = spawn('bash', ['-c', cmd], { detached: true })
            this.current = child
            child.stdout.on('data', () => {})
            child.stderr.on('data', (d) => {
                stderr += d
                if (stderr.length > 6000) stderr = stderr.slice(-6000)
            })
            child.on('error', (err) => resolve({ code: 1, stderr: String(err) }))
            child.on('close', (code, signal) => resolve({ code: signal ? 1 : code, stderr, signal }))
        })
        this.current = null
        if (this.stopped) { try { fs.rmSync(work, { recursive: true, force: true }) } catch (e) { /* ignore */ } return }

        if (result.code !== 0) {
            const tail = result.stderr.trim().split('\n').slice(-4).join(' | ')
            this.lastError = `${path.basename(input)}: exit ${result.code}${tail ? ` — ${tail}` : ''}`
            logger.error(`[preprocess ${this.group}] ${this.lastError}`)
            this.files.set(input, { state: 'failed', error: this.lastError, finishedAt: Date.now() })
        } else {
            let got = { files: 0, barcodes: 0 }
            try { got = this.collect(input, work) } catch (err) {
                this.lastError = `${path.basename(input)}: could not collect output — ${err.message || err}`
            }
            this.files.set(input, { state: 'done', finishedAt: Date.now(), outputs: got.files })
            this.ledger[path.basename(input)] = this.fingerprint(input)
            try { fs.writeFileSync(this.ledgerFile, JSON.stringify(this.ledger)) } catch (e) { /* ignore */ }
            if (!got.files) logger.warn(`[preprocess ${this.group}] ${path.basename(input)} produced no barcoded reads`)
        }
        try { fs.rmSync(work, { recursive: true, force: true }) } catch (e) { /* ignore */ }
        this.emit()
    }

    // Re-queue every input that failed (e.g. after installing the tool).
    retryFailed() {
        if (this.stopped) return 0
        let n = 0
        for (const [p, r] of this.files) {
            if (r.state === 'failed') { this.files.delete(p); this.enqueue(p); n += 1 }
        }
        if (n) this.lastError = null
        this.emit()
        return n
    }

    async stop() {
        this.stopped = true
        try { if (this.watcher) await this.watcher.close() } catch (e) { /* ignore */ }
        this.watcher = null
        if (this.current) { try { killProcessTree(this.current) } catch (e) { /* ignore */ } }
        for (const [p, r] of this.files) if (r.state === 'queued') this.files.set(p, { state: 'cancelled' })
        this.emit()
    }

    summary() {
        const c = { total: 0, queued: 0, running: 0, done: 0, failed: 0 }
        for (const r of this.files.values()) {
            if (r.state === 'cancelled') continue
            c.total += 1
            if (c[r.state] !== undefined) c[r.state] += 1
        }
        return {
            group: this.group,
            mode: this.cfg.mode,
            tool: this.cfg.tool,
            kit: this.cfg.kit || null,
            model: this.cfg.mode === 'basecall' ? (this.cfg.model || 'hac') : null,
            input: this.cfg.input,
            device: this.deviceLabel,
            toolPath: this.toolPath,
            watching: !!this.watcher && !this.stopped,
            stopped: this.stopped,
            files: c,
            barcodes: Array.from(this.barcodes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
            lastError: this.lastError
        }
    }

    emit() {
        try { this.onStatus(this.summary()) } catch (e) { logger.error(`[preprocess ${this.group}] status: ${e}`) }
    }
}
