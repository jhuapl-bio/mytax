import glob from "glob-all"
import {logger} from './logger.js'
import PQueue from 'p-queue';
import os from 'os'

import  { WebSocketServer } from 'ws';

import path, { resolve } from 'path'
import { fileURLToPath } from 'url'
import {Barcoder} from "./barcoder.mjs"
import {Classifier} from "./classifier.mjs"
import {Sample} from "./sample.mjs"

import { removeExtension , rmFile } from './controllers.mjs';
import fs, { watch } from "fs"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { parse } from "csv-parse"
import  { spawn } from 'child_process';
export  class Orchestrator { 
    constructor(socket){         
        this.queue = null
        this.queueList = []
        this.ws = socket
        this.watcher = {}
        this.watcherBC = {} 
        this.queueRecords = {}
        const $this = this
        this.homepath = os.homedir();
        this.savePath = path.join(this.homepath, ".config", "mytax2")
        this.configuration = path.join(this.savePath, "config.json")
        this.runs = path.join(this.savePath, "runs")
        this.reports = path.join(this.savePath, "reports")

        this.oxfordWatchPath = "/var/lib/minknow/data" 
        // this.portServer = 7688
        try{
            this.read_config()
        } catch (err){
            logger.error(err)
        }


        this.bundleconfigDefaults= [
            {
                name: "NCBI names.dmp file", 
                'Names File': { "arg": "y", "value": null},
                'Attributes': {"arg": "p", "value": ['common name']},
                'Value Index': { "arg": "v", "value": 3},
                'Column Index': { "arg": "c", "value": 7},
            },
            {
                name: "Pre-Bundled", 
                'Names File': { "arg": "y", "value": `${path.join(__dirname, 'data', 'names.tsv')}`},
                'Attributes': {"arg": "p", "value": []},
                'Value Index': { "arg": "v", "value": 2},
                'Column Index': { "arg": "c", "value": null}
            },
        ],

        this.bundleconfig = this.bundleconfigDefaults[1]
        this.runBundle = true
        this.queueLengthInterval = true
        // this.create_Report_WS(this.portServer)
        
        this.samples = []
        this.watchdir = null
        this.reportfile = null
        this.match = "*(.fastq.gz|.fq.gz)"
        this.taxonomy = null;
        this.database = null
        this.type = "single"
        this.logger = logger
        this.config = {}
        this.config['memory-mapping']=true
        this.config['gzip-compressed'] = false
        this.config['bzip2-compressed'] = false
        this.config['minimum-hit-groups'] = false
        this.config['report-minimizer-data'] = false
        this.config['report-zero-counts'] = false
        this.config['quick'] = false
        
        // this.config['threads'] = 1
        this.config['confidence'] = 0
        this.config['minimum-base-quality'] = 0
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
        this.streamoutseen = null 
        logger.on("data", (stream)=>{ 
            let output = stream   
            try{   
                this.ws.emit("logs", { data : output })
            } catch (err){ 
                console.error("no websocket connection %o", err)
            }
        })
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
            let sample = new Sample(s, this.queue, this.ws, this.reportWs)
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
    async writeRun(config){
        try{
            // set a configuration with run name, smaplesheet, and the bundle config information in it as a json
            console.log(config)
            let outfile = path.join(this.runs, `${config.run}.json`)
            // check if the run directory exists, if it does not make a directory
            console.log(outfile)
            let exists = await fs.existsSync(this.runs)
            if (!exists) {
                await fs.mkdirSync(this.runs, { recursive: true });
            }
            await fs.writeFileSync(outfile, JSON.stringify(config, null, 4))
        } catch (err){
            logger.error("Error in writing the run to a folder/file")
            logger.error(err)
        }
    }
    async setRun(configuration){ 
        try{
            // set a configuration with run name, smaplesheet, and the bundle config information in it as a json
            let config = {
                samplesheet: configuration.samplesheet,
                run: configuration.run,
                bundleconfig: this.bundleconfig
            }
            await this.writeRun(config)
            this.runName = this.configuration.runName
            this.samplesheet = this.configuration.samplesheet
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
    setConfig(config, type){
        const $this = this
        try{  
            logger.info(`${type}, setting the config`)
            if (type == 'bundle' && typeof config == 'object'){
                for (let[ key, value] of Object.entries(config)){
                    if ($this.bundleconfig.hasOwnProperty(key)){
                        $this.bundleconfig[key] = value
                    }
                }
                
            } else if (type == 'config' && typeof config == 'object'){
                for (let[ key, value] of Object.entries(config)){
                    if ($this.config.hasOwnProperty(key)){
                        $this.config[key] = value
                    }
                }
            }
        } catch (err){
            logger.error(`${err}, error in setting gpu for commands`)
        }
        if ($this.samples){
            try{
                for (let[key, sample] of Object.entries(this.samples)){
                    if (type == 'config'){
                        sample.config = config
                    } else if (type == 'bundleconfig'){
                        sample.bundleconfig = config
                    }
                    sample.queueList.forEach((job)=>{
                        if (job.job){
                            if (type == 'config'){
                                job.job.config = config
                            } else if (type == 'bundleconfig'){
                                job.job.bundleconfig = config
                            }
                        }
                    })
                }
            } catch (err){
                logger.error(`${err} error in config set ${type}`)
            }
        }
    }
    setGpu(gpu){
        logger.info(`${gpu}, setting the gpu for barcoding purposes`)
        this.gpu = gpu ?  ' -x cuda:0' : ''
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
        let sampleObj = new Sample(sample)

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
                        $this.ws.emit( "add", { data :  entry })
                    }
                    
                })
            }
        } catch (err){
            logger.error(`${err} error in reading barcode outputs`)
        }
    }
    cancel(index, sample){
        const $this = this
        try{       
            if (!index && this.samples[sample]) {
                let s = this.samples[sample]
                $this.samples[sample].paused = true
                Object.keys(s.queueRecords).map((f)=>{
                    if (s.queueRecords[f].controller){
                        s.queueRecords[f].controller.abort()
                    }
                })
            } else {
                if (index >= 0 && this.samples[sample]){
                    if (this.samples[sample] && this.samples[sample].queueRecords[index]){
                        this.samples[sample].queueRecords[index].controller.abort()
                    }
                }
            }
        } catch (Err){
            logger.error(`${Err} error in canceling job(s)`)
            throw Err
        }
    }
    createInterval(){
        const $this = this
        if ($this.queueSizeInterval){
            try{
                clearInterval($this.queueSizeInterval)
            }catch (err){
                logger.error(`${err} could not destroy queue length interval, skipping`)
            }
        }
        this.queueSizeInterval = setInterval(()=>{
            if ($this.queueLengthInterval){
                $this.ws.emit( "queueLength",   { data: $this.queue.size + 1})
            } else {
            }
        },1000)
    }
    enableQueue(){
        const $this = this
        const queue = new PQueue({concurrency: 1});
 
        $this.queue = queue

        $this.queue.on("active", (f) => {
            try{
                $this.queueLengthInterval = true
            } catch (err){
                logger.error(`${err} error in sending status of add in queue`)
            }
        });
        $this.createInterval()
        
        $this.queue.on("cancel", () => logger.info("canceled queue"));
        $this.queue.on("empty", () => {
            logger.info("Ended queue")
            try{
                this.ws.emit( "anyRunning", { status: false})
            } catch (err){
                logger.error(`${err} error in sending status of running in queue`) 
            }
        });
        $this.queue.on("idle", () => {
            logger.info("Idle queue, all jobs completed")
            $this.queueLengthInterval = false
            try{ 
                this.ws.emit("anyRunning",  {status: false})
                this.ws.emit("queueLength",  {data: $this.queue.size })
            } catch (err){
                logger.error(`${err} error in sending status of running in queue`)
            }
        });
        
        $this.queue.on('completed', function ( result) {
            logger.info(`task completed ${result}`)
        })
       
     

    }
    resume(val){
        try{
            for (let[key, sample] of Object.entries(this.samples)){
                sample.paused = false
                this.samples[key].resetWatchers() 
            }
            this.queue.start()
              
            this.ws.emit("paused",  {message: false })
        } catch (err){
            logger.error(`${err} error in resuming the job(s)`)
            this.ws.emit( "error",  {message: err})
        }
    }
    async rerun(index, sample){
        try{
            if (this.samples[sample].demux){
                this.samples[sample].overwrite = true
            }
            const $this  = this
            this.queue.start()
            this.ws.emit( "paused",  {message: false })
            this.samples[sample].resetWatchers() 
            this.samples[sample].paused=false
            if (this.samples[sample] && this.samples[sample].queueRecords){
                let job = this.samples[sample].queueRecords[index]
                job.gpu = this.gpu
                job.overwrite = true 
                job.recombine = true
                job.paused = false 
                this.samples[sample].defineQueueJob(job)
                // this.samples[sample].setJob(job.filepath, job.type, true)
                
                this.ws.emit("message",  {message: `Rerunning... ${sample}`})
            } else {
                this.ws.emit( "error",  {message: `Rerunning ... failed`})
            }
            
        } catch (err){
            logger.error(`${err} error in rerunning the job(s)`)
            this.ws.emit( "error", { message: err})
            
        }
    }
    pause(val){
        try{
            this.logger.info(`Pausing the queue for all running samples`)
            this.queue.pause()
            this.ws.emit( "paused", { message: true })
        } catch (err){
            logger.error(`${err} error in pausing the job(s)`)
            this.ws.emit("error",  {message: err})
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
                    this.queue.clear()
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
    
    async flush(){
        logger.info("flushing queue, canceling job(s)")
        const $this = this
        try{
            
            if (this.samples){
                for (let key of Object.keys(this.samples)){
                    try{
                        $this.samples[key].paused = true
                        $this.samples[key].cleanup()
                        $this.cancel(null, key)
                        $this.pause()
                    } catch (err){
                        logger.error(`${err}, error in canceling sample ${key}`)
                    }                       
                }
            }
            await this.queue.clear()
            
            this.ws.emit( "queueLength", { data: 0 })
            this.ws.emit( "flushed" )
            
        } catch (err){
            logger.error(`Error in stopping job(s) ${err}`)
        }
    }
    checkAndAddFileToQueue(sample, filepath, report, type){
        const $this = this;
        let msg = {}
        if (type == 'barcode'){
            let barcoder = new Barcoder(sample, filepath)
            try{
                barcoder.start().then((f)=>{
                    console.log(`${f} code exited for run of barcoder`)
                    $this.ws.emit("recentQueue", { data: barcoder })
                }).catch((err)=>{
                    logger.error(err)
                })
            } catch (err){
                logger.error(err)
            }
            msg = barcoder
        } else {
            try{
                let barcoder = new Classifier(sample, filepath)
                classifier.start().then((f)=>{
                    console.log(`${f} code exited for run of barcoder`)
                    $this.ws.emit( "recentQueue", {data: classifier })
                }).catch((err)=>{
                    logger.error(err)
                })
                msg = classifier
            } catch (err){
                logger.error(err)
            }
            msg = barcoder
            
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
                $this.ws.emit("current", {current : samplename, running: false })
                let reportpath = path.join(outputdir, `full.report`)
                $this.sendFullReportSample(reportpath, samplename)
                
                
                resolve()
            });
        })
    } 
    
    
    
    
}