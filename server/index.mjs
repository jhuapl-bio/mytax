
import path from 'path'
import {logger} from './logger.js'
import http from 'http'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from 'express'
import {Orchestrator} from "./server.mjs"
import  { WebSocketServer } from 'ws';
import { Server } from "socket.io";


// Our port
let port = process.env.NODE_ENV == 'development' ? 7689 : 7689;

// App and server
let app = express();
let server = http.createServer(app)
// Apply expressWs
let params = {}
let portclient = 8080
// if (process.env.NODE_ENV == 'development'){
  console.log(process.env.NODE_ENV,"<<")
    params = {
        cors: {
            origin: process.env.NODE_ENV == 'development' ? [`http://localhost:${8080}`, `http://localhost:${8098}`, `http://localhost:${4555}`] : [`http://localhost:${8098}`,`http://localhost:${4555}`],
            methods: ["GET", "POST"],
            allowedHeaders: ["my-custom-header"],
            credentials: true
        }
    }
// }

let io = new Server(server, params);

app.get('/', (req, res) => {
    logger.info("Welcome to Mytax2")
    res.status(200).send("Welcome to Mytax Version 2");
});
app.get('/ws', (req, res) => {
    logger.info("Welcome to Mytax2")
    res.status(200).send("Welcome to Mytax Version 2");
});

io.on('connection', (ws) => {
  console.log('a user connected');
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
  ws.on('create', function(room) {
    ws.join(room);
  });
//   ws.on('message', (msg) => {
//     console.log('message: ', msg);
//     ws.emit("message", { "message" : "hello" });
//   });
  ws.on('gpu', (msg) => {
    console.log('gpu: ', msg);
    try{
        storage.orchestrator.setGpu(msg.gpu)
        logger.info(`Barcoding: GPU ${msg.gpu ? 'Enabled' : 'Disabled'} `) 
    } catch(err){
        logger.error(err)
    } 
  });
  ws.on('config', (msg) => {
    console.log('config: ', msg);
    ws.emit("config", { "message" : storage.orchestrator.config });
  });
  ws.on('getbundleconfig', (msg) => {
    storage.orchestrator.runBundle = msg.config
  });
  ws.on('updateBundleconfig', (msg) => {
    storage.orchestrator.setConfig(msg.config, 'bundle')
  });
  ws.on('updateConfig', (msg) => {
    storage.orchestrator.setConfig(msg.config, 'config')
  });
  ws.on('cancel', (msg) => {
    logger.info(`${msg.index}: ${msg.sample}, canceling....`)
    storage.orchestrator.cancel(msg.index, msg.sample)
  })
  ws.on('rerun', (msg) => { 
    logger.info(`${msg.index}: ${msg.sample}, rerunning....`)
    storage.orchestrator.rerun(msg.index, msg.sample)
  })
  ws.on('restart', (msg) => {
    try{ 
        logger.info(`Starting restart of a sample ${msg.sample}, ${msg.overwrite}`) 
        storage.orchestrator.setSampleSingle(msg.sample, msg.overwrite)
    } catch(err){
        logger.error(err)
    }  
  })
  ws.on('start', (msg) => {
        try{
            let i=0
            logger.info(`Starting run from samplesheet ${JSON.stringify(msg)}`) 
            storage.orchestrator.setSamples(msg)
        } catch(err){
            logger.error(err)
        } 
  })
  ws.on('flush', () => {
    try{
        logger.info(`Flushing queue`)
        storage.orchestrator.flush()
        ws.emit("flushed");
    } catch(err){
        logger.error(err)
    } 
  })
  
  ws.on("basepathserver",(msg)=>{
    ws.emit('basepathserver', { data: __dirname });
  })
  ws.on('pause', (msg) => {
    try{ 
        logger.info(`Pausing Run(s) value: ${msg.pause}`) 
        if (msg.pause){
            storage.orchestrator.pause()
        } else {
            storage.orchestrator.resume()
        }
    } catch(err){
        logger.error(err)
    } 
  })
                    
});

server.listen(port, () => {
  console.log(`listening on ${port}`);
});
// Get the route / 


let storage = {}

// function create_Report_WS(port){
//     const $this = this
//     // if (this.reportWS   && this.reportWS.readyState === this.reportWS.OPEN){
//     //     this.reportWs.close() 
//     // }
//     let reportWs = new WebSocketServer({ 
//         port: port,
//         perMessageDeflate: { 
//         zlibDeflateOptions: {
//             // See zlib defaults.
//             chunkSize: 1024,
//             memLevel: 7, 
//             level: 3
//         },
//         zlibInflateOptions: {
//             chunkSize: 10 * 1024
//         },
//         // Other options settable:
//         clientNoContextTakeover: true, // Defaults to negotiated value.
//         serverNoContextTakeover: true, // Defaults to negotiated value.
//         serverMaxWindowBits: 10, // Defaults to negotiated value.
//         // Below options specified as default values.
//         concurrencyLimit: 1000, // Limits zlib concurrency for perf.
//         threshold: 1024 // Size (in bytes) below which messages
//         // should not be compressed if context takeover is disabled.
//         }
//     });
//     reportWs.on('close', (ws) => { 
//         // Get the /ws websocket route
//         console.log("close  report ws")
//     })
//     reportWs.on('connection', (ws) => { 
//         // Get the /ws websocket route
//         console.log("connected to report ws")
//         // this.reportWs = ws 
//         storage.orchestrator.wsReport = ws
//     })
// } 
// create_Report_WS(portReport) 
// create_WS(port)
// function create_WS(port){
//     let ws = new WebSocketServer({
//         port: port,
//         perMessageDeflate: {
//         zlibDeflateOptions: {
//             // See zlib defaults.
//             chunkSize: 1024,
//             memLevel: 7,
//             level: 3
//         },
//         zlibInflateOptions: {
//             chunkSize: 10 * 1024
//         },
//         // Other options settable:
//         clientNoContextTakeover: true, // Defaults to negotiated value.
//         serverNoContextTakeover: true, // Defaults to negotiated value.
//         serverMaxWindowBits: 10, // Defaults to negotiated value.
//         // Below options specified as default values.
//         concurrencyLimit: 1000, // Limits zlib concurrency for perf.
//         threshold: 1024 // Size (in bytes) below which messages
//         // should not be compressed if context takeover is disabled.
//         }
//     });
//     ws.on('connection', (ws) => {
        
//         // Get the /ws websocket route
//         if (storage.orchestrator){
//             try{
//                 logger.info(`Orchestrator exists already, skipping creation`)
//                 storage.orchestrator.cleanup()
//                 storage.orchestrator = null
//                 delete storage.orchestrator
//             } catch(err){
//                 logger.error(`${err} error in closing existing websocket`)
//             }
//         } else {
//             logger.info(`Orchestrator doesnt exist already, creating....`)
//         }
        
//         storage.orchestrator = new Orchestrator(ws);
//         storage.orchestrator.ws = ws  
//         ws.send(JSON.stringify({ type: "basepathserver", data: __dirname }));
//         ws.send(JSON.stringify({ type: "getbundleconfig", data: storage.orchestrator.bundleconfig }));
//         storage.orchestrator.ws.on('message', async function(command) {
//             // Let's put our message in JSON.stringify, and send it to the user who just sent the message
//             // logger.info(`${command}`)
//             command=JSON.parse(command) 
//             if (command['type'] == 'message'){
//                 ws.send(JSON.stringify({ "message" : "hello" }));
//             } else if (command.type == 'config'){
//                 ws.send(JSON.stringify({ type: "config", "message" : storage.orchestrator.config }));
//             } else if (command.type == 'getbundleconfig'){
//                 ws.send(JSON.stringify({ type: "getbundleconfig", "message" : storage.orchestrator.bundleconfig }));
//             } else if (command.type == 'runbundle'){
//                 storage.orchestrator.runBundle = command.config
//             } else if (command.type == 'updateBundleconfig'){
//                 storage.orchestrator.setConfig(command.config, 'bundle')
//             } else if (command.type == 'updateConfig'){
//                 storage.orchestrator.setConfig(command.config, 'config')
//             } else if (command.type == 'cancel'){ 
//                 logger.info(`${command.index}: ${command.sample}, canceling....`)
//                 storage.orchestrator.cancel(command.index, command.sample)
//             } else if (command.type == 'rerun'){
//                 logger.info(`${command.index}: ${command.sample}, rerunning....`)
//                 storage.orchestrator.rerun(command.index, command.sample)
//             } else if (command.type == 'extractTaxid'){ 
//                 storage.orchestrator.extractTaxid(command.taxid).then((f)=>{
//                     ws.send(JSON.stringify({ type: "reads", "message" : f }));
//                 })
//             } else if (command.type == 'start'){ 
//                 try{
//                     let i=0
//                     logger.info(`Starting run from samplesheet `) 
//                     storage.orchestrator.setSamples(command)
//                 } catch(err){
//                     logger.error(err)
//                 } 
//             } else if (command.type == 'flush'){
//                 try{
//                     logger.info(`Flushing queue`)
//                     storage.orchestrator.flush()
//                     ws.send(JSON.stringify({ type: "flushed" }));
//                 } catch(err){
//                     logger.error(err)
//                 } 
//             } else if (command.type == 'gpu'){
//                 try{
//                     let i=0
//                     storage.orchestrator.setGpu(command.gpu)
//                     logger.info(`Barcoding: GPU ${command.gpu ? 'Enabled' : 'Disabled'} `) 
//                 } catch(err){
//                     logger.error(err)
//                 } 
//             } else if (command.type == 'restart'){
//                 try{ 
//                     let i=0
//                     logger.info(`Starting restart of a sample ${command.sample}, ${command.overwrite}`) 
//                     storage.orchestrator.setSampleSingle(command.sample, command.overwrite)
                
//                 } catch(err){
//                     logger.error(err)
//                 }  
//             } else if (command.type == 'pause'){
//                 try{ 
//                     let i=0
//                     logger.info(`Pausing Run(s) value: ${command.pause}`) 
//                     if (command.pause){
//                         storage.orchestrator.pause()
//                     } else {
//                         storage.orchestrator.resume()
//                     }
//                 } catch(err){
//                     logger.error(err)
//                 }  
//             }
//         });        
//     })
// }
