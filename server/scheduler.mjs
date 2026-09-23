import { logger } from './logger.js'
import { storage } from './storage.mjs'
import { emitToRunViewers, broadcastThrottled } from './messenger.mjs'

// ---------------------------------------------------------------------------
// Round-robin job scheduler.
//
// Problem it solves:
//   Every barcode (or sample) is watched independently and, when its files are
//   discovered, all of that sample's classify jobs were pushed straight onto the
//   single global PQueue in FIFO order. So a 24-barcode run drained *all* of
//   barcode01's fastqs before touching barcode02 -> you wait a long time before
//   seeing anything from later barcodes.
//
// What it does instead (the "2-tier" queue):
//   tier 1 = which lane (barcode/sample) goes next, cycled round-robin.
//   tier 2 = the ordered fastq files inside each lane.
//   So it runs: barcode01 file#1, barcode02 file#1, barcode03 file#1,
//   barcode01 file#2, ... Uneven counts are handled automatically: when a lane
//   runs out it is simply skipped on its turn, while the lane keeps listening so
//   new files dropped in later slot back into the rotation.
//
// It sits in FRONT of the existing PQueue: it releases exactly `concurrency`
// jobs at a time (matching the PQueue), so the PQueue still executes the work
// (and all the existing per-job status/abort logic is untouched) while THIS
// class fully controls the order. That also makes live reordering trivial.
// ---------------------------------------------------------------------------

class RoundRobinScheduler {
	constructor() {
		// laneKey -> { key, runName, sample, pending: [entry] }
		this.lanes = new Map()
		// rotation order of laneKeys (tier-1). Drag-to-reorder rewrites this.
		this.laneOrder = []
		// jobs the user explicitly bumped to "run next" (drained before the
		// round-robin rotation).
		this.priorityFront = []
		// laneKey we served most recently; the rotation resumes from the lane
		// AFTER it. Tracking the key (not a numeric index) keeps the rotation
		// correct even when new lanes appear after the first job has started.
		this.lastServedKey = null
		// number of jobs currently released to the PQueue (in flight).
		this.active = 0
		// runName -> number of that run's jobs currently in flight. This is what
		// lets the UI put a spinner on a SPECIFIC run in the run dropdown
		// (including runs the user isn't currently looking at).
		this.activeByRun = new Map()
		// runName -> { total, done, failed } lifetime counters, so the run
		// dropdown can render a determinate progress wheel instead of a bare
		// spinner. `total` counts every job ever admitted for that run.
		this.statsByRun = new Map()
		// every jobId ever admitted, so a rerun doesn't double-count `total`.
		this._seenJobs = new Set()
		// per-run board-emit throttle timers.
		this._boardTimers = new Map()
	}

	_knownJob(jobId) {
		return this._seenJobs.has(jobId)
	}

	// --- per-run activity counters ------------------------------------------

	_stats(runName) {
		let s = this.statsByRun.get(runName)
		if (!s) { s = { total: 0, done: 0, failed: 0 }; this.statsByRun.set(runName, s) }
		return s
	}

	_bumpActive(runName, by) {
		if (!runName) return
		const n = (this.activeByRun.get(runName) || 0) + by
		if (n > 0) this.activeByRun.set(runName, n)
		else this.activeByRun.delete(runName)
	}

	// True when this run has work in flight or still waiting. Cheap enough to
	// call per dropdown row.
	isRunActive(runName) {
		if (!runName) return false
		if ((this.activeByRun.get(runName) || 0) > 0) return true
		for (const lane of this.lanes.values()) {
			if (lane.runName === runName && lane.pending.length) return true
		}
		return this.priorityFront.some((e) => e.runName === runName)
	}

	// Match the underlying PQueue so we never release more than it can run.
	get concurrency() {
		const c = storage.queue && storage.queue.concurrency
		return c && c > 0 ? c : 1
	}

	laneKeyFor(runName, sample) {
		return `${runName}::${sample}`
	}

	ensureLane(runName, sample) {
		const key = this.laneKeyFor(runName, sample)
		let lane = this.lanes.get(key)
		if (!lane) {
			lane = { key, runName, sample, pending: [] }
			this.lanes.set(key, lane)
			this.laneOrder.push(key)
		}
		return lane
	}

	// Register a job. entry = { jobId, runName, sample, index, priority,
	// controller, exec } where exec() returns a promise that resolves when the
	// job has actually finished running on the PQueue.
	add(entry) {
		if (!entry || !entry.jobId) return
		// de-dupe: a rerun re-submits the same jobId -> replace the old copy.
		const wasKnown = this._knownJob(entry.jobId)
		this.removeJob(entry.jobId, true)
		// Only count a jobId once towards the run's lifetime `total`; a rerun of
		// the same file shouldn't inflate the denominator of the progress wheel.
		if (!wasKnown) this._stats(entry.runName).total += 1
		this._seenJobs.add(entry.jobId)
		const lane = this.ensureLane(entry.runName, entry.sample)
		// keep a lane's files ordered by their index so tier-2 stays in read order
		const at = lane.pending.findIndex((e) => e.index > entry.index)
		if (at === -1) lane.pending.push(entry)
		else lane.pending.splice(at, 0, entry)
		this.pump()
		this.scheduleBoard(entry.runName)
		this.scheduleGlobalBoard()
	}

	// Pull the next entry to run, honouring priority-front then round-robin.
	_next() {
		// drop any aborted jobs sitting at the front of the priority list
		while (this.priorityFront.length) {
			const e = this.priorityFront.shift()
			if (!this._aborted(e)) return e
		}
		const order = this.laneOrder
		if (order.length === 0) return null
		// resume from the lane after the one we served last
		let start = 0
		if (this.lastServedKey) {
			const li = order.indexOf(this.lastServedKey)
			if (li > -1) start = (li + 1) % order.length
		}
		for (let step = 0; step < order.length; step++) {
			const idx = (start + step) % order.length
			const key = order[idx]
			const lane = this.lanes.get(key)
			if (lane && lane.pending.length) {
				// skip aborted jobs in this lane
				while (lane.pending.length && this._aborted(lane.pending[0])) {
					lane.pending.shift()
				}
				if (!lane.pending.length) continue
				this.lastServedKey = key
				return lane.pending.shift()
			}
		}
		return null
	}

	_aborted(entry) {
		return !!(entry && entry.controller && entry.controller.signal && entry.controller.signal.aborted)
	}

	pump() {
		while (this.active < this.concurrency) {
			const entry = this._next()
			if (!entry) break
			this.active += 1
			this._bumpActive(entry.runName, 1)
			// A run flipping from idle -> busy is exactly what the run dropdown's
			// status wheel needs to know about, so push the summary right away
			// rather than waiting for the next natural board event.
			this.scheduleGlobalBoard()
			Promise.resolve()
				.then(() => entry.exec())
				.then(() => { this._stats(entry.runName).done += 1 })
				.catch((err) => {
					this._stats(entry.runName).failed += 1
					logger.error(`${err} scheduler job ${entry.jobId} failed`)
				})
				.finally(() => {
					this.active -= 1
					this._bumpActive(entry.runName, -1)
					this.scheduleBoard(entry.runName)
					this.emitLength()
					this.scheduleGlobalBoard()
					this.pump()
				})
		}
		this.emitLength()
	}

	// total jobs still waiting + the one(s) running, for the UI badge.
	totalPending() {
		let n = this.priorityFront.length
		for (const lane of this.lanes.values()) n += lane.pending.length
		return n
	}

	emitLength() {
		try {
			broadcastThrottled('queueLength', { data: this.totalPending() + this.active, type: 'scheduler' }, 'queueLength')
		} catch (err) {
			logger.error(`${err} error emitting scheduler queueLength`)
		}
	}

	removeJob(jobId, silent) {
		if (!jobId) return
		let runName = null
		const pf = this.priorityFront.findIndex((e) => e.jobId === jobId)
		if (pf > -1) { runName = this.priorityFront[pf].runName; this.priorityFront.splice(pf, 1) }
		for (const lane of this.lanes.values()) {
			const i = lane.pending.findIndex((e) => e.jobId === jobId)
			if (i > -1) { runName = lane.runName; lane.pending.splice(i, 1); break }
		}
		if (!silent && runName) { this.scheduleBoard(runName); this.emitLength(); this.scheduleGlobalBoard() }
	}

	// Remove a single sample's lane entirely. Cancelling a sample's jobs only
	// empties its pending list; the lane itself lingers in `lanes`/`laneOrder`, so
	// getBoard()/getBoardAll() keep showing the (now empty) sample on the queue
	// board. Call this when a sample is deleted so it disappears from the board.
	removeSample(runName, sample) {
		const key = this.laneKeyFor(runName, sample)
		const existed = this.lanes.delete(key)
		this.laneOrder = this.laneOrder.filter((k) => k !== key)
		const beforeLen = this.priorityFront.length
		this.priorityFront = this.priorityFront.filter((e) => !(e.runName === runName && e.sample === sample))
		if (this.lastServedKey === key) this.lastServedKey = null
		if (existed || beforeLen !== this.priorityFront.length) {
			this.scheduleBoard(runName)
			this.emitLength()
			this.scheduleGlobalBoard()
		}
	}

	// --- live manipulation (driven by the queue board UI) --------------------

	// Bump a single file to run next.
	prioritizeJob(runName, sample, index) {
		const key = this.laneKeyFor(runName, sample)
		const lane = this.lanes.get(key)
		if (!lane) return
		const i = lane.pending.findIndex((e) => e.index === index)
		if (i === -1) return
		const [entry] = lane.pending.splice(i, 1)
		this.priorityFront.unshift(entry)
		this.pump()
		this.scheduleBoard(runName)
	}

	// Reorder the round-robin rotation (tier-1). `samples` is the desired order
	// of sample names for that run; unknown / other-run lanes keep their place.
	setLaneOrder(runName, samples) {
		if (!Array.isArray(samples)) return
		const desired = samples.map((s) => this.laneKeyFor(runName, s)).filter((k) => this.lanes.has(k))
		const others = this.laneOrder.filter((k) => {
			const lane = this.lanes.get(k)
			return !lane || lane.runName !== runName || !desired.includes(k)
		})
		this.laneOrder = [...desired, ...others]
		this.lastServedKey = null
		this.scheduleBoard(runName)
	}

	// Move a single job to an explicit slot in the global play order. Implemented
	// by re-deriving the affected lane's order; used by fine-grained dot drags.
	moveJob(runName, sample, index, beforeSample, beforeIndex) {
		// simplest robust behaviour: prioritise to front when no anchor given,
		// otherwise treat as prioritise (UI mostly needs "run sooner").
		this.prioritizeJob(runName, sample, index)
	}

	clear(runName) {
		if (!runName) {
			// Remember which runs had lanes so their viewers get an immediate
			// "empty" board pushed to them, instead of silently going stale until
			// something else happens to trigger a rebuild.
			const affectedRuns = new Set()
			for (const lane of this.lanes.values()) affectedRuns.add(lane.runName)
			this.lanes.clear()
			this.laneOrder = []
			this.priorityFront = []
			this.lastServedKey = null
			this.statsByRun.clear()
			this._seenJobs.clear()
			this.emitLength()
			for (const r of affectedRuns) this.scheduleBoard(r)
			this.scheduleGlobalBoard()
			return
		}
		for (const [key, lane] of Array.from(this.lanes.entries())) {
			if (lane.runName === runName) this.lanes.delete(key)
		}
		this.laneOrder = this.laneOrder.filter((k) => this.lanes.has(k))
		this.priorityFront = this.priorityFront.filter((e) => e.runName !== runName)
		this.lastServedKey = null
		this.statsByRun.delete(runName)
		for (const id of Array.from(this._seenJobs)) {
			if (id.startsWith(`${runName}::`)) this._seenJobs.delete(id)
		}
		this.scheduleBoard(runName)
		this.emitLength()
		this.scheduleGlobalBoard()
	}

	// --- board snapshot for the UI ------------------------------------------

	// A compact, run-scoped description of the *pending* order. Per-file state
	// (running/done/error) is already on the client via queueList; this only
	// conveys ordering: which lanes, in what rotation, and the next-up sequence.
	getBoard(runName) {
		const lanes = []
		for (const key of this.laneOrder) {
			const lane = this.lanes.get(key)
			if (!lane || lane.runName !== runName) continue
			lanes.push({
				sample: lane.sample,
				pending: lane.pending.map((e) => e.index)
			})
		}
		// simulate the rotation to produce the up-next sequence (cap it)
		const upNext = []
		const cursors = new Map()
		for (const l of lanes) cursors.set(l.sample, 0)
		for (const e of this.priorityFront) {
			if (e.runName === runName) upNext.push({ sample: e.sample, index: e.index, boosted: true })
		}
		let guard = 0
		const max = 400
		let remaining = lanes.reduce((a, l) => a + l.pending.length, 0)
		while (remaining > 0 && upNext.length < max && guard < max * 4) {
			guard++
			for (const l of lanes) {
				const c = cursors.get(l.sample)
				if (c < l.pending.length) {
					upNext.push({ sample: l.sample, index: l.pending[c], boosted: false })
					cursors.set(l.sample, c + 1)
					remaining--
					if (upNext.length >= max) break
				}
			}
		}
		return {
			run: runName,
			laneOrder: lanes.map((l) => l.sample),
			lanes,
			upNext,
			active: this.active,
			total: this.totalPending() + this.active
		}
	}

	scheduleBoard(runName, wait = 250) {
		if (!runName) return
		if (this._boardTimers.has(runName)) return
		const timer = setTimeout(() => {
			this._boardTimers.delete(runName)
			try {
				emitToRunViewers(runName, 'queueBoard', this.getBoard(runName))
			} catch (err) {
				logger.error(`${err} error emitting queueBoard`)
			}
		}, wait)
		if (typeof timer.unref === 'function') timer.unref()
		this._boardTimers.set(runName, timer)
	}

	// --- ALL-runs summary ----------------------------------------------------
	//
	// The per-run board (getBoard) carries full lane/upNext detail and is only
	// ever pushed to clients actively viewing that run -- that scoping is what
	// keeps a 1000-job run from flooding every other connection. But that also
	// meant the queue board UI could only ever show the ONE selected run, even
	// though jobs from every run share the same round-robin scheduler.
	//
	// getBoardAll() is the cheap counterpart: just counts (pending/lanes) per
	// run plus a grand total, no per-job payloads, so it's safe to broadcast to
	// every connected client regardless of which run they're looking at.
	getBoardAll() {
		const runs = new Map()
		const ensure = (runName) => {
			if (!runName) return null
			let r = runs.get(runName)
			if (!r) {
				r = { run: runName, pending: 0, lanes: 0, active: 0, done: 0, failed: 0, total: 0, percent: 0 }
				runs.set(runName, r)
			}
			return r
		}
		const bump = (runName, by) => {
			const r = ensure(runName)
			if (r) r.pending += by
		}
		for (const lane of this.lanes.values()) {
			bump(lane.runName, lane.pending.length)
			const r = runs.get(lane.runName)
			if (r) r.lanes += 1
		}
		for (const e of this.priorityFront) bump(e.runName, 1)
		// Fold in the per-run in-flight count and lifetime stats. A run with no
		// lanes left but jobs still running (last file of the run) must still
		// report active > 0, hence ensure() rather than only touching known runs.
		for (const [runName, n] of this.activeByRun.entries()) {
			const r = ensure(runName)
			if (r) r.active = n
		}
		for (const [runName, s] of this.statsByRun.entries()) {
			const r = ensure(runName)
			if (!r) continue
			r.done = s.done
			r.failed = s.failed
			r.total = s.total
			r.percent = s.total ? Math.round(((s.done + s.failed) / s.total) * 100) : 0
		}
		return {
			runs: Array.from(runs.values()),
			total: this.totalPending() + this.active,
			active: this.active
		}
	}

	// Throttled broadcast of the ALL-runs summary to every connected client
	// (not run-scoped -- it's small and everyone benefits from seeing it).
	scheduleGlobalBoard(wait = 300) {
		try {
			broadcastThrottled('queueBoardAll', this.getBoardAll(), 'queueBoardAll', wait)
		} catch (err) {
			logger.error(`${err} error scheduling global queue board`)
		}
	}
}

export const scheduler = new RoundRobinScheduler()
