import chokidar from 'chokidar'
import glob from "glob"
import {logger} from './logger.js'
import Queue from "queue-promise";
import path, { resolve } from 'path'
import { fileURLToPath } from 'url'
import fs, { watch } from "fs"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { parse } from "csv-parse"
import  { spawn } from 'child_process';
export  class Orchestrator { 
    constructor(socket){         
        this.queue = null
        this.ws = socket
        this.config = {}
        this.watcher = {}
        this.samples = []
        this.watchdir = null
        this.reportfile = null
        this.match = "*.fastq"
        this.taxonomy = null;
        this.database = null
        this.type = "single"
        this.logger = logger
        this.config['memory-mapping']=false
        this.config['gzip-compressed'] = false
        this.config['bzip2-compressed'] = false
        this.config['minimum-hit-groups'] = false
        this.config['report-minimizer-data'] = false
        this.config['report-zero-counts'] = false
        this.config['quick'] = false
        this.config['threads'] = 1
        this.config['confidence'] = 0
        this.config['minimum-base-quality'] = 0
        this.logdata = []
        this.overwrite = {}
        this.seenfiles = {}
        this.queuedFastqs = []
        this.streamout = null
        this.seenstream = null
        this.compressed = false
        this.ext = ".fastq"
        this.seenfile = null
        this.streamoutseen = null
        this.enableQueue()
        logger.on("data", (stream)=>{
            let output = stream
            try{
                this.ws.send(JSON.stringify({ type: "logs", "data" : output }))
            } catch (err){
                console.error("no websocket connection %o", err)
            }
        })



    } 
    async watchDirectory(sample, overwrite){
        const $this = this;
        if (this.watcher[sample.sample] ){
            this.watcher[sample.sample].close().then(() => console.log('closed')).catch((err)=>{
                logger.error("no watcher available to cancel properly")
            });
        }
        var watcher = chokidar.watch(`${sample.path_1}/**/${this.match}`, {ignored: /^\./, persistent: true});
        this.watcher[sample.sample] = watcher
        let outpath = path.join(path.dirname(sample.path_1), sample.sample)  
        let fullreport = path.join(outpath, sample.sample, 'full.report')
        let seenfiles = []
        let exists_returned = await fs.existsSync(fullreport)
        if (exists_returned && overwrite){
            try{
                await this.rmFile(fullreport)
            } catch(err){
                logger.error(err)
            }
        }
        function check_file(filepath){
            seenfiles.push(filepath)
            console.log("seen", filepath)
            $this.check_and_classify(filepath, null,  sample.sample, overwrite).then((runClassify)=>{
                
                if (runClassify){
                    logger.info(`report from ${filepath} doesn't exists, classifying now`)
                    $this.checkAndAddFileToQueue(sample, filepath, runClassify)
                } else {
                    logger.info(`skipping report making for ${filepath}`)
                } 
            }).catch((err)=>{
                logger.error(`${err}`)
            })
        }

        let files = await this.globFiles(`${sample.path_1}/**/${this.match}`)
        if (files){
            files.forEach((filepath)=>{
                check_file(filepath)
            })
        }
        watcher  
            .on('add', function(filepath) {
                if (seenfiles.indexOf(filepath) == -1){
                    logger.info(`File ${filepath} has been added for sample: ${sample.sample}`);
                    $this.ws.send(JSON.stringify({ "message" : `File ${filepath} has been added` }))
                    check_file(filepath)
                } else {
                    logger.info(`File ${filepath} has already been seen for sample: ${sample.sample}`)
                }
                    
                    
                
            }) 
            .on('unlink', function(filepath) {
                logger.info(`File ${filepath} has been removed`);
            })
            .on('error', function(error) {
                logger.error(`Error happened ${error}`);
            })  
       
        
        
    
    
    } async setSampleSingle(sample){
        try{
            await this.setupSample(sample.sample, sample.overwrite)
        } catch (err){
            logger.error(`${err}`)
        }
    }
    async setSamples(samples){
        const $this = this
        if (this.samples){
            this.samples.forEach((sample)=>{
                if (sample.watcher){
                    try{ 
                        sample.watcher.close()                        
                    } catch (err){
                        console.error(`${err} error in closing existing watcher`)
                    }
                }
            })
        }
        try{
            console.log("close queue..............")
            this.$queue.end()
        } catch (err){
            console.error(`${err} error in closing queue`)
        } finally{
            this.samples = samples.samplesheet
            
            for (let i = 0; i < samples.samplesheet.length; i++){
                await $this.setupSample(samples.samplesheet[i], samples.overwrite)
            }
        }
        
        
    }
    async setupSample(sample, overwrite){
        const $this = this
        if (overwrite){
            let outpath = path.join(path.dirname(sample.path_1), sample.sample)  
            let fullreport = path.join(outpath, 'full.report')
            let exists_returned = await fs.existsSync(fullreport)
            if (exists_returned){
                try{
                    await this.rmFile(fullreport)
                } catch(err){
                    logger.error(err)
                }
            }
        }
        if (sample.path_1 && sample.format == 'file'){
            
            let runClassify = await this.check_and_classify(sample.path_1, sample.path_2,  sample.sample, overwrite) 
            if (runClassify){
                logger.info(`report from ${sample.path_1} ${sample.path_2 ? sample.path_2 : '' } doesn't exists, classifying now`)
                $this.checkAndAddFileToQueue(sample, sample.path_2 ? `${sample.path_1} ${sample.path_2}` : `${sample.path_1}`, runClassify)
            } else {
                logger.info(`skipping report making for ${sample.path_1} ${sample.path_2 ? sample.path_2 : '' }`)
            }
        } else if (sample.path_1 && sample.format == 'directory'){
            sample.files = []
            this.watchDirectory(sample, overwrite)
        } 
        return 
    }
    async check_and_classify(path_1, path_2,  sample, overwrite){
        try{
            let outpath = path.join(path.dirname(path_1), sample)            
            let sampleReport = this.getReportName(path_1, path_2, outpath)
            let fullreport = (sample.directory ? path.join(outpath, sample, 'full.report') :  path.join(outpath, 'full.report'))
            if (overwrite){
                return sampleReport
            } else {
                let returned = null
                let returnedFull = false
                try{
                    returnedFull = await fs.existsSync(fullreport)
                } catch (err ){
                    logger.error(`${err} error in getting full report name for sample: ${sample}`)
                    return sampleReport
                } 
                if (!returnedFull){
                    return sampleReport
                }
                try{
                    returned = await fs.existsSync(sampleReport)
                } catch (err){
                    logger.error(`${err} error in getting full report name for sample: ${sample}`)
                    return sampleReport
                } finally {
                    if (returned){ 
                        try{
                            this.sendFullReportSample(fullreport, sample)
                        } catch (err){
                            console.error(err)
                            logger.error(`${err} error in getting full report name for sample: ${sample}`)
                        }
                    }
                    return (!returned ? sampleReport : null )
                }
                
            }
        } catch (Err){
            logger.error(Err)
            return null
        }
    }
    enableQueue(){
        const queue = new Queue({
            concurrent: 1,
            interval: 2000
        });
        queue.on("start", () => logger.info("started queue"));
        queue.on("stop", () => logger.info("stopped queue"));
        queue.on("end", () => logger.info("Ended queue"));

        queue.on("resolve", data => console.log(data));
        queue.on("reject", error => console.error(error));
        this.queue = queue 



    }
    async removeReport(){
        const $this = this
        return new Promise((resolve,reject)=>{
            try{
                // await 
                let promises = []
                const $this = this
                promises.push(this.rmFile(this.seenfile))
                promises.push(this.rmFile(this.reportfile))
                promises.push(this.rmFile(`${this.watchdir}/classifications/classifications.last.report`))
                Object.keys($this.seenfiles).forEach((f)=>{
                    let filename = `${path.join(this.classificationsDir, 'reports', f)}.report`
                    promises.push(this.rmFile(filename))
                })
                this.seenfiles = {}
                Promise.allSettled(promises).then((f)=>{
                    $this.watchFastqs(true)
                    $this.watcher.close().then((f)=>{
                        console.log("watchfastqs")
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
        // console.log("set params!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", params)
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
            this.seenfiles = {}
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
    rmFile(filepath){
        return new Promise((resolve, reject)=>{
            fs.stat(filepath, (err)=>{
                if (!err){
                    fs.unlink(filepath, (err, data)=>{
                        if (err){
                            logger.error("error in removing file")
                            logger.error(err)
                            reject(err)
                            
                        } else {
                            logger.info("Removed")
                            resolve()
                        }
                    })  
                } else {
                    resolve()
                }
            })
                   
        })
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
        
        let globoptions = {nodir:true, ignore:  options.ignore  }
        if (options.cwd){
            globoptions.cwd = options.cwd
        }
        return new Promise((resolve, reject)=>{
            glob.glob(`${pattern}`,globoptions, (err, files)=>{
                if (err){
                    logger.error(err)
                    reject(err)
                } else {
                    if (options.furtherfilter){
                        let re = new RegExp($this.match, "g")
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
        let seenfiles = {}
        this.samples = {}
        let meta = {}
        const $this = this;
        let outfile = `${this.watchdir}/classifications/classifications.full.report`
        try{
            let files = await this.globFiles(`${this.watchdir}/classifications/reports/*.report`)
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
                promises.push($this.globFiles(`${this.watchdir}/classifications/reports/${report.sample}/*.report`))
                // console.log(fastqs)
                
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
                            if (!$this.seenfiles[f.sample]){ 
                                $this.seenfiles[f.sample] = []
                            }
                            let recorded_file  = path.basename(f.path).replaceAll(".report", "")
                            $this.seenfiles[f.sample].push(recorded_file)
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
                console.log("extract now")
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
                    console.log("close")
                    $this.streamout.end()
                    resolve(reads)
                })
                $this.streamout.on("end", (end)=>{
                    console.log("destroy")
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
    getReportName(path_1, path_2, outpath){
        if (path_1 && !path_2 ){
            return path.join(outpath, `${path.parse(path_1).name}.report`)
        } else {
            return path.join(outpath, `${path.parse(path_1).name}.report`)
        }
    }
    checkAndAddFileToQueue(sample, filepath, report){
        const $this = this;
        $this.queue.enqueue(async () =>{ 
            $this.ws.send(JSON.stringify({ type: "current", current : sample.sample, running: true }))
            await $this.classify(sample.database, filepath, report, (sample.path_2 && sample.path_1 ? true : false), sample.compressed, sample.sample) 
        } ); 
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
        var watcher = chokidar.watch(`${this.watchdir}/**/${this.match}`, {ignored: /^\./, persistent: true});
        this.watcher = watcher
        let pattern = `${this.watchdir}/**/*`
        let files = await this.globFiles(pattern, {
            ignore: [`${this.watchdir}/classifications/**/*`],
            furtherfilter: $this.match
        })
        
        files = this.parseNames(files, 
            {
                remove: [ '.fastq', '.fq', '.gz', '.gzip' ],
                removematch: true,
                sampleparse : /^(.*)?\./
            }   
        ) 
        let seenfiles = []
        
        for (let [sample, files] of Object.entries($this.seenfiles)){
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
        // console.log("thsseenfiles", files,$this.seenfiles)
        // console.log("merged", mergedSamples)
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

            // .on('change', function(filepath) {
            //     logger.info(`File ${filepath} has been changed`);
            // }) 
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
            let command = `
                bash ${__dirname}/src/bundle.sh  -i "${filepath}" -o "${outputdir}"  -d "${database}"  `
            if (paired){ 
                command=`${command} -t paired `
            }
            
            let additionals = ""
            for(let [key, value] of Object.entries(this.config))
            {
                
                if (value && value == true && typeof value == 'boolean'){
                    additionals = `${additionals} --${key}` 
                } else if (value && value !== true){
                    additionals = `${additionals} --${key} ${value}`
                } 
            }
            if (compressed == 'TRUE' && !additionals.match(/--gzip-compressed/g)){
                additionals = `${additionals} --gzip-compressed `
            } 
            
            if (additionals !== ''){
                command = `${command} -a "${additionals}"`
            }
            console.log(command,"!!!!!")
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
    sendFullReportSample(reportpath, samplename){
        const $this = this
        logger.info(`${reportpath}: file done, sending sample data for sample ${samplename}`)
        fs.readFile(reportpath,(err,data)=>{
            if (err){
                logger.error(err)
            } else {
                
                $this.ws.send(JSON.stringify({ type: "data", samplename: samplename, "data" : data.toString()})) 
            }
        
        })
    }
    
    
    
}