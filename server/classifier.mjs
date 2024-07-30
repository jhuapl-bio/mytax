
import path, { dirname } from 'path'
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

import  { spawn } from 'child_process';
import { removeExtension,  getReportName, globFiles } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
import { broadcastToAllActiveConnections } from './messenger.mjs';
export  class Classifier { 
    constructor(sample){    

        this.name = sample.sample
        this.run = sample.run
        this.filepath = sample.filepath
        this.fullreport = sample.fullreport
        this.outputdir = sample.outputdir
        this.bundleconfig = sample.bundleconfig
        this.config = sample.config
        this.dirpath = path.dirname(this.filepath)
        this.sampleReport = sample.reportPath
        this.database = sample.database
        this.paired = ( sample.path_1 && sample.path_2 && sample.path_2 != sample.path_1 ? true : false)
        this.gpu = ''
        this.reportPath = sample.reportPath
        this.reportfiles_seen = []
        this.overwrite   = sample.overwrite
        this.ws = null
        this.process = null
        this.qc = sample.qc
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
        this.listeners = new Map(); 
 
        
        this.initialize()
       


    } 
    
    initialize(){
        this.generateCommand()
    } 
    

   

    async stop(){
        logger.info(`Attempting to stop process: ${this.name}`)
        if (this.process){
            try{
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
            if ($this.status.cancelled){
                logger.info(`Fastp Job was cancelled, exiting`)
                resolve(null)
            }
            else {
                logger.info("No cancel status, continuing to run job")
                $this.check_and_classify().then((exists)=>{
                    $this.status.historical = true
                    if (!exists.sample || $this.overwrite || (exists.sample && !exists.full)){
                        $this.generateCommand()
                        console.log(this.command)
                        logger.info(`Starting classifier run for job: ${$this.name}, ${$this.filepath}`)
                        let command = $this.command
                        let classify = spawn(command.main, command.args );
                        $this.process = classify
                        resolve(classify)
                    } else { 
                        
                        logger.info(`${this.fullreport} exists already`)
                        resolve(null)
                    }
                }).catch((err)=>{
                    logger.info(`${err} Error in starting classification job for sample ${$this.name}`)
                    reject(err)
                })
            }
        })
    }   
    sendFullReportSample(){
        const $this = this
        logger.info(`${$this.fullreport}: file done, sending sample data for sample ${$this.name}`)
        fs.readFile($this.fullreport,(err,data)=>{
            if (err){
                logger.error(err)
            }  
        
        })
    }
    generateQCCommand(filesshow){
        let commandqc=` \\ 
        fastp  \\
            -i ${filesshow}  \\
            -o ${this.outputdir}/output.fastq  \\
            --json ${this.outputdir}/qc.json  \\
            --html ${this.outputdir}/qc.html`
        return commandqc
    }
    generateCommand(){
        let dirname = path.dirname(this.sampleReport)
        let command = ` \\
        kraken2 --db '${this.sample.database}'  \\
            --report "${this.sampleReport}"  \\
            --out ${this.sampleReport}.out`
        this.database = this.sample.database
        if (this.sample.path_2 && this.sample.path_2 != this.sample.path_1 && this.sample.path_2 != ""){ 
            command=`${command} \\
            --paired ` 
            this.paired = true 
        } else {
            this.paired = false
        }
        let additionals = ""   
        if (this.config){
            for(let [key, value] of Object.entries(this.config))
            {   
                if (key == "minimum-hit-groups" && value >=0 && value != "" && value ){
                    additionals = `${additionals}  \\
                    --${key} ${value}`
                }  else if (value && value == true && typeof value == 'boolean'){
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

        }
        let filesshow = `${this.filepath} ${this.sample.path_2 ? this.sample.path_2 : ''}`
        let upstreadmcommands = ""
        let downstreamscommands = ""
        // if (this.qc){
        //     upstreadmcommands = `${upstreadmcommands} ${this.generateQCCommand(filesshow)};`
        //     downstreamscommands = `rm ${this.outputdir}/output.fastq ${this.outputdir}/qc.json ${this.outputdir}/qc.html`
        //     filesshow = ` ${this.outputdir}/output.fastq `
        // } 
        
        command = `${command } ${additionals} ${filesshow} `
        this.overwrite = true
        let kreportcombined = this.generateKReportCommand()
        command = {
            main: "bash", 
            args: ['-c', `mkdir -p ${dirname}; ${upstreadmcommands} ${command} && ${kreportcombined}; ${downstreamscommands}`]
        }
        this.command = command
        return command

    }
    generateKReportCommand(){ 
        let combinedfiles = this.reportfiles_seen.length > 0 ? `${this.reportfiles_seen.join(" ")} ${this.reportPath}` : this.reportPath
        let command = `combine_kreports.py \\
        --only-combined --no-headers \\
        -o ${this.fullreport} -r ${combinedfiles} `
        return command 
    }
    async check_and_classify(){ 
        let exists = { 
            full: false, 
            sample: false
        }
        let fullreport = this.fullreport
        try {
            const pattern = `${this.outputdir}/*.report`;
            let files = await globFiles(pattern)
            // Filter and display the files
            const reportFiles = files.filter(file =>  {
                if (file == fullreport){
                    exists.full = true
                }   
                if (file == this.reportPath){  
                    exists.sample = true  
                }  
                return file.endsWith('.report') && file !== fullreport  ;
            });  
            this.reportfiles_seen = reportFiles
        } catch (err) {
            logger.error(`Error reading directory for reports on classifier pre-check: ${err}`);
        } finally {
            return exists  
        }
    }
}