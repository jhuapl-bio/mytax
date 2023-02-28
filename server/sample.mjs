
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

export  class Sample { 
    
    constructor(sample, queue, ws){          
        for (let key of Object.keys(sample)){
            this[key] = sample[key]
        }
        this.ws = ws
        this.fullstop = false
        this.queueRecords = []
        this.watcher = null
        const $this = this
        
        this.reportWatcher = null
        this.config = {}
        this.paused = false
        // this.outputdir  = ( sample.demux ? path.join(sample.path_1, 'demultiplexed') : path.join(path.dirname(sample.path_1), sample.sample)  )
        if (sample.demux){
            this.outputdir =  path.join(sample.path_1, 'demultiplexed') 
        } else {
            if (sample.format == 'file'){
                this.classificationDir = path.join(path.dirname(sample.path_1), 'classifications')
                // this.outputdir = path.join(path.dirname(sample.path_1),  sample.sample) 
            } else {
                this.classificationDir = path.join(sample.path_1, 'classifications')
                // this.outputdir = path.join((sample.path_1)) 
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
                this.watcherDemux.close().then(() => console.log('closed demux'));
                this.watcherDemux._watched.clear()
                delete this.watcherDemux
            }
            if (this.samples[key].watcher){
                this.watcher.close().then(() => console.log('closed water'));
                $this.samples[key].watcher._watched.clear()
                delete this.watcher
            }
            if (this.samples[key].reportWatcher){
                this.reportWatcher.close().then(() => console.log('closed report'));
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
        barcoder.outputdir = this.getOutputDir(path_1, sampleObj)
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
        this.ws.send(JSON.stringify({ type: "recentQueue", data: msg }))
        this.defineQueueJob(barcoder)
        return barcoder
    }
    defineClassifier(sampleObj, path_1, priority){
        
        let classifier = new Classifier(sampleObj, path_1)
        classifier.ws = this.ws
        const $this = this
        classifier.config = this.config
        classifier.priority = ( priority ? priority : 0)
        classifier.gpu = this.gpu
        classifier.outputdir = this.getOutputDir(path_1, sampleObj)
        classifier.bundleconfig = this.bundleconfig
        classifier.overwrite = this.overwrite
        classifier.initialize()
        this.addReportWatch(classifier.outputdir)
        let msg; let code; 
        console.log("classifier", classifier.outputdir,"\n\n\n")
        msg = this.defineQueueMessage(classifier)
        classifier.type = 'classifier'
        classifier.index = msg.index
        this.updateStatusQueueList(classifier, msg.index)
        $this.defineQueueJob(classifier )
        return classifier
    }
    getIndexJob(filepath){
        try{
            // console.log(this.queueRecords.map((f)=>{return f.filepath}), filepath, this.queueRecords.findIndex((f)=>{return f.filepath == filepath}))
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
        // this.overwrite = true
        if (exists_returned && $this.overwrite){
            try{
                await rmFile(fullreport)
            } catch(err){
                logger.error(err)
            }
        }
        $this.queue.start()
        this.ws.send(JSON.stringify({ type: "paused",  message:  false })) 
        
        $this.resetWatchers()
        if (this.path_1 && this.format == 'file'){
            this.setJob(this.path_1, 'classifier')
        }
        
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
        this.ws.send(JSON.stringify({ type: "recentQueue", data: msg })) 
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
        let basename = `${path.basename(path.dirname(filepath))}`
        if (this.sampleObj.path_1 !== path.dirname(filepath) && this.sampleObj.pattern && !this.sampleObj.demux && this.sampleObj.format == 'directory'){            
            basename = `${path.basename(path.dirname(path.dirname(filepath)))}`
        }
        return `${basename == this.sample ? this.sample : `${this.sample}-${basename}`}`
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
            if (!this.reportWatcher){
                this.reportWatch()
            }
        } catch (Err){
            logger.error(`${Err} error in watching reports`)
        }
        try{
            if (!this.watcher && this.sampleObj.format == 'directory'){
                this.watchDirectory()
            }
        } catch (Err){
            logger.error(`${Err} error in watching base dir files`)
        }
        
        try{
            if (!this.watcherDemux && this.sampleObj.demux){
                this.barcodeWatch()
            }
        } catch (err){
            logger.error(`${err} error in watching barcodes`)
        }
    }
    setJob(filepath, type, overwrite){
        const $this = this 
        let sampleObj = this.sampleObj
        let sampleo = null
        let indexFilepath  = this.getIndexJob(filepath)
        
        if (!this.paused){
            if (indexFilepath != -1){ 
                logger.info(`Seenfile ${filepath}, ${type}, overwrite force: ${overwrite}`)
                sampleo = this.queueRecords[indexFilepath]
                sampleo.overwrite = overwrite
                this.defineQueueJob(sampleo)
                return 
            } else {
                logger.info(`Never seen this file process before ${filepath}, creating a new job, paused: ${this.paused}`)
                sampleObj.overwrite = overwrite
                if (sampleObj.format == 'directory' && !sampleObj.demux  && type == 'classifier' && path.dirname(filepath) !== sampleObj.path_1){
                    
                    sampleo = $this.defineBarcoderOutputfile(filepath) 
                    sampleo.format = 'directory'
                    $this.defineClassifier(sampleo, filepath, 1)
                }
                else if (sampleObj.demux && type == 'classifier'){
                    sampleo = $this.defineBarcoderOutputfile(filepath) 
                    // $this.defineClassifier(sampleo, filepath, 1)
                } else {
                    if (type == 'barcoder'){
                        // $this.defineBarcoder(sampleObj, filepath)
                    } 
                    else { 
                        $this.defineClassifier(sampleObj, filepath,1)
                    }
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
            logger.info(`${filepath}: file done, sending sample data for sample ${$this.sample} ${sample}, ${samplename}`)
            try{
                fs.readFile(filepath,(err,data)=>{
                    try{
                        if (err){
                            logger.error(err)
                            reject(err)
                        } else {
                            $this.ws.send(JSON.stringify({ type: "data", topLevelSampleNames: sample, samplename: samplename, "data" : data.toString()})) 
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
        let send = {
            jobnumber: id,
            id: id,
            name: name,
            type: `report`,
            filepath: filepath,
            sample: this.sample, 
            priority: 0,
            bind: this 
        }
        try {
            const controller = new AbortController();
            await this.queue.add(async ({signal}) => { 
                signal.addEventListener('abort', () => {
                    logger.info(`aborting report pulling ${id}`)
                }); 
                
                
                return await this.getFullReportSample(filepath, name, $this.sample) 
            }, {signal: controller.signal, priority: 0 });
        } catch (error) {
            if (!(error instanceof AbortError)) {
                logger.error(`${error} error in queuing report send job  ${id}` )
            }
        }
    }
    async addReportWatch(outputdir){
        let locations = [`${path.join(outputdir, 'full.report')}`]
        console.log(outputdir,"<<<\n\n<<<<")
        if (outputdir)    {
            try{
                await mkdirp.sync(outputdir)
            } catch (err){
                logger.error(`${err} error in creating output dir in report watch`)
            }
        } 
        this.reportWatcher.add(locations)
        
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
            let outputdir = this.classificationDir 
            logger.info(`________watching report files from ${outputdir}_________`)
            
            let locations = []
            // if (this.sampleObj.pattern){
            //     locations.push(`${path.join(path.dirname(outputdir), '**', 'full.report')}`)
            // } 
            // console.log(locations,"<<<<<<")
            this.reportWatcher = await chokidar.watch(locations, {ignored: /^\./, persistent: true, usePolling: true })
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
        let watcherDemux
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
            this.watcherDemux = await chokidar.watch([ 
                `${demuxoutpath}/**/*fastq.gz`, 
                `${demuxoutpath}/**/*fastq`,  
                `${demuxoutpath}/**/*fq.gz`, 
                `${demuxoutpath}/**/*fq`], {ignored: /^\./, persistent: true,  usePolling: true   })
                    .on('add', function(filepath) {
                        logger.info(`Post DEMUX NEWLY CREATED: File ${filepath} has been ADDED for barcoding demux`);
                        // $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                        $this.setJob(filepath, "classifier", false)
                    })

                    .on('change', function(filepath) {
                        logger.info(`POST DEMUX ALTERED: File ${filepath} has been ALTERED follow demux ${$this.overwrite}`);
                        // $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                        $this.setJob(filepath, "classifier", true)
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
    getOutputDir(path_1, sample){
        try{
            if (sample.demux){
                return  path.join((path_1 ? path.dirname(path_1) : path.dirname(this.path_1)), 'demultiplexed')
            } else {
                if (sample.format == 'file'){
                    if (this.sampleObj.demux){
                        return  path.join(path.dirname(path_1 ? path_1 : this.path_1), path.dirname(path.basename(path_1 ? path_1 : this.path_1)), sample.sample)
                    } else {
                        return  path.join(path.dirname(path_1 ? path_1 : this.path_1),  'classifications', sample.sample)
                    }
                } else {  
                    return path.join(path.dirname(path_1), 'classifications')
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
        let patterns = [`${sample.path_1}/*fastq.gz`,`${sample.path_1}/*fastq`,`${sample.path_1}/*fq.gz`, `${sample.path_1}/*fq`]
        if (sample.pattern){
            patterns.push(`${sample.path_1}/${sample.pattern}/*fastq.gz`)
            patterns.push(`${sample.path_1}/${sample.pattern}/*fastq`)
        }
        this.watcher = await chokidar.watch(patterns, {ignored: /^\./, persistent: true, usePolling: true })
            .on('add', function(filepath) {
                logger.info(`File ${filepath} has been added for sample: ${sample.sample}, demux: ${sample.demux}`);
                // $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                $this.setJob(filepath, (sample.demux ? 'barcoder' : 'classifier'), false)
            }) 
            .on('change', function(filepath) { 
                logger.info(`File ${filepath} has been changed, , demux: ${sample.demux}`);
                $this.setJob(filepath, (sample.demux ? 'barcoder' : 'classifier'), true)
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