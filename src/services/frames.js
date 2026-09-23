/* ---------------------------------------------------------------------------
 * services/frames.js — client half of the mtx frame protocol.
 *
 * Responsibilities, in order of importance:
 *
 *   1. NEVER BLOCK THE MAIN THREAD FOR LONG. Frames are queued on arrival and
 *      drained inside a time-budgeted loop on animation frames. A burst of
 *      updates therefore costs a few milliseconds per frame of animation
 *      instead of one multi-hundred-millisecond stall. This is the difference
 *      between "the UI is laggy" and "the UI is live".
 *
 *   2. ACK ONLY AFTER APPLYING. The server's flow-control window is meant to
 *      track how fast this client can actually absorb updates, not how fast the
 *      network delivered them. Acking on receipt would defeat the whole point:
 *      the server would keep shovelling while we fall further behind.
 *
 *   3. REPORT THE VIEWPORT. Which samples are mounted, and which one is
 *      focused, decides what the server bothers to encode. Off-screen samples
 *      cost nothing at all; the focused one gets full taxon detail.
 *
 * The old client had none of this: forty-odd independent socket.on handlers,
 * each mutating reactive state synchronously the instant a packet landed.
 * ------------------------------------------------------------------------- */

import taxaStore from '@/store/taxa'

export const PROTOCOL_VERSION = 1
export const FRAME_EVENT = 'mtx:frame'

// Per-animation-frame budget for applying queued frames. 8ms leaves room in a
// 16.7ms frame for Vue's own patch and for the chart layer to draw.
const APPLY_BUDGET_MS = 8

// Debounce on viewport reports. Scrolling a long sample list should not send a
// packet per pixel.
const VIEW_DEBOUNCE_MS = 150

// Minimum gap between resync requests for the same sample. A sample that
// legitimately has no jobs would otherwise be asked about forever.
const RESYNC_COOLDOWN_MS = 15000

export class FrameClient {
  /**
   * @param {object} opts
   * @param {object} opts.socket        socket.io client
   * @param {function} opts.onJobs      (jobs[]) => void
   * @param {function} opts.onSamples   (samples[]) => void
   * @param {function} opts.onQueue     (queue) => void
   * @param {function} opts.onMeta      (meta) => void
   * @param {function} opts.onApplied   (stats) => void — after each drain
   */
  constructor(opts) {
    this.socket = opts.socket
    this.onJobs = opts.onJobs || (() => {})
    this.onSamples = opts.onSamples || (() => {})
    this.onQueue = opts.onQueue || (() => {})
    this.onMeta = opts.onMeta || (() => {})
    this.onApplied = opts.onApplied || (() => {})

    this.queue = []
    this.draining = false
    this.rafHandle = null
    this.run = null
    this.viewTimer = null
    this.lastView = null

    // Diagnostics — surfaced in the UI so a slow session can be explained
    // rather than guessed at.
    this.stats = {
      framesReceived: 0,
      framesApplied: 0,
      bytesReceived: 0,
      lastApplyMs: 0,
      maxApplyMs: 0,
      backlog: 0,
      resyncs: 0
    }
    this._resyncedAt = new Map()

    this._onFrame = this._onFrame.bind(this)
    this._drain = this._drain.bind(this)
  }

  attach() {
    if (!this.socket || !this.socket.on) return
    this.socket.on(FRAME_EVENT, this._onFrame)
    this.socket.emit('mtx:hello', { v: PROTOCOL_VERSION })
  }

  detach() {
    if (this.socket && this.socket.off) this.socket.off(FRAME_EVENT, this._onFrame)
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle)
    this.rafHandle = null
    this.queue = []
  }

  // Switch runs. The store is cleared here and the server resets its cursors on
  // its own `getRunInformation` path, so both sides start from nothing.
  selectRun(run) {
    this.run = run
    this.queue = []
    taxaStore.reset(run)
    this.lastView = null
    this._resyncedAt = new Map()
  }

  // -------------------------------------------------------------------------
  // Viewport reporting
  // -------------------------------------------------------------------------

  /**
   * Tell the server what is on screen.
   * @param {string[]} visible  sample names currently mounted/in view
   * @param {string|null} focus the one sample shown in full detail, if any
   * @param {number} topN       taxa cap for non-focused samples
   */
  setView(visible, focus, topN) {
    const key = `${(visible || []).slice().sort().join(',')}|${focus || ''}|${topN || ''}`
    if (key === this.lastView) return
    this.lastView = key
    if (this.viewTimer) clearTimeout(this.viewTimer)
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null
      if (!this.socket || !this.socket.connected) return
      this.socket.emit('mtx:view', { visible, focus, topN })
    }, VIEW_DEBOUNCE_MS)
  }

  /**
   * Ask the server to re-send the authoritative queue + status for samples the
   * client believes it has an incomplete picture of.
   *
   * Rate-limited per sample: a resync that does not help (because the server
   * genuinely has no jobs for that sample) must not turn into a request loop.
   */
  requestResync(samples) {
    if (!this.socket || !this.socket.connected || !this.run) return
    const now = Date.now()
    if (!this._resyncedAt) this._resyncedAt = new Map()
    const ask = []
    for (const s of samples || []) {
      const last = this._resyncedAt.get(s) || 0
      if (now - last < RESYNC_COOLDOWN_MS) continue
      this._resyncedAt.set(s, now)
      ask.push(s)
    }
    if (!ask.length) return
    this.stats.resyncs += ask.length
    this.socket.emit('mtx:resync', { run: this.run, samples: ask })
  }

  // -------------------------------------------------------------------------
  // Receive / apply
  // -------------------------------------------------------------------------

  _onFrame(frame) {
    if (!frame) return
    this.stats.framesReceived += 1
    // Stale frames for a run we have navigated away from are dropped outright
    // — applying them would poison a store that has already been reset.
    if (this.run && frame.run && frame.run !== this.run) {
      this._ack(frame.seq)
      return
    }
    this.queue.push(frame)
    this.stats.backlog = this.queue.length
    this._schedule()
  }

  _schedule() {
    if (this.rafHandle || this.draining) return
    this.rafHandle = requestAnimationFrame(this._drain)
  }

  _drain() {
    this.rafHandle = null
    this.draining = true
    const started = performance.now()
    let applied = 0

    // Apply as many queued frames as fit in the budget. Anything left over
    // rides the next animation frame, so we degrade into slower-but-smooth
    // rather than into a frozen tab.
    while (this.queue.length && (performance.now() - started) < APPLY_BUDGET_MS) {
      const frame = this.queue.shift()
      try {
        this._apply(frame)
      } catch (err) {
        console.error('frame apply failed', err)
      }
      this._ack(frame.seq)
      applied += 1
    }

    const elapsed = performance.now() - started
    this.stats.framesApplied += applied
    this.stats.lastApplyMs = elapsed
    if (elapsed > this.stats.maxApplyMs) this.stats.maxApplyMs = elapsed
    this.stats.backlog = this.queue.length
    this.draining = false

    if (applied) this.onApplied(this.stats)
    if (this.queue.length) this._schedule()
  }

  _apply(frame) {
    // Taxa + dictionary go straight into the columnar store; no row objects are
    // created here at all.
    taxaStore.applyFrame(frame)
    // The light, structural sections are handed back to the app, which keeps
    // them in ordinary reactive state — they are small and bounded.
    if (frame.jobs && frame.jobs.length) this.onJobs(frame.jobs)
    if (frame.samples && frame.samples.length) this.onSamples(frame.samples)
    if (frame.queue) this.onQueue(frame.queue)
    if (frame.meta) this.onMeta(frame.meta)
  }

  _ack(seq) {
    if (!seq || !this.socket || !this.socket.connected) return
    this.socket.emit('mtx:ack', { seq })
  }
}

export default FrameClient
