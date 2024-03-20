
import path, { resolve } from 'path'
import { Sample } from './sample.mjs'
import { getReportName, rmFile, removeExtension, globFiles } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
import chokidar from 'chokidar'
import {AbortError} from 'p-queue'
import _ from 'lodash';
import { mkdirp } from 'mkdirp'
import { pathEqual } from 'path-equal'

export  class Entry { 
    
    constructor(info, queue, ws){          
        this.entry = info
        this.ws = ws
        this.watcher = null
        this.run = info.run
        this.entry.outrun = path.join(process.env.reports, this.run)
        this.outdir = this.entry.outrun
        this.name = info.sample
        this.subrun = null
        this.fullstop = false
        
        this.queueRecords = []
        this.watcher = null
        const $this = this
        this.data = []
        this.reportWatcher = null
        this.config = {}
        this.paused = false
        this.samples = {}
        
        this.platform = info.platform ? info.platform : 'illumina'
        this.database = info.database
        this.pattern = info.pattern
        this.kits = info.kits
        this.path_1 = info.path_1
        this.path_2 = info.path_2
        this.name = info.sample
        
        
        this.barcode = null
        this.queueList = []
        this.queue = queue 
        this.seenfiles = {}
        this.logger = logger
        this.overwrite = false
        
    }
    async addSample(info){
        let basename = info.basename
        // let sample = info.format == 'subdir' ? `${this.name}_${info.dirpath}` : this.name
        let sample = this.name
        let filepath = info.filepath
        let format = info.format
        let type = info.type

        if (!this.samples[sample]){
            this.samples[sample] =  new Sample(
                this.entry, 
                this.queue, 
                this.ws
            )
            await this.samples[sample].initialize()
        }
        return this.samples[sample]
    }
    // Make a watcher for the run directory to look for new samples
    // samples can be either a directory where each directory is a sample OR if it is a file then it belongs to a single sample
    async setupWatcherSequencing(){
        const $this = this
        logger.info(`Setting up run ${this.path_1}`)
        try{
            this.watcher = await chokidar.watch([
                `${this.path_1}/*fq`,
                `${this.path_1}/*fastq`,
                `${this.path_1}/*fastq.gz`,
                `${this.path_1}/*fq.gz`,
                `${this.path_1}/*fa`,
                `${this.path_1}/*fna`,
                `${this.path_1}/*faa`,
                `${this.path_1}/*fasta`
            ], {ignored: /^\./, persistent: true,  usePolling: true   })
            .on('add', async function(filepath, stat) {
                logger.info(`NEWLY CREATED: File ${filepath} has been ADDED`);

                // if (info){
                //     let dirpath = path.dirname(filepath)
                //     info.filepath = filepath
                //     info.dirpath = dirpath
                //     if (info.type == 'sequencing'){
                //         // $this.addSample(info)
                //     } else if (info.type == 'fullreport'){
                //         $this.addSample(info)
                //     }
                // }
            })
            .on('addDir', function(filepath) {
                // logger.info(`Directory ${filepath} has been added`);
            })
            .on('change', function(filepath) {  
                // logger.info(`ALTERED: File ${filepath} has been ALTERED`);
            })
            .on('unlinkDir', function(directory) { 
                // logger.info(`Directory ${directory} has been removed`);
            }).on('unlink', function(filepath) {    
                // logger.info(`File ${filepath} has been removed`);
            })
        } catch (err){
            logger.error(`${err} error in watching base dir files`)
        }
    }
    async sendData(sample, filepath){
        try{
            fs.readFile(filepath,(err,data)=>{
                try{  
                    if (err){
                        logger.error(err)
                        reject(err)
                    } else {
                        this.data[sample] = data.toString()
                        this.ws.emit('data', { 
                            run: this.run, 
                            topLevelSampleNames: sample, 
                            samplename: sample, 
                            "data" : data.toString()
                        }) 
                        resolve()
                    }
                } catch (err){
                    reject(err)
                }
            
            })
            
        } catch (err){
            logger.error(`${err} error in sending data to client`)
        }
    }
    async setupReportWatcher(){ 
        const $this = this
        try{
            this.watcher = await chokidar.watch([
                `${this.outdir}/**/full.report`,
            ], {ignored: /^\./, persistent: true,  usePolling: true   })
            .on('add', async function(filepath, stat) {
                logger.info(`NEWLY CREATED Report: ${filepath} has been ADDED`);
                let sample = path.basename(path.dirname(filepath))
                logger.info(`Sample: ${sample}, Run: ${$this.run}`)
                $this.sendData(sample, filepath)
                    
            })
            .on('change', function(filepath) {  
                logger.info(`ALTERED Report: ${filepath} has been ALTERED`);
            })
            .on('unlink', function(filepath) {    
                logger.info(`Report ${filepath} has been removed`);
            })
        } catch (err){
            logger.error(`${err} error in watching base dir files`)
        }
    }
    async resetWatchers(){
        const $this = this
        try{
            logger.info(`Resetting watchers for ${$this.sample}`)
            if ($this.watcher){
                $this.watcher.close()
            }
            $this.setupWatcherSequencing()
            $this.setupReportWatcher()
        } catch (Err){
            logger.error(`${Err} error in watching base dir files`)
        }
    }

    async setupEntry(){
        const $this = this

       
        this.entry.samplename = this.name
        // check if this.entry.path_1 is a directory or a file
        // if it is a directory then this.format is directory else is file
        try{
            let checkDir = await fs.lstatSync(this.entry.path_1).isDirectory()
            this.format = checkDir ? 'directory' : 'file'
        } catch (Err){
            logger.error(`${Err} error in checking if path is a directory`)
            this.format = "file"
        }
        // iterate through samples and define new samples for each sample and run setup
        this.resetWatchers()
        
        return 
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
    
    
    
}