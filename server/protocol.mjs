// ---------------------------------------------------------------------------
// protocol.mjs — the single, versioned, batched channel to the browser.
//
// WHAT REPLACED WHAT
// ------------------
// The hot path used to be six independent socket.io events, each fired from
// deep inside the classification pipeline:
//
//   data / sampledata   full report TSV, per sample, per finished fastq
//   queueJob            one frame per job created
//   status              one frame per job state transition (x2 per job)
//   queueLength         a counter, re-broadcast constantly
//   queueBoard          scheduler snapshot
//   runUpdate           a partial batching layer bolted on top of the above
//
// With 800 files that is tens of thousands of frames, most of them redundant,
// all of them fanned out to every connected socket regardless of what that
// socket was looking at. socket.io head-of-line blocks, the keepalive ping
// starves, and the client reports "connection lost then regained".
//
// It is now ONE event, `mtx:frame`, with these properties:
//
//   * Per connection, not broadcast. Each client has its own delta cursor, so
//     two people looking at different runs cost each other nothing.
//   * Batched on a fixed, load-adaptive interval. Bursts coalesce instead of
//     queueing.
//   * Ack'd. A client that is not keeping up simply stops receiving frames
//     until it catches up; because the state is delta-encoded against the
//     client's LAST ACKED version, nothing is lost — the next frame is just
//     bigger. This is the piece that makes a slow laptop degrade gracefully
//     instead of falling over.
//   * Scoped by view. The client tells us which samples are on screen and which
//     one is focused; everything else is capped at top-N taxa.
//
// FRAME SHAPE
// -----------
//   {
//     v: 1,
//     seq: <monotonic per connection>,
//     run: 'runName',
//     reset: true,                  // present on the first frame of a run
//     dict: [idx, taxid, rank, depth, parent, name, lineage, ...],
//     taxa: [ { sample, full, ver, total, count, upd: [idx,clade,assigned,pct,...], del: [...] } ],
//     jobs: [ { sample, index, job?, status?, config? } ],
//     samples: [ { sample, status } ],
//     queue: { pending, running, boards... }
//   }
//
// Every array is flat numbers or short strings — cheap to stringify, cheap to
// parse, and it lands directly in typed arrays on the client.
// ---------------------------------------------------------------------------

import { storage } from './storage.mjs'
import { logger } from './logger.js'
import { taxonStore, DEFAULT_TOP_N } from './taxonstore.mjs'

export const PROTOCOL_VERSION = 1
export const FRAME_EVENT = 'mtx:frame'

// Flush cadence. Deliberately slower than the old 400ms when the scheduler is
// deep in a backlog: under load the useful information content per unit time
// drops (counts creep up), so a slower cadence with bigger, fully-coalesced
// frames both looks smoother and costs far less.
const FLUSH_IDLE_MS = 250
const FLUSH_BUSY_MS = 900

// How many un-acked frames a connection may have outstanding before we stop
// sending. Two allows continuous streaming under normal RTT while still
// catching a client that has genuinely stalled.
const MAX_IN_FLIGHT = 2

// A connection that never acks (old client, wedged tab) would otherwise be
// starved forever. After this long we assume acks are not coming and fall back
// to unthrottled-but-still-batched sending.
const ACK_GRACE_MS = 15000

// ---------------------------------------------------------------------------
// Per-connection view state.
// ---------------------------------------------------------------------------
class Connection {
    constructor(userId, socket) {
        this.userId = userId
        this.socket = socket
        this.run = null
        this.seq = 0
        this.inFlight = 0
        this.lastAckAt = Date.now()
        this.acksSeen = false
        // sample -> { version, mode: 'top'|'full', topN, sentMode }
        this.cursors = new Map()
        this.dictCursor = { sent: 0 }
        this.queueSeededTotals = new Map()
        // Samples the client says are on screen. null == "everything" (used
        // before the first mtx:view arrives).
        this.visibleSamples = null
        this.focusSample = null
        this.topN = DEFAULT_TOP_N
        this.needsReset = true
        // Coalescing buffers, drained on flush.
        this.dirtyTaxa = new Set()
        this.pendingJobs = new Map()    // `${sample}::${index}` -> payload
        this.pendingSamples = new Map() // sample -> payload
        this.pendingQueue = null
        this.pendingMeta = null
    }

    // Reset everything that describes what the client already has. Called when
    // the client switches runs — the browser throws its store away, so our
    // delta cursors must go with it.
    selectRun(run) {
        this.run = run
        this.cursors = new Map()
        this.dictCursor = { sent: 0 }
        this.queueSeededTotals = new Map()
        this.needsReset = true
        this.dirtyTaxa = new Set()
        this.pendingJobs = new Map()
        this.pendingSamples = new Map()
        this.pendingQueue = null
        this.pendingMeta = null
        this.inFlight = 0
    }

    cursorFor(sample) {
        let c = this.cursors.get(sample)
        if (!c) {
            c = { version: 0, mode: 'top', topN: this.topN, sentMode: null }
            this.cursors.set(sample, c)
        }
        return c
    }

    // Is this connection allowed to send right now? Backpressure gate.
    canSend() {
        if (this.inFlight < MAX_IN_FLIGHT) return true
        // Client stopped acking entirely — don't starve it forever.
        if (!this.acksSeen && Date.now() - this.lastAckAt > ACK_GRACE_MS) {
            this.inFlight = 0
            return true
        }
        return false
    }

    // Which samples this connection should receive taxon updates for, and at
    // what fidelity. Returns null for "send nothing".
    //
    // THE BASELINE RULE, AND WHY IT MATTERS
    // -------------------------------------
    // Viewport scoping is an optimisation, not an authorisation check, and it
    // must never be able to starve a sample the client has never seen. Two
    // individually reasonable rules used to deadlock:
    //
    //   * the server only encodes taxa for samples the client says are visible;
    //   * the client only makes a sample visible once it has data to draw it.
    //
    // A sample that appears AFTER the client's last viewport report — a new
    // barcode directory mid-run, or the first fastq of a run created after the
    // client connected — satisfies neither. It was dropped silently and stayed
    // dropped, until some unrelated action made the client republish its
    // viewport. (Switching tabs did it, which is why the charts appeared to
    // need a tab round-trip before they would render.)
    //
    // So: a sample this connection has never sent anything for always gets its
    // first payload, regardless of the viewport. Only once the client HAS a
    // baseline does off-screen mean "skip".
    modeFor(sample) {
        if (this.focusSample === sample) return 'full'
        if (this.visibleSamples === null) return 'top'
        if (this.visibleSamples.has(sample)) return 'top'
        const cursor = this.cursors.get(sample)
        if (!cursor || !cursor.version) return 'top'   // no baseline yet — always send
        return null
    }
}

// ---------------------------------------------------------------------------
// The bus.
// ---------------------------------------------------------------------------
class ProtocolBus {
    constructor() {
        this.connections = new Map() // userId -> Connection
        this.timer = null
        this.urgentRuns = new Set()
        this.urgentHandle = null
        this.flushMs = FLUSH_IDLE_MS
        this.loadProbe = null   // () => number of pending jobs; injected by index.mjs
        // (run, sample) => { queue, status } | null. Injected by index.mjs so the
        // bus can attach a sample's job queue to that sample's FIRST taxa
        // payload — see flushConnection. Keeps protocol.mjs free of any direct
        // dependency on the orchestrator.
        this.sampleProvider = null
    }

    attach(userId, socket) {
        const conn = new Connection(userId, socket)
        this.connections.set(userId, conn)
        return conn
    }

    detach(userId) {
        this.connections.delete(userId)
    }

    get(userId) {
        return this.connections.get(userId)
    }

    // All connections currently viewing `run`.
    *viewers(run) {
        for (const conn of this.connections.values()) {
            if (conn.run && conn.run === run) yield conn
        }
    }

    // ---- producer-side API. Everything the pipeline calls lands here. ------

    // A sample's report changed. We do NOT send the report; we mark it dirty and
    // let the flusher work out the per-connection delta.
    markTaxa(run, sample) {
        for (const conn of this.viewers(run)) conn.dirtyTaxa.add(sample)
    }

    // A single job's queue entry / status changed. Latest wins per (sample,index).
    queueJobUpdate(run, sample, index, payload) {
        if (!sample) return
        const key = `${sample}::${index}`
        for (const conn of this.viewers(run)) {
            const prev = conn.pendingJobs.get(key) || {}
            conn.pendingJobs.set(key, { ...prev, ...payload, sample, index })
        }
    }

    // A sample's rollup status changed. `payload.data`, if present, is a report
    // body — we route it through the taxon store rather than putting it on the
    // wire.
    queueSampleUpdate(run, sample, payload) {
        if (!sample) return
        let rest = payload
        let changedTaxa = false
        if (payload && typeof payload.data === 'string') {
            const { data, ...others } = payload
            rest = others
            if (taxonStore.ingest(run, sample, data)) {
                this.markTaxa(run, sample)
                changedTaxa = true
            }
        }
        if (rest && Object.keys(rest).length > 0) {
            for (const conn of this.viewers(run)) {
                const prev = conn.pendingSamples.get(sample) || {}
                conn.pendingSamples.set(sample, { ...prev, ...rest, sample })
            }
        }
        if (changedTaxa || (rest && Object.keys(rest).length > 0)) {
            this.scheduleUrgentRunFlush(run)
        }
    }

    scheduleUrgentRunFlush(run) {
        if (!run) return
        this.urgentRuns.add(run)
        if (this.urgentHandle) return
        this.urgentHandle = setImmediate(() => {
            this.urgentHandle = null
            const runs = new Set(this.urgentRuns)
            this.urgentRuns.clear()
            for (const conn of this.connections.values()) {
                if (conn.run && runs.has(conn.run)) this.flushConnection(conn)
            }
        })
    }

    // Scheduler / queue counters. Small, always latest-wins.
    queueMetrics(run, metrics) {
        for (const conn of this.viewers(run)) conn.pendingQueue = metrics
    }

    // Run-level metadata (samplesheet, pair watches). Latest wins.
    queueMeta(run, meta) {
        for (const conn of this.viewers(run)) {
            conn.pendingMeta = { ...(conn.pendingMeta || {}), ...meta }
        }
    }

    // ---- consumer side ----------------------------------------------------

    ack(userId, seq) {
        const conn = this.connections.get(userId)
        if (!conn) return
        conn.acksSeen = true
        conn.lastAckAt = Date.now()
        conn.inFlight = Math.max(0, conn.inFlight - 1)
        // A client that acks promptly gets the next frame without waiting out
        // the interval — keeps the "live" feel when the machine can keep up.
        if (conn.inFlight === 0 && (conn.dirtyTaxa.size || conn.pendingJobs.size || conn.pendingSamples.size)) {
            setImmediate(() => this.flushConnection(conn))
        }
    }

    // ---- resync ------------------------------------------------------------
    //
    // The client noticed an inconsistency it cannot fix on its own — most often
    // "I have taxon data for this sample but no jobs at all", which means the
    // job frames describing its queue were emitted at a moment this connection
    // could not receive them (before it selected the run, or before the sample
    // finished initialising and had a queue to report).
    //
    // Rather than try to make every producer aware of every connection's
    // lifecycle, the client says what looks wrong and we re-send the
    // authoritative state for those samples. This is the self-healing path: any
    // future race in the same class recovers within one round trip instead of
    // leaving the row permanently wrong.
    resync(userId, run, samples, orchestrator) {
        const conn = this.connections.get(userId)
        if (!conn || !conn.run || conn.run !== run) return 0
        const runObj = orchestrator && Array.isArray(orchestrator.runs)
            ? orchestrator.runs.find((r) => r.run === run)
            : null
        if (!runObj || !runObj.samples) return 0

        let healed = 0
        for (const name of (samples || [])) {
            const sample = runObj.samples[name]
            if (!sample) continue
            try {
                // Whole queue for this sample, job by job, so the client can
                // rebuild its aggregate from scratch.
                const queue = typeof sample.formatQueueInfo === 'function' ? sample.formatQueueInfo() : []
                if (Array.isArray(queue)) {
                    queue.forEach((job, index) => {
                        if (!job) return
                        const key = `${name}::${index}`
                        conn.pendingJobs.set(key, {
                            ...(conn.pendingJobs.get(key) || {}),
                            job,
                            sample: name,
                            index
                        })
                    })
                }
                if (typeof sample.getStatus === 'function') {
                    conn.pendingSamples.set(name, {
                        ...(conn.pendingSamples.get(name) || {}),
                        status: sample.getStatus(),
                        sample: name
                    })
                }
                conn.dirtyTaxa.add(name)
                healed += 1
            } catch (err) {
                logger.error(`${err} resyncing ${run}/${name}`)
            }
        }
        if (healed) setImmediate(() => this.flushConnection(conn))
        return healed
    }

    // The client describes its viewport: which samples are mounted, which one is
    // expanded/focused. Everything else is dropped or capped.
    setView(userId, { visible, focus, topN }) {
        const conn = this.connections.get(userId)
        if (!conn) return
        conn.visibleSamples = Array.isArray(visible) ? new Set(visible) : null
        conn.focusSample = focus || null
        if (topN) conn.topN = topN
        // Newly visible samples need their first payload.
        if (conn.visibleSamples) {
            for (const s of conn.visibleSamples) conn.dirtyTaxa.add(s)
        }
        if (conn.focusSample) conn.dirtyTaxa.add(conn.focusSample)
    }

    // ---- flushing ---------------------------------------------------------

    start() {
        if (this.timer) return
        const tick = () => {
            let next = FLUSH_IDLE_MS
            try {
                const pending = this.loadProbe ? this.loadProbe() : 0
                next = pending > 25 ? FLUSH_BUSY_MS : FLUSH_IDLE_MS
                this.flush()
            } catch (err) {
                logger.error(`${err} error in protocol flush`)
            }
            this.timer = setTimeout(tick, next)
            if (typeof this.timer.unref === 'function') this.timer.unref()
        }
        this.timer = setTimeout(tick, FLUSH_IDLE_MS)
        if (typeof this.timer.unref === 'function') this.timer.unref()
    }

    stop() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null }
    }

    flush() {
        for (const conn of this.connections.values()) this.flushConnection(conn)
    }

    flushConnection(conn) {
        if (!conn.run || !conn.socket) return
        if (!conn.canSend()) return

        const frame = { v: PROTOCOL_VERSION, run: conn.run, seq: conn.seq + 1 }
        let hasContent = false

        if (conn.needsReset) {
            frame.reset = true
            hasContent = true
        }

        // --- taxa -----------------------------------------------------------
        if (conn.dirtyTaxa.size) {
            const taxa = []
            const handled = []
            const seededQueue = new Set()
            for (const sample of conn.dirtyTaxa) {
                const mode = conn.modeFor(sample)
                if (mode === null) {
                    // Off screen AND the client already holds a baseline: skip
                    // encoding, but LEAVE IT DIRTY. Clearing the flag here meant
                    // the update was discarded outright, and delivery depended on
                    // the client happening to republish its viewport later. Left
                    // dirty, the sample flushes the moment it scrolls back in,
                    // coalesced into a single catch-up delta.
                    continue
                }
                const cursor = conn.cursorFor(sample)
                cursor.mode = mode
                cursor.topN = conn.topN
                let section
                try {
                    section = taxonStore.encodeFor(conn.run, sample, cursor)
                } catch (err) {
                    logger.error(`${err} encoding taxa for ${conn.run}/${sample}`)
                    section = null
                }
                handled.push(sample)
                if (section) {
                    taxa.push(section)
                    // Queue snapshot for this sample on this connection.
                    //
                    // The client is about to have data for a sample it may know
                    // nothing else about: if the job frames describing its queue
                    // were emitted before this connection existed (or before the
                    // sample had a queue), they were dropped, and the sample row
                    // would read "nothing analyzed yet" despite its charts being
                    // full. Attaching the queue here means the two halves arrive
                    // together and the contradiction never appears. If the known
                    // queue total grows later (e.g. a 400-fastq directory whose
                    // jobs were discovered after the first report), seed again so
                    // the queue board gets every dot, not just the first job.
                    //
                    // The client also detects and repairs this on its own (see
                    // mtx:resync); this just avoids the visible delay.
                    if (!seededQueue.has(sample) && this.sampleProvider) {
                        try {
                            const snap = this.sampleProvider(conn.run, sample)
                            const total = Number((snap && snap.status && snap.status.total) || (snap && Array.isArray(snap.queue) ? snap.queue.length : 0) || 0)
                            const lastTotal = conn.queueSeededTotals.get(sample) || 0
                            if (section.full || total > lastTotal) {
                                seededQueue.add(sample)
                                conn.queueSeededTotals.set(sample, total)
                                if (snap && Array.isArray(snap.queue)) {
                                    snap.queue.forEach((job, index) => {
                                        if (!job) return
                                        const key = `${sample}::${index}`
                                        conn.pendingJobs.set(key, {
                                            ...(conn.pendingJobs.get(key) || {}),
                                            job, sample, index
                                        })
                                    })
                                }
                                if (snap && snap.status) {
                                    conn.pendingSamples.set(sample, {
                                        ...(conn.pendingSamples.get(sample) || {}),
                                        status: snap.status, sample
                                    })
                                }
                            }
                        } catch (err) {
                            logger.error(`${err} seeding queue for ${conn.run}/${sample}`)
                        }
                    }
                }
            }
            for (const s of handled) conn.dirtyTaxa.delete(s)
            if (taxa.length) { frame.taxa = taxa; hasContent = true }
        }

        // --- dictionary (must ship with, and before, any taxa that use it) ---
        try {
            const dict = taxonStore.encodeDict(conn.run, conn.dictCursor)
            if (dict && dict.length) { frame.dict = dict; hasContent = true }
        } catch (err) {
            logger.error(`${err} encoding dict for ${conn.run}`)
        }

        // --- jobs -----------------------------------------------------------
        if (conn.pendingJobs.size) {
            frame.jobs = Array.from(conn.pendingJobs.values())
            conn.pendingJobs.clear()
            hasContent = true
        }

        // --- sample rollups --------------------------------------------------
        if (conn.pendingSamples.size) {
            frame.samples = Array.from(conn.pendingSamples.values())
            conn.pendingSamples.clear()
            hasContent = true
        }

        // --- queue metrics + run meta ----------------------------------------
        if (conn.pendingQueue) { frame.queue = conn.pendingQueue; conn.pendingQueue = null; hasContent = true }
        if (conn.pendingMeta) { frame.meta = conn.pendingMeta; conn.pendingMeta = null; hasContent = true }

        if (!hasContent) return

        conn.seq += 1
        conn.needsReset = false
        conn.inFlight += 1
        try {
            conn.socket.emit(FRAME_EVENT, frame)
        } catch (err) {
            conn.inFlight = Math.max(0, conn.inFlight - 1)
            logger.error(`${err} emitting frame to ${conn.userId}`)
        }
    }

    // Force a complete resend for everyone on a run. Used after a delete or a
    // rerun wipes state the client is holding.
    resetRun(run) {
        for (const conn of this.viewers(run)) {
            conn.selectRun(run)
            for (const sample of taxonStore.samplesFor(run)) conn.dirtyTaxa.add(sample)
        }
    }
}

export const protocol = new ProtocolBus()
