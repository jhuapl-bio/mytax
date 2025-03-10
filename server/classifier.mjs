
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
    formatcommandstring(){
        let command = this.command
        let formatted = `${command.main} ${command.args.join(" ")}`
        return formatted
    }
    sendJobStatus(){
        let info = {
            command: this.formatcommandstring(),
            fullreport: this.fullreport,
            outputdir: this.outputdir,
            reportPath: this.reportPath,
            database: this.database,
            sampleReport: this.sampleReport,
            filepath: this.filepath,
            path_2: this.sample.path_2,
            index: this.index,
            run: this.run,
            sample: this.sample.sample,
        }
        broadcastToAllActiveConnections( "status", {
            run: this.run, 
            sample: this.name,  
            index: this.index, 
            'status' :  this.status ,
            config: info
        })
    }
    initialize(){
        this.generateKrakenCommand()
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
                logger.info(`Job was cancelled, exiting`)
                resolve('cancelled')
            }
            else {
                logger.info("No cancel status, continuing to run job")
                $this.check_and_classify().then((exists)=>{
                    $this.status.historical = true
                    if (!exists.sample || $this.overwrite || (exists.sample && !exists.full)){
                        $this.generateKrakenCommand()
                        logger.info(`Starting classifier run for job: ${$this.name}, ${$this.filepath}`)
                        $this.status.running = true  
                        $this.status.cancelled = false
                        $this.status.error = ''
                        $this.status.success = null
                        $this.status.logs = []
                        let command = $this.command
                        let classify = spawn(command.main, command.args );
                        $this.sendJobStatus()
                        classify.stdout.on('data', (data) => {
                            $this.status.logs.push(`${data}`) 
                            $this.status.logs.slice(0,20)
                            logger.info(`${data} `);
                        });   
                    
                        classify.stderr.on('data', (data) => {
                            $this.status.logs.push(`${data}`)
                            $this.status.logs.slice(0,20)
                            if (data){
                                $this.status.error = `${$this.status.error}\n${data}`
                            }
                            logger.error(`${data}`);
                        });
                        classify.on('error', function(error) {
                            logger.error(`Error happened during classification of ${$this.filepath} ${error}`);
                            $this.status.error = err
                            $this.status.running = false
                            reject(error)
                        })  
                        classify.on('exit', (code) => {
                            logger.info(`finished classification for: ${$this.filepath}, generated: ${$this.sampleReport} with code ${code}`);
                            $this.status.success = code !== 0 ? false : true
                            $this.status.running = false
                            $this.status.historical = false
                            $this.process = null
                            $this.sendJobStatus()

                            resolve( `${code}`)                 
                        });
                        $this.process = classify
                    } else { 
                        $this.status.success = true
                        $this.status.running = false
                        $this.status.historical = true
                        logger.info(`${this.fullreport} exists already`)
                        $this.status.logs.push['Historically gathered report, pre-run already']
                        $this.sendJobStatus()
                        
                        resolve()
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
    generateKrakenCommand(){
        let dirname = path.dirname(this.sampleReport)
        let command = `echo "Sleep job"; mkdir -p ${dirname};  echo "Run"; kraken2 --db '${this.sample.database}'  --report "${this.sampleReport}" --out ${this.sampleReport}.out `
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
        
        command = `${command } ${additionals} ${this.filepath} ${this.sample.path_2 ? this.sample.path_2 : ''}`
        
        let kreportcombined = this.generateKReportCommand()
        command = {
            main: "bash",
            args: ['-c', `${command} && ${kreportcombined}`]
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