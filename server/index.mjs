
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
let storage = {}
// Get the /ws websocket route
app.ws('/ws', async function(ws, req) {

    if (storage.orchestrator){
        
        try{
            logger.info(`Orchestrator exists already, skipping creation`)
            storage.orchestrator.cleanup()
            storage.orchestrator = null
            delete storage.orchestrator
        } catch(err){
            logger.error(`${err} error in closing existing websocket`)
        }
    } else {
        logger.info(`Orchestrator doesnt exist already, creating....`)
    }
     
    storage.orchestrator = new Orchestrator(ws);
    storage.orchestrator.ws = ws  
    ws.send(JSON.stringify({ type: "basepathserver", data: __dirname }));
    ws.send(JSON.stringify({ type: "getbundleconfig", data: storage.orchestrator.bundleconfig }));
    storage.orchestrator.ws.on('message', async function(command) {
        // Let's put our message in JSON.stringify, and send it to the user who just sent the message
        // logger.info(`${command}`)
        command=JSON.parse(command) 
        if (command['type'] == 'message'){
            ws.send(JSON.stringify({ "message" : "hello" }));
        } else if (command.type == 'config'){
            ws.send(JSON.stringify({ type: "config", "message" : storage.orchestrator.config }));
        } else if (command.type == 'getbundleconfig'){
            ws.send(JSON.stringify({ type: "getbundleconfig", "message" : storage.orchestrator.bundleconfig }));
        } else if (command.type == 'runbundle'){
            storage.orchestrator.runBundle = command.config
        } else if (command.type == 'updateBundleconfig'){
            storage.orchestrator.setConfig(command.config, 'bundle')
        } else if (command.type == 'updateConfig'){
            storage.orchestrator.setConfig(command.config, 'config')
        } else if (command.type == 'cancel'){
            logger.info(`${command.index}: ${command.sample}, canceling....`)
            storage.orchestrator.cancel(command.index, command.sample)
        } else if (command.type == 'rerun'){
            logger.info(`${command.index}: ${command.sample}, rerunning....`)
            storage.orchestrator.rerun(command.index, command.sample)
        } else if (command.type == 'extractTaxid'){ 
            storage.orchestrator.extractTaxid(command.taxid).then((f)=>{
                ws.send(JSON.stringify({ type: "reads", "message" : f }));
            })
        } else if (command.type == 'start'){ 
            try{
                let i=0
                logger.info(`Starting run from samplesheet `) 
                storage.orchestrator.setSamples(command)
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'flush'){
            try{
                logger.info(`Flushing queue`)
                storage.orchestrator.flush()
                ws.send(JSON.stringify({ type: "flushed" }));
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'gpu'){
            try{
                let i=0
                storage.orchestrator.setGpu(command.gpu)
                logger.info(`Barcoding: GPU ${command.gpu ? 'Enabled' : 'Disabled'} `) 
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'restart'){
            try{ 
                let i=0
                logger.info(`Starting restart of a sample ${command.sample}, ${command.overwrite}`) 
                storage.orchestrator.setSampleSingle(command.sample, command.overwrite)
               
            } catch(err){
                logger.error(err)
            }  
        } else if (command.type == 'pause'){
            try{ 
                let i=0
                logger.info(`Pausing Run(s) value: ${command.pause}`) 
                if (command.pause){
                    storage.orchestrator.pause()
                } else {
                    storage.orchestrator.resume()
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