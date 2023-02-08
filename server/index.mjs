
import path from 'path'
import {logger} from './logger.js'
import http from 'http'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from 'express'
import expressWs from 'express-ws'
import {Orchestrator} from "./server.mjs"





// Our port
let port = 3000;

// App and server
let app = express();
let server = http.createServer(app).listen(port);    

// Apply expressWs
expressWs(app, server);

app.use(express.static(__dirname + '/views'));

// Get the route / 
app.get('/', (req, res) => {
    logger.info("Welcome to the app")
    res.status(200).send("Welcome to our app");
});

let dirpath = '/Users/merribb1/Desktop/test-data2/demux-fastq_pass'
let input = "/Users/merribb1/Documents/Projects/real-time-reporting/data/"
let output = "/Users/merribb1/Documents/Projects/real-time-reporting/data/classifications"
// let nodes =  "/Users/merribb1/Desktop/mytax/flukraken2/taxonomy/nodes.dmp"
// let database = "/Users/merribb1/Desktop/mytax/flukraken2"
let websocket;

let max = 0
let orchestrator = null
// Get the /ws websocket route
app.ws('/ws', async function(ws, req) {

    if (orchestrator){
        orchestrator.ws = ws  
        try{
            logger.info(`Orchestrator exists already, skipping creation`)
        } catch(err){
            logger.error(`${err} error in closing existing websocket`)
        }
    } else {
        logger.info(`Orchestrator doesnt exist already, creating....`)
        orchestrator = new Orchestrator(ws);
        orchestrator.ws = ws  
    }
     
    ws.send(JSON.stringify({ type: "basepathserver", data: __dirname }));
    ws.send(JSON.stringify({ type: "getbundleconfig", data: orchestrator.bundleconfig }));
    orchestrator.ws.on('message', async function(command) {
        // Let's put our message in JSON.stringify, and send it to the user who just sent the message
        // logger.info(`${command}`)
        command=JSON.parse(command) 
        if (command['type'] == 'message'){
            ws.send(JSON.stringify({ "message" : "hello" }));
        } else if (command.type == 'config'){
            ws.send(JSON.stringify({ type: "config", "message" : orchestrator.config }));
        } else if (command.type == 'getbundleconfig'){
            ws.send(JSON.stringify({ type: "getbundleconfig", "message" : orchestrator.bundleconfig }));
        } else if (command.type == 'runbundle'){
            orchestrator.runBundle = command.config
        } else if (command.type == 'updateBundleconfig'){
            orchestrator.setConfig(command.config, 'bundle')
        } else if (command.type == 'updateConfig'){
            orchestrator.setConfig(command.config, 'config')
        } else if (command.type == 'cancel'){
            logger.info(`${command.index}: ${command.sample}, canceling....`)
            orchestrator.cancel(command.index, command.sample)
        } else if (command.type == 'rerun'){
            logger.info(`${command.index}: ${command.sample}, rerunning....`)
            orchestrator.rerun(command.index, command.sample)
        } else if (command.type == 'extractTaxid'){ 
            orchestrator.extractTaxid(command.taxid).then((f)=>{
                ws.send(JSON.stringify({ type: "reads", "message" : f }));
            })
        } else if (command.type == 'start'){ 
            try{
                let i=0
                logger.info(`Starting run from samplesheet `) 
                orchestrator.setSamples(command)
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'flush'){
            try{
                logger.info(`Flushing queue`)
                orchestrator.flush()
                ws.send(JSON.stringify({ type: "flushed" }));
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'gpu'){
            try{
                let i=0
                orchestrator.setGpu(command.gpu)
                logger.info(`Barcoding: GPU ${command.gpu ? 'Enabled' : 'Disabled'} `) 
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'restart'){
            try{ 
                let i=0
                logger.info(`Starting restart of a sample ${command.sample}, ${command.overwrite}`) 
                orchestrator.setSampleSingle(command.sample, command.overwrite)
               
            } catch(err){
                logger.error(err)
            }  
        } else if (command.type == 'pause'){
            try{ 
                let i=0
                logger.info(`Pausing Run(s) value: ${command.pause}`) 
                if (command.pause){
                    orchestrator.pause()
                } else {
                    orchestrator.resume()
                }
            } catch(err){
                logger.error(err)
            }  
        }
        // else if (command.type == 'basepathserver'){
        //     try{ 
        //         let i=0
        //         ws.send(JSON.stringify({ type: "basepathserver", value: __dirname }));
        //     } catch(err){
        //         logger.error(err)
        //     } 
        // } 
        
            

        //     ////////////////////////////////////////////////////////////////////////////////////
            
          
            
        //     ////////////////////////////////////////////////////////////////////////////////////
            
       
        //     ////////////////////////////////////////////////////////////////////////////////////
        // }
    });
    




});