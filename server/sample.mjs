
import path, { resolve } from 'path'
import { Classifier} from './classifier.mjs'
import { getReportName, rmFile, removeExtension, globFiles } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
import chokidar from 'chokidar'

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
        this.reportWatcher = null
        this.config = {}
        this.pause = false
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
                this.watcherDemux.close()
            }
            if (this.watcher){
                this.watcher.close()
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
    defineClassifier(sampleObj, path_1, priority ){
        
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
        let msg; let code; 

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
        this.queue.push({
            jobnumber: obj.index,
            id: id,
            type: obj.type,
            sample: this.sample, 
            priority: obj.priority ? obj.priority : 0,
            bind: obj 
        })
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
        if (this.path_1 && this.format == 'file'){
            this.setJob(this.path_1, 'classifier')
        } else if (this.path_1 ){
            this.files = []            
            this.watchDirectory()
        }  
        $this.reportWatch()
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
        try{
            // if (this.watcherDemux){
            //     this.watcherDemux.close()
            // }
            // if (this.watcher){
            //     this.watcher.close()
            // }
        } catch (err){
            logger.error(`${err} couldnt close waters`)
        }
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
    setJob(filepath, type, overwrite){
        const $this = this 
        let sampleObj = this.sampleObj
        let sampleo = null
        let indexFilepath  = this.getIndexJob(filepath)
        if (!this.paused){
            if (indexFilepath != -1){ 
                logger.info(`Seen the filepath: ${filepath}, ${indexFilepath}`)
                sampleo = this.queueRecords[indexFilepath]
                sampleo.overwrite = overwrite
                this.defineQueueJob(sampleo)
                return 
            } else {
                logger.info(`Never seen this file process before ${filepath}, creating a new job`)
                if (sampleObj.demux && type == 'classifier'){
                    sampleo = $this.defineBarcoderOutputfile(filepath) 
                    $this.defineClassifier(sampleo, filepath, 1)
                } else {
                    if (type == 'barcoder'){
                        $this.defineBarcoder(sampleObj, filepath)
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
    getFullReportSample(filepath, samplename){
        const $this = this
        return new Promise((resolve, reject)=>{
            logger.info(`${filepath}: file done, sending sample data for sample ${$this.sample}`)
            try{
                fs.readFile(filepath,(err,data)=>{
                    try{
                        if (err){
                            logger.error(err)
                            reject(err)
                        } else {
                            $this.ws.send(JSON.stringify({ type: "data", samplename: samplename, "data" : data.toString()})) 
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
    sendReportQueueJob(filepath){
        let id = `${filepath}-ReportSampleSending`
        const $this = this;
        let send = {
            jobnumber: id,
            id: id,
            name: this.defineBarcoderSamplename(filepath),
            type: `report`,
            filepath: filepath,
            sample: this.sample, 
            priority: 2,
            bind: this 
        }
        this.queue.push(send)
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
            logger.info(`________watching report files from ${this.outputdir}_________`)
            if (this.outputdir)    {
                try{
                    await mkdirp.sync(this.outputdir)
                } catch (err){
                    logger.error(`${err} error in creating output dir in report watch`)
                }
            }
            
            this.reportWatcher = chokidar.watch([
                `${outputdir}/**/full.report`], {ignored: /^\./, persistent: true, usePolling: true })
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
        }

    }
    async barcodeWatch(){
        const $this = this;
        let watcherDemux
        if (this.watcherDemux ){
            try{
                await this.watcherDemux.close()
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
            this.watcherDemux = chokidar.watch([ 
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
        } 
        
        

       
    }
    getOutputDir(path_1, sample){
        try{
            if (sample.demux){
                return  path.join((path_1 ? path.dirname(path_1) : path.dirname(this.path_1)), 'demultiplexed')
            } else {
                if (sample.format == 'file'){
                    if (this.sampleObj.demux){
                        return  path.join(path.dirname(path_1 ? path_1 : this.path_1), path.dirname(path.basename(path_1 ? path_1 : this.path_1)))
                    } else {
                        return  path.join(path.dirname(path_1 ? path_1 : this.path_1), this.sample)
                    }
                } else {
                    return path.join((this.path_1 ? this.path_1 : this.path_2), this.sample)
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
            } catch (err){
                logger.error(`${err} error in closing  watch chokidar`)
            }
        } 
        
        var watcher = chokidar.watch([`${sample.path_1}/*fastq.gz`,`${sample.path_1}/*fastq`,`${sample.path_1}/*fq.gz`, `${sample.path_1}/*fq`], {ignored: /^\./, persistent: true, usePolling: true });
        this.watcher  = watcher
        
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
        watcher  
            .on('add', function(filepath) {
                logger.info(`File ${filepath} has been added for sample: ${sample.sample}`);
                // $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                $this.setJob(filepath, (sample.demux ? 'barcoder' : 'classifier'), false)
            }) 
            .on('change', function(filepath) { 
                logger.info(`File ${filepath} has been changed`);
                $this.setJob(filepath, (sample.demux ? 'barcoder' : 'classifier'), true)
            })
            .on('unlink', function(filepath) {
                logger.info(`File ${filepath} has been removed`);
            })
            .on('error', function(error) {
                logger.error(`Error happened ${error}`); 
            })  
        if (sample.demux ){  

            $this.barcodeWatch()
        }
    

    
        
        
        
    
    
    }  
    
}