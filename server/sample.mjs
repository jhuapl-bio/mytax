
import path, { resolve } from 'path'
import { Job} from './job.mjs'
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
import { broadcastToAllActiveConnections } from './messenger.mjs';

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
        this.format = info.format ? info.format : 'file'
        this.pattern = info.pattern
        this.kits = info.kits
        this.samplesheet = {
            sample: this.sample,
            path_1: this.path_1,
            path_2: this.path_2,
            kits: this.kits
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
            this.watcher = await chokidar.watch(watchpaths, {ignored: /^\./, persistent: true,  usePolling: true   })
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
        const $this = this
        let samplename = this.sample
        return new Promise((resolve, reject)=>{
            logger.info(`${filepath}: file done, ${samplename} sending sample data for sample ${$this.sample}`)
            try{
                fs.readFile(filepath,(err,data)=>{
                    try{  
                        if (err){
                            logger.error(err)
                            reject(err)
                        } else {
                            this.data = data.toString()
                            $this.sendData()
                            resolve()
                        }
                    } catch (err){
                        reject(err)
                    }
                
                })
            } catch (err){
                reject(err)
            }
        })
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
                $this.defineJob(filepath, priority ? priority : 0, overwrite)
                return 
            } else {
                logger.info(`Never seen this file process before ${filepath}, creating a new job, paused? : ${this.paused  ? 'true' : 'false'}`)
                $this.defineJob(filepath, priority ? priority : 0, overwrite)
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
            const controller = new AbortController();
            obj.controller = controller
            storage.queue.add(async ({signal}) => { 
                logger.info("Added!!")
                $this.queueRecords[obj.index] = obj 
                // Check that filepath exists, and if not then remove from queue
                if (!fs.existsSync(obj.config.filepath)){
                    logger.info(`File ${obj.config.filepath} does not exist, removing from queue`)
                    $this.queueRecords = $this.queueRecords.filter((d)=>{return d.config.filepath != obj.config.filepath})
                    return 
                }
                signal.addEventListener('abort', () => {
                    logger.info(`aborting job ${obj.config.filepath}-${id}`)
                    obj.stop() 
                });  
                // logger.info(`Added Queue job: ${obj.filepath}-${id}`)                
                
                // broadcastToAllActiveConnections("queueSample", { samplename: $this.sample, queue: $this.formatQueueInfo()})
                logger.info("broadcasting to all active connections QUEUJOB")
                broadcastToAllActiveConnections("queueJob", { 
                    samplename: $this.sample, 
                    queue: $this.formatQueueInfo(obj.index)
                }) 
                await obj.start() 
               
                return 
            }, {signal: controller.signal, priority: obj.priority ? obj.priority : 0});
        } catch (error) {
            if (!(error instanceof AbortError)) {
                logger.error(`${error} error in queuing job ${obj.jobnumber} ${id}` )
            }
        }
        obj.jobnumber = id
        return 
    }
    updateparams(job){
        job.target.sample.database = this.database
        job.target.generateCommand()
        return job
    }
    
    defineJob(filepath, priority, overwrite){
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
            outputdir: this.outputdir,
            gpu: process.env.GPU,
            priority: ( priority ? priority : 0)

        }
        let classifier = new Job(sampleObj, "classifier", this.ws )
        classifier.ws = this.ws 
        let msg;  

        msg = this.defineQueueMessage(classifier)
        classifier.index = msg.index
        this.updateStatusQueueList(classifier) 
        logger.info(`CALLED DEFINE QUEUE JOB IN Define JOB`)
        this.defineQueueJob(classifier )
        return classifier
    }
    
    stop(index){
        storage.queueunshift(( index ? index : null ), function (cb) {
            const result = 'one'
            cb(null, result)
        })
    }
    getStatus(send){
        let status = {
            running: false, 
            historical: false, 
            success: true,
            logs: [],
            error: [],
            cancelled: false
        }
        // iterate thrugh this.queueList if any success is false then set success to false, if any historical set to true, append logs, if an cancel set to true etc
        status.running = this.queueList.some((d)=>{
            return d.info.status.running
        })
        status.historical = this.queueList.some((d)=>{
            return d.info.status.historical
        })
        status.success = this.queueList.every((d)=>{
            return d.info.status.success
        })
        status.cancelled = this.queueList.some((d)=>{
            return d.info.status.cancelled
        })
        status.error = this.queueList.map((d)=>{
            return d.info.status.error
        })
        status.logs = this.queueList.map((d)=>{
            return d.info.status.logs
        })
        if (send){
            const $this = this
            // iterate through all queueList jobs, check if they are running, if they are then update the status and emit status
            this.queueList.map((d)=>{
                let info =  d.info
                try{
                    d.job.sendJobStatus()
                } catch (err){
                    logger.error(`${err} error in sending job to client`)
                }
               
            })
        }
        return status
    }
  
    updateStatusQueueList(classifier){
        let index = classifier.index 
        if (index){ 
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
        if (obj.index){
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
    formatQueueInfo(index ){
        if (!index){
            try{
                let info = []
                this.queueList.map((d)=>{
                    let config = {
                        ...d.info,
                        ...d.job.sample,
                        ...d.job.target
                    }
                    config.command = config.command.args[1]
                    config.status = d.job.status
                    info.push(config)
                })
                return info
            } catch (err){
                logger.error(`${err} error in getting jobs for sample ${this.sample}`)
                return null
            }
        } else {
            try{
                // get job at index 
                let d = this.queueList[index]
                let config = {
                    ...d.info,
                    ...d.job.sample 
                }
                config.command = config.command.args.splice[1]
                config.status = d.job.status
                let info = config
            } catch (err){
                logger.error(`${err} error in getting job at index ${index} for sample ${this.sample}`)
                return null
            }
        }
        
    }
    cancel(index){ 
        const $this = this
        if (index >=0 && index){
            try{ 
                logger.info(`${job.name} stopping job at index ${index} `)
                this.queueList[index].cancel()
                let job = this.queueList[index].job
                job.status.cancelled = true
                job.stop()
            } catch (err){
                logger.error(`${err}, error in stopping job`)
                throw err
            }
        } else {
            logger.info(`stopping All jobs  for sample ${this.sample} `)
            // get storage.queue length and iterate through all jobs and stop them
 
            if (this.queueList.length > 0) { 
                this.fullstop = true
                this.queueList.map((f, i)=>{
                    try{
                        // let job = $this.queueList[i].job
                        let job = f.job
                        logger.info(`${job.name} stopping job for full sample #: ${job.jobnumber}`)
                        job.status.cancelled = true
                        job.stop()
                    } catch (err){
                        logger.error(`${err}, error in stopping job`)
                    }
                })
            }
        }
    }
    
    sendData(){
        try{
            logger.info(`Sending data for ${this.sample}`)
            broadcastToAllActiveConnections('sampledata', {  
                run: this.run, 
                samplename: this.sample, 
                "data" : this.data,
                status: this.getStatus() 
            }) 
            return this.data
        } catch (err){
            logger.error(`${err} error in sending data to client`)
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
        // look at the config of info, and update the samplesheet entry for this sample
        if (info.path_1 != this.path_1 || info.path_2 != this.path_2){
            // need to update the watcher
            try{
                this.path_1 = info.path_1
                this.path_2 = info.path_2
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
            this[key] = info[key]
        }
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