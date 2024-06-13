import {logger} from './logger.js'
import { Sample } from './sample.mjs'
import fs from "file-system"
import { broadcastToAllActiveConnections } from './messenger.mjs';
import { writeRun, globFiles, getKrakenConfigDefault } from './controllers.mjs';
import path from "path"

import { storage } from './storage.mjs';
export  class Run { 
    constructor(configuration, queue, ws){
        this.run = configuration.run
        this.queue = queue
        this.ws = ws
        this.samplesheet = configuration.samplesheet.map((d)=>{
            d.searchPatternBC = null   
            return d 
        })
        // remove dups for samoplesheet based on sample
        this.samplesheet = this.samplesheet.filter((v,i,a)=>a.findIndex(t=>(t.sample === v.sample))===i)
        this.entries = []  
        this.config = {}
        this.samples = {}
        this.outrun = path.join(process.env.reports, this.run)
        this.config['memory-mapping'] = true 
        this.config['gzip-compressed'] = false
        this.config['bzip2-compressed'] = false
        this.config['minimum-hit-groups'] = null
        this.config['report-minimizer-data'] = false
        this.config['report-zero-counts'] = false
        this.config['quick'] = false
        this.config['threads'] = 1
        this.config['confidence'] = 0
        this.config['minimum-base-quality'] = 0
        this.defineSamples()
    }
    checkStatus(){
        let status = []
        for (let sample in this.samples){
            let s = this.samples[sample].getStatus(true)
        }
        
        return status
    }
    
    async deleteSample(sample){
        let s = this.samples[sample]
        try{
            // delete the sample from the run
            logger.info(`Deleting sample reports info ${sample}`)
            await s.deleteReports()
            await s.cancel()
            
        } catch(err) {
            logger.error(`Error in deleting sample ${sample}`)
            logger.error(err)
        }
        delete this.samples[sample]
        // get the samplesehet and console log is
        let index = this.samplesheet.findIndex((d)=>d.sample == sample)
        if (index > -1){
            this.samplesheet.splice(index, 1)
        }
        // write the new samplesheet
        this.saveRunInformation()
    }
    async updateRun(info){
        try{
            let config = {
                samplesheet: this.samplesheet,
                run: this.run,
                report: this.outrun,
                config: this.config,            
                created:   new Date().toLocaleString('en', { timeZone: 'UTC' })
            }  
            let filepath = this.filepath
            if (filepath){
                await writeRun(filepath, config)
            } else {
                logger.error(`No filepath found for run ${this.run}`)
            }
        } catch (err){
            logger.error(`Error in updating run ${err}`)
            console.error(err)
        }

    }
   
    async cancel (index, sample){
        let s = this.samples[sample]
        if (s){
            await s.cancel(index)
        } else {
            logger.error(`Sample ${sample} does not exist in the run`)
        }
    }
    async cancelAll(sample){
        if (sample){
            let s = this.samples[sample]
            try{
                if (s){
                    await s.cancel()
                } else {
                    logger.error(`Sample ${sample} does not exist in the run`)
                }
            } catch (err){
                logger.error(`${err} Error in canceling all samples`)
            }
        } else {
            try{
                for (let sample in this.samples){
                    let s = this.samples[sample]
                    await s.cancel()
                }
            } catch (err){
                logger.error(`${err} Error in canceling all samples`)
            }
        }
        
    }
    async saveRunInformation(){
        try{
            // set a configuration with run name, smaplesheet, and the bundle config information in it as a json
            // remove duplicate this.samplesheet entries
            this.samplesheet = this.samplesheet.filter((v,i,a)=>a.findIndex(t=>(t.sample === v.sample))===i)
            let config = {
                samplesheet: this.samplesheet,
                run: this.run,
                report: this.outrun,
                config: getKrakenConfigDefault(),
                created:   new Date().toLocaleString('en', { timeZone: 'UTC' })
            }
            logger.info(`Writing run information as a save file ${this.run}`)
            await writeRun(this.filepath, config)
        } catch (err){
            logger.error("Error in writing the run to a folder/file")
            console.error(err)
        }
    }
    async defineSamples(){
        // iterate through samplesheet and make new Sample for each entry
        for (const [i, d] of this.samplesheet.entries()) {
            try{
                let sample = await this.addSample(d)
            } catch (err){
                logger.error(`${err} failure to initialize sample ${d.sample}`)
            }
        } 


    }
    async addSample(info){
        const $this = this   
        let sample = info.sample
        let configuration = {
            ...info,
            run: this.run,
            outrun: this.outrun,
            config: this.config,
        }
        try{
            logger.info(`Creating sample ${sample}`)
            if (!this.samples[sample]){
                this.samples[sample] =  new Sample(
                    configuration, 
                    this.queue
                )
                await this.samples[sample].initialize()
            } else {
                logger.info(`${sample} exists, skipping initialization`)
            }         
           
        } catch(err){ 
            logger.error(`${err} failure to initialize sample ${sample}`)
            
        }
        let index = $this.samplesheet.findIndex((d)=>d.sample == sample)
        if (index == -1){
            $this.samplesheet.push(info)
        } else {
            $this.samplesheet[index] = info
        }
        await this.saveRunInformation()
        return 
    }
    async sendSampleData(sample){
        let data = []
        // iterate through all samples, and call "sendData" on each
        if (!sample){
            for (let sample in this.samples){
                let s = this.samples[sample]
                data.push(s.sendData())
            }
        } else {
            let s = this.samples[sample]
            data.push(s.sendData())
        }
    }
    async checkSubdirs(info){
        const $this = this
        let searchPatternBC = info.searchPatternBC
        let pattern = path.join(info.path_1, searchPatternBC)
        let files = await globFiles(`${pattern}`, {  nodir: false })
        for (const [i, d] of files.entries()) {
            const sample = path.basename(d);
            let newinfo = { ...info }; // Make a copy of the info object
            newinfo.path_1 = path.join(path.dirname(info.path_1), d);
            newinfo.sample = sample;
    
            let index = $this.samplesheet.findIndex((item) => item.sample === sample);
            if (index > -1) {
                $this.samplesheet[index] = newinfo;
            } else {
                await $this.addSample(newinfo);
            }
            
        }
       
    }
    async updateSample(info, run, sample){
        if (info.searchPatternBC){
            logger.info("Checking subdirectories........................")
            await this.checkSubdirs(info)
        } else {
            let s = this.samples[sample]
            if (s){
                logger.info(`Sample exists.......: ${sample}`)
                s.update(info)
                // update samplesheet entry in the json path of this.filepath
                // if searchPatternBC then look through all subdirectories in the run directory
                let index = this.samplesheet.findIndex((d)=>d.sample == sample)
                if (index > -1){ 
                    this.samplesheet[index] = info
                }
                await this.saveRunInformation()
            } else {
                logger.info(`Could not find run ${run} to update, adding instead`)
                await this.addSample(info)
                // Emit updated samplesheet to frontend
                // broadcastToAllActiveConnections('samplesheet', { samplesheet: this.samplesheet })
            }
        }
    }
    
    async rerun(index, sample){
        try{
            console.log(this.samples[sample].queueRecords.length)
            
            if (sample){
                let s = this.samples[sample]
                
                if (s){
                    await s.rerun(index)
                } else {
                    logger.error(`Sample ${sample} does not exist in the run`)
                }
            } else {
                for (let sample in this.samples){
                    let s = this.samples[sample]
                    await s.rerun()
                }
            }
        } catch (err){
            logger.error(`${err} Error in rerunning run ${sample}`)
            throw err
        }
    } 
    setConfig(config){
        // iterate through all keys of config and if in this.config then overwrite otherwise leave alone
        for (let key in config){
            if (key in this.config){
                this.config[key] = config[key]
            } 
        }
        // iterate through all samples and set config
        for (let sample in this.samples){
            this.samples[sample].setConfig(config)
        }
    }
    async setupRun(){
        const $this = this

       
        this.entry.samplename = this.name
        try{
            let checkDir = await fs.lstatSync(this.entry.path_1).isDirectory()
            this.format = checkDir ? 'directory' : 'file'
        } catch (Err){
            logger.error(`${Err} error in checking if path is a directory`)
            this.format = "file"
        }
        this.resetWatchers()
        return 
    }
    
} 