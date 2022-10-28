
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
 
// Get the /ws websocket route
app.ws('/ws', async function(ws, req) {
    logger.info("App Initiated") 
    let orchestrator = new Orchestrator(ws);
    orchestrator.enableQueue()
    orchestrator.ws = ws  
    orchestrator.ws.on('message', async function(command) {
        // Let's put our message in JSON.stringify, and send it to the user who just sent the message
        // logger.info(`${command}`)
        
        command=JSON.parse(command) 
        if (command['type'] == 'message'){
            ws.send(JSON.stringify({ "message" : "hello" }));
        } else if (command.type == 'config'){
            ws.send(JSON.stringify({ type: "config", "message" : orchestrator.config }));
        } else if (command.type == 'updateConfig'){
            orchestrator.config = command.config
        }else if (command.type == 'extractTaxid'){ 
            orchestrator.extractTaxid(command.taxid).then((f)=>{
                ws.send(JSON.stringify({ type: "reads", "message" : f }));
            })
        } else if (command.type == 'start'){ 
            try{
                let i=0
                // console.log(command,"start")
                logger.info(`Starting run from samplesheet `) 
                orchestrator.setSamples(command)
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'flush'){
            try{
                orchestrator.flush()
                ws.send(JSON.stringify({ type: "flushed" }));
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'barcode'){
            try{
                let i=0
                logger.info(`Barcoding ${command.dirpath} ${command.kits} `) 
                orchestrator.barcode(command.dirpath, command.sample, command.run, command.kits)
            } catch(err){
                logger.error(err)
            } 
        } else if (command.type == 'restart'){
            try{ 
                let i=0
                logger.info(`Starting restart of a sample `) 
                orchestrator.setSampleSingle(command)
            } catch(err){
                logger.error(err)
            } 
        } 
        // else if (command.type == 'watch'){
        //     try{
        //         let i=0
        //         logger.info(`Get files from ${command.watchdir}`) 
        //     } catch(err){
        //         logger.error(err)
        //     } 
            
        //     orchestrator.setParams(command)
           
        //     if (command.restart){
        //         console.log("command restart")
        //         orchestrator.removeReport().then((resolve, reject)=>{
        //             orchestrator.seenfiles = {}
        //             orchestrator.watchReport(true)
        //         }).catch((err)=>{ 
        //             orchestrator.seenfiles = {}
        //             orchestrator.watchReport(true)
        //             logger.error(err)
        //         })
        //     } else {
        //         orchestrator.watchReport()
        //     }
            
            

        //     ////////////////////////////////////////////////////////////////////////////////////
            
          
            
        //     ////////////////////////////////////////////////////////////////////////////////////
            
       
        //     ////////////////////////////////////////////////////////////////////////////////////
        // }
    });
    




});