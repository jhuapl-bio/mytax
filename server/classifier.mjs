
import path, { dirname } from 'path'
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

import  { spawn } from 'child_process';
import { removeExtension, getReportName } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
export  class Classifier { 
    constructor(sample, filepath){         
        this.name = sample.sample
        this.filepath = (filepath ? filepath : sample.path_2 ? `${sample.path_1} ${sample.path_2}` : `${sample.path_1}` )
        this.dirpath = path.dirname(this.filepath)
        this.paired = ( sample.path_1 && sample.path_2 && sample.platform == 'illumina' ? true : false)
        this.gpu = ''
        this.ws = null
        this.process = null
        sample.filepath = this.filepath
        this.sample = sample
        
        this.recombine = null
        this.status = {
            running: false, 
            error: null, 
            historical: false, 
            success: null,
            logs: []
        }
       


    }
    initialize(){
        let sample = this.sample
        let path_1 = sample.path_1 
        let outpath = this.outputdir
        if (!outpath){
            outpath = this.sample.format == 'directory'  ? path.join(path_1,  sample.sample ) :  path.join(path.dirname(path_1), sample.sample)       
        }
        let sampleReport = getReportName(this.filepath, this.path_2, outpath)
        let fullreport =path.join(outpath, 'full.report') 
        this.fullreport = fullreport
        this.sampleReport = sampleReport
        this.generateCommandString()
    }
    async stop(){
        if (this.process){
            try{
                logger.info(`Attempting to stop process: ${this.name}`)
                this.process.kill();
                this.status.running = false
                this.status.error=`Canceled job`
                this.status.success = -1
                logger.info(`Process is ended in a midrun, exiting and continuing the queue if it exists currently......`)
                return 
            } catch (err){
                logger.error(`${err} failure to exit process appropriately`)
                throw err
            }
        }
    }
    getName(){
        return this.sample.run ? this.sample.run : this.name
    }
    async start(){ 
        const $this=this
        return new Promise((resolve, reject)=>{
            $this.check_and_classify().then((exists)=>{
                if (!exists.sample || $this.overwrite || (exists.sample && !exists.full)){
                    $this.generateCommandString()
                    logger.info(`Starting classifier run for job: ${$this.name}, ${$this.filepath}`)
                    $this.status.running = true 
                    $this.status.error = null
                    let command = $this.command
                    let classify = spawn('bash', ['-c', ` ${command}`]);
                    $this.ws.send(JSON.stringify({ type: "status", samplename: $this.getName(), sample: $this.sample,  index: $this.index, 'status' :  $this.status })) 
                    classify.stdout.on('data', (data) => {
                        $this.status.logs.push(`${data}`)
                        $this.status.logs.slice(0,20)
                        $this.ws.send(JSON.stringify({ type: "status", samplename: $this.getName(), sample: $this.sample,  index: $this.index, 'status' :  $this.status })) 
                        logger.info(`${data} `);
                    }); 
                
                    classify.stderr.on('data', (data) => {
                        $this.status.logs.push(`${data}`)
                        $this.status.logs.slice(0,20)
                        $this.ws.send(JSON.stringify({ type: "status", samplename: $this.getName(), sample: $this.sample,  index: $this.index, 'status' :  $this.status }))  
                        logger.error(`${data}`);
                    });
                    classify.on('error', function(error) {
                        logger.error(`Error happened during classification of ${$this.filepath} ${error}`);
                        $this.ws.send(JSON.stringify({ type: "status", samplename: $this.getName(), sample: $this.sample,  index: $this.index, 'status' :  $this.status })) 
                        $this.status.error = err
                        $this.status.running = false
                        reject(error)
                    })  
                    classify.on('exit', (code) => {
                        logger.info(`finished classification for: ${$this.filepath}, generated: ${this.fullreport} with code ${code}`);
                        $this.status.success = code
                        $this.status.running = false
                        $this.status.historical = false
                        
                        $this.process = null
                        $this.ws.send(JSON.stringify({ type: "status", samplename: $this.getName(), sample: $this.sample,  index: $this.index, 'status' :  $this.status })) 

                        resolve( `${code}`)                
                    });
                    $this.process = classify
                } else {
                    $this.status.success = 0
                    $this.status.running = false
                    $this.status.historical = true
                    $this.status.logs.push['Historically gathered report, pre-run already']
                    $this.ws.send(JSON.stringify({ type: "status", samplename: $this.getName(), sample: $this.sample,  index: $this.index, 'status' :  $this.status })) 
                    resolve()
                }
            }).catch((err)=>{
                logger.info(`${err} Error in starting classification job for sample ${$this.name}`)
                reject(err)
            })
        })
        
    }   
    sendFullReportSample(){
        const $this = this
        // logger.info(`${$this.fullreport}: file done, sending sample data for sample ${$this.name}`)
        fs.readFile($this.fullreport,(err,data)=>{
            if (err){
                logger.error(err)
            } else {
                $this.ws.send(JSON.stringify({ type: "data", samplename: $this.name, "data" : data.toString()})) 
            }
        
        })
    }
    
    generateCommandString(){
        const $this = this
        let report = this.fullreport
        let outputdir = this.outputdir
        let command = ` bash ${__dirname}/src/bundle.sh \\
            -i "${$this.filepath}" \\
            -o "${outputdir}"  \\
            -d "${$this.sample.database}" ${(this.recombine ? '-r' : '')} `

 
        if ($this.paired){ 
            command=`${command} \\
            -t paired `
        }
         
        let additionals = ""  
        for(let [key, value] of Object.entries(this.config))
        {
            if (value && value == true && typeof value == 'boolean'){
                additionals = `${additionals}  \\
                --${key}` 
            } else if (value && value !== true){
                if (Array.isArray(value)){
                    if (value.length >0){
                        additionals = `${additionals}  \\
                        --${key} ${value.join(",")}`
                    }
                } else {
                    additionals = `${additionals}   --${key} ${value}`
                }
            } 
        }


        if ($this.runBundle){
            for(let [key, value] of Object.entries($this.bundleconfig))
            {
                
                if (value && value.arg && Array.isArray(value.value)){
                    if (value.value && value.value.length >0){
                            
                        command = `${command} \\
                        -${value.arg} ${value.value.join(",")}`
                    }
                } else if (value && value.arg && value.value) {
                        command = `${command} \\
                        -${value.arg} ${value.value}`    
                }
            }

        }
         
        let compressed = $this.config.compressed
        if (compressed == 'TRUE' && !additionals.match(/--gzip-compressed/g)){
            additionals = `${additionals} --gzip-compressed `
        } 
        
        if (additionals !== ''){
            command = `${command} \\
            -a "${additionals}"`
        }
        this.command = command
        return command 
    }
    async check_and_classify(){
        let exists = {
            full: false, 
            sample: false
        }
        try{
            let fullreport = this.fullreport

            
            try{
                exists.full = await fs.existsSync(fullreport)
            } catch (err){
                logger.error(`${err} error in getting full report name for sample: ${ sample.sample}`)
            } finally {
                try{
                    exists.sample = await fs.existsSync(this.sampleReport)
                } catch (err){
                    logger.error(`${err} error in getting full report name for sample: ${sample}`)
                } finally {
                    return exists
                }
                
            }
        } catch (Err){
            logger.error(Err)
            return exists
        }
    }
    
}