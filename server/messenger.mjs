// ---------------------------------------------------------------------------
// messenger.mjs — control-plane messaging only.
//
// This file used to carry the whole live-update system: an ad-hoc throttler, a
// run-scoped batcher, and a fan-out broadcaster, all fighting each other. The
// data plane (reports, job status, queue counters — everything that fires once
// per fastq) now lives in protocol.mjs behind a single acked, delta-encoded
// frame channel.
//
// What is left here is the CONTROL plane: rare, small, must-not-drop events
// like alerts, run lists, database installs and health. These are fine to
// broadcast immediately, because there are a handful of them per session rather
// than tens of thousands.
//
// The queueSampleUpdate / queueJobUpdate / broadcastThrottled names are kept as
// thin adapters so the classification pipeline did not need rewriting; they
// simply hand off to the bus.
// ---------------------------------------------------------------------------

import { storage } from './storage.mjs';
import { logger } from './logger.js'
import { protocol } from './protocol.mjs'

// ---- control plane ---------------------------------------------------------

export function broadcastToAllActiveConnections(message, data) {
    if (!storage.activeConnections) {
        logger.error('No active connections found');
        return;
    }
    storage.activeConnections.forEach((connection) => {
        try {
            connection.emit(message, data);
        } catch (err) {
            logger.error(`${err} error in broadcasting ${message} to connection`);
        }
    });
}

// Emit to just the connections currently viewing `run`.
export function emitToRunViewers(run, event, data) {
    if (!run) return;
    for (const conn of protocol.viewers(run)) {
        try {
            conn.socket.emit(event, data);
        } catch (err) {
            logger.error(`${err} error emitting ${event} to run viewers`);
        }
    }
}

// ---------------------------------------------------------------------------
// Legacy trailing-edge throttle. Still used for a handful of genuinely
// low-frequency control events (database install progress). NOT for anything on
// the per-fastq path — that all goes through the bus now.
// ---------------------------------------------------------------------------
const _pending = new Map();
const _timers = new Map();

export function broadcastThrottled(message, data, key, wait = 250) {
    const k = key || message;
    _pending.set(k, { message, data });
    if (_timers.has(k)) return;
    const timer = setTimeout(() => {
        _timers.delete(k);
        const latest = _pending.get(k);
        _pending.delete(k);
        if (latest) broadcastToAllActiveConnections(latest.message, latest.data);
    }, wait);
    if (typeof timer.unref === 'function') timer.unref();
    _timers.set(k, timer);
}

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

export function queueSampleUpdate(run, samplename, payload) {
    protocol.queueSampleUpdate(run, samplename, payload)
}

export function queueJobUpdate(run, samplename, index, payload) {
    protocol.queueJobUpdate(run, samplename, index, payload)
}

// Queue/scheduler counters. These used to be their own broadcast events fired
// on every enqueue and every completion; now they ride the frame.
export function queueMetrics(run, metrics) {
    protocol.queueMetrics(run, metrics)
}

export function queueRunMeta(run, meta) {
    protocol.queueMeta(run, meta)
}

// Start the frame flusher. Replaces startRunUpdateFlusher().
//
// `sampleProvider` lets the bus attach a sample's job queue to that sample's
// first taxa payload without protocol.mjs having to know what an orchestrator
// is.
export function startProtocol(loadProbe, sampleProvider) {
    if (typeof loadProbe === 'function') protocol.loadProbe = loadProbe
    if (typeof sampleProvider === 'function') protocol.sampleProvider = sampleProvider
    protocol.start()
}
