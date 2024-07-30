
import path, { dirname } from 'path'
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

import  { spawn } from 'child_process';
import { removeExtension,  getReportName, globFiles } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
import { Classifier } from './classifier.mjs';
import { broadcastToAllActiveConnections } from './messenger.mjs';
export  class Job { 
    constructor(config, jobname, ws){    
        this.name = config.sample
        this.jobtype = jobname
        this.config = config
        this.ws = ws
        this.status = {
            running: false, 
            error: null,    
            historical: false, 
            success: null, 
            logs: []
        } 
        this.target = null 
        this.initialize()

    } 
    initialize(){
        if (this.jobtype == "classifier"){
            this.config.qc = true
            this.target = new Classifier(this.config)
            this.target.overwrite = true
        } else {
            logger.error(`Jobtype ${this.jobtype} is not recognized`)
        }
        
    }
    formatcommandstring(){
        let command = this.target.command
        let formatted = `${command.main} ${command.args.join(" ")}`
        return formatted
    }
    sendJobStatus(){
        try{
            
            let info = {
                command: this.formatcommandstring(),
                fullreport: this.target.fullreport,
                outputdir: this.target.outputdir,
                reportPath: this.target.reportPath,
                database: this.target.database,
                sampleReport: this.target.sampleReport,
                filepath: this.target.filepath,
                path_2: this.target.sample.path_2,
                index: this.target.index,
                run: this.target.run,
                sample: this.target.sample.sample,
            }
            broadcastToAllActiveConnections( "status", {
                run: this.run, 
                sample: this.name,  
                index: this.index, 
                'status' :  this.status ,
                config: info
            })
        } catch(err){
            logger.error(`${err} - error in sending job status`)
            throw err
        }
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
    async start(){ 
        const $this=this 
        logger.info("START___")
        return new Promise(async (resolve, reject)=>{
            if ($this.status.cancelled){
                logger.info(`Job was cancelled, exiting`)
                resolve('cancelled') 
            }
            else {
                logger.info("No cancel status, continuing to run job")
                $this.target.overwrite = true
                let processjob = await $this.target.start()
                $this.status.running = true  
                $this.status.cancelled = false
                $this.status.error = ''
                $this.status.success = null
                $this.status.logs = []
                $this.sendJobStatus()
                if (!processjob){
                    $this.status.success = true
                    $this.status.running = false
                    $this.status.historical = true
                    $this.status.logs.push['Historically gathered report, pre-run already']
                    resolve("Job is skipped")
                } else {
                    processjob.stdout.on('data', (data) => {
                        $this.status.logs.push(`${data}`) 
                        $this.status.logs.slice(0,20)
                        logger.info(`${data} `);
                    });   
                
                    processjob.stderr.on('data', (data) => {
                        $this.status.logs.push(`${data}`)
                        $this.status.logs.slice(0,20)
                        if (data){
                            $this.status.error = `${$this.status.error}\n${data}`
                        }
                        logger.error(`${data}`);
                    });
                    processjob.on('error', function(error) {
                        logger.error(`Error happened during classification of ${$this.filepath} ${error}`);
                        $this.status.error = err
                        $this.status.running = false
                        reject(error)
                    })  
                    processjob.on('exit', (code) => {
                        logger.info(`finished classification for: ${$this.filepath}, generated: ${$this.sampleReport} with code ${code}`);
                        $this.status.success = code !== 0 ? false : true
                        $this.status.running = false
                        $this.status.historical = false 
                        $this.process = null
                        $this.sendJobStatus()

                        resolve( `${code}`)                 
                    });
                    resolve(processjob)
                }
            }
        })
    }   
}