
import path, { resolve } from 'path'
import { Classifier} from './classifier.mjs'
import { getReportName, rmFile, removeExtension, globFiles } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
import chokidar from 'chokidar'
import {AbortError} from 'p-queue'
import {Barcoder} from "./barcoder.mjs"
import _ from 'lodash';
import { mkdirp } from 'mkdirp'
import { pathEqual } from 'path-equal'

export  class Sample { 
    
    constructor(sample, queue, ws, wsReport){          
        for (let key of Object.keys(sample)){
            this[key] = sample[key] 
        }
        this.ws = ws
        this.subrun = null
        this.wsReport = wsReport 
        this.fullstop = false
        this.queueRecords = []
        this.watcher = null
        const $this = this
        
        this.reportWatcher = null
        this.config = {}
        this.paused = false
        this.outputdir  = ( sample.demux ? path.join(sample.path_1, 'demultiplexed') : path.join(path.dirname(sample.path_1), sample.sample)  )
        if (sample.demux){
            this.outputdir =  path.join(sample.path_1, 'demultiplexed') 
        } else {
            if (sample.format == 'file'){
                this.outputdir = path.join(path.dirname(sample.path_1), sample.sample) 
            } else {
                this.outputdir = path.join((sample.path_1), sample.sample) 
            }
        }
        this.barcode = null
        this.queueList = []
        this.queue = queue 
        this.sampleObj = sample
        this.seenfiles = {}
        this.overwrite = false
        
    }
    cleanup(){
        try{
            if (this.watcherDemux){
                this.watcherDemux.close().then(() => logger.info('closed demux'));
                this.watcherDemux._watched.clear()
                delete this.watcherDemux
            }
            if (this.watcher){
                this.watcher.close().then(() => logger.info('closed water'));
                this.watcher._watched.clear()
                delete this.watcher
            }
            if (this.reportWatcher){
                this.reportWatcher.close().then(() => logger.info('closed report'));
                this.reportWatcher._watched.clear()
                delete this.reportWatcher
            }
            this.cancel()
        } catch (err){
            logger.error(`${err} failure cleanup up sample ${this.sample}`)
        }
    }
    async defineBarcoder(sampleObj, path_1, priority ){
        let barcoder = new Barcoder(sampleObj, path_1)        
        barcoder.ws = this.ws
        const $this = this
        barcoder.priority = ( priority ? priority : 0)
        barcoder.outputdir = this.getOutputDir(sampleObj)
        barcoder.gpu = this.gpu 
        barcoder.config = this.config
        barcoder.bundleconfig = this.bundleconfig
        barcoder.overwrite = this.overwrite
        let msg;
        let code 
        msg = this.defineQueueMessage(barcoder)
        barcoder.index = msg.index
        barcoder.type = 'barcoder'
        this.updateStatusQueueList(barcoder, msg.index)
        this.ws.emit('recentQueue', { type: "recentQueue", data: msg })
        this.defineQueueJob(barcoder) 
        return barcoder
    }
    defineClassifier(sampleObj, priority ){
        let path_1 = sampleObj.path_1
        let classifier = new Classifier(sampleObj)
        classifier.ws = this.ws

        const $this = this
        classifier.config = this.config
        classifier.priority = ( priority ? priority : 0)
        classifier.gpu = this.gpu 
        classifier.outputdir = this.getOutputDir( sampleObj)
        classifier.bundleconfig = this.bundleconfig
        classifier.overwrite = this.overwrite 
        classifier.initialize()
        let msg; 
        // console.log(">>>>", classifier.sampleReport,"\n\t", "<<<<", this.sampleObj.sample, this.sampleObj.format, this.sampleObj.platform) 
        msg = this.defineQueueMessage(classifier)
        classifier.type = 'classifier'
        classifier.index = msg.index
        this.updateStatusQueueList(classifier, msg.index)
        $this.defineQueueJob(classifier )
        return classifier
    }
    getIndexJob(filepath){
        try{
            return this.queueRecords.findIndex((f)=>{return f.filepath == filepath})
        } catch(err){
            logger.error(`${err}, couldn't get the index of the job in question`)
            return -1 
        }
    }
    async defineQueueJob(obj){
        let id =  this.getId(obj.index)
        let index = this.getIndexJob(obj.filepath)
        const $this = this;
       
        try {
            const controller = new AbortController();
            obj.controller = controller
            await this.queue.add(async ({signal}) => { 
                $this.queueRecords[obj.index] = obj
                signal.addEventListener('abort', () => {
                    logger.info(`aborting job ${obj.filepath}-${id}`)
                    obj.stop()
                }); 
               
                return await obj.start() 
            }, {signal: controller.signal, priority: obj.priority ? obj.priority : 0});
        } catch (error) {
            if (!(error instanceof AbortError)) {
                logger.error(`${error} error in queuing job ${obj.jobnumber} ${id}` )
            }
        }
        
        obj.jobnumber = id

        if (index && index > -1){ 
            this.queueRecords[index] = obj
        } else {
            this.queueRecords.push(obj)
        }
        return 
    }
    async setupSample(){
        const $this = this
        let outpath = this.sampleObj.format == 'directory'  ? path.join($this.path_1,  $this.sample ) :  path.join(path.dirname($this.path_1), $this.sample)  
        let fullreport = path.join(outpath, 'full.report')
        let exists_returned = await fs.existsSync(fullreport)
        if (exists_returned && $this.overwrite){ 
            try{
                await rmFile(fullreport)
            } catch(err){ 
                logger.error(err)
            }
        }
        $this.queue.start()
        this.ws.emit('paused', { type: "paused",  message:  false }) 
        $this.resetWatchers()
        
        return 
    }
    stop(index){
        $this.queue.unshift(( index ? index : null ), function (cb) {
            const result = 'one'
            cb(null, result)
        })
    }
  
    updateStatusQueueList(classifier, index){
        if (index){
            this.queueList[index].info.status = classifier.status
        }
        return classifier.status
    }
    defineQueueMessage(obj){
        let msg = {}
        
        msg.command = obj.command
        msg.status = obj.status
        msg.name = this.sample && this.barcode ? `${this.sample}-${this.barcode}` : this.sample
        
        msg.indexQueue = this.queue.size  ? this.queue.size -1 : 0
        
        msg.command = obj.command
        msg.config = obj.config
        msg.filepath = obj.filepath
        msg.sampleReport = obj.sampleReport
        msg.fullreport = obj.fullreport
        msg.sample = this.sampleObj
        this.updateStatusQueueList(obj)
        msg.index = this.queueList.length 
        this.ws.emit('recentQueue', { type: "recentQueue", data: msg }) 
        this.queueList.push({info: msg, job: obj})
        return msg 
    }
    cancel(index){
        const $this = this
        if (index >=0 && index){
            try{ 
                logger.info(`${job.name} stopping job at index ${index} `)
                this.queueList[index].cancel()
                let job = this.queueList[index].job
                job.stop()
            } catch (err){
                logger.error(`${err}, error in stopping job`)
                throw err
            }
        } else {
            if (this.queueList.length > 0){ 
                this.fullstop = true
                this.queueList.forEach((f, i)=>{
                    try{
                        let job = $this.queueList[i].job
                        logger.info(`${job.name} stopping job for full sample #: ${job.jobnumber}`)
                        $this.queue.cancel(job.jobnumber)
                        job.stop()
                    } catch (err){
                        logger.error(`${err}, error in stopping job`)
                    }
                })
            }
        }
    }
    defineBarcoderSamplename(filepath){
        let basename = path.basename(path.dirname((filepath)))
        return basename ? basename : this.sampleObj.sample       
    }
    defineBarcoderOutputfile(filepath){
        let sample = _.cloneDeep(this.sampleObj)
        sample.path_1 = filepath
        sample.sample = this.defineBarcoderSamplename(filepath)
        sample.run = `${this.sample}`
        sample.format = 'file' 
        sample.demux = false
        sample.overwrite = this.overwrite
        return sample
    }
    getId(idx){
        return `${this.sample}-${idx}`
    }
    async resetWatchers(config){
        try{
            this.reportWatch() 
        } catch (Err){
            logger.error(`${Err} error in watching reports`)
        }
        try{
            if (!this.watcher){
                setTimeout(()=>{
                    this.watchDirectory()
                },1000)
            }
        } catch (Err){
            logger.error(`${Err} error in watching base dir files`)
        }
        
        try{
            if (!this.watcherDemux && this.sampleObj.demux){
                setTimeout(()=>{
                    this.barcodeWatch()
                },1000)
            }
        } catch (err){
            logger.error(`${err} error in watching barcodes`)
        }
    }
    createObjSample(path_1, path_2, format, type, outname, demux){
        let sample = _.cloneDeep(this.sampleObj)
        let samplename = sample.sample
        let parentdir = path.dirname(path_1)
        if (sample.format == 'directory' && !pathEqual(parentdir, sample.path_1) && sample.platform !== 'illumina'  ){
            let basename = path.basename(path.dirname((path_1 ? path_1 : path_2)))
            samplename = `${basename}`
        }   else if (sample.platform == 'illumina') {
            samplename = `${outname ? outname : sample.sample}`
        }
        sample.path_1 = path_1
        sample.sample = samplename
        sample.path_2 = path_2
        sample.format = format
        sample.type = type 
        sample.demux = demux
        sample.run = sample.format == 'directory' ? this.sampleObj.sample : false
        sample.overwrite = this.overwrite
        return sample
    }
    setJob(sampleObj, overwrite){
        const $this = this 
        
        let sampleo = null
        let filepath = sampleObj.path_1
        let type  = sampleObj.type
        let indexFilepath  = this.getIndexJob(filepath)
        if (!this.paused){
            if (indexFilepath != -1){ 
                logger.info(`Seenfile ${filepath}, ${type}, overwrite force: ${overwrite}`)
                sampleo = this.queueRecords[indexFilepath]
                sampleo.overwrite = overwrite
                return 
            } else {
                logger.info(`Never seen this file process before ${filepath}, creating a new job, paused: ${this.paused}`)
                sampleObj.overwrite = overwrite
                if (sampleObj.demux){
                    $this.defineBarcoder(sampleObj)
                } 
                else {  
                    $this.defineClassifier(sampleObj,1)
                }
                return  
            }
        } else {
            logger.info(`Paused: ${this.paused}, skipping ${filepath}. Please rerun if you want to get info again from this.`)
        }
    }
    getFullReportSample(filepath, samplename, sample){
        const $this = this
        return new Promise((resolve, reject)=>{
            logger.info(`${filepath}: file done, ${samplename} sending sample data for sample ${$this.sample}`)
            try{
                fs.readFile(filepath,(err,data)=>{
                    try{  
                        if (err){
                            logger.error(err)
                            reject(err)
                        } else {
                            $this.ws.emit('data', { topLevelSampleNames: sample, samplename: samplename, "data" : data.toString()}) 
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
    async sendReportQueueJob(filepath){
        let id = `${filepath}-ReportSampleSending`
        const $this = this;
        let name = this.defineBarcoderSamplename(filepath)
        try { 
            const controller = new AbortController();
            await this.queue.add(async ({signal}) => { 
                signal.addEventListener('abort', () => { 
                    logger.info(`aborting report pulling ${id}`)
                }); 
                
                return await this.getFullReportSample(filepath, name, $this.sample) 
            }, {signal: controller.signal, priority: 3 });
        } catch (error) {
            if (!(error instanceof AbortError)) {
                logger.error(`${error} error in queuing report send job  ${id}` )
            }
        }
    }
    async reportWatch(type){
        const $this  =this
        try{
            this.reportWatcher ? this.reportWatcher.close() : ''  
            delete this.reportWatcher
        } catch (err){
            logger.error(`${err} error in deleting demux watcher`)
        }
        try{
            
            let outputdir = this.outputdir
            
            logger.info(`________watching report files from ${this.outputdir}   _________`)
            if (this.outputdir)    {
                try{
                    await mkdirp.sync(this.outputdir)
                } catch (err){
                    logger.error(`${err} error in creating output dir in report watch`)
                }
            }
            let outpathmatch = [
                `${outputdir}/full.report`,
                `${outputdir}/**/full.report`,
                
            ]   
            if (this.pattern){
                outpathmatch.push(`${path.dirname(outputdir)}/${$this.pattern}/**/full.report`)
            }
            logger.info(`${outpathmatch} ____Watching this outpath `)
            this.reportWatcher = await chokidar.watch(
                outpathmatch , {ignored: /^\./, persistent: true, usePolling: true })
                .on('add', function(filepath) { 
                    logger.info(`REPORT WATCH: File ${filepath} has been ADDED NEWLY`);
                    $this.sendReportQueueJob(filepath)
                })
                .on('change', function(filepath) {
                    logger.info(`REPORT WATCH: File ${filepath} has been ALTERED`);
                    $this.sendReportQueueJob(filepath)
                })
    
                .on('unlink', function(filepath) {
                    logger.info(`File ${filepath} has been removed`);
                })
                .on('error', function(error) { 
                    logger.error(`Error happened ${error}`);
                }) 
        } catch (err){
            logger.error(`${err} error in watching for report files, no plots will be made for this sample: ${this.sample}`)
        } finally {
            return 
        }

    }
    async barcodeWatch(){
        const $this = this;
        if (this.watcherDemux ){
            try{
                await this.watcherDemux.close()
                delete this.watcherDemux
            } catch (err){
                logger.error(`${err} error in closing watch demux chokidar`)
            }
        } 
        let demuxoutpath = null
        try{
            let dirpath = this.path_1 ? this.path_1 : this.path_2
            demuxoutpath = path.join(dirpath, 'demultiplexed') 
            this.demuxoutpath = demuxoutpath
            
            await mkdirp.sync(demuxoutpath)   
            let watchpath = [ 
                `${demuxoutpath}/${$this.pattern ? $this.pattern : '**'}/*fastq.gz`, 
                `${demuxoutpath}/${$this.pattern ? $this.pattern : '**'}/*fastq`,  
                `${demuxoutpath}/${$this.pattern ? $this.pattern : '**'}/*fq.gz`,  
                `${demuxoutpath}/${$this.pattern ? $this.pattern : '**'}/*fq`]
            logger.info( `${watchpath} +++++++++++++++watchpath demux -!`)
            this.watcherDemux = await chokidar.watch(watchpath, {ignored: /^\./, persistent: true,  usePolling: true   })
                    .on('add', function(filepath) {  
                        logger.info(`Post DEMUX NEWLY CREATED: File ${filepath} has been ADDED for barcoding demux`);
                        let sampleObj = $this.createObjSample(filepath, null, 'file', 'classifier', null)
                        sampleObj.run = $this.sampleObj.sample
                        $this.setJob(sampleObj, false)
                    })
 
                    .on('change', function(filepath) {
                        logger.info(`POST DEMUX ALTERED: File ${filepath} has been ALTERED follow demux ${$this.overwrite}`);
                        let sampleObj = $this.createObjSample(filepath, null, 'file', 'classifier', null)
                        sampleObj.run = $this.sampleObj.sample
                        $this.setJob(sampleObj, false)
                    })
                    .on('unlinkDir', function(directory) { 
                        logger.info(`Directory ${directory} has been removed`);
                    })  
                    .on('unlink', function(filepath) {
                        logger.info(`File ${filepath} has been removed`);
                    })
                    .on('error', function(error) { 
                        logger.error(`Error happened ${error}`);
                    })  
        } catch (Err){ 
            logger.error(`${Err} Error in finding the dmux outpath`)
            throw Err
        } finally {
            return 
        }
        
        

       
    }
    getOutputDir(sample){
        try{
            let path_1 = sample.path_1
            if (sample.demux){
                return  path.join((path_1 ? path.dirname(path_1) : path.dirname(this.path_1)), 'demultiplexed')
            } else {
                console.log("get output dir", this.path_1, this.sampleObj.sample, sample.sample,"<ooooooooooo<<<", sample.format)
                if (sample.format == 'file'){
                    if (this.sampleObj.demux){
                        return  path.join(path.dirname(path_1 ? path_1 : this.path_1), path.dirname(path.basename(path_1 ? path_1 : this.path_1)))
                    } else {
                        return  path.join(path.dirname(this.path_1 ? this.path_1 : this.path_2), sample.sample )
                    }
                } else {
                    if (this.sampleObj.sample == sample.sample){
                        return path.join((this.path_1 ? this.path_1 : this.path_2), sample.sample)
                    } else {
                        return path.join((this.path_1 ? this.path_1 : this.path_2), this.sampleObj.sample, sample.sample)
                    }
                }
            }
        } catch(err){
            logger.error(`${err} error in setting output dir`)
        }
    }
    async watchDirectory(){
        let sample = this.sampleObj
        const $this = this;
        let overwrite = false
        if (this.watcher ){
            try{
                await this.watcher.close()
                delete this.watcher
            } catch (err){
                logger.error(`${err} error in closing  watch chokidar`)
            }
        } 
        let filewatchpaths = []
        if (sample.format != 'directory'){
            if (sample.path_2 && !sample.path_1){
                filewatchpaths = [`${sample.path_2}`]
            } else {
                filewatchpaths = [`${sample.path_1}`]
            }
        } else {
            if (sample.path_2 && !sample.path_1){
                filewatchpaths = [`
                ${sample.path_2}/*fastq.gz`,
                `${sample.path_2}/*fastq`,
                `${sample.path_2}/*fq.gz`, 
                `${sample.path_2}/*fq`]
            } else {
                filewatchpaths = [
                    `${sample.path_1}/*fastq.gz`,
                    `${sample.path_1}/*fastq`,
                    `${sample.path_1}/*fq.gz`,
                    `${sample.path_1}/*fq`
                ]

            }
            if (sample.pattern){
                filewatchpaths.push(...[
                    `${sample.path_1}/${sample.pattern}/fastq.gz`,
                    `${sample.path_1}/${sample.pattern}/*fastq`,
                    `${sample.path_1}/${sample.pattern}/*fq.gz`,
                    `${sample.path_1}/${sample.pattern}/*fq`
                ])
            }
        }
        logger.info(`\n\n${filewatchpaths} +++++ +++++++++++++ Watching filepaths`)
        let seenfiles = {}

        function defineSetting(filepath, demux){
            if (!demux){

                if (sample.format == 'directory' && sample.platform == 'illumina'){
                    let basename = removeExtension(filepath, true)
                    let baseSampleName = path.join(sample.path_1, basename)
                    if (!seenfiles[baseSampleName]){
                        seenfiles[baseSampleName]  =  {}
                    }  
                    try{
                        globFiles( `${baseSampleName}*`  , {}).then((f)=>{
                            if (f){
                                let run = false
                                f.forEach((fileI)=>{
                                    if (!seenfiles[baseSampleName][fileI]){
                                        run = true
                                        seenfiles[baseSampleName][fileI] = 1
                                    }
                                })
                                if (run){
                                    if (f.length ==2){
                                        let sampleObj = $this.createObjSample(f[0], f[1], 'directory', 'classifier', basename, false)
                                        
                                        $this.setJob(sampleObj)

                                    } else {
                                        let sampleObj = $this.createObjSample(f[0], null, 'directory', 'classifier', basename, false)
                                        $this.setJob(sampleObj)
                                    }
                                } 
                            }
                        })
                    } catch (err){
                        logger.error(`${err} error in globbing files for added classification report catch`)
                    }
                } else if ($this.format == 'file') {
                    logger.info(`File ${filepath} has been added for sample: ${sample.sample}, demux: ${sample.demux}`);
                    let sampleObj = $this.createObjSample(sample.path_1, sample.path_2, 'file', 'classifier', null)
                    $this.setJob(sampleObj, false)
                } else {
                    logger.info(`Dir File ${filepath} has been added for sample: ${sample.sample}, demux: ${sample.demux}`);
                    let sampleObj = $this.createObjSample(filepath, null, 'directory', 'classifier', null)
                    $this.setJob(sampleObj, false)
                }
            } else {
                let sampleObj = $this.createObjSample(filepath, null, 'directory', 'barcoder', null, true )
                $this.setJob(sampleObj, false)
            }
        }

        this.watcher = await chokidar.watch(filewatchpaths, {ignored: /^\./, persistent: true, usePolling: true })
            .on('add', function(filepath) {
                logger.info(`filepath added to watch ${filepath}`)
                defineSetting(filepath, $this.sampleObj.demux) 
            }) 
            .on('change', function(filepath) { 
                logger.info(`File ${filepath} has been changed, , demux: ${sample.demux}`);
                defineSetting(filepath, $this.sampleObj.demux)
            })
            .on('unlink', function(filepath) {
                logger.info(`File ${filepath} has been removed`);
            })
            .on('error', function(error) {
                logger.error(`Error happened ${error}`); 
            }) ;
        
        
        let outpath = path.join(path.dirname(sample.path_1), sample.sample)  
        let fullreport = path.join(outpath, sample.sample, 'full.report')
        let exists_returned = await fs.existsSync(fullreport)
        if (exists_returned && overwrite){
            try{
                await rmFile(fullreport)
            } catch(err){
                logger.error(err)
            }
        }
        return 
    }  
    
}