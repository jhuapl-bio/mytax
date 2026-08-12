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

// ---- data plane adapters ---------------------------------------------------
// Kept so sample.mjs / classifier.mjs read the same as before. All they do now
// is hand the update to the bus, which owns coalescing, delta encoding,
// view-scoping and backpressure.

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
