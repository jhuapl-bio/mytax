
import path from 'path'
import {logger} from './logger.js'
import http from 'http'
import { fileURLToPath } from 'url'
import { searchPath, openPath, autodetectMate, browsePath, filterReferencePaths } from './controllers.mjs'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from 'express'
import {Orchestrator} from "./server.mjs"
import  { WebSocketServer } from 'ws';
import { Server } from "socket.io";
import { storage } from './storage.mjs';
import  { broadcastToAllActiveConnections, startProtocol } from './messenger.mjs';
import { protocol } from './protocol.mjs';
import { scheduler } from './scheduler.mjs';
import { getCachedIndex, ensureIndexBuilding } from './phylopic.mjs';
import { getHealth, installDependency } from './health.mjs';
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
// Start the single batched frame channel. The load probe lets the flusher slow
// its cadence while the scheduler is deep in a backlog: under load, bigger and
// less frequent frames are strictly better than more of them.
startProtocol(
  () => {
    try { return scheduler.totalPending() + scheduler.active } catch (e) { return 0 }
  },
  // Queue + rollup for one sample, used to seed a client's first taxa payload.
  (run, sampleName) => {
    try {
      const runObj = storage.orchestrator.runs.find((r) => r.run === run)
      const sample = runObj && runObj.samples ? runObj.samples[sampleName] : null
      if (!sample) return null
      return {
        queue: typeof sample.formatQueueInfo === 'function' ? sample.formatQueueInfo() : [],
        status: typeof sample.getStatus === 'function' ? sample.getStatus() : null
      }
    } catch (e) {
      return null
    }
  }
);


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
  // Register with the frame bus. Until the client sends `mtx:hello` it has no
  // run selected and therefore receives no data-plane traffic at all.
  protocol.attach(userId, ws);
  logger.info(`A user connected! ID: ${userId}`);

  // ---- data-plane handshake ------------------------------------------------
  //
  // mtx:hello  -> client announces the protocol version it speaks. We reply with
  //               the server's version so a stale bundle can tell the user to
  //               reload instead of silently mis-parsing frames.
  // mtx:ack    -> flow control. The client acks each frame once it has APPLIED
  //               it (not on receipt), which is what makes the backpressure
  //               window track real render capacity rather than network speed.
  // mtx:view   -> the client's viewport: which samples are mounted and which one
  //               is focused. Off-screen samples cost nothing; the focused one
  //               gets full taxon detail.
  ws.on('mtx:hello', (msg) => {
    try {
      ws.emit('mtx:hello', { v: 1, server: true });
      if (msg && msg.run) {
        const conn = protocol.get(userId);
        if (conn) conn.selectRun(msg.run);
      }
    } catch (err) { logger.error(`${err} in mtx:hello`) }
  });
  ws.on('mtx:ack', (msg) => {
    try { protocol.ack(userId, msg && msg.seq) } catch (err) { logger.error(`${err} in mtx:ack`) }
  });
  // The client believes its view of these samples is incomplete (see
  // protocol.resync). Re-send their authoritative queue and status.
  ws.on('mtx:resync', (msg) => {
    try {
      const run = msg && msg.run
      const samples = (msg && Array.isArray(msg.samples)) ? msg.samples.slice(0, 200) : []
      if (!run || !samples.length) return
      const healed = protocol.resync(userId, run, samples, storage.orchestrator)
      if (healed) logger.info(`Resynced ${healed} sample(s) for ${userId} on run ${run}`)
    } catch (err) { logger.error(`${err} in mtx:resync`) }
  });
  ws.on('mtx:view', (msg) => {
    try {
      protocol.setView(userId, {
        visible: msg && msg.visible,
        focus: msg && msg.focus,
        topN: msg && msg.topN
      })
    } catch (err) { logger.error(`${err} in mtx:view`) }
  });

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
  // Push an initial backend-dependency health snapshot (kraken2, KrakenTools,
  // conda/mamba, dorado, guppy) so the UI lights reflect reality on load.
  getHealth().then((h) => { try { ws.emit('health', h) } catch (e) { logger.error(e) } })
            .catch((err) => logger.error(`health snapshot failed: ${err}`))
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
    protocol.detach(userId);
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
  // --- on-demand job logs --------------------------------------------------
  // Per-job kraken/minimap output is NO LONGER streamed with every status frame
  // (that duplication is what pushed a 500-file barcode into GBs on the wire and
  // in the browser heap). The UI asks for one job's log tail only when the user
  // opens that job, and gets it back on a private, single-socket reply.
  ws.on("getJobLogs", (msg) => {
    const reply = (payload) => {
      try { ws.emit('jobLogs', payload) } catch (err) { logger.error(`${err} emitting jobLogs`) }
    }
    try {
      const run = msg && msg.run
      const samplename = msg && (msg.samplename || msg.sample)
      const index = msg && msg.index
      if (!run || !samplename || index === undefined || index === null){
        reply({ run, samplename, index, logs: [], error: 'Missing run/sample/index' })
        return
      }
      const runObj = storage.orchestrator.runs.find((r) => r.run === run)
      const sample = runObj && runObj.samples ? runObj.samples[samplename] : null
      if (!sample || typeof sample.getJobLogs !== 'function'){
        reply({ run, samplename, index, logs: [], error: 'Sample not found' })
        return
      }
      reply(sample.getJobLogs(index))
    } catch (err) {
      logger.error(`${err} error in getJobLogs`)
      reply({ logs: [], error: `${err}` })
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
  // --- backend dependency health + in-UI installer -------------------------
  // Client asks for a fresh dependency snapshot (re-probes PATH each time).
  ws.on("getHealth", async () => {
    try {
      ws.emit("health", await getHealth());
    } catch (err) {
      logger.error(err);
    }
  });
  // Client requests a one-click conda install of an installable tool. The
  // package list is resolved server-side from a fixed registry (the client only
  // sends a key), and progress streams back via 'installLog' / 'installStatus'
  // plus a refreshed 'health' frame on completion.
  ws.on("installTool", (msg) => {
    try {
      installDependency(msg && msg.key);
    } catch (err) {
      logger.error(err);
    }
  });
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
  // ALL-runs queue summary (counts only) so the queue board can show every
  // run's queue depth, not just whichever run happens to be selected.
  ws.on('getQueueBoardAll', () => {
    try {
      ws.emit('queueBoardAll', storage.orchestrator.getQueueBoardAll())
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
  // minimap2 reference typeahead: return sub-directories + FASTA/MMI files so a
  // fasta reference is actually selectable (searchPathDb only lists directories).
  ws.on("searchPathRef", async (msg) => {
    try{
        let matches = await searchPath(msg.value, true)
        ws.emit("sendPathsRef", { data: filterReferencePaths(matches) });
    } catch(err){
        logger.error(err)
    }
  })
  // Native OS file/folder picker so users can point-and-click an input instead
  // of typing it. `target` is echoed back so the client knows which field to fill.
  ws.on("browsePath", async (msg) => {
    try{
        const res = await browsePath(msg && msg.kind)
        ws.emit("browsePathResult", { target: msg && msg.target, kind: msg && msg.kind, ...res });
    } catch(err){
        logger.error(err)
        ws.emit("browsePathResult", { target: msg && msg.target, error: String(err) });
    }
  })
  // Given a chosen R1 file, find its R2 mate in the same directory (single-sample
  // "auto-detect" button). Returns { found, path_2, tried, reason } to the client.
  ws.on("autodetectR2", async (msg) => {
    try{
        let res = autodetectMate(msg.path_1, msg.r1 || '_R1', msg.r2 || '_R2')
        ws.emit("autodetectR2Result", res)
    } catch(err){
        logger.error(err)
        ws.emit("autodetectR2Result", { found: false, reason: 'error', error: String(err) })
    }
  })
  ws.on("openPath", async (msg) => {
    try{
      // When a database key is supplied, let the orchestrator resolve the
      // on-disk folder (handles aliases / nested kraken2 index dirs) rather
      // than trusting a client-side path.
      if (msg && msg.database){
        await storage.orchestrator.openDatabasePath(msg.database)
        return
      }
      storage.orchestrator.openPath(msg.path)
    } catch(err){
        logger.error(err)
    }
  })
  // Delete a downloaded reference database from disk. The frontend confirms
  // with the user first; this is unconditional and irreversible.
  ws.on("deleteDatabase", async (msg) => {
    try{
      await storage.orchestrator.deleteDatabase(msg.database)
    } catch(err){
        logger.error(err)
        ws.emit("alert", { type: 'error', message: `Could not delete database: ${err && err.message ? err.message : err}` })
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
  // Stop listening on a paired-read directory (manual "stop watching" control).
  ws.on('stopPairWatch', async (msg) => {
    try{
        await storage.orchestrator.stopPairWatch(msg.run, { group: msg.group, dir: msg.dir })
    } catch(err){
        logger.error(err)
    }
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
          // Point this connection's delta cursors at the new run. Everything the
          // client held for the previous run is discarded on both ends, so the
          // first frame after this is a clean snapshot rather than a delta
          // against state the client no longer has.
          const conn = protocol.get(userId)
          if (conn) conn.selectRun(msg.run)
          try {
            const board = storage.orchestrator.getQueueBoard(msg.run)
            if (conn) conn.pendingQueue = { board }
          } catch (e) { logger.error(e) }
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
  ws.on("deleteEntries", async (msg) => {
    try{
        let samples = Array.isArray(msg.samples) ? msg.samples : []
        let run = msg.run
        logger.info(`Batch deleting ${samples.length} entries from run ${run}`)
        await storage.orchestrator.deleteEntries(run, samples)
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
