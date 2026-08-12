
import path, { resolve } from 'path'
import { Classifier} from './classifier.mjs'
import { getReportName, rmDir, rmFile, removeExtension, globFiles } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
import chokidar from 'chokidar'
import {AbortError} from 'p-queue'
import {Barcoder} from "./barcoder.mjs"
import _ from 'lodash';
import { mkdirp } from 'mkdirp'
import { pathEqual } from 'path-equal'
import { storage } from './storage.mjs'
import { scheduler } from './scheduler.mjs'
import { broadcastToAllActiveConnections, queueSampleUpdate, queueJobUpdate } from './messenger.mjs';
export  class Sample { 

    constructor(info, queue){
        this.queue = queue
        this._files = [];
        this.data = ''
        this.reportWatcher = null
        this._reports = [];
        this.run = info.run
        this.queueList = []
        this.queueRecords = []
        this.sample = info.sample ? info.sample : "NoNameSample"
        // Hierarchy metadata. `group` is the parent run/folder this sample was
        // discovered under (null for standalone single samples); `label` is the
        // short display name shown within that group (e.g. "barcode01"). The
        // unique key remains `this.sample`.
        this.group = info.group !== undefined ? info.group : null
        this.label = info.label !== undefined && info.label !== null ? info.label : this.sample
        this.path_1 = info.path_1
        this.path_2 = info.path_2
        this.config = info.config
        if (!this.path_1 && this.path_2){
            this.path_1 = this.path_2
            this.path_2 = null
        }
        this.status = {
            running: false, 
            complete: false, 
            error: null 
        }
        this.outputdir = path.join(info.outrun, this.sample)
        this.fullreport = path.join(this.outputdir,'full.report')
        this.platform = info.platform ? info.platform : 'illumina'
        // watch === true (default) keeps watching the input for new reads in real time;
        // false does a single pass over existing files then stops watching.
        this.watch = info.watch !== undefined ? info.watch : true
        this.format = info.format ? info.format : 'file'
        this.pattern = info.pattern
        this.kits = info.kits
        // Classification engine for this sample: 'kraken2' (default), 'minimap2'
        // or 'bracken'. Chosen per-sample, editable after the fact, and re-runnable.
        this.classifier = info.classifier ? info.classifier : 'kraken2'
        // Optional fastp low-quality-read filtering before classification (default off).
        this.fastp = info.fastp === true || info.fastp === 'true'
        this.fastpConfig = info.fastpConfig || null
        // FASTA/MMI reference used when classifier === 'minimap2'.
        this.minimapDatabase = info.minimapDatabase || null
        this.brackenConfig = info.brackenConfig || null
        this.samplesheet = {
            sample: this.sample,
            group: this.group,
            label: this.label,
            path_1: this.path_1,
            path_2: this.path_2,
            // Real-time watch intent. The live "is a watcher currently attached"
            // flag rides on getStatus().watching, but that only exists for
            // samples that have produced a report. A sample that is being
            // watched and simply has not seen a fastq yet had no way to say so,
            // so the UI could not tell "waiting for reads" apart from "this
            // sample is broken" and painted both as an error.
            watch: this.watch,
            kits: this.kits,
            classifier: this.classifier,
            fastp: this.fastp,
            fastpConfig: this.fastpConfig,
            minimapDatabase: this.minimapDatabase,
            brackenConfig: this.brackenConfig
        }
        this.database = info.database

    }

    async initialize(){
        try{
            // check if outputdir exists, if bot then make it
            // logger.info(`Initializing sample ${this.sample} with outputdir: ${this.outputdir}`)
            await mkdirp(this.outputdir)
        } catch (err){
            logger.error(`${err} failure to make outputdir ${this.outputdir}`)
            throw err
        } finally{
            try{
                this.startWatcher()
            } catch {
                logger.error(`${err} failure to start watcher for sample ${this.sample}`)
                throw err
            }
            try{
                this.setupWatcherSequencing()
            } catch {
                logger.error(`${err} failure to start watcher for sample ${this.sample}`)
                throw err
            }
        }
        
    }
    // samples can be either a directory where each directory is a sample OR if it is a file then it belongs to a single sample
    async setupWatcherSequencing(){
        const $this = this
        if (!this.path_1){
            logger.warn(`No input path set for sample ${this.sample}; skipping sequencing watcher setup`)
            return
        }
        logger.info(`Setting up run ${this.path_1}`)
        let format = "directory"
        // check if the this.path_1 is a file or a directory
        let watchpaths = [this.path_1]
        // if (this.path_2 && watchpaths.indexOf(this.path_2) == -1){
        //     watchpaths.push(this.path_2)
        // } 
        try{
            let checkDir = await fs.lstatSync(this.path_1).isDirectory()
            format = checkDir ? 'directory' : 'file'
        } catch (Err){
            logger.error(`${Err} error in checking if path is a directory`)
            broadcastToAllActiveConnections("alert",  {message: `${Err} error in checking if path is a directory`})
        } finally {
            if (format == "directory"){
                // if it is a directory then watch the directory
                logger.info(`Watching directory ${this.path_1}`)
                watchpaths = [
                    `${this.path_1}/*fq`,
                    `${this.path_1}/*fastq`,
                    `${this.path_1}/*fastq.gz`,
                    `${this.path_1}/*fq.gz`,
                    `${this.path_1}/*fa`,
                    `${this.path_1}/*fna`,
                    `${this.path_1}/*faa`,
                    `${this.path_1}/*fasta`
                ]
            }  

        }

        try{
            this.watcher = await chokidar.watch(watchpaths, {
                ignored: /^\./,
                persistent: true,
                // Local-disk inputs: use native fsevents/inotify instead of
                // polling. Polling a 400-file directory means stat()-ing every
                // file on every tick, which pins a CPU core and stalls the event
                // loop (the root cause of the lag + dropped websocket pings).
                usePolling: false,
                // Don't fire 'add' until the fastq has finished being written.
                // MinKNOW streams reads into a file, so without this we'd queue a
                // classify job against a half-written file and re-fire on every
                // flush. Waiting for the size to stabilise = one job per file.
                awaitWriteFinish: {
                    stabilityThreshold: 2000,
                    pollInterval: 200
                }
            })
            .on('add', async function(filepath, stat) {
                logger.info(`NEWLY CREATED Seq: File ${filepath} has been ADDED`);
                $this.addFile(filepath)
            })
            .on('change', function(filepath) {  
                logger.info(`ALTERED Seq: File ${filepath} has been ALTERED`);
            })
            .on('unlinkDir', function(directory) { 
                logger.info(`Directory ${directory} has been removed`);
            }).on('unlink', function(filepath) {
                logger.info(`File ${filepath} has been removed`);
            }).on('ready', function() {
                // initial scan finished; if real-time watching is disabled, stop here
                if ($this.watch === false){
                    logger.info(`Initial scan complete for ${$this.sample}; watch disabled, closing watcher`)
                    try { $this.watcher.close() } catch (err) { logger.error(`${err} closing watcher`) }
                } else {
                    logger.info(`Watching for new reads in ${$this.path_1} (sample ${$this.sample})`)
                }
            })
        } catch (err){
            logger.error(`${err} error in watching base dir files`)
        }
    }
    async startWatcher(){
        this.cleanup()
        this.reportWatcher = chokidar.watch([
                `${path.join(this.outputdir, 'full.report')}`,
            ], {
            persistent: true,
            ignoreInitial: false,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        }).on('add', (path_1, stats) => {
            logger.info(`ADDED Report ${path_1} has been added`)
            this.getFullReportSample(path_1)
        }).on('unlink', (path_1, stats) => {
            logger.info(`DELETED Report ${path_1} has been removed`)
        }).on('change', (path_1, stats) => {
            logger.info(`CHANGED Report ${path_1} has been changed`)
            this.getFullReportSample(path_1)
        })
    
    }

    // Method to add a file 
    addFile(file) {
        logger.info(`File added: ${file} ` );
        // check if file is in the "files" array if not then push it
        if (!this._files.includes(file)){
            this._files.push(file)
        } 
        this.setJob(file, 0, false)
    }
   
    getFullReportSample(filepath){
        return this.publishFullReport(filepath)
    }

    publishFullReport(filepath = this.fullreport){
        if (this._reportReadPending) {
            this._reportReadAgain = true
            return this._reportReadPending
        }
        let samplename = this.sample
        logger.info(`${filepath}: publishing report data for sample ${samplename}`)
        this._reportReadPending = new Promise((resolve, reject)=>{
            try{
                fs.readFile(filepath,(err,data)=>{
                    try{
                        if (err){
                            logger.error(err)
                            reject(err)
                        } else {
                            this.data = data.toString()
                            this.sendData()
                            resolve()
                        }
                    } catch (err){
                        reject(err)
                    }
                })
            } catch (err){
                reject(err)
            }
        }).finally(() => {
            this._reportReadPending = null
            if (this._reportReadAgain) {
                this._reportReadAgain = false
                setImmediate(() => this.publishFullReport(filepath).catch((err) => logger.error(`${err} republishing ${filepath}`)))
            }
        })
        return this._reportReadPending
    }
    setJob(filepath, priority, overwrite){
        const $this = this 
        let sampleo = null
        let indexFilepath  = this.getIndexJob(filepath)
        if (!this.paused){
            if (indexFilepath != -1){ 
                logger.info(`Seenfile ${filepath}, overwrite force: ${overwrite}`)
                sampleo = this.queueRecords[indexFilepath]
                sampleo.overwrite = overwrite
                $this.defineClassifier(filepath, priority ? priority : 0, overwrite)
                return 
            } else {
                logger.info(`Never seen this file process before ${filepath}, creating a new job, paused? : ${this.paused  ? 'true' : 'false'}`)
                $this.defineClassifier(filepath, priority ? priority : 0, overwrite)
            }
        } else {
            logger.info(`Paused: ${this.paused}, skipping ${filepath}. Please rerun if you want to get info again from this.`)
        }
        
    }
    setConfig(config){
        this.config = config
        this.queueRecords = this.queueRecords.map((d)=>{
            d.config = config
            return d 
        })
    }
    async rerun(index){
        logger.info(`${index ? index : ''} Rerunning sample`)
        if (this.queueRecords.length > index && index >= 0){
            let job = this.queueRecords[index]
            job.status.cancelled = false
            job.gpu = this.gpu
            job.overwrite = true 
            job.recombine = true
            job.paused = false 
            logger.info(`CALLED DEFINE QUEUE JOB IN RERUN`)

            this.defineQueueJob(job) 
        } else if (index == -1 || index == undefined){
            // rerun all jobs and add to queue. Make sure to flush the queue for current sample first
            logger.info(`CALLED DEFINE QUEUE JOB IN index == -1 RERUN ${this.queueRecords.length}`)
            this.queueRecords.map((d)=>{
                d.gpu = this.gpu
                d.overwrite = true 
                d.status.cancelled = false
                d.recombine = true 
                d.paused = false 
                this.defineQueueJob(d)
            }) 
            broadcastToAllActiveConnections("message",  {message: `Rerunning... ${this.sample} with index: ${index}`})
        }
         
    }
    getId(idx){
        return `${this.sample}-${idx}`
    }
    updateStatus(){
        // iterate through all queueList jobs, check if they are running, if they are then update the status and emit status
        this.queueList.map((d)=>{
            let info = d.info.status
            if (info.running){
                info.status = d.job.status
                // this.ws.emit('recentQueue', { type: "recentQueue", data: d.info })
            } 
        })
    }
    
    async defineQueueJob(obj){
        let id =  this.getId(obj.index)
        // let index = this.getIndexJob(obj.filepath)
        const $this = this;
        try {
            obj = this.updateparams(obj)
            // obj.generateKrakenCommand()
            const controller = new AbortController();
            obj.controller = controller
            obj.status = {
                ...obj.status,
                waiting: true,
                running: false,
                cancelled: false
            }
            // Notify clients that a job was queued. Coalesced per (sample,index)
            // into the run-scoped batched 'runUpdate' frame, and only buffered if
            // someone is actually viewing this run.
            queueJobUpdate($this.run, $this.sample, obj.index, {
                job: $this.formatQueueInfo(obj.index)
            })
            // The actual unit of work, unchanged from before. It still runs on the
            // global PQueue (so abort/status logic is identical); we just let the
            // round-robin scheduler decide WHEN to release it.
            const workFn = async ({signal}) => {
                $this.queueRecords[obj.index] = obj
                // Check that filepath exists, and if not then remove from queue
                if (!fs.existsSync(obj.filepath)){
                    logger.info(`File ${obj.filepath} does not exist, removing from queue`)
                    $this.queueRecords = $this.queueRecords.filter((d)=>{return d.filepath != obj.filepath})
                    return
                }
                obj.status.waiting = false
                signal.addEventListener('abort', () => {
                    logger.info(`aborting job ${obj.filepath}-${id}`)
                    obj.stop()
                });

                queueJobUpdate($this.run, $this.sample, obj.index, {
                    job: $this.formatQueueInfo(obj.index)
                })

                await obj.start()
                return
            }
            // Tier-1 = barcode/sample lane, tier-2 = the file's index within it.
            // The scheduler cycles one file per lane so later barcodes start
            // appearing almost immediately instead of waiting out barcode01.
            scheduler.add({
                jobId: `${$this.run}::${$this.sample}::${obj.index}`,
                runName: $this.run,
                sample: $this.sample,
                index: obj.index,
                priority: obj.priority ? obj.priority : 0,
                controller,
                exec: () => storage.queue.add(workFn, {
                    signal: controller.signal,
                    priority: obj.priority ? obj.priority : 0
                })
            })
        } catch (error) {
            if (!(error instanceof AbortError)) {
                logger.error(`${error} error in queuing job ${obj.jobnumber} ${id}` )
            }
        }
        obj.jobnumber = id
        return 
    }
    updateparams(classifier){
        // Keep the live Classifier's sample view in sync with the latest sample
        // settings so an edit to the database, chosen classifier, fastp toggle or
        // minimap2 reference is picked up on the next (re)run without recreating
        // the job.
        classifier.sample.database = this.database
        classifier.sample.classifier = this.classifier
        classifier.sample.fastp = this.fastp
        classifier.sample.fastpConfig = this.fastpConfig
        classifier.sample.minimapDatabase = this.minimapDatabase
        classifier.sample.brackenConfig = this.brackenConfig
        classifier.generateKrakenCommand()
        return classifier
    }
    
    defineClassifier(filepath, priority, overwrite){
        let sampleObj = {
            sample: this.sample,
            basename: removeExtension(filepath),
            fullreport: this.fullreport, 
            filepath: filepath,
            path_2: this.path_2,
            bundleconfig: this.bundleconfiguration,
            config: this.config,
            platform: this.platform,
            run: this.run,
            format: this.format,
            filepath: filepath,
            overwrite: overwrite, 
            recombine: false, 
            reportPath: getReportName(filepath, this.outputdir),
            database: this.database,
            classifier: this.classifier,
            fastp: this.fastp,
            fastpConfig: this.fastpConfig,
            minimapDatabase: this.minimapDatabase,
            brackenConfig: this.brackenConfig,
            outputdir: this.outputdir,
            gpu: process.env.GPU,
            priority: ( priority ? priority : 0)

        }
        let classifier = new Classifier(sampleObj)
        classifier.ws = this.ws
        classifier.onReportReady = () => this.publishFullReport(this.fullreport)
        let msg;

        msg = this.defineQueueMessage(classifier)
        classifier.index = msg.index
        // Skip re-queuing files that are already fully classified. On startup the
        // sequencing watcher's initial scan re-emits EVERY existing FASTQ; without
        // this, each already-done file is pushed through the scheduler/queue only to
        // no-op inside start() -- which is what produced the misleading
        // "+N queued in M other runs" counts for finished samples. If the per-file
        // report AND the sample's combined full.report already exist on disk (and
        // we're not force-overwriting), mark the job complete/historical and DON'T
        // enqueue it. Genuine reruns pass overwrite=true and go through
        // rerun()->defineQueueJob, so they still re-run as before.
        if (!overwrite && this.isAlreadyClassified(filepath)){
            classifier.status.running = false
            classifier.status.waiting = false
            classifier.status.historical = true
            classifier.status.success = true
            classifier.status.cancelled = false
            // IMPORTANT: still record the job in queueRecords (keyed by its index)
            // even though we didn't enqueue it. rerun() iterates queueRecords to
            // re-queue work, so without this a reloaded, already-finished sample
            // would have an empty queueRecords and the ▶ rerun button would do
            // nothing ("... index == -1 RERUN 0").
            this.queueRecords[classifier.index] = classifier
            this.updateStatusQueueList(classifier)
            try { classifier.sendJobStatus() } catch (err){ logger.error(`${err} sending historical job status for ${filepath}`) }
            return classifier
        }
        this.updateStatusQueueList(classifier)
        logger.info(`CALLED DEFINE QUEUE JOB IN DEFINECLASSIFIER`)
        this.defineQueueJob(classifier )
        return classifier
    }
    // True when this file has already been classified in a previous run: its
    // per-file report and the sample's combined full.report both exist and are
    // non-empty. Used to avoid re-queuing finished work on startup.
    isAlreadyClassified(filepath){
        try {
            const reportPath = getReportName(filepath, this.outputdir)
            const perFile = fs.existsSync(reportPath) && fs.statSync(reportPath).size > 0
            const full = fs.existsSync(this.fullreport) && fs.statSync(this.fullreport).size > 0
            return perFile && full
        } catch (err){
            return false
        }
    }
    
    stop(index){
        storage.queueunshift(( index ? index : null ), function (cb) {
            const result = 'one'
            cb(null, result)
        })
    }
    // Aggregate, wire-safe status for the whole sample.
    //
    // This used to build `logs` and `error` as arrays holding EVERY job's full
    // log/error text, and it is called on every sendData() -- i.e. once per
    // classified fastq. For a 500-file barcode that is 500 flushes x 500 log
    // arrays: O(n^2) bytes on the socket and, worse, all of it retained in the
    // browser's reactive store. That is the multi-GB tab.
    //
    // Now it is O(1)-sized: booleans, counts, and at most a few sampled error
    // strings. Per-job logs are fetched on demand via the `getJobLogs` socket
    // handler when the user opens a specific job.
    getStatus(send){
        const jobs = this.queueList
        const knownTotal = Math.max(
            jobs.length,
            this.queueRecords ? this.queueRecords.length : 0,
            this._files ? this._files.length : 0
        )
        let errored = []
        let logLines = 0
        let done = 0
        let runningCount = 0
        let waiting = 0
        for (let index = 0; index < knownTotal; index++){
            const queued = jobs[index]
            const record = this.queueRecords && this.queueRecords[index]
            const s = (queued && queued.info && queued.info.status) || (record && record.status) || { waiting: true }
            if (s.running) runningCount++
            if (s.waiting) waiting++
            if (s.success === true || s.success === 0) done++
            if (Array.isArray(s.logs)) logLines += s.logs.length
            if ((s.success === false || (s.code != null && s.code !== 0)) && s.error) {
                errored.push({ index, error: String(s.error).slice(-500) })
            }
        }
        // Only carry a handful of representative errors; the rest are reachable
        // per-job on demand. Keeps this payload bounded no matter the run size.
        const MAX_ERRORS_INLINE = 5
        const status = {
            running: runningCount > 0,
            historical: this.statusFlagForKnownJobs('historical', knownTotal),
            success: knownTotal > 0 && done === knownTotal && errored.length === 0,
            cancelled: this.statusFlagForKnownJobs('cancelled', knownTotal),
            // counts the UI can render directly instead of recomputing from
            // a full per-job payload it no longer receives
            total: knownTotal,
            runningCount,
            waiting,
            done,
            errorCount: errored.length,
            logCount: logLines,
            // bounded sample of errors (index + tail of message)
            errors: errored.slice(0, MAX_ERRORS_INLINE),
            // Back-compat: older UI code reads `status.error` as an array.
            // Keep the shape but bounded, and never include logs at all.
            error: errored.slice(0, MAX_ERRORS_INLINE).map((e)=> e.error),
            truncated: errored.length > MAX_ERRORS_INLINE,
            // watching === real-time watch mode is on AND a live watcher exists,
            // so the frontend can show a pulsing "listening for new reads" light.
            watching: !!(this.watch && this.watcher)
        }
        if (send){
            const $this = this
            // iterate through all queueList jobs, check if they are running, if they are then update the status and emit status
            this.queueList.map((d)=>{
                let info =  d.info
                try{
                    d.job.sendJobStatus()
                } catch (err){
                    logger.error(`${err} error in sending job`)
                }
               
            })
        }
        return status
    }
    statusFlagForKnownJobs(flag, total){
        for (let index = 0; index < total; index++) {
            const queued = this.queueList[index]
            const record = this.queueRecords && this.queueRecords[index]
            const s = (queued && queued.info && queued.info.status) || (record && record.status)
            if (s && s[flag]) return true
        }
        return false
    }
  
    updateStatusQueueList(classifier){
        let index = classifier.index 
        if (index !== undefined && index !== null && index >= 0 && this.queueList[index]){ 
            this.queueList[index].info.status = classifier.status
        }
        return classifier.status
    }
    defineMessageTo(obj){
        let msg = {}
        msg.command = obj.command
        msg.status = obj.status
        msg.config = obj.config
        msg.filepath = obj.filepath
        msg.sampleReport = obj.sampleReport
        msg.fullreport = this.fullreport
        msg.database = obj.database
        msg.sample = this.sample 
        msg.run = this.run
        if (obj.index !== undefined && obj.index !== null){
            msg.index = obj.index
        } else {
            msg.index = this.queueList.length 
        }
        return msg
    }
    defineQueueMessage(obj){        
        let msg = this.defineMessageTo(obj)
        this.updateStatusQueueList(obj)
        this.queueList.push({info: msg, job: obj})
        return msg 
    }
    // Project a single queue entry down to ONLY the fields the client renders
    // (job index, status, file, command, sample/run identity). The old code
    // spread the entire classifier sampleObj *and* its full kraken config into
    // every job; with 1600 jobs that duplicated the config object 1600x and
    // bloated the snapshot into tens of MB. Keep it lean.
    formatJobInfo(d){
        if (!d || !d.info) return null
        const info = d.info
        const job = d.job
        const cmdObj = (info && info.command) ? info.command : (job ? job.command : null)
        const command = (cmdObj && cmdObj.args) ? cmdObj.args[1] : cmdObj
        // Use the log-free wire projection. A run-hydrate snapshot for 96
        // barcodes x 500 files would otherwise inline every job's accumulated
        // kraken stderr into a single frame.
        const status = (job && typeof job.statusForWire === 'function')
            ? job.statusForWire()
            : (job ? job.status : info.status)
        return {
            index: info.index,
            sample: info.sample,
            run: info.run,
            filepath: info.filepath,
            reportPath: job ? job.reportPath : info.sampleReport,
            database: info.database,
            command: command,
            status: status
        }
    }

    // Per-job log tail, resolved on demand (see the `getJobLogs` socket handler).
    getJobLogs(index){
        const entry = this.queueList[index]
        const job = entry && entry.job
        if (!job) return { run: this.run, samplename: this.sample, index, logs: [], error: null }
        return {
            run: this.run,
            samplename: this.sample,
            index,
            logs: typeof job.getLogs === 'function' ? job.getLogs() : (job.status && job.status.logs) || [],
            error: job.status ? job.status.error : null,
            command: typeof job.formatcommandstring === 'function' ? job.formatcommandstring() : null,
            filepath: job.filepath || null
        }
    }
    formatQueueInfo(index){
        const hasIndex = index !== undefined && index !== null
        try {
            if (!hasIndex){
                return this.formatQueueSnapshot()
            }
            return this.formatJobInfo(this.queueList[index])
        } catch (err){
            logger.error(`${err} error in getting job(s) for sample ${this.sample}${hasIndex ? ` at index ${index}` : ''}`)
            return hasIndex ? null : []
        }
    }
    formatQueueSnapshot(){
        const total = Math.max(
            this.queueList.length,
            this.queueRecords ? this.queueRecords.length : 0,
            this._files ? this._files.length : 0
        )
        const out = []
        for (let index = 0; index < total; index++) {
            const queued = this.formatJobInfo(this.queueList[index])
            if (queued) { out[index] = queued; continue }
            const record = this.queueRecords && this.queueRecords[index]
            if (record) {
                out[index] = this.formatClassifierSnapshot(record, index)
                continue
            }
            const filepath = this._files && this._files[index]
            if (filepath) out[index] = this.formatFileSnapshot(filepath, index)
        }
        return out
    }
    formatClassifierSnapshot(job, index){
        const status = typeof job.statusForWire === 'function' ? job.statusForWire() : (job.status || {})
        return {
            index,
            sample: this.sample,
            run: this.run,
            filepath: job.filepath || null,
            reportPath: job.reportPath || job.sampleReport || null,
            database: job.database || (job.sample && job.sample.database) || this.database,
            command: typeof job.formatcommandstring === 'function' ? job.formatcommandstring() : null,
            status
        }
    }
    formatFileSnapshot(filepath, index){
        return {
            index,
            sample: this.sample,
            run: this.run,
            filepath,
            reportPath: getReportName(filepath, this.outputdir),
            database: this.database,
            command: null,
            status: {
                running: false,
                waiting: true,
                success: null,
                historical: false,
                error: null,
                logCount: 0,
                lastLog: null
            }
        }
    }
    cancel(index){
        const $this = this
        // NOTE: this used to be `if (index >= 0 && index)`, which treats index 0
        // (the very first file of a sample) as falsy and silently fell through to
        // the "cancel everything" branch below -- cancelling a single job at
        // index 0 nuked the whole sample's queue instead. Compare against
        // null/undefined explicitly so 0 is a valid single-job index.
        if (index !== null && index !== undefined && index >= 0){
            try{
                // drop it from the round-robin buffer if it hasn't started yet
                try { scheduler.removeJob(`${this.run}::${this.sample}::${index}`) } catch (e) { logger.error(`${e} scheduler removeJob`) }
                let entry = this.queueList[index]
                let job = entry && entry.job
                if (!job){
                    logger.error(`No job found at index ${index} for sample ${this.sample}`)
                    return
                }
                logger.info(`${job.name} stopping job at index ${index} `)
                if (job.controller && typeof job.controller.abort === 'function') job.controller.abort()
                job.status.cancelled = true
                job.status.running = false
                job.stop()
                // Broadcast immediately so the queue board / job panel flips this
                // dot to "cancelled" right away instead of waiting on some other
                // event to happen to trigger a refresh.
                queueJobUpdate(this.run, this.sample, index, { status: this.wireStatus(job) })
            } catch (err){
                logger.error(`${err}, error in stopping job`)
                throw err
            } finally {
                this.sendData()
            }
        } else {
            logger.info(`stopping All jobs  for sample ${this.sample} `)
            // get storage.queue length and iterate through all jobs and stop them
            if (this.queueList.length > 0) {
                this.fullstop = true
                this.queueList.forEach((f)=>{
                    try{
                        let job = f.job
                        if (!job) return
                        logger.info(`${job.name} stopping job for full sample #: ${job.jobnumber}`)
                        // remove any not-yet-started copy from the round-robin buffer
                        try { scheduler.removeJob(`${this.run}::${this.sample}::${job.index}`) } catch (e) { logger.error(`${e} scheduler removeJob`) }
                        if (job.controller && typeof job.controller.abort === 'function') job.controller.abort()
                        job.status.cancelled = true
                        job.status.running = false
                        job.stop()
                        queueJobUpdate(this.run, this.sample, job.index, { status: this.wireStatus(job) })
                    } catch (err){
                        logger.error(`${err}, error in stopping job`)
                    }
                })
                // one coalesced sample-level refresh for the whole batch, instead
                // of relying on a later, unrelated event to push the update.
                this.sendData()
            }
        }
    }
    
    // Small helper so every job-status emit goes through the log-free projection.
    wireStatus(job){
        if (!job) return null
        return typeof job.statusForWire === 'function' ? job.statusForWire() : job.status
    }

    // ---------------------------------------------------------------------
    // Report push.
    //
    // This method used to own an elaborate dedupe + adaptive-throttle scheme,
    // because it was shipping the entire full.report TSV to every browser after
    // every classified fastq. Under a deep backlog it would hold reports back
    // for up to five seconds — which is why the UI visibly stalled during the
    // exact period a user most wants to watch it.
    //
    // None of that is needed now. queueSampleUpdate() hands the text to the
    // taxon store, which:
    //   * hashes it and drops it if nothing changed (the old guard #1),
    //   * diffs it against the previous parse and keeps only what moved, and
    //   * lets the frame bus decide when to flush, per connection, with real
    //     backpressure (the old guard #2, but done where it belongs).
    //
    // So we can go back to simply reporting the truth every time and let the
    // transport layer worry about pacing. A steady-state update is a few KB.
    // ---------------------------------------------------------------------
    sendData(){
        try{
            queueSampleUpdate(this.run, this.sample, {
                data: this.data || '',
                status: this.getStatus()
            })
            return this.data
        } catch (err){
            logger.error(`${err} error in publishing sample update`)
        }
    }
    getIndexJob(filepath){
        try{
            return this.queueRecords.findIndex((f)=>{return f.filepath == filepath })
        } catch(err){
            logger.error(`${err}, couldn't get the index of the job in question`)
            return -1 
        }
    }
    async deleteReports(){    
        console.log("deleting!")
        // remove the outputdir 
        try{
            await rmDir(this.outputdir)
        } catch (err){
            logger.error(`${err} error in deleting outputdir ${this.outputdir}`)
        }
        try{
            this.cancel()
            // this.cleanup()
        } catch (err){
            logger.error(`${err} error in cleaning up sample ${this.sample}`)
        }
      
    }
    async update(info, run, sample){
        // look at the config of info, and update the samplesheet entry for this sample.
        // IMPORTANT: metadata-only edits (e.g. adding lat/long from the Metadata tab)
        // arrive without path_1/path_2. Treat a missing/undefined path as "no change"
        // so we never wipe the existing path, delete reports, or restart the watcher
        // with an undefined path (which previously crashed lstatSync and lost the sample).
        const path1Changed = info.path_1 != null && info.path_1 !== this.path_1
        const path2Changed = info.path_2 != null && info.path_2 !== this.path_2
        if (path1Changed || path2Changed){
            // need to update the watcher
            try{
                if (info.path_1 != null) this.path_1 = info.path_1
                if (info.path_2 != null) this.path_2 = info.path_2
                if (this.watcher){
                    this.watcher.close().then(() => logger.info('closed watcher'));
                    this.watcher._watched.clear()
                    delete this.watcher
                }
                await this.cleanup()
                this.queueList = []
                this.queueRecords = []
                this._files = []
                this._reports = []
                this.data = ''
                await this.deleteReports()
                await this.initialize()
                // this.initialize() 
            } catch (err){
                logger.error(`${err} failure to update sample ${this.sample}`)
            }
                     
        }
        for (let key in info){
            // never overwrite a known path with an undefined/null value coming from a
            // metadata-only update
            if ((key === 'path_1' || key === 'path_2') && info[key] == null) continue
            this[key] = info[key]
        }
        // keep the samplesheet projection in sync with any new metadata (lat/long, etc.)
        this.samplesheet = { ...this.samplesheet, ...info, sample: this.sample, group: this.group, label: this.label, path_1: this.path_1, path_2: this.path_2 }
        this.updateQueueRecords()

        return
    } 
    updateQueueRecords(){
        this.queueRecords = this.queueRecords.map((d)=>{
            this.updateparams(d)
            return d
        })
    }
    cleanup(){
        try{
            // drop any pending trailing report push for this sample
            if (this._reportTimer){ clearTimeout(this._reportTimer); this._reportTimer = null }
            if (this.reportWatcher){
                this.reportWatcher.close().then(() => logger.info('closed report'));
                this.reportWatcher._watched.clear()
                delete this.reportWatcher
            }
            if (this.watcher){
                this.watcher.close().then(() => logger.info('closed watcher'));
                this.watcher._watched.clear()
                delete this.watcher
            }

            this.cancel()
            // this.queueList = []
            // this.queueRecords = []
            // this._files = []
            // this._reports = []
            // this.data = ''


        } catch (err){
            logger.error(`${err} failure cleanup up sample ${this.sample}`)
        }
    }
    defineSamplename(filepath){
        let basename = path.basename(path.dirname((filepath)))
        return basename ? basename : this.sampleObj.sample       
    }
    
    async sendReportQueueJob(filepath){
        let id = `${filepath}-ReportSampleSending`
        const $this = this;
        let name = this.sampleObj.sample
        try {  
            const controller = new AbortController();
            await storage.queue.add(async ({signal}) => { 
                signal.addEventListener('abort', () => { 
                    logger.info(`aborting report pulling ${id}`)
                }); 
                logger.info(`Sending report for ${name} ${filepath}`)
                return await this.getFullReportSample(filepath, name, $this.sample) 
            }, {signal: controller.signal, priority: 3 });
        } catch (error) {
            if (!(error instanceof AbortError)) {
                logger.error(`${error} error in queuing report send job  ${id}` )
            }
        }
    }
}