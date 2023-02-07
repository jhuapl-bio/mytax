import chokidar from 'chokidar'
import glob from "glob-all"
import {logger} from './logger.js'
import Queue from 'better-queue' 
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
                this.ws.send(JSON.stringify({ type: "logs", "data" : output }))
            } catch (err){ 
                console.error("no websocket connection %o", err)
            }
        })



    } 
    
    async setSampleSingle(s, overwrite){
        try{
            if (this.samples[s.sample]){
                this.samples[s.sample].cancel()
                delete this.samples[s.sample]
            }
        } catch (err){
            logger.error(err)
        }
        try{
            if (!this.queueRecords[s.sample]){
                this.queueRecords[s.sample] = []
            }
            let sample = new Sample(s, this.queue, this.queueRecords)
            sample.gpu = this.gpu
            sample.ws = this.ws 
            sample.overwrite = overwrite
            sample.config = this.config
            sample.pause = false
            sample.bundleconfig = this.bundleconfig
            this.samples[sample.sample] = sample
            logger.info(`Setup sample ${sample.sample}`)
            sample.setupSample()
        } catch (err){
            logger.error(`${err}`)
        }
    }
    async setSamples(samples, overwrite){
        logger.info(`${process.env} ${path.cwd}-----${samples}`)
        const $this = this
        this.samples = {}
        if (samples.samplesheet){
            samples.samplesheet.forEach((s)=>{
                $this.setSampleSingle(s, samples.overwrite)
            })
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
                // $this.ws.send(JSON.stringify({ type: "current", current : sample.sample, running: true }))
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
                        $this.ws.send(JSON.stringify({ type: "add", "data" :  entry })) 
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
            if (index && index >= 0){
                
                $this.queue.cancel(`${sample}-${index}`)
            } else {
                let s = this.samples[sample]
                $this.samples[sample].pause = true
                Object.keys(s.queueRecords).map((f)=>{
                    $this.queue.cancel(f)
                })
            }
        } catch (Err){
            logger.error(`${Err} error in canceling job(s)`)
            throw Err
        }
    }
    enableQueue(){
        const $this = this
        delete this.queue
        const queue = new Queue(async function (name, cb) { 
            try{
                logger.info(`Priority (lower is more priority): ${name.priority}, Type: ${name.type}, Sample: ${name.sample}, Job#: ${name.jobnumber}`)
                await name.bind.start()    
                   
                cb()                    
            } catch (err){
                logger.error(`${err} error in running of the job in queue ${name.id}, ${name.sample}`)
                cb(err)
            }
            
          }, { 
            concurrent: 1, 
            autoResume: true,
            cancelIfRunning: true,
            priority: function (name, cb) { 
                cb(null, name.priority)
            },

        });  
        this.queue = queue

        $this.queue.on("start", () => {
            try{
                this.ws.send(JSON.stringify({ type: "anyRunning",  status: true}))
            } catch (err){
                logger.error(`${err} error in sending status of running in queue`)
            }
        });
        
        $this.queue.on("cancel", () => logger.info("canceled queue"));
        $this.queue.on("drain", () => {
            logger.info("Ended queue")
            try{
                this.ws.send(JSON.stringify({ type: "anyRunning",  status: false}))
                this.ws.send(JSON.stringify({ type: "queueLength",  data: $this.queue.length })) 
            } catch (err){
                logger.error(`${err} error in sending status of running in queue`)
            }
        });
        $this.queue.on('task_failed', function (taskId, result, stats) {
            
            $this.ws.send(JSON.stringify({ type: "queueLength",  data: $this.queue.length })) 
        })
        $this.queue.on('task_queued', function (taskId, result, stats) {
            
            $this.ws.send(JSON.stringify({ type: "queueLength",  data: $this.queue.length })) 
        })
        $this.queue.on('task_finish', function (taskId, result, stats) {
            
            $this.ws.send(JSON.stringify({ type: "queueLength",  data: $this.queue.length })) 
        })   
        $this.queue.on('paused', function (taskId, result, stats) {
            
            logger.info(`Paused ${$this.queue.getStats()}`)
        })        
     

    }
    resume(val){
        try{
            for (let[key, sample] of Object.entries(this.samples)){
                sample.paused = false
            }
            this.queue.resume()
            this.ws.send(JSON.stringify({ type: "message",  message: `Resumed`}))
        } catch (err){
            logger.error(`${err} error in resuming the job(s)`)
            this.ws.send(JSON.stringify({ type: "error",  message: err})) 
        }
    }
    async rerun(index, sample){
        try{
            if (this.samples[sample].demux){
                this.samples[sample].overwrite = true
            }
            this.samples[sample].paused=false
            if (this.samples[sample] && this.samples[sample].queueRecords){
                let job = this.samples[sample].queueRecords[index]
                job.gpu = this.gpu
                job.overwrite = true
                job.recombine = true
                job.paused = false 
                this.samples[sample].setJob(job.filepath, job.format, true)                
                this.ws.send(JSON.stringify({ type: "message",  message: `Rerunning... ${sample}`}))
            } else {
                this.ws.send(JSON.stringify({ type: "error",  message: `Rerunning ... failed`}))
            }
            
        } catch (err){
            logger.error(`${err} error in resuming the job(s)`)
            this.ws.send(JSON.stringify({ type: "error",  message: err})) 
            
        }
    }
    pause(val){
        try{
            this.logger.info(`Pausing the queue for all running samples`)
            this.queue.pause()
            this.ws.send(JSON.stringify({ type: "message",  message: `Paused`}))
        } catch (err){
            logger.error(`${err} error in pausing the job(s)`)
            this.ws.send(JSON.stringify({ type: "error",  message: err})) 
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
    async watchReport(ignoreSeen){
        var watcherOutput = chokidar.watch(`${this.watchdir}/classifications/classifications.full.report`, {ignored: /^\./, persistent: true});
        let newfiles  = []
        let index = 0
        this.samples = {}
        const $this = this;
        let outfile = `${this.watchdir}/classifications/classifications.full.report`
        try{
            let files = await this.globFiles(`${this.watchdir}/classifications/reports/*.report`, { nodir: true })
            files = this.parseNames(files, 
                {
                    remove: [ '.report' ],
                    filter: [ '.report' ],
                    sampleparse : /^(.*)?\./
                }   
            )  
            let reports = []
            let promises = []
            files.forEach((report)=>{
                promises.push($this.globFiles(`${this.watchdir}/classifications/reports/${report.sample}/*.report`, { nodir: true }))
                
            })
            Promise.allSettled(promises).then((results)=>{
                results.forEach((result,i)=>{
                    
                    if (result.status == 'fulfilled'){
                        let report = files[i]
                        let fffs = result.value
                        fffs = this.parseNames(fffs, 
                            {
                                remove: [ '.report', '.fastq', '.fq', '.gzip', '.gz' ],
                                removematch: true,
                                sampleparse : /^(.*)?\./
                            }   
                        )  
                        
                        
                        fffs.forEach((f)=>{
                            if (!$this.seenfiles.fastqs[f.sample]){ 
                                $this.seenfiles.fastqs[f.sample] = []
                            }
                            let recorded_file  = path.basename(f.path).replaceAll(".report", "")
                            $this.seenfiles.fastqs[f.sample].push(recorded_file)
                        })
                        fs.readFile(report.path,(err,data)=>{
                            if (err){
                                logger.error(err)
                            } else {
                                
                                $this.ws.send(JSON.stringify({ type: "data", samplename: report.sample, "data" : data.toString()})) 
                            }
                        })
                    }
                })
                $this.watchFastqs(ignoreSeen)
            })
                        
        } catch(err){
            logger.error(err) 
        }
        watcherOutput  
        .on('add', function(filepath) {
            logger.info(`File output JSON ${filepath} output has been added________`);
            fs.readFile((filepath), (err,data)=>{
                $this.ws.send(JSON.stringify({ type: "data", "data" : data.toString()}))
            }) 
        
        }) 
        .on('change', function(filepath) {
            // logger.info(`File output JSON ${filepath} output has been changed`); 
            fs.readFile(filepath, (err,data)=>{
                $this.ws.send(JSON.stringify({ type: "data", "data" : data.toString()}))
            })
        })
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
    
    flush(){
        logger.info("flushing queue, canceling job(s)")
        try{
            // this.queue.destroy()
            
            if (this.samples){
                for (let [key, value] of Object.entries(this.samples)){
                    try{
                        value.paused = true
                        value.cancel() 
                    } catch (err){
                        logger.error(`${err}, error in canceling sample ${key}`)
                    }                       
                }
            }
            // this.enableQueue()
            this.ws.send(JSON.stringify({ type: "queueLength", data: 0 }))
            this.ws.send(JSON.stringify({ type: "message", message: "flushed queue, canceled job(s)" }))
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
                    $this.ws.send(JSON.stringify({ type: "recentQueue", data: barcoder }))
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
                    $this.ws.send(JSON.stringify({ type: "recentQueue", data: classifier }))
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
    async watchFastqs(ignoreSeen){
        const $this = this;
        var watcher = chokidar.watch([`${this.watchdir}/*fastq.gz`,`${this.watchdir}/*fastq`,`${this.watchdir}/*fq.gz`, `${this.watchdir}/*fq`], {ignored: /^\./, persistent: true});
        this.watcher = watcher
        let pattern = `${this.watchdir}/**/*`
        let files = await this.globFiles(pattern, {
            ignore: [`${this.watchdir}/classifications/**/*`],
            furtherfilter: $this.match,
            nodir: true 
        })
        
        files = this.parseNames(files, 
            {
                remove: [ '.fastq', '.fq', '.gz', '.gzip' ],
                removematch: true,
                sampleparse : /^(.*)?\./
            }   
        ) 
        for (let [sample, files] of Object.entries($this.seenfiles.fastqs)){
            if (!this.samples[sample]){
                $this.samples[sample] = []
            }
            if ($this.type == 'paired'){
                $this.samples[sample] = files
            } else {
                $this.samples[sample] = files
            }
        }
        
        let mergedSamples = {}
        if ($this.type == 'paired'){
            mergedSamples = this.mergeSamples(files)
        } else {
            mergedSamples = this.mergeSamples(files)
        }
        for (let [key, filepath] of Object.entries(mergedSamples)){
            this.checkAndAddFileToQueue(filepath,key)
        }
        
        watcher  
            .on('add', function(filepath) {
                let sam = $this.defineSample(filepath)
                logger.info(`File ${filepath} has been added`);
                $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                $this.checkAndAddFileToQueue(filepath,sam)
            })
            .on('unlink', function(filepath) {
                logger.info(`File ${filepath} has been removed`);
            })
            .on('error', function(error) {
                logger.error(`Error happened ${error}`);
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
        
        // this.streamoutseen.end()
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
                $this.ws.send(JSON.stringify({ type: "current", current : samplename, running: false }))
                let reportpath = path.join(outputdir, `full.report`)
                $this.sendFullReportSample(reportpath, samplename)
                
                
                resolve()
            });
        })
    } 
    
    
    
    
}