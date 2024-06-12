import glob from "glob-all"
import {logger} from './logger.js'
import PQueue from 'p-queue';
import os from 'os'
import { broadcastToAllActiveConnections } from './messenger.mjs';
import { storage } from "./storage.mjs";
import path from 'path'
import { fileURLToPath } from 'url'
import {Barcoder} from "./barcoder.mjs"
import { Downloader } from "./downloader.mjs"
import { Run  } from "./run.mjs";
import {  globFiles, getKrakenConfigDefault , openPath,  rmFile } from './controllers.mjs';
import fs from "fs"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { parse } from "csv-parse"
import  { spawn } from 'child_process';
export  class Orchestrator { 
    constructor(){         
        this.sessions = {}
        this.queueList = []
        this.userSettings = new Map()
        this.homepath = os.homedir(); 
        this.savePath = path.join(this.homepath, ".config", "mytax2")
        this.userSavePath = path.join(this.homepath, ".config", "mytax2", "users")
        this.configuration = path.join(this.savePath, "config.json")
        this.historyPath = path.join(this.savePath, "runs")
        this.databasespath = path.join(this.homepath, ".config", "mytax2", "databases")
        this.databases = [
            {
                url: 'https://genome-idx.s3.amazonaws.com/kraken/k2_viral_20231009.tar.gz',
                decompress: true,
                final: 'k2_viral_20231009', 
                key: 'k2_viral_20231009',
                fullpath: path.join(this.databasespath, "k2_viral_20231009")
            },
            {
                url: "https://media.githubusercontent.com/media/jhuapl-bio/mytax/master/databases/flukraken2.tar.gz",
                decompress: true,
                final: 'flukraken2', 
                nested: true,
                key: 'flukraken2',
                fullpath: path.join(this.databasespath, "flukraken2")
            },
            {
                url: "https://media.githubusercontent.com/media/jhuapl-bio/mytax/master/databases/marine_mammal_mitochondrion-refseq-20210629.tar.gz",
                decompress: true,
                final: 'MarineMitogenome20210629', 
                nested: true,
                key: 'MarineMitogenome20210629',
                fullpath: path.join(this.databasespath, "MarineMitogenome20210629")
            },
            {
                url: "https://genome-idx.s3.amazonaws.com/kraken/k2_pluspfp_08gb_20240605.tar.gz",
                decompress: true,
                final: 'pluspf8', 
                nested: true,
                key: 'pluspf8',
                fullpath: path.join(this.databasespath, "pluspf8")
            },
            {
                url: "https://genome-idx.s3.amazonaws.com/kraken/16S_Greengenes13.5_20200326.tgz",
                decompress: true,
                final: 'Greengenes13.5', 
                nested: true,
                key: 'Greengenes13.5',
                fullpath: path.join(this.databasespath, "Greengenes13.5")
            },
            {
                url: "https://genome-idx.s3.amazonaws.com/kraken/16S_Greengenes13.5_20200326.tgz",
                decompress: true,
                final: 'Greengenes13.5', 
                nested: true,
                key: 'Greengenes13.5',
                fullpath: path.join(this.databasespath, "Greengenes13.5")
            },
            
            // Add other databases here
        ];
        this.defaultLocation = ""
        this.watcher = {} 
        this.watcherBC = {} 
        this.queueRecords = {}
        const $this = this
        
        this.downloader = new Downloader(
            path.join(this.homepath, ".config", "mytax2", "databases")
        );
        this.downloader.databases = this.databases

        this.changeReportDir() 
        this.runs = []
        this.defaultwatchpath = "/var/lib/minknow/data" 
        this.defaultdatabase = path.join(this.homepath, ".config", "mytax2", "databases", "k2_viral")
        // this.portServer = 7688
        try{
            this.read_config()
        } catch (err){
            logger.error(err)
        }
        this.queueLengthInterval = true
        
        this.samples = []
        this.watchdir = null
        this.reportfile = null
        this.match = "*(.fastq.gz|.fq.gz)"
        this.taxonomy = null;
        this.database = null
        this.type = "single"
        this.logger = logger
        logger.on("data", (stream)=>{ 
            let output = stream   
            try{   
                broadcastToAllActiveConnections("logs", { data : output })
            } catch (err){ 
                console.error("no websocket connection %o", err)
            }
        })
        
        this.logdata = []
        this.overwrite = {}
        this.seenfiles = {
            bcs: [],
            fastqs: [],
        }
        this.queuedFastqs = []
        this.streamout = null
        this.seenstream = null   
        this.compressed = false
        this.ext = ".fastq"
        this.seenfile = null 
        this.enableQueue()
        this.checkdatabases()
        try{
            this.loadruns({})
        } catch (err){
            logger.error(err)
        }
        this.streamoutseen = null 
    } 
    
    async loadUserSettings(userId) {
        const filePath = path.join(this.userSavePath, `${userId}.json`);
        let exists = await fs.existsSync(filePath)
        if (exists) {
            const settings = await fs.readFileSync(filePath, 'utf8')
            this.userSettings.set(userId, JSON.parse(settings));
        } else {
            this.userSettings.set(userId, this.getDefaultSettings());
        }
        return this.userSettings.get(userId);
    }
    openPath(directoryPath) {
        if (directoryPath){
            openPath(directoryPath)
        } else {
            openPath(this.savePath)
        }
    }
    getDefaultSettings() {
        return {
            database: defaultdatabase,
            gpu: false,
            watchpath: this.defaultwatchpath,
            // ... other default settings
        };
    }
    async updateUserSettings(userId, settings) {
        // Update settings for the user
        let currentSettings = this.userSettings.get(userId) || {};
        this.userSettings.set(userId, { ...currentSettings, ...settings });
        // Save to file
        await this.saveUserSettingsToFile(userId);
    }
    async checkdatabases(){
        try{
            const $this = this
            // glob all directories in the database path, get size of the folder and return in a list
            let databases = await globFiles(`${this.downloader.databaseSavePath}/*`, { cwd: this.downloader.databaseSavePath, nodir: false })
            // iterate through this.databases and if the final == basename then set status" exists true and size 0, then for each that exist check the size of the dir 
            for (let [ key, value ] of Object.entries(this.databases)){
                let index = databases.findIndex((d)=>{
                    return d == path.join($this.downloader.databaseSavePath, value.final )
                })
                 
                if (index != -1){ 
                    let database = databases[index]
                    let size = await fs.statSync(path.join(database, 'hash.k2d')).size
                    value.exists = true
                    // convert size to byte, kb, mb, or gb
                    if (size > 1000000000){
                        size = `${(size / 1000000000).toFixed(2)} GB`
                    } else if (size > 1000000){
                        size = `${(size / 1000000).toFixed(2)} MB`
                    } else if (size > 1000){
                        size = `${(size / 1000).toFixed(2)} KB`
                    } else {
                        size = `${size} B`
                    }
                    value.size = size
                    broadcastToAllActiveConnections('databaseStatus', { status: value  })
                } else {
                    value.exists = false 
                    value.size = 0
                    broadcastToAllActiveConnections('databaseStatus', { status: value })
                }
                
            }
        } catch (err){
            logger.error(err)
        }
    }
    async checkdatabase(dbkey){
        try{
            const $this = this
            let databaseIdx = this.databases.findIndex((d)=>{ return d.key == dbkey })
            if (databaseIdx>-1){
                let database = this.databases[databaseIdx]
                
                let exists = await fs.existsSync(database.fullpath)
                if (exists){
                    let size = await fs.statSync(path.join(database.fullpath, 'hash.k2d')).size
                    console.log(exists, size)
                    if (size > 1000000000){
                        size = `${(size / 1000000000).toFixed(2)} GB`
                    } else if (size > 1000000){
                        size = `${(size / 1000000).toFixed(2)} MB`
                    } else if (size > 1000){
                        size = `${(size / 1000).toFixed(2)} KB`
                    } else {
                        size = `${size} B` 
                    }
                    if (database.size != size){
                        logger.info(`Database ${dbkey} has changed, updating size`)
                    }
                    this.databases[databaseIdx].size = size
                    
                    return 
                } 
            } else {
                return
            }
            
        } catch (err){
            logger.error(err)
        }
    }

    async saveUserSettingsToFile(userId) {
        const userSettings = this.userSettings.get(userId);
        // check that the dir for this.userSavePath exists if not then mkdirp
        let exists = await fs.existsSync(this.userSavePath)
        if (!exists){
            await fs.mkdirSync(this.userSavePath, { recursive: true });
        }
        if (userSettings) {
            const filePath = path.join(this.userSavePath, `${userId}.json`);
            await fs.writeFileSync(filePath, JSON.stringify(userSettings, null, 4));
        }
    }

    async sendMessageToUser(userId, message) {
        if (storage.activeConnections.has(userId)) {
            let userSocket = storage.activeConnections.get(userId);
            userSocket.emit('message', message);
        } else {
            console.log(`User ${userId} is not connected.`);
        }
    }
    async cancelDownload(database){
        try{
            let index = this.databases.findIndex((d)=>{
                return d.key == database
            })
            if (index != -1){
                try{
                    this.databases[index].stream.destroy()
                } catch (err){
                    console.error(err)
                } finally {
                    this.databases[index].downloading = false
                    await this.checkdatabase(this.databases[index].key)
                    broadcastToAllActiveConnections('databaseStatus', { status: this.databases[index] })
                }
                
            }
        } catch (err){
            console.error(err)
        }
    }

    async downloadfile(target){
        const $this = this 
        // get the index of the database in this.databases, if exits set download to true
        let index = this.databases.findIndex((d)=>{
            return d.key == target
        })
        try{
            if (index != -1){
                this.databases[index].downloading = true
            } 
            this.databases[index].error = null   
             
            broadcastToAllActiveConnections('databaseStatus', { status: this.databases[index] })
            await this.downloader.download(target)
            $this.databases[index].downloading = false
            logger.info("done dwnld")  
            await this.checkdatabase(this.databases[index].key)
            broadcastToAllActiveConnections('databaseStatus', { status: $this.databases[index] })
        } catch (err){ 
            logger.error(err.message)
            $this.databases[index].downloading = false
            $this.databases[index].error = err.message
            await this.checkdatabase(this.databases[index].key)
            broadcastToAllActiveConnections('databaseStatus', { status: this.databases[index] })
        }
    }
    getEntriesStatus(run, sample){
        // get the status of all entries and assign to a list. 
        let entries = []
        if (run && sample){
            let index = this.runs.findIndex((r)=>{
                return r.run == run
            })
            if (index != -1){
                let r = this.runs[index]
                let s = r.samples[sample]
                entries.push(s.getStatus(true))
            }
        } else {
            for (let [key, value] of Object.entries(this.runs)){
                entries.push(value.checkStatus())
            }
        }
            
        return entries
    }
    changeReportDir(report){
        process.env.reports = report ? report : path.join(this.savePath, "reports")
        
        this.reportdir = process.env.reports
        // broadcastToAllActiveConnections( "reportSavePath",  
        //     { data: process.env.reports }
        // )
    }
    async read_config(){
        let exists = await fs.existsSync(this.configuration)
        if (!exists){
            await this.setConfiguration()
        } else {
            let config = await fs.readFileSync(this.configuration)
            config = JSON.parse(config)
            this.savePath = config.savePath
            this.oxfordWatchPath = config.oxfordWatchPath
            return 
        }
    }
    
    async setConfiguration(){
        try{
            let exists = await fs.existsSync(this.savePath)
            if (!exists){
                await fs.mkdirSync(this.savePath, { recursive: true });

                const config = {
                    savePath: this.savePath,
                    oxfordWatchPath: this.oxfordWatchPath
                }

                await fs.writeFileSync(
                    this.configuration,
                    JSON.stringify(config, null, 4)
                )
            }
        } catch (err){
            logger.error(err)
        }
    }
    
    cleanup(){
        const $this = this
        try{
            for (let key  of Object.keys(this.samples)){
                logger.info(`${key}, cleaning up sample`)
                $this.samples[key].cleanup()
            }
        } catch (err){
            logger.error(`${err} error in config set ${type}`)
        }
        try{ 
            clearInterval(this.queueSizeInterval)
        } catch (err){
            logger.error(`${err} removing interval`) 
        } 
    } 
    // make a getter for run names as runNames
    get runNames(){
        return this.runs.map((r)=>{
            return r.run
        })
    }
    async getRunInformation(run){
        // get index where run.name == run
        let index = this.runs.findIndex((r)=>{
            return r.run == run  
        }) 
        if (index != -1){  
            let r = this.runs[index]
            let reportdata = []
            r.sendSampleData()
            if (r.samples){
                for (let [key, sample] of Object.entries(r.samples)){
                    let queueList =  sample.formatQueueInfo()
                    reportdata.push({
                        samplename: key,
                        data: sample.data, 
                        queue: queueList,
                        samplesheet: sample.samplesheet,
                        status: sample.getStatus()
                    })
                }
            }
            try{
                let returninfo = {  
                    run: r.run,
                    reportdata: reportdata,
                    samplesheet: r.samplesheet,
                    config: r.config
                }
                
                broadcastToAllActiveConnections( "runInformation",  returninfo);
            } catch (err){ 
                logger.error(`${err} error in sending run information`)
            }
        } else {
            return null
        } 
    }
    async setSampleSingle(s, overwrite){
        try{
            if (this.samples[s.sample]){
                this.samples[s.sample].cancel()
                delete this.samples[s.sample]
            }
        } catch (err){
            logger.error(`${err}, error in setting sample`)
        }
        try{
            let sample = new Sample(s, storage.queue, this.w, this.reportWs)
            sample.gpu = this.gpu 
            sample.overwrite = overwrite
            sample.config = this.config
            sample.pause = false
            sample.bundleconfig = this.bundleconfig
            this.samples[sample.sample] = sample
            sample.setupSample()
        } catch (err){
            logger.error(`${err}`)
        }
    }
    
    async loadruns(config){
        // from within this.historyPath, load all of the json files with a try catch
        let runlocation = config.history
        if (!runlocation){
            runlocation = this.historyPath
        }
        try{            
            logger.info(`Loading runs from ${runlocation}`)
            let exists = await fs.existsSync(runlocation)
            logger.info(`Loaded (successfully) from ${runlocation}`)
            if (exists){
                // glob all files in "*json in runlocation"
                let files = await globFiles(`${runlocation}/*.json`, { cwd: runlocation, nodir: true })
                files.forEach((file)=>{
                    let run = fs.readFileSync(file)
                    run = JSON.parse(run)
                    // add the runs to the array this.runs, get index if it exists and overwrite otherwise append to front
                    let index = this.runs.findIndex((r)=>{
                        return r.run == run.run
                    })   
                    if (index == -1){ 
                        if (run.run){
                            logger.info(`Have not seen run ${run.run}`)
                            console.log(run.run, run.config)
                            let r = new Run(run, storage.queue, this.w)
                            r.filepath = file
                            // for keys in run.config overwrite r.config
                            if (run.config){
                                Object.keys(run.config).forEach((key)=>{
                                    r.config[key] = run.config[key]
                                })
                            }
                            this.runs.unshift(r)
                        }
                    }  else { 
                        logger.info("Already seen run: %s", run.run)    
                    }
                })
            } 
            // send the runs information to the front end 
            logger.info("Sending runs")
            let runnames = this.runs.map((r)=>{
                return r.run
            })
            // broadcastToAllActiveConnections( "runs",  runnames )
        } catch (err){  
            logger.error("Error in loading the runs!")
            console.error(err)
            logger.error(err)
        }
    }
    
    async deleteEntry(run, sample){
        try{
            // set a configuration with run name, smaplesheet, and the bundle config information in it as a json
            let index = this.runs.findIndex((r)=>{
                return r.run == run
            })
            if (index != -1){
                let r = this.runs[index]
                await r.deleteSample(sample)
            }
        }
        catch (err){
            logger.error("Error in deleting the run to a folder/file")
            logger.error(err)
        }
    }
    async deleteRun(run){
        try{
            let index = this.runs.findIndex((r)=>{
                return r.run == run
            })
            if (index != -1){
                let r = this.runs[index]
                this.runs.splice(index, 1)
                let outfile = r.filepath
                await rmFile(outfile)
                // if there are more runs, send the runs information to the front end
                if (this.runs.length > 0){   
                    let runnames = this.runs.map((r)=>{
                        return r.run
                    })
                    broadcastToAllActiveConnections( "runs",  runnames )
                } else {
                    broadcastToAllActiveConnections( "runs",  [] )
                }
            }
        } catch (err){
            logger.error("Error in deleting the run to a folder/file")
            logger.error(err)
        }
    }
    async addRun(configuration){
        try{
            // set a configuration with run name, smaplesheet, and the bundle config information in it as a json
            let config = {
                samplesheet: configuration.samplesheet,
                run: configuration.run,
                report: configuration.report,
                config: getKrakenConfigDefault(),            
                created:   new Date().toLocaleString('en', { timeZone: 'UTC' })
            }  
            logger.info(`Adding run ${config.run}`)
            let r = new Run(config, storage.queue, this.w)
            r.filepath = file
            let index = this.runs.findIndex((r)=>{
                return r.run == run
            })
            if (index == -1){
                this.runs.unshift(r)
            }  else {
                logger.info("Already seen run: %s", run)
            }
               
        } catch (err){ 
            logger.error("Error in setting run ")
            logger.error(err)
        }
    }
    async setRun(configuration){ 
        try{
            // set a configuration with run name, smaplesheet, and the bundle config information in it as a json
            let config = {
                samplesheet: configuration.samplesheet,
                run: configuration.run,
                bundleconfig: this.bundleconfig,
                created:   new Date().toLocaleString('en', { timeZone: 'UTC' })
            }
            this.logger.info(`Setting run ${config.run}`)
            this.runName = this.configuration.runName
            this.samplesheet = this.configuration.samplesheet
            this.configuration.bundleconfig  ? this.bundleconfig = this.configuration.bundleconfig : ''
        } catch (err){ 
            logger.error("Error in setting run ")
            logger.error(err)
        }
    }
    async setSamples(samples, overwrite){
        logger.info(`Env: ${process.env} ${path.cwd}-----${samples}`)
        const $this = this
        delete this.samples
        this.samples = {}
        if (samples.samplesheet){
            samples.samplesheet.forEach((s)=>{
                $this.setSampleSingle(s, samples.overwrite)
            })
        }
    }
    setConfig(config, runnameselected){
        const $this = this
        try{  
            // iterate through all runs, and set the configuration for each run
            for (let[key, run] of Object.entries(this.runs)){
                run.setConfig(config)
                if (runnameselected == run.run){
                    // update the run config attr in the runfile json
                    run.updateRun()
                }
            }
        } catch (err){
            logger.error(`${err}, error in setting gpu for commands`)
        }
        
    }
    setGpu(gpu){
        logger.info(`${gpu}, setting the gpu for barcoding purposes`)
        this.gpu = gpu ?  ' -x cuda:0' : ''
        process.env.GPU = this.gpu 
        if (this.samples){
            const $this = this
            try{    
                for (let[key, sample] of Object.entries(this.samples)){
                    sample.gpu = ( gpu ? '-x cuda:0' : '')
                    sample.queueList.forEach((job)=>{
                        if (job.job){
                            job.job.gpu = ( gpu ? '-x cuda:0' : '')
                            job.job.generateCommandString()
                        }
                    })
                }
            } catch (err){
                logger.error(`${err}, error in setting gpu for commands`)
            }
        }
    }
    async createSample(sample, overwrite){
        const $this = this

        if (overwrite){ 
            let outpath = path.join(path.dirname(sample.path_1), sample.sample)  
            let fullreport = path.join(outpath, 'full.report')
            let exists_returned = await fs.existsSync(fullreport)
            if (exists_returned){
                try{
                    await rmFile(fullreport)
                } catch(err){
                    logger.error(err)
                }
            }
        }
        if (sample.path_1 && sample.format == 'file'){
            // overwrite = true //CHANGE THIS LATER!
            let runClassify = await this.check_and_classify(sample.path_1, sample.path_2,  sample.sample, overwrite) 
            if (runClassify){
                // logger.info(`report from ${sample.path_1} ${sample.path_2 ? sample.path_2 : '' } doesn't exists, classifying now`)
                $this.checkAndAddFileToQueue(sample, sample.path_2 ? `${sample.path_1} ${sample.path_2}` : `${sample.path_1}`, runClassify)
            } else {
                // logger.info(`skipping report making for ${sample.path_1} ${sample.path_2 ? sample.path_2 : '' }`)
            }
        } else if (sample.path_1 && sample.format == 'directory'){
            sample.files = []
            this.watchDirectory(sample, overwrite)
        }  
        
        return 
    }
    
    resetSeenfiles(){
        this.seenfiles = {
            bcs: [],
            fastq: []
        }
    }
    
    
    
    async  barcode(filepath, sample){
        const $this = this
        
        return new Promise((resolve, reject)=>{
            try{
                let barcoder = new Barcoder(sample, filepath)
                resolve(barcoder)
            } catch (err){
                logger.error(err)
                reject()
            }
        })
        
    } 
    async addSamples(output_path, pattern, run, fullrun){
        try{
            const $this = this
            logger.info(`${output_path}/ output path of files from barcoding ${pattern}`)
            let directories = await this.globFiles(`${output_path}/*`, { furtherfilter: [ ( pattern ? pattern : 'barcode[0-9]+' ) ], nodir: false })
            if (directories){
                let database = fullrun.database
                directories.forEach((directory)=>{
                    
                    let entry = {
                        sample: path.basename(directory),
                        platform: 'oxford',
                        database: database,
                        format: 'directory',
                        path_1: directory,
                        path_2: null, 
                        run: run ? run : 'N/A',
                        compressed: true,
                        kits:null
                    }
                    if ($this.seenfiles.fastqs.indexOf(directory) == -1){
                        $this.setupSample(entry, false)
                        $this.seenfiles.fastqs.push(directory)
                        broadcastToAllActiveConnections( "add", { data :  entry })
                    }
                    
                })
            }
        } catch (err){
            logger.error(`${err} error in reading barcode outputs`)
        }
    }
    cancel(index, sample, run){
        const $this = this   
        try{      
            // find the run if it exists, then iterate through everything, if index > -1 then just select a job otherwise cancel ALL sample jobs for that run
            let index_run = this.runs.findIndex((r)=>{
                return r.run == run
            })
            if (index_run != -1){
                let r = this.runs[index_run]
                if (index >= 0){
                    r.cancel(index, sample)
                } else {
                    r.cancelAll(sample)
                }
            } 
            
        } catch (Err){
            logger.error(`${Err} error in canceling job(s)`)
            throw Err
        }
    }
    createInterval(){
        const $this = this
        if (storage.queueSizeInterval){
            try{
                clearInterval(storage.queueSizeInterval)
            }catch (err){
                logger.error(`${err} could not destroy queue length interval, skipping`)
            }
        }
        this.queueSizeInterval = setInterval(()=>{
            if (storage.queueLengthInterval){
                // broadcastToAllActiveConnections( "queueLength",   { data: storage.queue.size + 1})
            } else {
            }
        },1000)
    }
    enableQueue(){
        const $this = this
        const queue = new PQueue({concurrency: 1});
 
        storage.queue = queue

        storage.queue.on("active", (f) => {
            try{
                // logger.info(`Active queue started, adding to queue ${queue.size}`)
                // storage.queueLengthInterval = true  
                // broadcastToAllActiveConnections( "queueLength", {data:  queue.size }); 
            } catch (err){
                logger.error(`${err} error in sending active status of add in queue`)
            } 
        });
        storage.queue.on("add", (f) => { 
            try{
                // logger.info(`Added to queue ${queue.size} --- ${queue.pending}`)
                storage.queueLengthInterval = true
                broadcastToAllActiveConnections( "queueLength", {data: queue.size + queue.pending , type: "add" });
            } catch (err){
                logger.error(`${err} error in sending add status of add in queue`)
            } 
        });
        $this.createInterval() 
       
        storage.queue.on("empty", () => {
            logger.info("Ended queue");
            // broadcastToAllActiveConnections( "queueLength", {data:  queue.size });
            try {
                // Use the imported function to emit to all active connections
                // broadcastToAllActiveConnections( "anyRunning", { status: false });
            } catch (err) {
                logger.error(`${err} error in sending empty status of running in queue`);
            }
        });
        storage.queue.on("idle", () => {
            logger.info("Idle queue, all jobs completed")
            // storage.queueLengthInterval = false
            broadcastToAllActiveConnections( "queueLength", {data:  queue.size + queue.pending, type: "idle"});
            try{ 
            } catch (err){
                logger.error(`${err} error in sending idle status of running in queue`)
            }
        });
        
        storage.queue.on('completed', function ( result) {
            // logger.info(`task completed ${result}`)
            broadcastToAllActiveConnections( "queueLength", {data:   queue.size , type: "completed" });
        })
        storage.queue.on('error', function (err) {
            logger.error(`Queue task error ${err}`)
            broadcastToAllActiveConnections( "queueLength", {data: queue.size + queue.pending, type: "error"});
        })
       
     

    }
    resume(val){
        try{
            for (let[key, sample] of Object.entries(this.samples)){
                sample.paused = false
                this.samples[key].resetWatchers() 
            }
            storage.queue.start()
               
            broadcastToAllActiveConnections("paused",  {message: false })
        } catch (err){
            logger.error(`${err} error in resuming the job(s)`)
            broadcastToAllActiveConnections( "error",  {message: err})
        }
    }
    async rerun(index, sample, run){
        try{
            // check if run exist with run and if run.sample exists
            // if so, then rerun the job
            // if not, then send error message
            // if index is null and sample null, then rerun the entire run including all samples
            let index_run = this.runs.findIndex((r)=>{
                return r.run == run
            })
            if (index_run != -1){
                let r = this.runs[index_run]
                r.rerun(index, sample)
            }
            
           
            
        } catch (err){
            logger.error(`${err} error in rerunning the job(s)`)
            broadcastToAllActiveConnections( "error", { message: err})
            
        }
    }
    pause(val){
        try{
            this.logger.info(`Pausing the queue for all running samples`)
            storage.queue.pause()
            broadcastToAllActiveConnections( "paused", { message: true })
        } catch (err){
            logger.error(`${err} error in pausing the job(s)`)
            broadcastToAllActiveConnections("error",  {message: err})
        }
    }
    async removeReport(){
        const $this = this
        return new Promise((resolve,reject)=>{
            try{
                // await 
                let promises = []
                const $this = this
                promises.push(rmFile(this.seenfile))
                promises.push(rmFile(this.reportfile))
                promises.push(rmFile(`${this.watchdir}/classifications/classifications.last.report`))
                Object.keys($this.seenfiles.fastqs).forEach((f)=>{
                    let filename = `${path.join(this.classificationsDir, 'reports', f)}.report`
                    promises.push(rmFile(filename))
                }) 
                this.resetSeenfiles() 
                Promise.allSettled(promises).then((f)=>{ 
                    $this.watchFastqs(true)
                    $this.watcher.close().then((f)=>{
                        $this.watchFastqs(true)
                    })
                    storage.queue.clear()
                    resolve(f)
                }).catch((err)=>{
                    console.error(err)
                    reject(err)
                })

            } catch (err){
                logger.error(err)
                reject(err)
            }
        })
            
    }
    setParams(params){
        this.database = params.database
        this.reportfile = `${params.watchdir}/classifications/classifications.full.report`
        this.outfile = `${params.watchdir}/classifications/classifications.full.out`
        // this.reportfile = `${params.watchdir}/classifications/classifications.full.json`
        this.classificationsDir = `${params.watchdir}/classifications/`
        this.type = params.readtype
        this.match = params.match
        this.config = params.config
        // this.match = "_R?[1-2].fastq"
        this.compressed = params.compressed
        this.ext = params.ext
        this.watchdir = `${params.watchdir}`
        this.seenfile =  path.join(this.watchdir, "classifications", "files_seen.tsv")
        
        if (!fs.existsSync(path.join(this.watchdir, "classifications"))){
            logger.info("Making file at %s", `${this.watchdir}/classifications` )
            fs.mkdirSync(path.join(this.watchdir, "classifications"), { recursive: true });
            this.streamoutseen = fs.createWriteStream(this.seenfile, { 'flags': 'a'})
        } else {
            this.streamoutseen = fs.createWriteStream(this.seenfile, { 'flags': 'a'})
        }
        if (this.restart){ 
            this.resetSeenfiles() 
        }
    }
    getQueueStatus(){
        return {
            length: storage.queue.size,
            isPaused: storage.queue.isPaused,
            pending: storage.queue.pending,
            pendingLength: storage.queue.pending,
        }
    }
 
    getFile(dir){
        var  ls = spawn('bash', ['-c', ` bash ${path.join(__dirname,'make_new.sh' ) } ${dir} ${output}` ]);

        ls.stdout.on('data', (data) => {
            logger.info(`stdout: ${data}`);
        });
    
        ls.stderr.on('data', (data) => {
            logger.error(`stderr: ${data}`);
        });
        ls.on('close', (code) => {
            logger.info(`child process exited with code ${code}`);
        }); 
    }
    
    copyFile(filepath, outputpath){
        fs.copyFile(filepath, outputpath, (err, data)=>{
            if (err){
                logger.error(err)
            } else {
                logger.info("Copied")
            }
        })
    }
    async globFiles(pattern, options){
        const $this = this
        if (!options){
            options = { ignore: [] }
        }
        let globoptions = options
        if (options.cwd){
            globoptions.cwd = options.cwd
        }
        return new Promise((resolve, reject)=>{
            glob(pattern ,globoptions, (err, files)=>{
                if (err){
                    logger.error(err)
                    reject(err)
                } else {
                    if (options.furtherfilter){
                        let re = new RegExp(options.furtherfilter, "g")
                        let files_true  = files.filter((file)=>{
                            let returnable = file.match(re)
                            return returnable
                        })
                        files = files_true
                    }
                    resolve(files)
                }
            })
        })
    }
    parseNames(files, options){
        if (!options){
            options = {}
        }
        const $this = this
        let basefiles = files.filter((file)=>{
            if (options.filter){
                return options.filter.some((f)=>{
                    let re = new RegExp(f, "g")
                    let matches = re.test(file)
                    return matches
                })
                

            } else {
                return true
            }
        })
        .map((file)=>{
            let returnable = path.basename(file)
            let removal = options.remove
            if (options.removematch){
                returnable = $this.removeMatch(returnable)
            }
            if(removal && Array.isArray(removal)){
                removal.forEach((rem)=>{
                    returnable = returnable.replaceAll(rem, "")
                })
            }
            if (options.sampleparse){
                let seen  = returnable.match(options.sampleparse)
                if (seen && Array.isArray(seen)){
                    returnable = seen[1]
                } 
            }
            
            return {
                path: file,
                sample: returnable,
                name: path.basename(file),
                dir: path.dirname(file),
            }
        })
        return basefiles
    }
    
    extractTaxid(taxid){
        const $this = this
        return new Promise((resolve,reject)=>{
            try{
                if ($this.streamout){
                    
                    $this.streamout.end()
                    $this.streamout.destroy()
                    delete $this.streamout
                    $this.streamout = null
                }
                
                let outparser = parse({columns:  [
                    'classified',
                    'ID',
                    'taxid',
                    'length',
                    'LCA mapping'
                ], delimiter:"\t"}, function (err, records) {
                    return records
                }); 
                
                $this.streamout = fs.createReadStream($this.outfile).pipe(outparser);
                let reads = []
                taxid = taxid.toString() 
                $this.streamout.on("data",(data)=>{    
                    let split = data['LCA mapping'].split(" ")
                    let filtered = split.filter((f)=>{
                        if (f.includes(`${taxid}:`)){
                            return true
                        } else {
                            return false
                        }
                    })
                    if (filtered.length >=1){
                        reads.push(data)
                    }
                    
                }) 
                $this.streamout.on("error", (err)=>{
                    logger.error(err)
                    reject(err) 
                }) 
                $this.streamout.on("close", (end)=>{
                    $this.streamout.end()
                    resolve(reads)
                })
                $this.streamout.on("end", (end)=>{
                    $this.streamout.destroy()
                    resolve(reads)
                })
    
                
            } catch (Err){
                logger.error(Err)
                reject(Err)
            }
        })
        
        
    }
    appendMatch(name){
        let returnable = name
        let match = this.match.replaceAll("\.\*", "")
        returnable = `${returnable}.${match}`
        return returnable
    }
    removeMatch(name){
        let returnable = name
        let match = this.match.replaceAll("\.\*", "")
        let re = new RegExp(match, "g")
        returnable = returnable.replaceAll(re, "")
        return returnable
    }
    async updateRun(info, run, sample){
        try{
            let index = this.runs.findIndex((r)=>{
                return r.run == run
            })
            if (index != -1){
                let r = this.runs[index]
                await r.updateSample(info, run, sample)
                await this.getRunInformation(run)
            } 
        } catch (err){
            logger.error(`${err} failure to update run`)
        }
    }
    async flush(){
        logger.info("flushing queue, canceling job(s)")
        const $this = this
        try{
            
            // iterate through all runs and cancel all jobs
            for (let [key, value] of Object.entries(this.runs)){
                try{
                    value.cancelAll()
                } catch (err){
                    logger.error(`${err} error in canceling run ${key}`)
                }
            }

            await storage.queue.clear()
            
        } catch (err){
            logger.error(`Error in stopping job(s) ${err}`)
        }
    }
    
    defineSample(filepath){ 
        let re = new RegExp(this.match.replaceAll(".\*", ""), "gi")
        if (this.type == 'paired'){
            let samplename = path.basename(filepath.replace(re, ""))
            return samplename
        } else {
            return path.basename(filepath) 
        }
    }
    
    
    mergeSamples(files){
        const $this=this
        
        let merged = {}
        files.forEach((file)=>{
            let sam = file.sample
            if (!merged[sam]){
                merged[sam] = []
            }
            merged[sam].push(file.path)
        })
        if ($this.type == 'paired'){
            for (let [key, value] of Object.entries(merged)){
                merged[key] = value.join(" ") 
            } 
        }
        return merged
    }
    definedSamplePairs(files){
        let pairs = []
        let re = new RegExp(this.match.replaceAll(".\*", ""), "gi")
        files.forEach((file)=>{
            let samplename = path.basename(filepath.replace(re, ""))
        })
    }
    
    writeSeen(filepath, samplename){
        let seenfile = path.join(this.watchdir, "classifications", "files_seen.tsv")
        if (this.type == 'paired'){
            filepath = filepath.split(" ")
            this.streamoutseen.write(`${samplename}\t${filepath[0]}\t${filepath[1]}\n`)
        } else {
            this.streamoutseen.write(`${samplename}\t${filepath}\n`)
        } 
        
    }
    async classify(database, filepath, report, paired, compressed, samplename){
        const $this=this
        return new Promise((resolve, reject)=>{
            let outputdir = path.dirname(report)
            
    
            logger.info(`report for: ${filepath},  database: ${database}, output to: ${outputdir}` )
            let command = `bash ${__dirname}/src/bundle.sh  -i "${filepath}" -o "${outputdir}"  -d "${database}"  `
            if (paired){ 
                command=`${command} -t paired `
            }
            
            let additionals = ""
            for(let [key, value] of Object.entries(this.config))
            {
                
                if (value && value == true && typeof value == 'boolean'){
                    additionals = `${additionals} --${key}` 
                } else if (value && value !== true){
                    if (Array.isArray(value)){
                        if (value.length >0){
                            additionals = `${additionals} --${key} ${value.join(",")}`
                        }
                    } else {
                        additionals = `${additionals} --${key} ${value}`
                    }
                } 
            }
            if (this.runBundle){
                for(let [key, value] of Object.entries(this.bundleconfig))
                {
                    
                    if (value && value.arg && Array.isArray(value.value)){
                        if (value.value && value.value.length >0){
                             
                            command = `${command} -${value.arg} ${value.value.join(",")}`
                        }
                    } else if (value && value.arg && value.value) {
                            command = `${command} -${value.arg} ${value.value}`    
                    }
                }

            }
            if (compressed == 'TRUE' && !additionals.match(/--gzip-compressed/g)){
                additionals = `${additionals} --gzip-compressed `
            } 
            
            if (additionals !== ''){
                command = `${command} -a "${additionals}"`
            }
            logger.info(`${command} `);
            let classify = spawn('bash', ['-c', command]);
            classify.stdout.on('data', (data) => {
                logger.info(`${data} `);
            }); 
        
            classify.stderr.on('data', (data) => {
                logger.error(`${data}`);
            });
            classify.on('exit', (data) => {
                logger.info(`finished classification for: ${filepath}`);
                broadcastToAllActiveConnections("current", {current : samplename, running: false })
                let reportpath = path.join(outputdir, `full.report`)
                $this.sendFullReportSample(reportpath, samplename)
                resolve()
            });
        })
    } 
    
    
    
    
}