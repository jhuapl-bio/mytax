
import path from 'path'
import {logger} from './logger.js'
import http from 'http'
import { fileURLToPath } from 'url'
import { searchPath, openPath } from './controllers.mjs'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from 'express'
import {Orchestrator} from "./server.mjs"
import  { WebSocketServer } from 'ws';
import { Server } from "socket.io";
import { storage } from './storage.mjs';
import  { broadcastToAllActiveConnections } from './messenger.mjs';
// Our port
let port = process.env.NODE_ENV == 'development' ? 7689 : 7689;

// App and server
let app = express();
let server = http.createServer(app)
// Apply expressWs
let params = {}
let portclient = 8080
// if (process.env.NODE_ENV == 'development'){
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


logger.info(`Orchestrator creation...`)
storage.orchestrator = new Orchestrator(); 


io.on('connection', (ws) => {
  const userId = ws.handshake.query.userId;
  // Store the connection
  
  // If there's an existing connection for this user, close it
  if (storage.activeConnections.has(userId)) {
    try {
      const existingSocket = storage.activeConnections.get(userId);
      logger.info(`User connection exists, disconnecting ${userId}`)
      existingSocket.disconnect();
    } catch (err) {
      logger.error(`Error disconnecting existing socket: ${err}`);
    }
  }
  // Store the new connection
  storage.activeConnections.set(userId, ws);
  logger.info(`A user connected! ID: ${userId}`);

  // Send a message to the client with the imported uer settings from storage.orchestrator
  async function sendUserSettings() {
    try{
      storage.orchestrator.loadUserSettings(userId).then((data)=>{
        ws.emit("userSettings",  data  );
      })
    }
    catch(err){
      logger.error(err)
      logger.error("Couldn't import user settings. Please check the logs for more information.")
    }
  } 
  sendUserSettings()
  ws.emit( "databases",  storage.orchestrator.databases )
  // get all of the queueSamples information for a given run
  ws.on("message", (msg) => {
    logger.info(`Message received: ${msg.message}`);
    broadcastToAllActiveConnections("message", { "message": msg.message });
  })

  ws.emit("message", { "message": "Connection established with server" });
  ws.on('disconnect', () => {
    storage.activeConnections.delete(userId); 
    logger.info(`User disconnected! ID: ${userId}`);
  });
  ws.on("getStatus", async (msg) => {
    try{
      if (msg.run && msg.sample){
        let status = await storage.orchestrator.getEntriesStatus(msg.run, msg.sample)
        ws.emit("status", { "message": status });
      } else {
        let statuses = storage.orchestrator.getEntriesStatus()
      }
      
      
      
    } catch(err){
      logger.error(err)
    }
  })
  ws.emit("sendQueueStatus",  storage.orchestrator.getQueueStatus() );
  ws.on('downloaddb', (msg) => {
    try {
      storage.orchestrator.downloadfile(msg.database);
    } catch (err) {
      logger.error(err); 
    }
  });
  ws.on('canceldownload', (msg) => {
    try {
      storage.orchestrator.cancelDownload(msg.database);
    } catch (err) {
      console.error(err); 
    }
  });

  ws.on("getDbs", async () => {
    try{
      ws.emit("databases",  storage.orchestrator.databases );
    }
    catch(err){
      logger.error(err)
    }
  })
  ws.on('gpu', (msg) => {
    try {
      const userId = ws.handshake.query.userId;
      storage.orchestrator.updateUserSettings(userId, { gpu: msg.gpu });
      logger.info(`Barcoding: GPU ${msg.gpu ? 'Enabled' : 'Disabled'}`); 
    } catch (err) {
        logger.error(err);
    }
  });
  ws.on('config', (msg) => {
    
    ws.emit("config", { "message" : storage.orchestrator.config });
  });
  ws.on('getbundleconfig', (msg) => {
    storage.orchestrator.runBundle = msg.config
  });
  ws.on('updateBundleconfig', (msg) => {
    storage.orchestrator.setConfig(msg.config, 'bundle')
  });
  ws.on('updateConfig', (msg) => {
    storage.orchestrator.setConfig(msg.config, msg.run)
  });
  ws.on('cancel', (msg) => {
    logger.info(`${msg.index}: ${msg.sample}-${msg.run}, canceling....`)
    storage.orchestrator.cancel(msg.index, msg.sample, msg.run)
  })
  ws.on("getReportPath", async () => { 
    try{
      ws.emit("reportSavePath", { data: process.env.reports });
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on("searchPath", async (msg) => { 
    try{
        let path_1 = await searchPath(msg.value)
        ws.emit("sendPaths", { data: path_1 });
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on("searchPath1", async (msg) => { 
    try{
        let path_1 = await searchPath(msg.value, true)
        ws.emit("sendPaths1", { data: path_1 });
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on("searchPath2", async (msg) => { 
    try{
        let path_1 = await searchPath(msg.value, true)
        ws.emit("sendPaths2", { data: path_1 });
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on("searchPathDb", async (msg) => { 
    try{
        let path_1 = await searchPath(msg.value, false)
        ws.emit("sendPathsDb", { data: path_1 });
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on("openPath", async (msg) => {
    try{
      storage.orchestrator.openPath(msg.path)
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on("updateEntry", async (msg) => {
    try{
        let sample = msg.sample
        let run = msg.run
        let info = msg.info
        logger.info(`Updating entry ${sample} from run ${run}`)
        await storage.orchestrator.updateRun(info, run, sample)
    } catch(err){
        logger.error(err)
    }
  })
  ws.on('rerun', (msg) => {  
    console.log("msg", msg)
    logger.info(`${msg.index}: ${msg.sample}, ${msg.run} rerunning....`)
    storage.orchestrator.rerun(msg.index, msg.sample, msg.run)
  })
 
  ws.on('getRuns', (msg) => {
    try{
        let i=0 
        ws.emit("runs",  storage.orchestrator.runNames  ); 
    } catch(err){ 
      console.log(err) 
      logger.error(err)  
    }   
  })
  ws.on('getRunInformation', (msg) => {
    try{
        let i=0 
        logger.info(`Getting Run information ${msg.run}` ) 
        storage.orchestrator.getRunInformation(msg.run)
    } catch(err){ 
        logger.error(err)
    } 
  })
  ws.on('load', (msg) => {
    try{
        let i=0
        logger.info(`Loading Run(s)`) 
        storage.orchestrator.loadruns(msg)
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on('saveRun', (msg) => {
    try{
        let i=0
        logger.info(`Saving Run ${msg.run}`) 
        storage.orchestrator.saveRunInformation(msg)
    } catch(err){
        logger.error(err)
    } 
  })
  ws.on('addRun', (msg) => {
      try{
          let i=0
          logger.info(`Adding run ${msg.run}`) 
           
          storage.orchestrator.addRun(msg)
          ws.emit("runs",  storage.orchestrator.runNames )
      } catch(err){
          logger.error(err)
      } 
  })
  ws.on("deleteEntry", async (msg) => {
    try{
        let sample = msg.sample
        let run = msg.run
        logger.info(`Deleting entry ${sample} from run ${run}`)
        await storage.orchestrator.deleteEntry(run, sample)
    } catch(err){
        logger.error(err)
    }
  })
  ws.on('deleteRun', async (msg) => {
    try{
        let i=0
        logger.info(`Deleting run ${msg.run}`) 
        
        await storage.orchestrator.deleteRun(msg.run)
    } catch(err){
        logger.error(err)
    } 
  })
  
  ws.on('flush', () => {
    try{
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
