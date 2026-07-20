<!--
  QueueBoard.vue
  Full-screen "cartoon line" view of the live job queue.

  One row per sample/barcode; each fastq is a dot on that row's line, drawn in
  read order. Colour = state (queued / running / done / error / cancelled).
  The running dot pulses ("report generation"). The rows are drawn in the
  round-robin rotation order, so the top-to-bottom order is literally the order
  the backend cycles through.

  Interactions:
    - drag a row by its handle to change the barcode rotation (which barcode
      gets served first each round)  -> emits "reorder-lanes"
    - click a dot to select it, then Run next / Rerun / Cancel
        Run next -> emits "prioritize"
        Rerun    -> emits "rerun"
        Cancel   -> emits "cancel"
-->
<template>
  <div class="qb-root">
    <div class="qb-head">
      <div class="qb-title">
        <v-icon left color="white">mdi-rotate-3d-variant</v-icon>
        Live queue &mdash; round-robin across {{ rows.length }} {{ rows.length === 1 ? 'sample' : 'samples' }}
        <span class="qb-title-all" v-if="boardAll && boardAll.total">
          &middot; {{ boardAll.total }} job{{ boardAll.total === 1 ? '' : 's' }} queued across all runs
        </span>
      </div>
      <div class="qb-counts">
        <span class="qb-chip running" v-if="totals.running">{{ totals.running }} running</span>
        <span class="qb-chip queued" v-if="totals.queued">{{ totals.queued }} queued</span>
        <span class="qb-chip done" v-if="totals.done">{{ totals.done }} done</span>
        <span class="qb-chip error" v-if="totals.error">{{ totals.error }} error</span>
      </div>
      <v-spacer></v-spacer>
      <v-btn icon dark @click="$emit('close')"><v-icon>mdi-close</v-icon></v-btn>
    </div>

    <div class="qb-hint">
      Drag a row by its <v-icon x-small>mdi-drag</v-icon> handle to change which barcode is read first each round.
      Click any dot to run it next, rerun it, or cancel it.
    </div>

    <div class="qb-board">
      <template v-for="group in groups">
        <!-- run/group header: collapse toggle + aggregate counts + remove-all -->
        <div
          class="qb-group"
          :class="{ 'qb-group--sel': group.name && group.name === selectedRun }"
          :key="'g-' + group.key"
          @click="toggleGroup(group.key)"
        >
          <v-icon small class="qb-group-caret">{{ isCollapsed(group.key) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
          <v-icon small class="qb-group-icon">{{ group.name ? 'mdi-folder-multiple-outline' : 'mdi-flask-outline' }}</v-icon>
          <span class="qb-group-name">{{ group.name || 'Individual samples' }}</span>
          <span class="qb-group-n">{{ group.rows.length }} {{ group.rows.length === 1 ? 'sample' : 'samples' }}</span>
          <span class="qb-group-stats">
            <span class="qb-chip running" v-if="group.running">{{ group.running }} running</span>
            <span class="qb-chip queued" v-if="group.queued">{{ group.queued }} queued</span>
            <span class="qb-chip error" v-if="group.error">{{ group.error }} err</span>
            <span class="qb-chip done" v-if="group.done">{{ group.done }} done</span>
          </span>
          <v-spacer></v-spacer>
          <button
            class="qb-group-removeall"
            v-if="group.samples.length"
            @click.stop="removeAllInGroup(group)"
            title="Remove all samples in this run"
          >
            <v-icon x-small left>mdi-delete-sweep</v-icon>Remove all
          </button>
        </div>

        <!-- child sample rows (hidden when the group is collapsed) -->
        <template v-if="!isCollapsed(group.key)">
          <div
            v-for="row in group.rows"
            :key="row.sample"
            class="qb-row"
            :class="{ 'qb-row--drag': dragIndex === row._gindex, 'qb-row--over': overIndex === row._gindex }"
            draggable="true"
            @dragstart="onDragStart(row._gindex, $event)"
            @dragover.prevent="onDragOver(row._gindex)"
            @drop.prevent="onDrop(row._gindex)"
            @dragend="onDragEnd"
          >
            <div class="qb-anchor">
              <div class="qb-handle" title="Drag to reorder rotation">
                <v-icon small>mdi-drag</v-icon>
              </div>
              <div class="qb-label" :title="row.sample">
                <span class="qb-rank">{{ row._gindex + 1 }}</span>
                {{ row.sample }}
                <span class="qb-rowcount">{{ row.done }}/{{ row.dots.length }}</span>
              </div>
              <button
                class="qb-rowrerun"
                v-if="row.dots.length"
                @click.stop="rerunSample(row.sample)"
                @mouseenter="showTip($event, 'Rerun the entire sample (' + row.sample + ')')"
                @mousemove="moveTip($event)"
                @mouseleave="hideTip"
              >
                <v-icon x-small>mdi-replay</v-icon>
              </button>
            </div>

            <div class="qb-line">
              <div class="qb-track"></div>
              <div class="qb-dots">
                <button
                  v-for="dot in row.dots"
                  :key="dot.index"
                  class="qb-dot"
                  :class="[dot.state, { selected: isSelected(row.sample, dot.index) }]"
                  @click="selectDot(row.sample, dot)"
                  @mouseenter="showTip($event, dotTooltip(row.sample, dot))"
                  @mousemove="moveTip($event)"
                  @mouseleave="hideTip"
                >
                  <span v-if="dot.state === 'running'" class="qb-dot-pulse"></span>
                </button>
                <span v-if="!row.dots.length" class="qb-empty">listening for reads&hellip;</span>
              </div>
            </div>
          </div>
        </template>
      </template>

      <div v-if="!rows.length" class="qb-none">
        No samples in the queue yet. Add a barcode run or samples to begin.
      </div>

      <!-- Other runs' queues. Detailed per-file dots only exist for the run the
           app has currently loaded (selectedRun) -- pulling full job detail for
           every run at once is what used to flood the socket with 1000s of job
           frames. This section instead shows the lightweight ALL-runs counts
           (queueBoardAll) so queued work in other runs is at least visible;
           clicking one switches to it and loads its full detail. -->
      <div v-if="otherRuns.length" class="qb-otherruns">
        <div class="qb-otherruns-head">Other runs with queued jobs</div>
        <div
          v-for="r in otherRuns"
          :key="'other-' + r.run"
          class="qb-otherrun-row"
          @click="$emit('select-run', r.run)"
          title="Switch to this run to see full job detail"
        >
          <v-icon small class="qb-group-icon">mdi-folder-multiple-outline</v-icon>
          <span class="qb-group-name">{{ r.run }}</span>
          <span class="qb-group-n">{{ r.lanes }} {{ r.lanes === 1 ? 'sample' : 'samples' }}</span>
          <v-spacer></v-spacer>
          <span class="qb-chip queued">{{ r.pending }} queued</span>
          <v-icon small class="qb-otherrun-arrow">mdi-chevron-right</v-icon>
        </div>
      </div>
    </div>

    <!-- selected-dot dock: logs panel + action bar -->
    <v-slide-y-reverse-transition>
      <div class="qb-dock" v-if="selected">
        <div class="qb-logpanel" v-if="showLogs">
          <div class="qb-log-head">
            <v-icon small color="#9fb3c8">mdi-text-box-outline</v-icon>
            <span class="qb-log-ttl">{{ selected.sample }} &middot; {{ shortFile(selected.filepath) || 'file #' + selected.index }}</span>
            <span class="qb-sel-state" :class="liveState">{{ stateLabel(liveState) }}</span>
            <v-spacer></v-spacer>
            <button class="qb-log-x" @click="showLogs = false" title="Hide logs">&times;</button>
          </div>
          <pre v-if="selCommand" class="qb-log-cmd">{{ selCommand }}</pre>
          <pre v-if="selLogText" class="qb-log-body">{{ selLogText }}</pre>
          <div v-else class="qb-log-empty">No log output captured for this job yet.</div>
        </div>

        <div class="qb-actionbar">
          <div class="qb-sel-info">
            <span class="qb-dot" :class="liveState" style="position:relative;"></span>
            <strong>{{ selected.sample }}</strong>
            <span class="qb-sel-file">{{ shortFile(selected.filepath) }}</span>
            <span class="qb-sel-state" :class="liveState">{{ stateLabel(liveState) }}</span>
          </div>
          <v-spacer></v-spacer>
          <v-btn small text dark class="mr-2" @click="showLogs = !showLogs">
            <v-icon small left>{{ showLogs ? 'mdi-chevron-down' : 'mdi-text-box-outline' }}</v-icon>
            Logs<span v-if="logCount" class="qb-log-n">{{ logCount }}</span>
          </v-btn>
          <v-btn small color="primary" dark class="mr-2"
                 :disabled="liveState === 'running' || liveState === 'done' || liveState === 'historical'"
                 @click="act('prioritize')">
            <v-icon small left>mdi-arrow-up-bold</v-icon>Run next
          </v-btn>
          <v-btn small color="blue-grey" dark class="mr-2" @click="act('rerun')">
            <v-icon small left>mdi-replay</v-icon>Rerun file
          </v-btn>
          <v-btn small color="blue-grey darken-2" dark class="mr-2" @click="rerunSample(selected.sample)">
            <v-icon small left>mdi-replay</v-icon>Rerun sample
          </v-btn>
          <v-btn small color="orange darken-1" dark class="mr-2"
                 :disabled="liveState !== 'running' && liveState !== 'queued'"
                 @click="act('cancel')">
            <v-icon small left>mdi-cancel</v-icon>Cancel
          </v-btn>
          <v-btn small text @click="selected = null">Close</v-btn>
        </div>
      </div>
    </v-slide-y-reverse-transition>

    <!-- floating cursor tooltip (escapes overflow / hint-bar clipping) -->
    <div v-if="tip.show" class="qb-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
  </div>
</template>

<script>
export default {
  name: 'QueueBoard',
  props: {
    // { sampleName: [ { index, filepath, status }, ... ] }
    queueList: { type: Object, default: () => ({}) },
    // server round-robin snapshot: { laneOrder:[sample], lanes:[{sample,pending:[idx]}], upNext, total }
    board: { type: Object, default: () => ({}) },
    // ALL-runs counts-only summary: { runs:[{run,pending,lanes}], total, active }
    boardAll: { type: Object, default: () => ({ runs: [], total: 0, active: 0 }) },
    selectedRun: { type: [String, Number], default: null }
  },
  data() {
    return {
      dragIndex: null,
      overIndex: null,
      selected: null,
      showLogs: false,
      // floating cursor tooltip
      tip: { show: false, x: 0, y: 0, text: '' },
      // local rotation order (sample names) so dragging feels instant; synced
      // from the server board whenever it changes.
      laneOrder: [],
      // per-group collapsed state (groupKey -> true). Non-selected runs start
      // collapsed so the board stays readable across many barcode runs.
      collapsedGroups: {}
    }
  },
  watch: {
    'board.laneOrder': {
      immediate: true,
      handler(val) {
        if (Array.isArray(val) && val.length) this.laneOrder = val.slice()
      }
    },
    groups: { immediate: true, handler() { this.syncCollapsed(false) } },
    selectedRun() { this.syncCollapsed(true) }
  },
  computed: {
    // every sample we know about, ordered by the rotation (laneOrder) first,
    // then any extras (e.g. samples with no queued files yet) appended.
    orderedSamples() {
      const keys = Object.keys(this.queueList || {})
      const order = this.laneOrder && this.laneOrder.length ? this.laneOrder : keys
      const seen = new Set()
      const out = []
      order.forEach((s) => { if (!seen.has(s)) { seen.add(s); out.push(s) } })
      keys.forEach((s) => { if (!seen.has(s)) { seen.add(s); out.push(s) } })
      return out
    },
    rows() {
      return this.orderedSamples.map((sample) => {
        const jobs = (this.queueList[sample] || []).filter(Boolean)
        const dots = jobs
          .map((j) => ({
            index: j.index != null ? j.index : 0,
            filepath: j.filepath || (j.config && j.config.filepath) || '',
            state: this.jobState(j),
            logs: (j.status && j.status.logs) || [],
            error: (j.status && j.status.error) || '',
            command: j.command || (j.config && j.config.command) || ''
          }))
          .sort((a, b) => a.index - b.index)
        const done = dots.filter((d) => d.state === 'done' || d.state === 'historical').length
        return { sample, dots, done }
      })
    },
    // Bucket rows into their parent run/group (the "<group>__<label>" id prefix),
    // preserving the rotation order. Each row keeps its global index so drag
    // reordering still maps back into the flat laneOrder.
    groups() {
      const SEP = '__'
      const order = []
      const map = new Map()
      this.rows.forEach((row, gi) => {
        const i = row.sample ? row.sample.indexOf(SEP) : -1
        const name = i > 0 ? row.sample.slice(0, i) : null
        const key = name || '__individual__'
        if (!map.has(key)) {
          const g = { key, name, rows: [], samples: [], total: 0, done: 0, running: 0, queued: 0, error: 0 }
          map.set(key, g); order.push(g)
        }
        const g = map.get(key)
        g.rows.push(Object.assign({}, row, { _gindex: gi }))
        g.samples.push(row.sample)
        row.dots.forEach((d) => {
          g.total++
          if (d.state === 'running') g.running++
          else if (d.state === 'error') g.error++
          else if (d.state === 'done' || d.state === 'historical') g.done++
          else if (d.state === 'cancelled') { /* ignore */ }
          else g.queued++
        })
      })
      return order
    },
    totals() {
      const c = { running: 0, queued: 0, done: 0, error: 0 }
      this.rows.forEach((r) => r.dots.forEach((d) => {
        if (d.state === 'running') c.running++
        else if (d.state === 'error' || d.state === 'cancelled') c.error += d.state === 'error' ? 1 : 0
        else if (d.state === 'done' || d.state === 'historical') c.done++
        else c.queued++
      }))
      return c
    },
    // Other runs (besides the one currently loaded) that have jobs sitting in
    // the scheduler, from the lightweight ALL-runs summary.
    otherRuns() {
      const all = (this.boardAll && this.boardAll.runs) || []
      return all
        .filter((r) => r && r.run !== this.selectedRun && r.pending > 0)
        .sort((a, b) => b.pending - a.pending)
    },
    // live dot for the current selection, re-read from rows so logs/state stay
    // fresh as the backend streams updates for a running job.
    selDot() {
      if (!this.selected) return null
      const r = this.rows.find((r) => r.sample === this.selected.sample)
      if (!r) return null
      return r.dots.find((d) => d.index === this.selected.index) || null
    },
    liveState() {
      return (this.selDot && this.selDot.state) || (this.selected && this.selected.state) || 'queued'
    },
    selCommand() {
      return this.selDot ? this.selDot.command : ''
    },
    // combine captured log lines + stderr (kraken2 writes progress to stderr)
    selLogText() {
      if (!this.selDot) return ''
      const lines = (this.selDot.logs || []).map((l) => (typeof l === 'string' ? l : JSON.stringify(l)))
      if (this.selDot.error) lines.push(this.selDot.error)
      return lines.join('\n').trim()
    },
    logCount() {
      return this.selDot ? (this.selDot.logs || []).length : 0
    }
  },
  methods: {
    jobState(job) {
      // kraken2 writes normal progress to stderr (captured into status.error),
      // so a non-empty error string is NOT a failure. Only success===false or a
      // non-zero exit code is a real error.
      const s = (job && job.status) || {}
      if (s.running) return 'running'
      if (s.cancelled) return 'cancelled'
      if (s.success === true) return s.historical ? 'historical' : 'done'
      if (s.success === false || (s.code != null && s.code !== 0)) return 'error'
      if (s.paused) return 'paused'
      if (s.preload) return 'preload'
      return 'queued'
    },
    stateLabel(st) {
      return ({ running: 'Generating report', queued: 'Queued', error: 'Error',
        done: 'Done', historical: 'Done (cached)', cancelled: 'Cancelled',
        paused: 'Paused', preload: 'Preloaded' })[st] || st
    },
    shortFile(fp) {
      if (!fp) return ''
      const parts = String(fp).split('/')
      return parts[parts.length - 1]
    },
    dotTooltip(sample, dot) {
      return `${sample} · ${this.shortFile(dot.filepath) || 'file #' + dot.index} — ${this.stateLabel(dot.state)}`
    },
    isSelected(sample, index) {
      return this.selected && this.selected.sample === sample && this.selected.index === index
    },
    selectDot(sample, dot) {
      if (this.isSelected(sample, dot.index)) { this.selected = null; return }
      this.selected = { sample, index: dot.index, filepath: dot.filepath, state: dot.state }
    },
    act(kind) {
      if (!this.selected) return
      this.$emit(kind, { sample: this.selected.sample, index: this.selected.index })
      if (kind === 'cancel') this.selected = null
    },
    // rerun every fastq for a sample (index -1 => full-sample rerun on the server)
    rerunSample(sample) {
      this.hideTip()
      this.$emit('rerun', { sample, index: -1 })
    },
    // ---- group collapse ----
    isCollapsed(key) { return !!this.collapsedGroups[key] },
    toggleGroup(key) { this.$set(this.collapsedGroups, key, !this.collapsedGroups[key]) },
    // Decide which groups are open: the one matching the selected run stays open
    // and the rest collapse. If nothing matches the selected run, the first group
    // is left open so the board is never entirely empty. `force` re-applies the
    // rule even to groups the user has already toggled (used when selectedRun
    // changes); otherwise only newly-seen groups get a default.
    syncCollapsed(force) {
      const groups = this.groups
      if (!groups.length) return
      const anyMatch = groups.some((g) => g.name && g.name === this.selectedRun)
      groups.forEach((g, i) => {
        if (force || !(g.key in this.collapsedGroups)) {
          const expanded = anyMatch ? (g.name === this.selectedRun) : (i === 0)
          this.$set(this.collapsedGroups, g.key, !expanded)
        }
      })
    },
    // Ask the host to remove every sample in this run (host shows the confirm
    // dialog + batches the delete).
    removeAllInGroup(group) {
      this.hideTip()
      this.$emit('remove-all-samples', { run: group.name, samples: group.samples.slice() })
    },
    // ---- floating cursor tooltip ----
    showTip(ev, text) {
      this.tip = { show: true, text, x: ev.clientX, y: ev.clientY }
      this.placeTip(ev)
    },
    moveTip(ev) {
      if (this.tip.show) this.placeTip(ev)
    },
    placeTip(ev) {
      const pad = 14
      let x = ev.clientX + pad
      let y = ev.clientY - 10
      // flip away from the right / top edges so it never spills off-screen
      const w = 240
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad
      if (y < 8) y = ev.clientY + pad + 8
      if (x < 8) x = 8
      this.tip.x = x
      this.tip.y = y
    },
    hideTip() {
      this.tip.show = false
    },
    // ---- row drag reorder ----
    onDragStart(ri, ev) {
      this.dragIndex = ri
      if (ev && ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move' }
    },
    onDragOver(ri) { this.overIndex = ri },
    onDrop(ri) {
      const from = this.dragIndex
      const to = ri
      if (from == null || from === to) { this.onDragEnd(); return }
      const order = this.orderedSamples.slice()
      const [moved] = order.splice(from, 1)
      order.splice(to, 0, moved)
      this.laneOrder = order
      this.$emit('reorder-lanes', order)
      this.onDragEnd()
    },
    onDragEnd() { this.dragIndex = null; this.overIndex = null }
  }
}
</script>

<style scoped>
.qb-root { display:flex; flex-direction:column; height:100%; background:#0f1722; color:#e6edf3; }
.qb-head { display:flex; align-items:center; gap:14px; padding:14px 18px; background:#16263a; }
.qb-title { font-size:1.05rem; font-weight:600; display:flex; align-items:center; }
.qb-counts { display:flex; gap:6px; }
.qb-chip { font-size:.72rem; padding:2px 8px; border-radius:10px; font-weight:600; }
.qb-chip.running { background:#1d4ed8; color:#fff; }
.qb-chip.queued { background:#37475a; color:#cbd5e1; }
.qb-chip.done { background:#15803d; color:#fff; }
.qb-chip.error { background:#b91c1c; color:#fff; }
.qb-hint { padding:8px 18px; font-size:.78rem; color:#9fb3c8; background:#111d2b; border-bottom:1px solid #1f2f44; }
.qb-board { flex:1; overflow-x:auto; overflow-y:auto; padding:10px 14px 90px; }
.qb-row {
  display:flex; align-items:center; gap:10px; padding:8px 6px; border-radius:8px;
  transition:background .12s ease, transform .12s ease; min-width:max-content;
}
.qb-row:hover { background:#16222f; }
.qb-row--drag { opacity:.5; }
/* run/group header */
.qb-group {
  position:sticky; left:0; z-index:11;
  display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;
  padding:8px 10px; margin:6px 0 2px; border-radius:8px;
  background:#16263a; border:1px solid #21344a; min-width:max-content;
}
.qb-group:hover { background:#1b2f47; }
.qb-group--sel { border-color:#3b82f6; box-shadow:inset 3px 0 0 #3b82f6; }
.qb-group-caret, .qb-group-icon { color:#9fb3c8; }
.qb-group-name { font-weight:700; font-size:.9rem; color:#e6edf3; }
.qb-group-n { color:#7d93a8; font-size:.75rem; }
.qb-group-stats { display:flex; gap:5px; margin-left:4px; }
.qb-group-removeall {
  display:flex; align-items:center; gap:2px; flex:0 0 auto;
  background:#3a1d1d; color:#fca5a5; border:1px solid #6b2b2b; border-radius:7px;
  padding:3px 9px; font-size:.74rem; font-weight:600; cursor:pointer;
  transition:background .12s ease, color .12s ease, border-color .12s ease;
}
.qb-group-removeall:hover { background:#dc2626; color:#fff; border-color:#dc2626; }
.qb-row--over { background:#1c3147; outline:1px dashed #3b82f6; }
/* sticky left anchor: handle + label + rerun button stay fixed while dots scroll */
.qb-anchor {
  position:sticky; left:0; z-index:10;
  display:flex; align-items:center; gap:8px; flex:0 0 auto;
  background:inherit; padding-right:8px;
}
.qb-row:hover .qb-anchor { background:#16222f; }
.qb-row--over .qb-anchor { background:#1c3147; }
.qb-handle { cursor:grab; color:#67809a; display:flex; }
.qb-handle:active { cursor:grabbing; }
.qb-label {
  width:190px; min-width:190px; font-size:.85rem; font-weight:600; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px;
}
.qb-rank {
  background:#274157; color:#9fc4e6; border-radius:50%;
  width:18px; height:18px; font-size:.7rem; display:inline-flex; align-items:center; justify-content:center;
}
.qb-rowcount { color:#7d93a8; font-weight:400; font-size:.74rem; margin-left:4px; }
.qb-line { position:relative; flex:1; min-width:0; min-height:30px; display:flex; align-items:center; }
.qb-track { position:absolute; left:0; right:0; top:50%; height:2px; background:#22344a; z-index:0; }
/* dots flow freely; the whole board scrolls horizontally instead */
.qb-dots {
  position:relative; z-index:1; flex:1;
  display:flex; align-items:center; gap:6px;
  overflow:visible; padding:7px 4px;
}
.qb-dot {
  position:relative; z-index:1; flex:0 0 auto; width:16px; height:16px; border-radius:50%; border:2px solid transparent;
  padding:0; cursor:pointer; background:#3a4d63; transition:transform .1s ease, box-shadow .1s ease;
}
.qb-dot:hover { transform:scale(1.25); z-index:5; }
.qb-dot.selected { box-shadow:0 0 0 3px #fde047; }
.qb-dot.queued { background:#52677d; }
.qb-dot.done, .qb-dot.historical { background:#22c55e; }
.qb-dot.error { background:#ef4444; }
.qb-dot.cancelled { background:#475569; opacity:.5; }
.qb-dot.paused { background:#f59e0b; }
.qb-dot.preload { background:#38bdf8; }
.qb-dot.running {
  background:#3b82f6; border-color:#93c5fd;
  animation:qb-breathe 1.6s ease-in-out infinite;
}
.qb-dot-pulse {
  position:absolute; inset:-4px; border-radius:50%; border:2px solid #60a5fa;
  animation:qb-pulse 1.5s cubic-bezier(.3,.1,.3,1) infinite;
}
/* second, offset ring for a layered "sonar" feel */
.qb-dot-pulse::after {
  content:""; position:absolute; inset:-4px; border-radius:50%; border:2px solid #60a5fa;
  animation:qb-pulse 1.5s cubic-bezier(.3,.1,.3,1) infinite; animation-delay:.75s;
}
@keyframes qb-pulse {
  0% { transform:scale(.65); opacity:.85; }
  70% { opacity:0; }
  100% { transform:scale(1.7); opacity:0; }
}
@keyframes qb-breathe {
  0%, 100% { box-shadow:0 0 0 0 rgba(96,165,250,0); }
  50% { box-shadow:0 0 6px 1px rgba(96,165,250,.55); }
}
@media (prefers-reduced-motion: reduce) {
  .qb-dot-pulse, .qb-dot-pulse::after, .qb-dot.running { animation:none; }
}

/* ---- floating cursor tooltip (fixed -> never clipped by hint bar / scrollers) ---- */
.qb-tip {
  position:fixed; z-index:2400; pointer-events:none;
  background:#1e2c3d; color:#e6edf3; border:1px solid #2c4159;
  padding:5px 9px; border-radius:7px; font-size:.74rem; font-weight:500; line-height:1.25;
  max-width:340px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  box-shadow:0 8px 20px rgba(5,12,22,.5);
}

/* per-row "rerun whole sample" button (lives in sticky anchor) */
.qb-rowrerun {
  flex:0 0 auto; width:26px; height:26px; border-radius:7px; border:1px solid #d6d9dd;
  background:#f0f0f0; color:#010306; cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition:background .12s ease, color .12s ease, border-color .12s ease;
}
.qb-rowrerun:hover { background:#89a1e4; color:#fff; border-color:#1d4ed8; }

.qb-empty { color:#64788d; font-size:.76rem; font-style:italic; z-index:1; }
.qb-none { text-align:center; color:#7d93a8; padding:40px; }
.qb-title-all { font-size:.78rem; font-weight:500; color:#9fc4e6; margin-left:6px; }

/* ---- other runs (counts-only) section ---- */
.qb-otherruns { margin-top:14px; padding-top:10px; border-top:1px solid #1f2f44; }
.qb-otherruns-head { font-size:.72rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#7d93a8; padding:0 10px 6px; }
.qb-otherrun-row {
  display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;
  padding:8px 10px; margin:2px 0; border-radius:8px;
  background:#111d2b; border:1px solid #1f2f44; min-width:max-content;
  transition:background .12s ease, border-color .12s ease;
}
.qb-otherrun-row:hover { background:#16263a; border-color:#3b82f6; }
.qb-otherrun-arrow { color:#67809a; }

/* selected-dot dock (logs panel stacked above the action bar) */
.qb-dock { position:absolute; left:0; right:0; bottom:0; display:flex; flex-direction:column; }
.qb-actionbar {
  display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  padding:12px 18px; background:#16263a; border-top:1px solid #24384f;
}
.qb-sel-info { display:flex; align-items:center; gap:10px; font-size:.85rem; }
.qb-sel-file { color:#9fb3c8; font-size:.78rem; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.qb-sel-state { font-size:.72rem; padding:1px 7px; border-radius:9px; background:#274157; }
.qb-sel-state.running { background:#1d4ed8; }
.qb-sel-state.done, .qb-sel-state.historical { background:#15803d; }
.qb-sel-state.error { background:#b91c1c; }
.qb-log-n {
  display:inline-block; margin-left:5px; background:#33485f; color:#cfe0f0;
  border-radius:8px; padding:0 6px; font-size:.66rem; line-height:1.5;
}

/* logs panel */
.qb-logpanel {
  background:#0c141e; border-top:1px solid #24384f; padding:10px 16px 12px;
  max-height:42vh; overflow:auto;
}
.qb-log-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.qb-log-ttl { font-size:.82rem; font-weight:600; color:#e6edf3; }
.qb-log-x {
  background:transparent; border:none; color:#7d93a8; font-size:18px; line-height:1;
  cursor:pointer; padding:0 4px;
}
.qb-log-x:hover { color:#e6edf3; }
.qb-log-cmd {
  margin:0 0 8px; padding:7px 10px; background:#13202f; border:1px solid #21344a; border-radius:7px;
  color:#8fd1ff; font-size:.74rem; white-space:pre-wrap; word-break:break-all;
  font-family:"SFMono-Regular", Menlo, Consolas, monospace;
}
.qb-log-body {
  margin:0; padding:9px 11px; background:#0a121b; border:1px solid #1c2c3e; border-radius:7px;
  color:#c4d2e0; font-size:.74rem; line-height:1.45; white-space:pre-wrap; word-break:break-word;
  font-family:"SFMono-Regular", Menlo, Consolas, monospace;
}
.qb-log-empty { color:#64788d; font-size:.78rem; font-style:italic; padding:6px 2px; }
</style>
