
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
import  { broadcastToAllActiveConnections, startRunUpdateFlusher } from './messenger.mjs';
import { getCachedIndex, ensureIndexBuilding } from './phylopic.mjs';
// Our port
let port = process.env.NODE_ENV == 'development' ? 7689 : 7689;
// App and server
let app = express();
let server = http.createServer(app)
// Apply expressWs
let params = {}
// if (process.env.NODE_ENV == 'development'){
  let added_ports = ""
  if (process.env.CORS_ADDR){
    added_ports = process.env.CORS_ADDR
    // add http:// if not start of added_ports
    if (!added_ports.startsWith("http://")){
      added_ports = `http://${added_ports}`
    }
  }
    params = {
        cors: {
            origin: process.env.NODE_ENV == 'development' ? [`http://localhost:${8080}`, `${added_ports}`, `http://localhost:${8098}`, `http://localhost:${4555}`, `http://localhost:${8081}`] : [`http://localhost:${8098}`, `${added_ports}`, `http://localhost:${4555}`, `http://localhost:${8081}`],
            methods: ["GET", "POST"],
            allowedHeaders: ["my-custom-header"],
            credentials: true
        }
    }
// }

let io = new Server(server, {
    ...params,
    // A full.report for a dense metagenome easily exceeds socket.io's default
    // 1MB frame limit. When a single payload blows past that limit the server
    // closes the connection -> this was the "connection lost then regained"
    // symptom while streaming reports for large samples. 100MB of headroom.
    maxHttpBufferSize: 1e8,
    // When 400 fastqs land at once the event loop is briefly saturated and the
    // default 20s ping timeout can lapse, dropping otherwise-healthy clients.
    // A longer timeout + steady interval keeps connections alive through bursts.
    pingTimeout: 60000,
    pingInterval: 25000,
    // Compress large report frames on the wire (skip tiny control messages).
    perMessageDeflate: { threshold: 1024 },
});

app.get('/', (req, res) => {
    logger.info("Welcome to Mytax2")
    res.status(200).send("Welcome to Mytax Version 2");
});
app.get('/ws', (req, res) => {
    logger.info("Welcome to Mytax2")
    res.status(200).send("Welcome to Mytax Version 2");
});

// PhyloPic image index: serve the prebuilt { build, map } of taxon name ->
// source-file URL. Built server-side (no browser CORS) and cached by build.
// The frontend tries this first; if it isn't ready yet (202) or the backend is
// down, the frontend builds the same index directly against the PhyloPic API.
app.get('/phylopic/index', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    const idx = getCachedIndex();
    if (idx) {
        res.header('Cache-Control', 'public, max-age=3600');
        res.status(200).json(idx);
        return;
    }
    ensureIndexBuilding();
    res.status(202).json({ building: true });
});

// PhyloPic SVG proxy: the frontend tries THIS first to load an individual
// silhouette (the name -> svg-URL map is bundled with the app). Fetching
// server-side avoids browser CORS and gives us clean inline <svg> markup. If
// this endpoint is unreachable (backend down) or fails, the frontend falls back
// to fetching the same URL directly from images.phylopic.org.
//
// SSRF guard: only proxy hosts on phylopic.org (images/api), nothing else.
const PHYLOPIC_SVG_HOSTS = new Set([
    'images.phylopic.org',
    'api.phylopic.org',
]);

app.get('/phylopic/svg', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');

    const raw = req.query.url;
    let target;
    try {
        target = new URL(String(raw || ''));
    } catch (e) {
        res.status(400).json({ error: 'invalid url' });
        return;
    }
    if (target.protocol !== 'https:' || !PHYLOPIC_SVG_HOSTS.has(target.hostname)) {
        res.status(400).json({ error: 'disallowed host' });
        return;
    }

    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        let upstream;
        try {
            upstream = await fetch(target.href, { redirect: 'follow', signal: ctrl.signal });
        } finally {
            clearTimeout(timer);
        }
        if (!upstream.ok) {
            res.status(502).json({ error: `upstream ${upstream.status}` });
            return;
        }
        const ct = (upstream.headers.get('content-type') || '').toLowerCase();
        const body = await upstream.text();
        const isSvg = ct.includes('svg') || ct.includes('xml') || /^\s*(<\?xml|<svg[\s>])/i.test(body);
        res.header('Content-Type', isSvg ? 'image/svg+xml; charset=utf-8' : (ct || 'application/octet-stream'));
        res.header('Cache-Control', 'public, max-age=86400');
        res.status(200).send(body);
    } catch (e) {
        res.status(502).json({ error: 'fetch failed' });
    }
});

// Warm the PhyloPic index in the background at startup so it's ready when the
// frontend asks (best-effort; failures are swallowed).
ensureIndexBuilding();

logger.info(`Orchestrator creation...`)
storage.orchestrator = new Orchestrator();
// Start the batched, run-scoped update flusher (single 'runUpdate' frame per
// window for whichever run each client is viewing).
startRunUpdateFlusher();


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
    // Stop scoping live updates to this (now gone) connection's run.
    storage.selectedRuns.delete(userId);
    logger.info(`User disconnected! ID: ${userId}`);
  });
  ws.on("getStatus", async (msg) => {
    try{
      if (msg.run && msg.sample){
        let status = await storage.orchestrator.getEntriesStatus(msg.run, msg.sample)
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
      storage.orchestrator.downloadfile(msg.database, msg.confirm === true);
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
  // --- live queue-board controls ------------------------------------------
  // Client asks for the current round-robin play order for a run.
  ws.on('getQueueBoard', (msg) => {
    try {
      const run = msg && msg.run
      ws.emit('queueBoard', storage.orchestrator.getQueueBoard(run))
    } catch (err) {
      logger.error(err)
    }
  })
  // Drag-reorder the barcode/sample rotation (tier-1 order).
  ws.on('setLaneOrder', (msg) => {
    try {
      storage.orchestrator.setLaneOrder(msg.run, msg.samples)
      ws.emit('queueBoard', storage.orchestrator.getQueueBoard(msg.run))
    } catch (err) {
      logger.error(err)
    }
  })
  // Bump a single fastq to run next.
  ws.on('prioritizeJob', (msg) => {
    try {
      storage.orchestrator.prioritizeJob(msg.run, msg.sample, msg.index)
      ws.emit('queueBoard', storage.orchestrator.getQueueBoard(msg.run))
    } catch (err) {
      logger.error(err)
    }
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
        // Record which run THIS connection is viewing so live updates are scoped
        // to it (and the other run's 1000s of job frames don't clog this socket).
        if (msg && msg.run){
          storage.selectedRuns.set(userId, msg.run)
          // hand the viewer the current round-robin board straight away
          try { ws.emit('queueBoard', storage.orchestrator.getQueueBoard(msg.run)) } catch (e) { logger.error(e) }
        }
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
        ws.emit("runs",  storage.orchestrator.runNames  ); 

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
