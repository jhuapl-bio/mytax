// messenger.mjs
import { storage } from './storage.mjs';
import {logger} from './logger.js'
export function broadcastToAllActiveConnections(message, data) {
    if (storage['activeConnections']) {
        // if (message !== 'status') {
        //     console.log(`Broadcasting ${message} to all active connections`);
        // }
        const activeConnections = storage['activeConnections'];
        let i = 0
        activeConnections.forEach((connection) => {
            try {
                connection.emit(message, data);
            } catch (err) {
                console.error(`${err} error in broadcasting to connection`);
            } 
            i+=1
        });
    } else {
        console.error('No active connections found');
    }
}

// Emit an event only to the connections currently viewing `run` (same scoping
// rule the batched runUpdate flusher uses). Used for run-scoped frames like the
// live queue board so other runs' viewers aren't spammed.
export function emitToRunViewers(run, event, data) {
    if (!run || !storage.activeConnections || !storage.selectedRuns) return;
    storage.activeConnections.forEach((conn, userId) => {
        if (storage.selectedRuns.get(userId) === run) {
            try {
                conn.emit(event, data);
            } catch (err) {
                console.error(`${err} error emitting ${event} to run viewers`);
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Coalescing / throttled broadcaster.
//
// When 400 fastqs are queued and classified in a burst, the naive path fires
// hundreds of `queueLength`, `queueJob` and `sampledata` frames back to back.
// That floods socket.io, causes head-of-line blocking and starves the ping
// keepalive -> the client reports the connection as lost then regained.
//
// broadcastThrottled() collapses repeated events that share a `key` into a
// single trailing emit per `wait` window, always sending the most recent
// payload. Use it for high-frequency progress events. Keep the immediate
// broadcastToAllActiveConnections() for low-frequency, must-not-drop events
// (alerts, deletes, run lists, etc.).
// ---------------------------------------------------------------------------
const _pending = new Map();   // key -> { message, data }
const _timers = new Map();    // key -> timeout handle

export function broadcastThrottled(message, data, key, wait = 250) {
    const k = key || message;
    // Always remember the latest payload for this key.
    _pending.set(k, { message, data });
    if (_timers.has(k)) return; // a trailing flush is already scheduled
    const timer = setTimeout(() => {
        _timers.delete(k);
        const latest = _pending.get(k);
        _pending.delete(k);
        if (latest) {
            broadcastToAllActiveConnections(latest.message, latest.data);
        }
    }, wait);
    // Don't let these timers keep the process alive on shutdown.
    if (typeof timer.unref === 'function') timer.unref();
    _timers.set(k, timer);
}

// Force-flush any pending throttled payloads immediately (e.g. when the queue
// goes idle and we want the final state delivered without waiting out the window).
export function flushThrottled(key) {
    const flushOne = (k) => {
        const t = _timers.get(k);
        if (t) { clearTimeout(t); _timers.delete(k); }
        const latest = _pending.get(k);
        _pending.delete(k);
        if (latest) broadcastToAllActiveConnections(latest.message, latest.data);
    };
    if (key) { flushOne(key); return; }
    for (const k of Array.from(_pending.keys())) flushOne(k);
}

// ---------------------------------------------------------------------------
// Batched log bus.
//
// Every winston line used to be pushed as its own `logs` socket frame. During
// classification that's one frame per stdout/stderr chunk per job -- kraken2's
// "Loading database information... / done. / N sequences processed" plus
// combine_kreports' ">>STEP 1/2/3" plus a watcher line per report change. On a
// busy run that is hundreds of frames a second carrying almost no information,
// and it competes with the frames that actually matter (runUpdate, queueBoard).
//
// Now lines are buffered, consecutive duplicates are collapsed into a single
// entry with a repeat count, and the whole buffer ships as ONE `logs` frame on
// a fixed interval. The client accepts either an array or a single line so an
// older frontend keeps working.
// ---------------------------------------------------------------------------
const LOG_FLUSH_MS = 750;
const LOG_MAX_BUFFER = 300;   // hard cap of DISTINCT lines per flush window
let _logBuffer = [];
let _logIndex = new Map();    // line text -> its entry in _logBuffer (this window)
let _logDropped = 0;
let _logTimer = null;

function _logText(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry;
    return entry.message != null ? String(entry.message) : String(entry);
}

export function queueLogLine(line) {
    const text = _logText(line);
    if (text === '') return;
    // Collapse duplicates ANYWHERE in the current window, not just consecutive
    // ones. Classification output is cyclic — kraken2 repeats "Loading database
    // information… / done. / N sequences processed / N classified" once per
    // FASTQ — so a consecutive-only check never matches and the window fills
    // with the same four strings over and over. Keyed on the text, N files
    // collapse to 4 entries with repeat counts.
    const seen = _logIndex.get(text);
    if (seen) {
        seen.repeat = (seen.repeat || 1) + 1;
        return;
    }
    if (_logBuffer.length >= LOG_MAX_BUFFER) { _logDropped += 1; return; }
    const payload = (typeof line === 'object' && line !== null) ? { ...line } : { message: text };
    payload._text = text;
    _logBuffer.push(payload);
    _logIndex.set(text, payload);
}

export function startLogFlusher(wait = LOG_FLUSH_MS) {
    if (_logTimer) return;
    _logTimer = setInterval(() => {
        if (_logBuffer.length === 0 && _logDropped === 0) return;
        const lines = _logBuffer;
        const dropped = _logDropped;
        _logBuffer = [];
        _logIndex = new Map();
        _logDropped = 0;
        if (dropped > 0) {
            lines.push({ level: 'info', message: `… ${dropped} further log line(s) suppressed`, _text: 'suppressed' });
        }
        broadcastToAllActiveConnections('logs', { data: lines });
    }, wait);
    if (typeof _logTimer.unref === 'function') _logTimer.unref();
}

// ---------------------------------------------------------------------------
// Run-scoped, batched update bus.
//
// A large run (1000s of fastqs) emits 1000s of per-job `status` and per-sample
// `sampledata`/`queueJob` events. Broadcasting each one to every socket (a)
// floods the wire so the run the user is actually looking at can't render, and
// (b) wastes work pushing updates for runs nobody is viewing.
//
// Instead we:
//   * only buffer updates for runs at least one client has selected
//     (storage.selectedRuns),
//   * coalesce them per sample / per job (latest wins), and
//   * flush everything as ONE `runUpdate` frame per run on a fixed interval,
//     delivered only to the connections viewing that run.
//
// Shape of a flushed frame:
//   { run, samples: [{ samplename, data?, status? }, ...],
//          jobs:    [{ samplename, index, job?, status?, config? }, ...] }
// ---------------------------------------------------------------------------
let _runBuffers = new Map(); // run -> { samples: Map(name->payload), jobs: Map(key->payload) }

function _anyoneViewing(run) {
    if (!run || !storage.selectedRuns) return false;
    for (const r of storage.selectedRuns.values()) {
        if (r === run) return true;
    }
    return false;
}

function _runBuffer(run) {
    let b = _runBuffers.get(run);
    if (!b) { b = { samples: new Map(), jobs: new Map() }; _runBuffers.set(run, b); }
    return b;
}

// Coalesce a sample-level report/status update (latest wins per sample).
export function queueSampleUpdate(run, samplename, payload) {
    if (!samplename || !_anyoneViewing(run)) return;
    const b = _runBuffer(run);
    b.samples.set(samplename, { ...(b.samples.get(samplename) || {}), ...payload, samplename });
}

// Coalesce a single job's queue/status update (latest wins per sample+index).
export function queueJobUpdate(run, samplename, index, payload) {
    if (!samplename || !_anyoneViewing(run)) return;
    const b = _runBuffer(run);
    const k = `${samplename}::${index}`;
    b.jobs.set(k, { ...(b.jobs.get(k) || {}), ...payload, samplename, index });
}

let _runFlushTimer = null;

// Start the single interval that drains the per-run buffers into one frame each.
export function startRunUpdateFlusher(wait = 400) {
    if (_runFlushTimer) return;
    _runFlushTimer = setInterval(() => {
        if (_runBuffers.size === 0 || !storage.activeConnections) return;
        // Swap the buffer atomically so updates arriving mid-flush land in the
        // next window instead of being lost.
        const buffers = _runBuffers;
        _runBuffers = new Map();
        for (const [run, buf] of buffers.entries()) {
            const samples = Array.from(buf.samples.values());
            const jobs = Array.from(buf.jobs.values());
            if (samples.length === 0 && jobs.length === 0) continue;
            if (!_anyoneViewing(run)) continue; // viewers moved on; drop the batch
            const frame = { run, samples, jobs };
            storage.activeConnections.forEach((conn, userId) => {
                if (storage.selectedRuns && storage.selectedRuns.get(userId) === run) {
                    try {
                        conn.emit('runUpdate', frame);
                    } catch (err) {
                        console.error(`${err} error emitting runUpdate`);
                    }
                }
            });
        }
    }, wait);
    if (typeof _runFlushTimer.unref === 'function') _runFlushTimer.unref();
}