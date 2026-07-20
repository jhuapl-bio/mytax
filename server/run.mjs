import {logger} from './logger.js'
import { Sample } from './sample.mjs'
import fs from "file-system"
import { broadcastToAllActiveConnections } from './messenger.mjs';
import { writeRun, globFiles, getKrakenConfigDefault, makeSampleId, sanitizeIdPart, findReadPairs } from './controllers.mjs';
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
            await this.cancelAll(sample)
        } catch(err) {
            logger.error(`Error in deleting sample ${sample}`)
            logger.error(err)
        } 
        try{
            delete this.samples[sample]
            // get the samplesehet and console log is
            let index = this.samplesheet.findIndex((d)=>d.sample == sample)
            if (index > -1){
                this.samplesheet.splice(index, 1)
            }
            // write the new samplesheet
            this.saveRunInformation()
        } catch (err){
            logger.error(`Error in deleting sample ${sample}`)
            logger.error(err)
        } finally{
            // send emit that sample deleted
            logger.info(`Sending deleted sample status to frontend ${sample}`)
            broadcastToAllActiveConnections('deletedSample', { samplename: sample })
        } 
    }
    // Batch-delete many samples in one pass: cancel + drop reports for each, but
    // write the run file and broadcast only ONCE at the end. Deleting a 24-barcode
    // run one-at-a-time rewrote the run JSON 24x and emitted 24 frames; this does
    // it a single time.
    async deleteSamples(samples){
        const list = Array.isArray(samples) ? samples : []
        for (const sample of list){
            const s = this.samples[sample]
            try{
                if (s){
                    logger.info(`Deleting sample reports info ${sample}`)
                    await s.deleteReports()
                    await this.cancelAll(sample)
                }
            } catch(err){
                logger.error(`Error in deleting sample ${sample}`)
                logger.error(err)
            }
            try{
                delete this.samples[sample]
                const index = this.samplesheet.findIndex((d)=>d.sample == sample)
                if (index > -1){
                    this.samplesheet.splice(index, 1)
                }
            } catch (err){
                logger.error(`Error in removing sample ${sample} from samplesheet`)
                logger.error(err)
            }
        }
        try{
            // single persist for the whole batch
            await this.saveRunInformation()
        } catch (err){
            logger.error(`Error saving run after batch delete`)
            logger.error(err)
        } finally {
            // tell every viewer which samples are gone (one frame per sample so the
            // existing front-end handler stays unchanged)
            list.forEach((sample) => {
                logger.info(`Sending deleted sample status to frontend ${sample}`)
                broadcastToAllActiveConnections('deletedSample', { samplename: sample })
            })
        }
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
            logger.info(`${sample}, cancel job request at index ${index}`)
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
                    logger.info(`${sample}, cancelling all currently queued jobs. The operating one will complete as planned....`)
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
        // The run-entry name the user typed becomes the GROUP (parent) for every
        // barcode discovered underneath it. Two different run folders that both
        // contain barcode01..24 therefore expand into distinct, non-colliding
        // sample ids (e.g. RunA__barcode01 vs RunB__barcode01) while still being
        // grouped under their own run in the UI.
        const group = info.sample;
        for (const [i, d] of files.entries()) {
            const label = path.basename(d);            // e.g. "barcode01"
            // Unique, path/shell-safe sample id scoped to its parent run.
            const sample = makeSampleId(group, label);
            let newinfo = { ...info }; // Make a copy of the info object
            // get abs path of d
            newinfo.path_1 = d;
            // newinfo.path_1 = path.join(path.dirname(info.path_1), d);
            newinfo.sample = sample;
            newinfo.group = group;     // parent run / folder name
            newinfo.label = label;     // display name within the group

            let index = $this.samplesheet.findIndex((item) => item.sample === sample);
            if (index > -1) {
                logger.info(`Sample exists, overwriting..`)
                $this.samplesheet[index] = newinfo;
                // get sampel in this.samples 
                if ($this.samples[sample]){
                    try{
                        $this.sendSampleData(sample)
                    } catch(err) {
                        logger.error(`${sample} could not send data to the user... ${err}`)
                    }
                }

            } else {
                logger.info(`Sample does not exist, creating a new class..`)
                await $this.addSample(newinfo);
                $this.sendSampleData(sample)

            }
            
        }
       
    }
    // Expand a directory of R1/R2 FASTQ files into one paired-end sample per
    // pair. Mirrors checkSubdirs (barcoded runs) but pairs files by a shared
    // name that differs only by the R1/R2 marker instead of enumerating
    // sub-directories. Each pair becomes format:'file' with path_1=R1, path_2=R2.
    async checkReadPairs(info){
        const $this = this
        const markers = info.pairReads || {}
        const r1Marker = markers.r1 || '_R1'
        const r2Marker = markers.r2 || '_R2'
        const { pairs, unpaired, error } = findReadPairs(info.path_1, r1Marker, r2Marker)
        if (error){
            broadcastToAllActiveConnections("alert", { message: `Could not read ${info.path_1}: ${error}` })
            return
        }
        if (!pairs || !pairs.length){
            logger.warn(`No R1/R2 read pairs found in ${info.path_1} using markers ${r1Marker}/${r2Marker}`)
            broadcastToAllActiveConnections("alert", { message: `No R1/R2 read pairs found in ${info.path_1} using markers ${r1Marker} / ${r2Marker}` })
            return
        }
        // Optional parent group: when the user names the entry, pairs are grouped
        // under it (ids scoped as group__prefix) so two directories with the same
        // file names don't collide. Blank name => flat samples named by prefix.
        const group = (info.sample && String(info.sample).trim()) ? String(info.sample).trim() : null
        for (const pair of pairs){
            const label = pair.sample
            const sample = group ? makeSampleId(group, label) : sanitizeIdPart(label)
            let newinfo = { ...info }
            delete newinfo.pairReads
            delete newinfo.searchPatternBC
            newinfo.path_1 = pair.path_1
            newinfo.path_2 = pair.path_2
            newinfo.format = 'file'
            newinfo.sample = sample
            if (group){ newinfo.group = group; newinfo.label = label }
            const index = $this.samplesheet.findIndex((item) => item.sample === sample)
            if (index > -1){
                logger.info(`Read-pair sample exists, overwriting ${sample}`)
                $this.samplesheet[index] = newinfo
                if ($this.samples[sample]){
                    try { $this.sendSampleData(sample) } catch(err){ logger.error(`${sample} could not send data ${err}`) }
                }
            } else {
                logger.info(`Adding read-pair sample ${sample} (R1 ${pair.path_1}${pair.path_2 ? `, R2 ${pair.path_2}` : ', no R2'})`)
                await $this.addSample(newinfo)
                $this.sendSampleData(sample)
            }
        }
        await this.saveRunInformation()
        if (unpaired && unpaired.length){
            broadcastToAllActiveConnections("alert", { message: `${unpaired.length} R1 file(s) had no matching R2 and were added single-ended: ${unpaired.slice(0, 5).join(', ')}${unpaired.length > 5 ? '…' : ''}` })
        }
    }
    async updateSample(info, run, sample){
        if (info.pairReads){
            logger.info("Scanning directory for R1/R2 read pairs........................")
            await this.checkReadPairs(info)
            broadcastToAllActiveConnections('samplesheet', { samplesheet: this.samplesheet })
        } else if (info.searchPatternBC){
            logger.info("Checking subdirectories........................")
            await this.checkSubdirs(info)
            broadcastToAllActiveConnections('samplesheet', { samplesheet: this.samplesheet })
        } else {
            let s = this.samples[sample]
            if (s){
                logger.info(`Sample exists.......: ${sample}`)
                s.update(info)
                // update samplesheet entry in the json path of this.filepath
                // if searchPatternBC then look through all subdirectories in the run directory
                let index = this.samplesheet.findIndex((d)=>d.sample == sample)
                if (index > -1){
                    // merge so metadata-only updates (lat/long) don't drop path_1/path_2/kits
                    this.samplesheet[index] = { ...this.samplesheet[index], ...info }
                }
                await this.saveRunInformation()
            } else {
                logger.info(`Could not find run ${run} to update, adding instead`)
                await this.addSample(info)
                // Emit updated samplesheet to frontend
            } 
            broadcastToAllActiveConnections('samplesheet', { samplesheet: this.samplesheet })
        }
    }
    
    async rerun(index, sample){
        try{
            
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