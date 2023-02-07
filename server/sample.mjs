
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
    constructor(sample, queue, queueRecords){         
        for (let key of Object.keys(sample)){
            this[key] = sample[key]
        }
        this.fullstop = false
        this.queueRecords = {}
        this.watcher = null
        this.config = {}
        this.pause = false
        this.barcode = null
        this.queueList = []
        this.queue = queue 
        this.sampleObj = sample
        this.seenfiles = {}
        this.ws = null
        this.overwrite = false
    }
    async defineBarcoder(sampleObj, path_1){
        let barcoder = new Barcoder(sampleObj, path_1)        
        barcoder.ws = this.ws
        const $this = this
        barcoder.gpu = this.gpu 
        barcoder.config = this.config
        barcoder.bundleconfig = this.bundleconfig
        barcoder.overwrite = this.overwrite
        // this.watcherSequencing = chokidar.watch([
        //     `${path_1}/*fastq.gz`, 
        //     `${path_1}/*fastq`,
        //     `${path_1}/*fq.gz`,  
        //     `${path_1}/*fq`], {ignored: /^\./, persistent: true});
 
         

        let msg;
        let code 
        // logger.info(`Starting barcoder run for job: ${this.sample}, ${barcoder.filepath}`)
        
        msg = this.defineQueueMessage(barcoder)
        barcoder.index = msg.index
        barcoder.type = 'barcoder'
        this.updateStatusQueueList(barcoder, msg.index)
        this.ws.send(JSON.stringify({ type: "recentQueue", data: msg }))
        this.defineQueueJob(barcoder)
        
        return barcoder
    }
    defineClassifier(sampleObj, path_1, push){
        let classifier = new Classifier(sampleObj, path_1)
        classifier.ws = this.ws
        const $this = this
        classifier.config = this.config
        classifier.gpu = this.gpu
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
    async defineQueueJob(obj){
        let id = `${this.sample}-${obj.index}`
        this.queue.push({
            jobnumber: obj.index,
            id: id,
            type: obj.type,
            sample: this.sample,
            priority: 0,
            bind: obj
        })
        this.queueRecords[id] = obj
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
        if (this.path_1 && this.format == 'file'){
            this.defineClassifier(this.sampleObj, this.path_1)
        } else if (this.path_1 ){
            this.files = []
            
            this.watchDirectory()
        }  
        return 
    }
    stop(index){
        $this.queue.unshift(( index ? index : null ), function (cb) {
            const result = 'one'
            console.log(`removed index of queue: ${index}`)
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
        msg.sample = this.sample
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
                logger.info(`${job.name} stopping job `)
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
                        job.stop()
                        logger.info(`${job.name} stopping job `)
                    } catch (err){
                        logger.error(`${err}, error in stopping job`)
                    }
                })
            }
        }
    }
    defineBarcoderOutputfile(filepath){
        let sample = _.cloneDeep(this.sampleObj)
        sample.path_1 = filepath
        sample.sample = `${this.sample}-${path.basename(path.dirname(filepath))}`
        sample.run = `${this.sample}`
        sample.format = 'file'
        sample.demux = false
        sample.overwrite = this.overwrite
        return sample
    }
    async barcodeWatch(){
        const $this = this;
        let dirpath = ""
        try{
            this.watcherDemux ? this.watcherDemux.close() : ''  
            console.log("watcherdemux closed")
            delete this.watcherDemux
        } catch (err){
            logger.error(`${err} error in deleting demux watcher`)
        }
        try{
            let dirpath = this.path_1 ? this.path_1 : this.path_2
            let demuxoutpath = path.join(dirpath, 'demultiplexed') 
            await mkdirp.sync(demuxoutpath)
            this.watcherDemux = chokidar.watch([
                `${demuxoutpath}/**/*fastq.gz`,
                `${demuxoutpath}/**/*fastq`, 
                `${demuxoutpath}/**/*fq.gz`,
                `${demuxoutpath}/**/*fq`], {ignored: /^\./, persistent: true});
            
        } catch (Err){ 
            logger.error(`${Err} Error in finding the dmux outpath`)
            throw Err
        } finally { 
            if (!$this.pause){
                
                this.watcherDemux
                    .on('add', function(filepath) {
                        logger.info(`Post DEMUX: File ${filepath} has been ADDED for barcoding demux`);
                        $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                        let basefile = removeExtension(filepath) 
                        $this.seenfiles[basefile] = 1 
                        let sampleo = $this.defineBarcoderOutputfile(filepath)
                        $this.defineClassifier(sampleo, filepath, true) 
                    })
                    .on('change', function(filepath) {
                        logger.info(`POST DEMUX: File ${filepath} has been ALTERED follow demux ${$this.overwrite}`);
                        // $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                        // let basefile = removeExtension(filepath)
                        // $this.seenfiles[basefile] = 1 
                        // let sampleo = $this.defineBarcoderOutputfile(filepath)
                        // $this.defineClassifier(sampleo, filepath, true) 
                    })
        
                    .on('unlink', function(filepath) {
                        logger.info(`File ${filepath} has been removed`);
                    })
                    .on('error', function(error) { 
                        logger.error(`Error happened ${error}`);
                    }) 
            
            }
            
            
        }
        
        

       
    }
    async watchDirectory(){
        let sample = this.sampleObj
        const $this = this;
        let overwrite = false
        if (this.watcher ){
            this.watcher.close().then(() => console.log('closed')).catch((err)=>{
                logger.error("no watcher available to cancel properly")
                delete $this.watcher
            });
        } 
        var watcher = chokidar.watch([`${sample.path_1}/*fastq.gz`,`${sample.path_1}/*fastq`,`${sample.path_1}/*fq.gz`, `${sample.path_1}/*fq`], {ignored: /^\./, persistent: true});
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
                $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                if (!sample.demux){
                    $this.defineClassifier(sample, filepath)
                } else {
                    $this.defineBarcoder(sample, filepath)
                }
            }) 
            .on('change', function(filepath) {
                logger.info(`File ${filepath} has been changed`);
            })
            .on('unlink', function(filepath) {
                logger.info(`File ${filepath} has been removed`);
            })
            .on('error', function(error) {
                logger.error(`Error happened ${error}`); 
            })  
        if (sample.demux){  
            $this.barcodeWatch()
        }
    

    
        
        
        
    
    
    } 
    
}