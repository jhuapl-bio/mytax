<!--
  Explore.vue — real-time taxonomic explorer for Kraken2 reports.
  • One taxonomic sunburst PER SAMPLE (grid of cards), live-updating as
    report data streams over the websocket.
  • Additional analytic panels (lollipop / bar / table / sunburst) added on
    demand via the "+ Panel" dropdown, with common-name group labels.
  The sunburst is built with a robust depth-stack walk (not d3.stratify) so it
  never renders empty when a partial report is missing intermediate ranks.
-->
<template>
  <div class="mtx-explore">
    <!-- ============ control bar ============ -->
    <div class="mtx-bar">
      <div class="mtx-bar-group">
        <div class="mtx-bar-label-row">
          <span class="mtx-bar-label">Samples</span>
          <div class="mtx-chip-actions" v-if="availableSamples.length">
            <button class="mtx-chip-action" @click="showAllSamples">Show all</button>
            <button class="mtx-chip-action" @click="hideAllSamples">Hide all</button>
          </div>
        </div>
        <div class="mtx-chips">
          <button
            v-for="s in availableSamples"
            :key="s"
            class="mtx-chip"
            :class="{ active: isSampleVisible(s), focused: s === focusSample && isSampleVisible(s) }"
            @click="toggleSampleVisibility(s)"
          >
            <span class="mtx-chip-dot" :class="{ live: isLive(s) }"></span>
            {{ s | fmtSample }}
            <span class="mtx-chip-count">{{ sampleReadTotal(s) | kfmt }}</span>
          </button>
          <span v-if="availableSamples.length === 0" class="mtx-empty-chip">
            No samples loaded yet
          </span>
        </div>
      </div>

      <div class="mtx-bar-group mtx-bar-controls">
        <label class="mtx-field">
          <span>Rank <InfoIcon text="Taxonomic rank displayed in all panels and charts. Genus is the default — switch to Species for finer resolution or Phylum for a broad overview." /></span>
          <select v-model="primaryRank" class="mtx-select">
            <option v-for="r in rankChoices" :key="r.code" :value="r.code">
              {{ r.label }}
            </option>
          </select>
        </label>
        <label class="mtx-field mtx-field-search">
          <span>Search Organisms <InfoIcon text="Filter all panels to taxa whose name contains this text. Leave blank to show all taxa at the selected rank." /></span>
          <input
            v-model="globalSearch"
            class="mtx-search"
            type="text"
            placeholder="Filter across all organisms..."
          />
        </label>
        <label class="mtx-field mtx-field-link">
          <span>Linked Panels <InfoIcon text="When On, clicking any organism in a chart highlights it across all panels simultaneously, making cross-sample comparison easy." /></span>
          <div class="mtx-link-wrap">
            <input id="mtx-link-panels" v-model="linkPanels" type="checkbox" />
            <label for="mtx-link-panels">{{ linkPanels ? 'On' : 'Off' }}</label>
          </div>
        </label>
        <div v-if="linkPanels && selectedOrganism" class="mtx-linked-chip">
          <span>Selected: <em>{{ selectedOrganism }}</em></span>
          <button class="mtx-btn ghost" @click="selectedOrganism = ''">Clear</button>
        </div>

        <!-- + Panel dropdown -->
        <div class="mtx-add" v-click-outside="closeAddMenu">
          <button class="mtx-btn primary" @click="addMenuOpen = !addMenuOpen">
            ＋ Panel
            <span class="mtx-caret">▾</span>
          </button>
          <div class="mtx-add-menu" v-if="addMenuOpen">
            <div class="mtx-add-menu-head">Choose sample for new panel</div>
            <button v-for="s in availableSamples" :key="s" class="mtx-add-item" @click="addPanel(s)">
              <span class="mtx-add-ico">🧪</span>
              <span>
                <strong>{{ s | fmtSample }}</strong>
                <small>Adds a panel for this sample</small>
              </span>
            </button>
            <div v-if="!availableSamples.length" class="mtx-add-empty">No samples available</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ sunbursts: one per sample ============ -->
    <div class="mtx-section-label mtx-section-label-row" v-if="visibleSamples.length">
      <span>Taxonomic sunbursts · one per sample</span>
      <button class="mtx-btn ghost sm" @click="resetAllSunbursts"
        title="Reset every sunburst back to its root (un-zoom all)">⟲ Reset all</button>
    </div>
    <div class="mtx-grid mtx-sb-grid" v-if="visibleSamples.length">
      <!-- data-sample is what the IntersectionObserver keys on: it is how the
           app knows which panels are on screen, and therefore which samples the
           server should bother encoding taxa for at all. -->
      <section
        v-for="s in visibleSamples"
        :key="'sb-card-' + s"
        :data-sample="s"
        class="mtx-card mtx-sunburst-card"
        :class="{ focused: s === focusSample }"
      >
        <header class="mtx-card-head">
          <h3>
            <span class="mtx-sb-dot" :class="{ live: isLive(s) }"></span>
            {{ s | fmtSample }}
          </h3>
          <div class="mtx-card-actions">
            <span class="mtx-pill" v-if="sampleReadTotal(s)">{{ sampleReadTotal(s) | kfmt }} reads</span>
            <InfoIcon text="Chart type for this sample card. Sunburst shows the full taxonomic hierarchy; Lollipop and Bar show top taxa by read count; Table gives a sortable breakdown." />
            <select class="mtx-select sm" :value="viewOf(s)" @change="setSampleView(s, $event.target.value)"
              title="Plot type for this sample">
              <option v-for="t in panelTypes" :key="t.type" :value="t.type">{{ t.label }}</option>
            </select>
            <button class="mtx-btn ghost" v-if="viewOf(s) === 'sunburst'" @click="resetSunburst(s)"
              :title="'Reset ' + s + ' sunburst to root'">⟲</button>
            <button class="mtx-btn ghost" @click="setFocus(s)" :title="'Focus ' + s">
              {{ s === focusSample ? '★' : '☆' }}
            </button>
          </div>
        </header>
        <div class="mtx-sunburst-body">
          <div class="mtx-sunburst" :ref="'sb-' + safe(s)"></div>
          <div class="mtx-legend" v-if="viewOf(s) === 'sunburst'">
            <div class="mtx-legend-title">{{ legendTitle[s] || rankLabel(primaryRank) }}</div>
            <ul>
              <li v-for="g in pagedLegend(s)" :key="g.taxid != null ? String(g.taxid) : g.name" class="mtx-legend-click" @click="legendZoom(s, g)">
                <span class="mtx-swatch" :style="{ background: g.color }"></span>
                <span class="mtx-legend-name">{{ g.name }}</span>
                <span class="mtx-legend-pct">{{ g.pct.toFixed(1) }}%</span>
              </li>
              <li v-if="!(legends[s] && legends[s].length)" class="mtx-legend-empty">
                building…
              </li>
            </ul>
            <div class="mtx-pg-nav mtx-legend-nav" v-if="legendTotalPages(s) > 1">
              <button :disabled="(legendPage[s] || 0) === 0" @click="stepLegend(s, -1)">‹</button>
              <span>{{ (legendPage[s] || 0) + 1 }} / {{ legendTotalPages(s) }}</span>
              <button :disabled="(legendPage[s] || 0) >= legendTotalPages(s) - 1" @click="stepLegend(s, 1)">›</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ============ extra analytic panels ============ -->
    <div class="mtx-section-label" v-if="panels.length">
      Panels · focused on {{ focusSample | fmtSample }}
    </div>
    <div class="mtx-grid" v-if="panels.length">
      <section v-for="p in panels" :key="p.id" class="mtx-card mtx-panel-card">
        <header class="mtx-card-head">
          <h3>
            <span class="mtx-panel-type">{{ p.type }}</span>
            {{ p.sample | fmtSample }} · {{ rankLabel(p.rank) }}
          </h3>
          <div class="mtx-card-actions">
            <InfoIcon text="Sample this panel is bound to." />
            <select v-model="p.sample" class="mtx-select sm" @change="drawPanelSoon(p)">
              <option v-for="s in availableSamples" :key="'panel-s-' + s" :value="s">{{ s | fmtSample }}</option>
            </select>
            <InfoIcon text="Chart type: Sunburst shows hierarchy; Lollipop and Bar rank taxa by reads; Table gives a sortable breakdown." />
            <select v-model="p.type" class="mtx-select sm" @change="drawPanelSoon(p)">
              <option v-for="t in panelTypes" :key="t.type" :value="t.type">{{ t.label }}</option>
            </select>
            <InfoIcon text="Taxonomic rank for this panel. Overrides the global Rank setting for this panel only." />
            <select v-model="p.rank" class="mtx-select sm" @change="drawPanelSoon(p)">
              <option v-for="r in rankChoices" :key="r.code" :value="r.code">{{ r.label }}</option>
            </select>
            <button class="mtx-btn ghost danger" @click="removePanel(p.id)" title="Remove panel">✕</button>
          </div>
        </header>
        <div class="mtx-panel-body" :ref="'panel-' + p.id"></div>
      </section>
    </div>

    <!-- empty state -->
    <div class="mtx-blank" v-if="availableSamples.length && !visibleSamples.length">
      <div class="mtx-blank-art">◷</div>
      <p>All sample plots are currently hidden. Re-enable a sample chip or click Show all.</p>
    </div>
    <div class="mtx-blank" v-else-if="!availableSamples.length">
      <div class="mtx-blank-art">◷</div>
      <p>Waiting for sample data. As reports are generated and streamed in,
        each sample gets its own sunburst here and panels populate automatically.</p>
    </div>
  </div>
</template>

<script>
import * as d3 from 'd3'
import commonNames from '@/assets/taxon_common_names.json'
import InfoIcon from '@/components/InfoIcon.vue'
import taxaSource from '@/mixins/taxaSource'
import {
  drawBars as canvasBars,
  drawLollipop as canvasLollipop,
  hitRow, redrawQueue
} from '@/render/canvasChart'

// Standard Kraken2 rank hierarchy.
const RANK_ORDER = ['R', 'D', 'K', 'P', 'C', 'O', 'F', 'G', 'S']
const RANK_LABELS = {
  R: 'Root', D: 'Domain', K: 'Kingdom', P: 'Phylum', C: 'Class',
  O: 'Order', F: 'Family', G: 'Genus', S: 'Species'
}
const GROUP_PALETTE = d3.schemeTableau10.concat(d3.schemeSet3)

// The sunburst code below was written against nodes shaped { data: row, children }.
// The store hands back a flatter node, so translate once here rather than
// touching every accessor in the drawing code.
function wrapNodes(nodes) {
  return (nodes || []).map((n) => ({
    data: {
      target: n.name,
      rank_code: n.rank_code,
      taxid: n.taxid,
      depth: n.depth,
      num_fragments_clade: n.value,
      num_fragments_assigned: n.assigned,
      value: n.pct
    },
    children: wrapNodes(n.children)
  }))
}

export default {
  name: 'Explore',
  components: { InfoIcon },
  // taxaSource supplies `sampleData` (lazily hydrated and capped from the
  // columnar store), the display-filter plumbing, and the IntersectionObserver
  // machinery that reports which panels are on screen.
  mixins: [taxaSource],
  // tiny click-outside directive for the + Panel menu (no extra deps)
  directives: {
    'click-outside': {
      bind(el, binding) {
        el.__mtxOutside = (ev) => { if (!(el === ev.target || el.contains(ev.target))) binding.value(ev) }
        document.addEventListener('click', el.__mtxOutside)
      },
      unbind(el) { document.removeEventListener('click', el.__mtxOutside) }
    }
  },
  props: {
    // `samples`, `taxaQuery` and `storeTick` come from the taxaSource mixin.
    // The old `sampleData` prop -- an object holding every parsed row of every
    // sample -- is gone; rows are pulled from the store on demand instead.
    selectedsamples: { type: Array, default: () => [] },
    socket: { type: Object, default: () => ({}) }
  },
  filters: {
    kfmt(v) {
      v = +v || 0
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
      return String(v)
    }
  },
  data() {
    return {
      // Per-sample hydration cap. Panels page through pageSize rows at a time
      // and the sunburst is pruned to a few thousand nodes, so materialising
      // more than this can never affect what is drawn.
      taxaLimit: 3000,
      focusSample: null,
      primaryRank: 'G',
      pageSize: 12,                // rows per page for paginated lollipop/bar/table
      legendPageSize: 8,           // rows per page for the sunburst legend
      cardPage: {},                // { sample: pageIndex } for per-sample card charts
      legendPage: {},              // { sample: pageIndex } for per-sample card legend
      panels: [],
      seeded: false,
      legends: {},                 // { sample: [ {name,pct,color} ] }
      sampleView: {},              // { sample: 'sunburst'|'bar'|'lollipop'|'table' }
      sbFocus: {},                 // { sample: [taxid,...] }  persisted zoom path
      sunburstApi: {},             // { sample: { zoomTaxid(taxid) } }
      groupColor: d3.scaleOrdinal(GROUP_PALETTE),
      pidSeq: 0,
      redrawTimer: null,
      resizeObs: null,
      lastGridWidth: 0,
      liveStamp: {},
      liveNow: Date.now(),
      liveTimer: null,
      addMenuOpen: false,
      globalSearch: '',
      linkPanels: true,
      selectedOrganism: '',
      panelTypes: [
        { type: 'lollipop', label: 'Lollipop', icon: '🎯', hint: 'ranked taxa' },
        { type: 'bar', label: 'Bar chart', icon: '📊', hint: 'read counts' },
        { type: 'table', label: 'Table', icon: '▦', hint: 'taxa + groups' },
        { type: 'sunburst', label: 'Sunburst', icon: '◍', hint: 'full hierarchy' }
      ],
      hiddenSamples: [],
      legendTitle: {}              // { sample: legend heading text }
    }
  },
  computed: {
    availableSamples() {
      return Object.keys(this.sampleData || {}).filter(s => (this.sampleData[s] || []).length)
    },
    visibleSamples() {
      return this.availableSamples.filter(s => this.hiddenSamples.indexOf(s) === -1)
    },
    rankChoices() {
      // The store tracks which rank codes exist as it ingests, so this no longer
      // scans every row of every sample on each render.
      const present = new Set(this.ranksPresent)
      const base = RANK_ORDER.filter(c => c !== 'R' && present.has(c))
      const subs = Array.from(present)
        .filter(c => /^S\d+$/.test(c))
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      const merged = [...base, ...subs]
      const fallback = RANK_ORDER.filter(c => c !== 'R')
      const ordered = merged.length ? merged : fallback
      return ordered.map(c => ({ code: c, label: this.rankLabel(c) }))
    },
    focusRows() {
      return (this.sampleData && this.sampleData[this.focusSample]) || []
    }
  },
  watch: {
    // The old watcher here was `sampleData: { deep: true }`. Vue 2's deep watch
    // walks the ENTIRE watched structure on every change to decide whether to
    // fire -- for an object holding tens of thousands of row objects across
    // every sample, that traversal alone cost more than the redraw it triggered,
    // and it ran on every arriving report.
    //
    // `storeTick` is a single integer the store bumps when it has applied a
    // change. Same trigger, none of the traversal.
    storeTick() { this.onData() },
    samples() { this.onData() },
    'taxaQuery.version'() { this.onData() },
    // The set of rendered cards is derived from which samples have data, so it
    // changes independently of the `samples` prop. Re-attach the observer to
    // whatever is on the page now, otherwise a card that appears when its first
    // report lands is never observed, never considered visible, and never drawn.
    visibleSamples: {
      handler() { this.$nextTick(() => this.refreshVisibilityTargets()) },
      immediate: true
    },
    primaryRank() { this.redraw() },
    globalSearch() { this.cardPage = {}; this.redraw() },
    selectedOrganism() { this.redraw() },
    linkPanels(v) {
      if (!v) this.selectedOrganism = ''
      this.redraw()
    }
  },
  created() {
    // Canvas hit boxes hold references to hydrated taxon rows. Kept off data()
    // on purpose: observing them would make Vue walk every row we just drew,
    // which is the cost the canvas renderer exists to avoid.
    this.hitBoxes = {}
    this._tipEl = null
  },
  mounted() {
    this.onData()
    // Track which sample cards are actually on screen. The mixin reports the
    // list upward, App.vue forwards it to the server, and the server stops
    // encoding taxa for everything else.
    this.observeVisibility('.mtx-sunburst-card')
    this.liveTimer = setInterval(() => {
      this.liveNow = Date.now()
    }, 1000)
    window.addEventListener('resize', this.redraw)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width)
        if (Math.abs(w - this.lastGridWidth) > 8) {
          this.lastGridWidth = w
          this.redraw()
        }
      })
      this.$nextTick(() => { if (this.$el) this.resizeObs.observe(this.$el) })
    }
  },
  beforeDestroy() {
    // Release the canvas tooltip and drop any queued draws for panels that are
    // about to stop existing. Without this, switching tabs leaves the redraw
    // queue holding closures over destroyed components.
    if (this._tipEl && this._tipEl.parentNode) this._tipEl.parentNode.removeChild(this._tipEl)
    this._tipEl = null
    this.hitBoxes = {}
    redrawQueue.clear()

    if (this.liveTimer) {
      clearInterval(this.liveTimer)
      this.liveTimer = null
    }
    if (this.resizeObs) {
      this.resizeObs.disconnect()
      this.resizeObs = null
    }
    window.removeEventListener('resize', this.redraw)
  },
  methods: {
    safe(s) { return (s || '').replace(/[^A-Za-z0-9_-]/g, '_') },
    isSampleVisible(sample) {
      return this.hiddenSamples.indexOf(sample) === -1
    },
    ensureFocusSample() {
      if (!this.visibleSamples.length) {
        this.focusSample = null
        return
      }
      if (!this.focusSample || !this.visibleSamples.includes(this.focusSample)) {
        this.focusSample = this.visibleSamples[0]
      }
    },
    toggleSampleVisibility(sample) {
      const idx = this.hiddenSamples.indexOf(sample)
      if (idx > -1) this.hiddenSamples.splice(idx, 1)
      else this.hiddenSamples.push(sample)
      this.ensureFocusSample()
      this.redraw()
    },
    showAllSamples() {
      this.hiddenSamples = []
      this.ensureFocusSample()
      this.redraw()
    },
    hideAllSamples() {
      this.hiddenSamples = this.availableSamples.slice()
      this.ensureFocusSample()
      this.redraw()
    },
    isSubRank(code) { return /^S\d+$/.test(String(code || '')) },
    rankLabel(code) {
      if (/^S\d+$/.test(String(code || ''))) return `Subspecies (${code})`
      return RANK_LABELS[code] || code
    },
    subspeciesPath(sample, row) {
      if (!row || !this.isSubRank(row.rank_code)) return row ? row.target : ''
      const map = this._taxMap(sample)
      const parts = []
      let cur = row
      let guard = 0
      while (cur && guard++ < 80) {
        if (this.isSubRank(cur.rank_code)) parts.push(`${cur.rank_code} ${cur.target}`)
        if (cur.parenttaxid == null) break
        const parent = map[String(cur.parenttaxid)]
        if (!parent) break
        cur = parent
        if (!this.isSubRank(cur.rank_code) && parts.length) break
      }
      return parts.reverse().join(' > ') || `${row.rank_code} ${row.target}`
    },
    legendNameForRow(sample, row) {
      if (!row) return 'other'
      return this.displayTaxonName(sample, row)
    },
    displayTaxonName(sample, row) {
      if (!row) return ''
      if (this.isSubRank(row.rank_code)) return this.subspeciesPath(sample, row)
      return row.target
    },
    rankMatches(rowRank, selectedRank) {
      const rr = String(rowRank || '')
      const sr = String(selectedRank || '')
      return rr === sr
    },
    // per-sample card legend pagination
    legendTotalPages(s) {
      const n = (this.legends[s] || []).length
      return Math.max(1, Math.ceil(n / this.legendPageSize))
    },
    pagedLegend(s) {
      const list = this.legends[s] || []
      const page = Math.min(this.legendPage[s] || 0, this.legendTotalPages(s) - 1)
      return list.slice(page * this.legendPageSize, (page + 1) * this.legendPageSize)
    },
    stepLegend(s, dir) {
      const cur = this.legendPage[s] || 0
      const next = Math.min(Math.max(0, cur + dir), this.legendTotalPages(s) - 1)
      this.$set(this.legendPage, s, next)
    },
    closeAddMenu() { this.addMenuOpen = false },
    organismMatches(name) {
      const q = (this.globalSearch || '').trim().toLowerCase()
      if (!q) return true
      return String(name || '').toLowerCase().indexOf(q) > -1
    },
    setSelectedOrganism(name) {
      if (!this.linkPanels) return
      this.selectedOrganism = (this.selectedOrganism === name) ? '' : (name || '')
    },
    /**
     * Clicking a legend entry zooms EVERY sunburst that contains that taxon to
     * that level — not just the card whose legend was clicked.
     *
     * Two things have to happen, and only doing the first is why this used to
     * look unreliable:
     *
     *   1. Cards that are currently drawn get an animated zoom through their
     *      live API. Matching is by TAXID first (exact, and the same taxon can
     *      have different display names across samples once aliases and common
     *      names are applied); the legend group name is only a fallback for
     *      grouped rows that have no single taxid.
     *
     *   2. Cards that are NOT currently drawn — off screen, or a sample whose
     *      first report has not landed yet — have no API to call. Their zoom is
     *      persisted into sbFocus instead, which drawSunburstInto() resolves on
     *      its next draw. Without this, scrolling a card into view after a
     *      linked zoom showed it sitting at root, out of step with the rest.
     */
    legendZoom(sample, g) {
      if (!g) return
      const taxid = g.taxid != null ? String(g.taxid) : null

      // (2) persist the focus for every sample that actually contains the taxon
      if (taxid != null) {
        this.availableSamples.forEach((s) => {
          if (s === sample || this.sampleHasTaxon(s, taxid)) {
            this.$set(this.sbFocus, s, taxid)
          }
        })
      }

      // (1) animate the ones that are live
      Object.keys(this.sunburstApi).forEach((s) => {
        const api = this.sunburstApi[s]
        if (!api) return
        if (taxid != null && s !== sample && !this.sampleHasTaxon(s, taxid)) return
        const zoomed = (taxid != null && typeof api.zoomTaxid === 'function')
          ? api.zoomTaxid(taxid)
          : false
        if (taxid == null && !zoomed && typeof api.zoomLegendName === 'function') {
          api.zoomLegendName(g.name)
        }
      })

      // Keep the cross-panel highlight in step with the zoom.
      if (this.linkPanels) this.setSelectedOrganism(g.name)
    },

    // --- live / totals ---
    // "Has this sample changed recently" used to be answered by summing every
    // row's counts into a signature string -- a full pass over the sample, for
    // every sample, on every update. The store already maintains a version
    // counter that increments precisely when something changed, so the same
    // question is now a comparison of two integers.
    sampleLiveSignature(sample) {
      return `${this.storeTick}:${(this.$root.$data && 0) || 0}:${sample ? this.totalFor(sample) : 0}`
    },
    onData() {
      const avail = this.availableSamples
      this.hiddenSamples = this.hiddenSamples.filter(s => avail.includes(s))
      avail.forEach(s => {
        const sig = this.sampleLiveSignature(s)
        if (this.liveStamp[s] !== sig) {
          this.$set(this.liveStamp, s, sig)
          this.$set(this.liveStamp, '_t_' + s, Date.now())
        }
      })
      this.ensureFocusSample()
      avail.forEach((s) => {
        this.$set(this.legendTitle, s, this.rankLabel(this.primaryRank))
      })
      const validRanks = this.rankChoices.map(r => r.code)
      const fallbackRank = validRanks.includes('G') ? 'G' : (validRanks[0] || 'S')
      if (validRanks.length && !validRanks.includes(this.primaryRank)) {
        this.primaryRank = fallbackRank
      }
      this.panels.forEach((p) => {
        if (validRanks.length && !validRanks.includes(p.rank)) {
          this.$set(p, 'rank', fallbackRank)
        }
      })
      this.redraw()
    },
    isLive(s) {
      return this.liveNow - (this.liveStamp['_t_' + s] || 0) < 4000
    },
    sampleReadTotal(s) {
      // The store tracks this as it applies deltas, so it is a lookup rather
      // than a scan over every row of the sample on every render.
      return this.totalFor(s)
    },
    setFocus(s) {
      this.focusSample = s
      // A focused sample is the one the user is actually reading, so ask the
      // server for its full taxon table rather than the top-N summary every
      // other visible sample gets.
      this.requestFullDetail(s)
      this.redraw()
    },

    // --- per-sample card view type ---
    viewOf(s) { return this.sampleView[s] || 'sunburst' },
    setSampleView(s, type) {
      this.$set(this.sampleView, s, type)
      this.$nextTick(() => this.drawSampleCard(s))
    },

    // --- panels ---
    mkPanel(sample, type, rank) { return { id: ++this.pidSeq, sample, type, rank, page: 0 } },
    addPanel(sample) {
      this.addMenuOpen = false
      if (!sample) return
      const p = this.mkPanel(sample, 'sunburst', this.primaryRank)
      this.panels.push(p)
      this.drawPanelSoon(p)
    },
    removePanel(id) { this.panels = this.panels.filter(p => p.id !== id) },
    cyclePanel(p) {
      const order = ['lollipop', 'bar', 'table', 'sunburst']
      p.type = order[(order.indexOf(p.type) + 1) % order.length]
      this.drawPanelSoon(p)
    },

    // --- common-name group resolution via lineage walk ---
    commonGroup(sample, row) {
      const direct = commonNames.by_scientific_name[row.target] ||
        commonNames.by_taxid[String(row.taxid)]
      if (direct) return direct
      const map = this._taxMap(sample)
      let cur = row, guard = 0
      while (cur && guard++ < 60) {
        const hit = commonNames.by_scientific_name[cur.target] ||
          commonNames.by_taxid[String(cur.taxid)]
        if (hit) return hit
        cur = map[String(cur.parenttaxid)]
      }
      return null
    },
    _taxMap(sample) {
      const rows = (this.sampleData && this.sampleData[sample]) || []
      const m = {}
      rows.forEach(r => { m[String(r.taxid)] = r })
      return m
    },

    // --- top taxa at a rank ---
    topTaxa(sample, rank, n) {
      const rows = (this.sampleData && this.sampleData[sample]) || []
      return rows
        .filter(r => this.rankMatches(r.rank_code, rank) && r.taxid !== -1)
        .filter(r => this.organismMatches(r.target))
        .filter(r => !this.linkPanels || !this.selectedOrganism || r.target === this.selectedOrganism)
        .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
        .slice(0, n)
        .map(r => {
          const common = this.commonGroup(sample, r)
          const displayName = this.displayTaxonName(sample, r)
          return {
          name: r.target,
          displayName,
          common,
          group: this.isSubRank(r.rank_code) ? displayName : (common || r.target),
          reads: r.num_fragments_clade,
          pct: r.value,
          taxid: r.taxid,
          rank: r.rank_code
        }})
    },

    // all taxa at a rank (no topN slice) — used for paginated panels
    topTaxaAll(sample, rank, opts = {}) {
      const rows = (this.sampleData && this.sampleData[sample]) || []
      const withinTaxids = opts.withinTaxids || null
      return rows
        .filter(r => this.rankMatches(r.rank_code, rank) && r.taxid !== -1)
        .filter(r => !withinTaxids || withinTaxids.has(String(r.taxid)))
        .filter(r => this.organismMatches(r.target))
        .filter(r => !this.linkPanels || !this.selectedOrganism || r.target === this.selectedOrganism)
        .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
        .map(r => {
          const common = this.commonGroup(sample, r)
          const displayName = this.displayTaxonName(sample, r)
          return {
          name: r.target,
          displayName,
          common,
          group: this.isSubRank(r.rank_code) ? displayName : (common || r.target),
          reads: r.num_fragments_clade,
          pct: r.value,
          taxid: r.taxid,
          rank: r.rank_code
        }})
    },

    // --- redraw orchestration ---
    //
    // Two changes from the original, both aimed at the same thing: never do
    // work for a chart nobody can see, and never do all the work in one go.
    //
    //   1. Only cards scrolled into view are drawn (isVisible() is backed by an
    //      IntersectionObserver in the taxaSource mixin). On a 24-barcode run
    //      with four cards on screen, that is a 6x reduction before any other
    //      optimisation applies.
    //   2. Draws are queued rather than executed inline. redrawQueue coalesces
    //      duplicate requests per card and spends a bounded slice of each
    //      animation frame drawing, so a burst of updates degrades into a
    //      progressive repaint instead of a dropped frame.
    redraw() {
      clearTimeout(this.redrawTimer)
      this.redrawTimer = setTimeout(() => {
        this.$nextTick(() => {
          this.visibleSamples.forEach((s) => {
            if (!this.isVisible(s)) return
            redrawQueue.schedule(`card:${s}`, () => this.drawSampleCard(s))
          })
          Object.keys(this.sunburstApi).forEach((s) => {
            if (!this.visibleSamples.includes(s)) this.$delete(this.sunburstApi, s)
          })
          this.panels.forEach((p) => {
            redrawQueue.schedule(`panel:${p.id}`, () => this.drawPanel(p))
          })
        })
      }, 60)
    },
    drawPanelSoon(p) { this.$set(p, 'page', 0); this.$nextTick(() => this.drawPanel(p)) },

    // draw one per-sample card according to its selected plot type
    drawSampleCard(sample) {
      const host = this.$refs['sb-' + this.safe(sample)]
      const el = Array.isArray(host) ? host[0] : host
      if (!el) return
      const type = this.viewOf(sample)
      if (type === 'sunburst') {
        // Sunbursts use the d3 renderer, cards included.
        //
        // I briefly swapped the per-sample cards to a canvas renderer for the
        // draw-cost win. That was the wrong trade: it dropped the animated zoom
        // transition, the legend (which is populated as a side effect of the d3
        // path's refreshLegend), and the zoom API that lets one card's legend
        // drive every other card. Those are the things that make this view
        // usable, and they are not worth a few milliseconds of paint.
        //
        // The cost is contained instead by only ever drawing sunbursts that are
        // actually on screen (see redraw / isVisible) and by only mounting one
        // tab at a time. Bar/lollipop panels, which have no equivalent
        // interaction to lose, still render on canvas.
        this.drawSunburstInto(el, sample, { legendRank: this.primaryRank })
        return
      }
      this.$delete(this.sunburstApi, sample)
      this.drawPaginated(
        el, sample, this.primaryRank, type,
        this.cardPage[sample] || 0,
        (n) => { this.$set(this.cardPage, sample, n); this.drawSampleCard(sample) },
        'No taxa at ' + this.rankLabel(this.primaryRank) + ' rank yet'
      )
    },

    // Draw a paginated lollipop/bar/table into `el`. `page` is the current page,
    // `setPage(n)` persists+redraws. Search/link filters are applied upstream in
    // topTaxaAll, so this just slices the full ranked list by pageSize.
    drawPaginated(el, sample, rank, type, page, setPage, emptyMsg) {
      const allData = this.topTaxaAll(sample, rank)
      d3.select(el).selectAll('*').remove()
      if (!allData.length) {
        d3.select(el).append('div').attr('class', 'mtx-nodata')
          .text(emptyMsg || ('No taxa at ' + this.rankLabel(rank) + ' rank for ' + sample))
        return
      }
      const totalPages = Math.max(1, Math.ceil(allData.length / this.pageSize))
      const pg = Math.min(page || 0, totalPages - 1)
      if (pg !== page) { setPage(pg); return }
      const data = allData.slice(pg * this.pageSize, (pg + 1) * this.pageSize)
      // Wrap nav + chart in a column so the pagination is always a full-width
      // block ABOVE the chart/table — the parent card container is a centred
      // flex row, which otherwise pushed the pager to the left of the plot.
      const wrap = document.createElement('div')
      wrap.className = 'mtx-paginated'
      el.appendChild(wrap)
      if (totalPages > 1) this.appendPageNav(wrap, pg, totalPages, setPage, { top: true })
      const chartHost = document.createElement('div')
      chartHost.className = 'mtx-paginated-chart'
      wrap.appendChild(chartHost)
      const key = `${sample}:${type}:${rank}:${pg}`
      if (type === 'table') this.drawTable(chartHost, data)
      else if (type === 'lollipop') this.drawLollipop(chartHost, data, key)
      else if (type === 'bar') this.drawBar(chartHost, data, key)
    },

    // Shared prev / "n / total" / next nav used by paginated charts.
    appendPageNav(el, page, totalPages, setPage, opts = {}) {
      const nav = document.createElement('div')
      nav.className = 'mtx-pg-nav' +
        (opts.top ? ' mtx-pg-nav-top' : '') +
        (opts.topRight ? ' mtx-pg-nav-top-right' : '')
      const prev = document.createElement('button')
      prev.textContent = '‹'; prev.disabled = page === 0
      prev.addEventListener('click', () => setPage(page - 1))
      const info = document.createElement('span')
      info.textContent = `${page + 1} / ${totalPages}`
      const next = document.createElement('button')
      next.textContent = '›'; next.disabled = page >= totalPages - 1
      next.addEventListener('click', () => setPage(page + 1))
      nav.appendChild(prev); nav.appendChild(info); nav.appendChild(next)
      if ((opts.top || opts.topRight) && el.firstChild) {
        el.insertBefore(nav, el.firstChild)
      } else {
        el.appendChild(nav)
      }
    },

    // ============ ROBUST TREE BUILD (depth-stack, no stratify) ============
    // Returns a d3.hierarchy root or null. Works even if intermediate ranks
    // are missing from a partial report, because parents are resolved by the
    // nearest shallower row rather than by taxid links.
    // Deepest structural ring that actually carries content. A level counts as
    // populated if more than one node sits at it (real branching) or it holds a
    // meaningful share of the reads. Returns ring count = deepest populated
    // depth + 1, so ringUnit = (radius / this) makes the populated rings fill
    // the dial while lone deep lineages get clamped to the rim. Falls back to
    // the full depth when nothing stands out.
    effectiveRings(root, fullRings) {
      const byDepth = {}
      let rootReads = 0
      root.each(d => {
        (byDepth[d.depth] || (byDepth[d.depth] = [])).push(d)
        const r = d.data && d.data.data ? +d.data.data.num_fragments_clade || 0 : 0
        if (r > rootReads) rootReads = r
      })
      const floor = rootReads * 0.005 // 0.5% of the largest clade
      let deepest = 0
      Object.keys(byDepth).forEach(k => {
        const lvl = +k
        const nodes = byDepth[k]
        let reads = 0
        nodes.forEach(n => { reads += (n.data && n.data.data ? +n.data.data.num_fragments_clade || 0 : 0) })
        if ((nodes.length > 1 || reads >= floor) && lvl > deepest) deepest = lvl
      })
      return Math.max(2, Math.min(fullRings, deepest + 1))
    },

    // Hierarchy for the sunburst.
    //
    // This used to rebuild the tree from the sample's flat row array on every
    // draw: filter, re-derive parents by walking indentation with a depth
    // stack, allocate a node per row, then hand the whole thing to
    // d3.hierarchy().sum().sort(). For a 30k-row report that is ~90k object
    // allocations per redraw, per sample.
    //
    // Parent pointers already exist in the store's dictionary (resolved once,
    // server-side), so the tree can be assembled directly -- and pruned to the
    // top `maxNodes` clades first, because a sunburst cannot render more arcs
    // than it has pixels anyway.
    buildHierarchy(sample) {
      const tree = this.hierarchyFor(sample, { maxNodes: 1500 })
      if (!tree) return null
      const q = (this.globalSearch || '').trim().toLowerCase()
      const selected = (this.linkPanels && this.selectedOrganism) ? this.selectedOrganism : ''

      // Search/link filtering prunes branches that contain no match, keeping
      // ancestors so the dial stays connected.
      const prune = (node) => {
        const kids = (node.children || []).map(prune).filter(Boolean)
        const selfMatch =
          (!q || String(node.name || '').toLowerCase().indexOf(q) > -1) &&
          (!selected || node.name === selected)
        if (!kids.length && !selfMatch) return null
        return { ...node, children: kids }
      }
      const pruned = (q || selected) ? prune(tree) : tree
      if (!pruned) {
        // A linked click can target a taxon that this sample does not contain.
        // Keep this sample's dial usable instead of redrawing it as empty.
        if (selected && !q) return this.buildHierarchyFromTree(tree)
        return null
      }

      return this.buildHierarchyFromTree(pruned)
    },
    buildHierarchyFromTree(tree) {
      try {
        return d3.hierarchy(
          { data: { target: tree.name, rank_code: tree.rank_code, taxid: tree.taxid, num_fragments_clade: tree.value, value: tree.pct }, children: wrapNodes(tree.children) },
          (d) => d.children
        )
          .sum((d) => (d.children && d.children.length) ? 0 : Math.max(0, +d.data.num_fragments_clade || 0))
          .sort((a, b) => b.value - a.value)
      } catch (e) {
        return null
      }
    },

    // ============ ZOOMABLE SUNBURST ============
    // back-compat alias (called by other code paths)
    drawSunburst(sample) { this.drawSampleCard(sample) },

    // Reset a single sunburst back to its root (un-zoom). Uses the live API for
    // an animated transition when available; otherwise clears the persisted
    // focus and redraws (e.g. when the card is currently showing a leaf pie).
    resetSunburst(sample) {
      const api = this.sunburstApi[sample]
      this.$set(this.sbFocus, sample, null)
      if (api && typeof api.reset === 'function') {
        api.reset()
      } else {
        this.drawSampleCard(sample)
      }
    },
    // Reset every visible sunburst panel to its root.
    resetAllSunbursts() {
      this.visibleSamples.forEach(s => this.resetSunburst(s))
    },

    // Click a slice to zoom: the clicked node expands to the full circle and its
    // subtree fills the rings (the classic zoomable sunburst). The current focus
    // is persisted per-sample in this.sbFocus so streaming redraws keep the zoom.
    drawSunburstInto(el, sample, opts = {}) {
      const legendRank = opts.legendRank || null
      const inlineLegend = !!opts.inlineLegend
      const hadContent = !!(el && el.childNodes && el.childNodes.length)

      // Panels render an in-card legend to the RIGHT of the dial; the per-sample
      // cards keep using the Vue-template legend (this.legends).
      let chartEl = el
      let legendEl = null

      const root = this.buildHierarchy(sample)
      if (!root || !root.value) {
        if (!hadContent) {
          d3.select(chartEl).selectAll('*').remove()
          d3.select(chartEl).append('div').attr('class', 'mtx-nodata').text('building…')
        }
        return
      }

      const minDial = inlineLegend ? 260 : 320
      const availDial = Math.max(chartEl.clientWidth || el.clientWidth || 0, minDial)
      const maxDial = inlineLegend ? 960 : 1400
      const size = Math.min(maxDial, availDial)
      // `rings` is the true depth of the tree; the partition is laid out over it
      // so every node keeps its correct structural ring index.
      const rings = (root.height || 1) + 1
      // But we size the rings off the deepest *populated* level, not the deepest
      // node. Kraken taxonomy frequently contains a single freak lineage that
      // descends many extra ranks (e.g. one strain trailing out to indentation
      // depth 62 while all the real species sit near depth 10). Dividing the
      // radius by that inflated depth crushes the meaningful rings into the
      // centre and makes the dial look "zoomed out". Capping at the populated
      // depth lets the real content fill the SVG; rarer deeper nodes are clamped
      // to the rim instead of shrinking everything.
      const effRings = this.effectiveRings(root, rings)
      const ringUnit = (size / 2) / effRings
      const rMax = size / 2
      d3.partition().size([2 * Math.PI, rings])(root)

      // resolve persisted focus (by taxid) → default to root
      let focus = root
      const focTaxid = this.sbFocus[sample]
      if (focTaxid != null) {
        const want = String(focTaxid)
        const hit = root.descendants().find(d => d.data.data && String(d.data.data.taxid) === want)
        if (hit) focus = hit
        else if (hadContent) return
        else this.$set(this.sbFocus, sample, null)
      }

      d3.select(el).selectAll('*').remove()
      chartEl = el
      legendEl = null
      if (inlineLegend) {
        const wrap = document.createElement('div'); wrap.className = 'mtx-sb-wrap'
        chartEl = document.createElement('div'); chartEl.className = 'mtx-sb-chart'
        legendEl = document.createElement('div'); legendEl.className = 'mtx-sb-legend'
        wrap.appendChild(chartEl); wrap.appendChild(legendEl); el.appendChild(wrap)
      }

      // map any node to its own taxon name (used for leaf pies / propagation)
      const groupOf = d => {
        const gdata = d && d.data ? d.data.data : null
        return this.legendNameForRow(sample, gdata)
      }

      // Colour key for an ARC: the ancestor of `d` that sits one ring below the
      // current focus (i.e. a direct child of the focus). Every node in that
      // subtree therefore shares one hue, so a whole branch reads as a single
      // colour and only opacity changes with depth. This re-anchors on zoom:
      // zoom into a Domain and its Kingdoms become the colour groups (3 kingdoms
      // -> 3 colours), each carrying down to all of its descendants. Matches the
      // "Current level" legend (focusLegendData), which colours those same
      // direct children by name.
      const colorKeyOf = d => {
        let n = d
        while (n && n.parent && n.parent !== focus) n = n.parent
        const gdata = n && n.data ? n.data.data : null
        return this.legendNameForRow(sample, gdata)
      }
      const colorOf = d => {
        const base = d3.color(this.groupColor(colorKeyOf(d))) || d3.color('#9bb6cf')
        const rel = Math.max(0, (d.depth - focus.depth) - 1)
        return base.copy({ opacity: Math.max(0.42, 1 - rel * 0.11) })
      }

      // Legend semantics:
      // - At root: strictly show the selected rank (never substitute another rank).
      // - After slice click (non-root focus): show direct children one level down.
      const refreshLegend = (f) => {
        if (legendRank) {
          const useChildren = !!(f && f !== root)
          // At root, pass NO focus node so the legend lists every taxon at the
          // selected rank.
          //
          // This used to pass `root`, which was harmless when the tree was built
          // from every row: restricting to root's descendants restricted to
          // everything. The tree is now pruned to the top N clades for drawing,
          // so passing it here would have silently truncated the legend to
          // whatever survived that prune — the legend is a list and has its own
          // pagination, so it has no reason to inherit the dial's node budget.
          const merged = useChildren
            ? this.focusLegendData(sample, root, f)
            : this.rankLegendData(sample, legendRank, null)
          const title = useChildren ? 'Current level' : this.rankLabel(legendRank)
          if (inlineLegend) {
            this.renderInlineLegend(legendEl, sample, merged, title)
          } else {
            this.$set(this.legends, sample, merged)
            this.$set(this.legendTitle, sample, title)
            this.$set(this.legendPage, sample, 0)
          }
        } else {
          this.buildLegend(sample, root, f)
        }
      }

      // Lowest/leaf slice in focus → render a full-circle pie for that taxon and
      // surface its full detail as the legend, instead of an empty/stuck dial.
      if (focus !== root && (!focus.children || !focus.children.length)) {
        this.renderLeafPie(el, chartEl, legendEl, inlineLegend, sample, focus, root, opts, groupOf, size)
        return
      }

      // project every node into the frame where `p` fills the whole circle
      const project = (d, p) => ({
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth)
      })
      root.each(d => { d.current = project(d, focus) })
      const arcVisible = c => c.x1 > c.x0 && c.y0 >= 1

      const arc = d3.arc()
        .startAngle(d => d.x0).endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(ringUnit * 1.5)
        .innerRadius(d => Math.min(rMax, d.y0 * ringUnit))
        .outerRadius(d => Math.min(rMax, Math.max(d.y0 * ringUnit, d.y1 * ringUnit - 1)))

      const svg = d3.select(chartEl).append('svg')
        .attr('viewBox', [-size / 2, -size / 2, size, size])
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '100%')
        .style('display', 'block')
        .style('font', '10px Inter, system-ui, sans-serif')
      const g = svg.append('g')
      const tip = d3.select(chartEl).append('div').attr('class', 'mtx-tip').style('opacity', 0)
      const self = this

      const center = g.append('g').style('cursor', focus === root ? 'default' : 'zoom-out')
      center.append('circle').attr('r', ringUnit * 0.95).attr('fill', '#fff').attr('opacity', 0.001)

      const centerLabel = svg.append('text').attr('text-anchor', 'middle').attr('dy', '0.32em')
        .style('font-size', '11px').style('font-weight', '700').style('fill', '#274766')
        .style('pointer-events', 'none')

      const path = g.selectAll('path')
        .data(root.descendants().slice(1))
        .join('path')
        .attr('fill', d => colorOf(d))
        .attr('fill-opacity', d => arcVisible(d.current) ? 1 : 0)
        .attr('pointer-events', d => arcVisible(d.current) ? 'auto' : 'none')
        .attr('d', d => arc(d.current))
        .style('cursor', 'pointer')
        .on('mousemove', (ev, d) => {
          const data = d.data.data
          const cn = this.commonGroup(sample, data)
          const label = this.displayTaxonName(sample, data)
          tip.style('opacity', 1)
            .style('left', (ev.offsetX + 14) + 'px')
            .style('top', (ev.offsetY + 8) + 'px')
            .html(`<b>${label}</b>${cn ? ' <i>(' + cn + ')</i>' : ''}<br>` +
              `${this.rankLabel(data.rank_code)} · taxid ${data.taxid}<br>` +
              `${(+data.num_fragments_clade).toLocaleString()} reads · ${data.value}%`)
        })
        .on('mouseleave', () => tip.style('opacity', 0))
        .on('click', (ev, d) => {
          ev.stopPropagation()
          if (!d.children || !d.children.length) {
            // lowest slice → render its full-circle pie directly from the current
            // hierarchy node. (Rebuilding under a selected-organism filter can
            // collapse to <2 rows — e.g. depth gaps after subspecies rollup — which
            // is what produced the stuck "building…" state.)
            const dn = d && d.data && d.data.data
            self.$set(self.sbFocus, sample, dn ? dn.taxid : null)
            d3.select(chartEl).selectAll('*').remove()
            self.renderLeafPie(el, chartEl, legendEl, inlineLegend, sample, d, root, opts, groupOf, size)
            return
          }
          // Zoom this sunburst locally
          zoomTo(d)
          // Propagate to every other sunburst: by taxid where the taxon exists,
          // by legend group name otherwise. Same two-part treatment as
          // legendZoom -- live cards animate, undrawn ones get sbFocus set so
          // they come up already zoomed.
          const nodeData = d.data && d.data.data
          if (nodeData) {
            const zoomName = this.legendNameForRow(sample, nodeData)
            const tx = nodeData.taxid != null ? String(nodeData.taxid) : null
            if (tx != null) {
              self.availableSamples.forEach((s) => {
                if (s !== sample && self.sampleHasTaxon(s, tx)) self.$set(self.sbFocus, s, tx)
              })
            }
            Object.keys(self.sunburstApi).forEach(s => {
              if (s === sample) return
              const api = self.sunburstApi[s]
              if (!api) return
              if (tx != null && !self.sampleHasTaxon(s, tx)) return
              const zoomed = (tx != null && typeof api.zoomTaxid === 'function') ? api.zoomTaxid(tx) : false
              if (tx == null && !zoomed && typeof api.zoomLegendName === 'function') api.zoomLegendName(zoomName)
            })
          }
        })

      const updateCenter = (node) => {
        center.style('cursor', node === root ? 'default' : 'zoom-out')
        centerLabel.text(node !== root ? this.trunc(node.data.data.target, 16) : '')
      }

      const zoomTo = (node) => {
        focus = node || root
        root.each(d => { d.target = project(d, focus) })
        const t = g.transition().duration(720).ease(d3.easeCubicInOut)

        path.transition(t)
          .tween('data', d => {
            const i = d3.interpolate(d.current, d.target)
            return tt => { d.current = i(tt) }
          })
          .filter(function (d) {
            return +this.getAttribute('fill-opacity') || arcVisible(d.target)
          })
          .attr('fill-opacity', d => arcVisible(d.target) ? 1 : 0)
          .attr('pointer-events', d => arcVisible(d.target) ? 'auto' : 'none')
          .attrTween('d', d => () => arc(d.current))

        // re-anchor colours to the new focus: each direct child of the focus (and
        // its whole subtree) gets a single hue, so the dial stays "consistent
        // with the current level" after every zoom.
        path.transition(t).attr('fill', d => colorOf(d))

        const tx = (focus && focus !== root && focus.data && focus.data.data) ? focus.data.data.taxid : null
        self.$set(self.sbFocus, sample, tx)
        updateCenter(focus)
        refreshLegend(focus)
      }

      this.$set(this.sunburstApi, sample, {
        reset: () => zoomTo(root),
        // Returns true when the taxon was found in THIS sample's tree, so the
        // caller can fall back to name matching only where it genuinely missed.
        // Compared as strings: taxids come off the report as text and have been
        // through JSON, so a strict === between a string and a number silently
        // never matched.
        zoomTaxid: (taxid) => {
          if (taxid == null) return false
          const want = String(taxid)
          const hit = root.descendants().find(d => d.data && d.data.data && String(d.data.data.taxid) === want)
          if (!hit) return false
          zoomTo(hit)
          return true
        },
        zoomLegendName: (name) => {
          if (!name) return
          const hit = root.descendants().find(d => {
            if (!d.data || !d.data.data) return false
            const data = d.data.data
            const grp = this.legendNameForRow(sample, data)
            return grp === name
          })
          if (hit) zoomTo(hit)
        }
      })

      center.on('click', () => {
        if (focus !== root) {
          zoomTo(focus.parent || root)
        }
      })

      updateCenter(focus)
      refreshLegend(focus)
    },

    // Build legend rows from ALL taxa at a given rank (panel Rank dropdown).
    // No top-10 cap — the legend itself paginates.
    rankLegendData(sample, rank, focusNode = null) {
      let withinTaxids = null
      if (focusNode && typeof focusNode.descendants === 'function') {
        withinTaxids = new Set(
          focusNode.descendants()
            .map(d => (d && d.data && d.data.data && d.data.data.taxid != null) ? String(d.data.data.taxid) : null)
            .filter(v => v != null)
        )
      }
      const all = this.topTaxaAll(sample, rank, { withinTaxids })
      return all.map(t => ({
        name: t.displayName || t.name,
        taxid: t.taxid,
        pct: t.pct != null ? +t.pct : 0,
        reads: t.reads,
        color: this.groupColor(t.displayName || t.name)
      }))
    },

    // Render an in-panel legend (right of the dial), paginated. Items may carry a
    // `sub` detail line (used by the leaf/pie view to show full taxon info). The
    // current page is stored on the element so nav clicks don't trigger a full
    // panel redraw.
    renderInlineLegend(legendEl, sample, items, titleText) {
      if (!legendEl) return
      const size = this.legendPageSize || 8
      const list = items || []
      const totalPages = Math.max(1, Math.ceil(list.length / size))
      if (legendEl._page == null) legendEl._page = 0
      if (legendEl._page > totalPages - 1) legendEl._page = totalPages - 1
      const page = legendEl._page
      legendEl.innerHTML = ''
      const title = document.createElement('div')
      title.className = 'mtx-legend-title'
      title.textContent = titleText || 'Groups'
      legendEl.appendChild(title)
      if (!list.length) {
        const empty = document.createElement('div')
        empty.className = 'mtx-legend-empty'
        empty.textContent = 'No taxa at this rank'
        legendEl.appendChild(empty)
        return
      }
      const ul = document.createElement('ul')
      list.slice(page * size, (page + 1) * size).forEach(g => {
        const li = document.createElement('li')
        li.className = 'mtx-legend-click'
        const sw = document.createElement('span')
        sw.className = 'mtx-legend-swatch'
        sw.style.background = g.color
        const nm = document.createElement('span')
        nm.className = 'mtx-legend-name'
        nm.textContent = g.name
        const pc = document.createElement('span')
        pc.className = 'mtx-legend-pct'
        pc.textContent = (g.pct != null ? g.pct.toFixed(1) : '0.0') + '%'
        li.appendChild(sw); li.appendChild(nm); li.appendChild(pc)
        if (g.sub) {
          const sub = document.createElement('span')
          sub.className = 'mtx-legend-sub'
          sub.textContent = g.sub
          li.appendChild(sub)
        }
        li.addEventListener('click', () => { if (g.name) this.setSelectedOrganism(g.name) })
        ul.appendChild(li)
      })
      legendEl.appendChild(ul)
      if (totalPages > 1) {
        const nav = document.createElement('div')
        nav.className = 'mtx-pg-nav mtx-legend-nav'
        const prev = document.createElement('button')
        prev.textContent = '‹'; prev.disabled = page === 0
        prev.addEventListener('click', () => { legendEl._page = page - 1; this.renderInlineLegend(legendEl, sample, items, titleText) })
        const info = document.createElement('span')
        info.textContent = `${page + 1} / ${totalPages}`
        const next = document.createElement('button')
        next.textContent = '›'; next.disabled = page >= totalPages - 1
        next.addEventListener('click', () => { legendEl._page = page + 1; this.renderInlineLegend(legendEl, sample, items, titleText) })
        nav.appendChild(prev); nav.appendChild(info); nav.appendChild(next)
        legendEl.appendChild(nav)
      }
    },

    // Full-circle pie for a single (deepest) taxon + its full info as the legend.
    renderLeafPie(el, chartEl, legendEl, inlineLegend, sample, leaf, root, opts, groupOf, size) {
      const data = leaf.data.data
      const color = this.groupColor(groupOf(leaf))
      const avail = chartEl.clientWidth || size || 320
      const sz = Math.max(240, Math.min(avail, 720))
      const svg = d3.select(chartEl).append('svg')
        .attr('viewBox', [-sz / 2, -sz / 2, sz, sz])
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '100%')
        .style('display', 'block')
        .style('font', '10px Inter, system-ui, sans-serif')
      const g = svg.append('g')
      g.append('circle').attr('r', sz / 2 - 2).attr('fill', color).attr('fill-opacity', 0.92)
      g.append('circle').attr('r', sz * 0.22).attr('fill', '#fff')
      g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.15em')
        .style('font-size', '11px').style('font-weight', '700').style('fill', '#274766')
        .text(this.trunc(data.target, 16))
      g.append('text').attr('text-anchor', 'middle').attr('dy', '1.15em')
        .style('font-size', '10px').style('fill', '#5b7088')
        .text((+data.value).toFixed(2) + '%')
      // transparent overlay → click anywhere to zoom back out to the parent
      g.append('circle').attr('r', sz / 2 - 2).attr('fill', 'transparent')
        .style('cursor', 'zoom-out')
        .on('click', () => {
          const parent = leaf.parent
          const tx = (parent && parent !== root && parent.data && parent.data.data) ? parent.data.data.taxid : null
          this.$set(this.sbFocus, sample, tx)
          this.drawSunburstInto(el, sample, opts)
        })

      const cn = this.commonGroup(sample, data)
      const item = {
        name: this.legendNameForRow(sample, data),
        taxid: data.taxid,
        pct: +data.value,
        reads: +data.num_fragments_clade,
        color,
        sub: `${this.rankLabel(data.rank_code)}` +
          `${cn ? ' · ' + cn : ''} · ${(+data.num_fragments_clade).toLocaleString()} reads · taxid ${data.taxid}`
      }
      if (inlineLegend) this.renderInlineLegend(legendEl, sample, [item], 'Selected taxon')
      else this.$set(this.legends, sample, [item])
    },

    focusLegendData(sample, part, focusNode) {
      const focus = focusNode || part
      const baseNode = (focus && focus.children && focus.children.length)
        ? focus
        : ((focus && focus.parent && focus.parent.children && focus.parent.children.length) ? focus.parent : part)
      const kids = (baseNode.children || [])
      if (!kids.length) return []

      const total = d3.sum(kids.map(k => k.value || 0)) || 1
      return kids
        .map((d) => {
          const data = d.data ? d.data.data : null
          const name = data
            ? this.displayTaxonName(sample, data)
            : ((d.data && d.data.name) ? d.data.name : 'other')
          return {
            name,
            taxid: (data && data.taxid != null) ? data.taxid : null,
            pct: ((d.value || 0) / total) * 100,
            color: this.groupColor(name)
          }
        })
        .sort((a, b) => b.pct - a.pct)
    },

    buildLegend(sample, part, focusNode) {
      const legend = this.focusLegendData(sample, part, focusNode)
      this.$set(this.legends, sample, legend)
    },

    // ============ PANELS ============
    drawPanel(p) {
      const host = this.$refs['panel-' + p.id]
      const el = Array.isArray(host) ? host[0] : host
      if (!el) return
      const sample = p.sample || this.focusSample
      if (!sample) return
      if (p.type === 'sunburst') {
        // panel Rank dropdown drives the legend; the dial reframes on slice click
        this.drawSunburstInto(el, sample, { legendRank: p.rank, inlineLegend: true })
        return
      }
      // lollipop / bar / table: all paginated with a fixed page size
      this.drawPaginated(
        el, sample, p.rank, p.type,
        p.page || 0,
        (n) => { this.$set(p, 'page', n); this.drawPanel(p) }
      )
    },
    // -------------------------------------------------------------------
    // Canvas chart renderers.
    //
    // These were d3/SVG: one <g> plus a <text>, a <line>, a <circle> and a
    // <title> per taxon, rebuilt from scratch on every redraw. With a card per
    // barcode that is thousands of live DOM nodes being torn down and recreated
    // every time a report lands -- layout and style recalculation dominate, and
    // it is why the page felt heavy even when idle.
    //
    // A canvas panel is one element no matter how many taxa it shows. Hit
    // testing (tooltips, click-to-select) is done against the hit boxes the
    // renderer returns, which is the same data we just drew.
    // -------------------------------------------------------------------

    // Build a canvas inside `el` and wire pointer handling to `rows`.
    _mountCanvas(el, key, rows, drawFn) {
      const canvas = document.createElement('canvas')
      canvas.className = 'mtx-canvas'
      canvas.style.display = 'block'
      canvas.style.width = '100%'
      el.appendChild(canvas)

      const width = el.clientWidth || 420
      const hits = drawFn(canvas, width)
      this.hitBoxes[key] = hits

      const tip = this._ensureTip()
      canvas.addEventListener('mousemove', (ev) => {
        const rect = canvas.getBoundingClientRect()
        const row = hitRow(this.hitBoxes[key] || [], ev.clientX - rect.left, ev.clientY - rect.top)
        if (!row) { tip.style.display = 'none'; canvas.style.cursor = 'default'; return }
        canvas.style.cursor = 'pointer'
        tip.style.display = 'block'
        tip.style.left = `${ev.clientX + 12}px`
        tip.style.top = `${ev.clientY + 12}px`
        tip.innerHTML = `<strong>${row.name || row.target}</strong>` +
          (row.common ? ` <em>(${row.common})</em>` : '') +
          `<br>${(row.reads != null ? row.reads : row.num_fragments_clade || 0).toLocaleString()} reads` +
          ` (${(row.pct != null ? row.pct : row.value || 0)}%)`
      })
      canvas.addEventListener('mouseleave', () => { tip.style.display = 'none' })
      canvas.addEventListener('click', (ev) => {
        const rect = canvas.getBoundingClientRect()
        const row = hitRow(this.hitBoxes[key] || [], ev.clientX - rect.left, ev.clientY - rect.top)
        if (row) this.setSelectedOrganism(row.name || row.target)
      })
      return canvas
    },

    // One shared tooltip node for the whole tab, rather than an SVG <title> per
    // datum. Created lazily and torn down with the component.
    _ensureTip() {
      if (this._tipEl && document.body.contains(this._tipEl)) return this._tipEl
      const tip = document.createElement('div')
      tip.className = 'mtx-canvas-tip'
      tip.style.cssText = [
        'position:fixed', 'z-index:9999', 'pointer-events:none', 'display:none',
        'background:rgba(15,23,42,.94)', 'color:#fff', 'padding:6px 9px',
        'border-radius:6px', 'font:11px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'box-shadow:0 6px 20px -8px rgba(0,0,0,.6)', 'max-width:280px'
      ].join(';')
      document.body.appendChild(tip)
      this._tipEl = tip
      return tip
    },

    drawLollipop(el, data, key) {
      this._mountCanvas(el, key || 'lolli', data, (canvas, width) => canvasLollipop(canvas, {
        rows: data,
        width,
        rowHeight: 18,
        labelWidth: Math.min(170, Math.max(90, width * 0.36)),
        valueKey: 'reads',
        color: (d) => this.groupColor(d.group),
        highlight: (this.linkPanels && this.selectedOrganism)
          ? (data.find((d) => d.name === this.selectedOrganism) || {}).taxid
          : null
      }))
    },

    drawBar(el, data, key) {
      this._mountCanvas(el, key || 'bar', data, (canvas, width) => canvasBars(canvas, {
        rows: data,
        width,
        rowHeight: 18,
        labelWidth: Math.min(170, Math.max(90, width * 0.36)),
        valueKey: 'reads',
        color: (d) => this.groupColor(d.group),
        highlight: (this.linkPanels && this.selectedOrganism)
          ? (data.find((d) => d.name === this.selectedOrganism) || {}).taxid
          : null
      }))
    },

    drawTable(el, data) {
      const total = d3.sum(data, d => d.reads) || 1
      const tbl = d3.select(el).append('table').attr('class', 'mtx-tbl')
      tbl.append('thead').append('tr').html(
        '<th>Taxon</th><th>Group</th><th class="n">Reads</th><th class="n">%</th>')
      const tb = tbl.append('tbody')
      data.forEach(d => {
        const tr = tb.append('tr').attr('class', (this.linkPanels && this.selectedOrganism && d.name === this.selectedOrganism) ? 'mtx-row-active' : '')
        tr.append('td').html(`<span class="mtx-sci">${d.name}</span><span class="mtx-tid">${d.taxid}</span>`)
        tr.append('td').html(d.common
          ? `<span class="mtx-grp" style="--c:${this.groupColor(d.group)}">${d.common}</span>` : '—')
        tr.append('td').attr('class', 'n').text(d.reads.toLocaleString())
        tr.append('td').attr('class', 'n').html(
          `<span class="mtx-mini"><i style="width:${Math.min(100, (d.reads / total) * 100)}%"></i></span>${d.pct}`)
        tr.style('cursor', 'pointer').on('click', () => this.setSelectedOrganism(d.name))
      })
    },

    trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s },
    kf(v) {
      v = +v || 0
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
      return String(v)
    }
  }
}
</script>

<style scoped>
.mtx-explore {
  --c-ink: #1f2937;
  --c-sub: #5b6573;
  --c-line: #e2e8f0;
  --c-soft: #eef3f7;
  --c-navy: #274766;
  --c-accent: #e63946;
  --c-card: #ffffff;
  text-align: left;
  color: var(--c-ink);
  font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 4px 6px 40px;
}

/* ---- control bar ---- */
.mtx-bar {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start;
  justify-content: space-between;
  background: linear-gradient(180deg, #fbfdff, #f3f7fb);
  border: 1px solid var(--c-line); border-radius: 14px;
  padding: 12px 16px; margin-bottom: 16px;
}
.mtx-bar-group { display: flex; flex-direction: column; gap: 8px; }
.mtx-bar-controls { flex-direction: row; align-items: flex-end; gap: 18px; flex-wrap: wrap; }
.mtx-bar-label { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--c-sub); font-weight: 600; }
.mtx-bar-label-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mtx-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.mtx-chip {
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--c-line); background: #fff; color: var(--c-ink);
  border-radius: 999px; padding: 5px 12px; font-size: 13px; cursor: pointer;
  transition: all .15s ease;
}
.mtx-chip:hover { border-color: #9fb6cd; }
.mtx-chip.active { background: #f2f7fd; border-color: #8aa7c4; color: #264968; }
.mtx-chip.focused { box-shadow: 0 0 0 2px rgba(39,71,102,.18); }
.mtx-chip:not(.active) { opacity: .55; }
.mtx-chip-dot { width: 8px; height: 8px; border-radius: 50%; background: #c2ccd6; }
.mtx-chip-dot.live { background: #2a9d8f; box-shadow: 0 0 0 0 rgba(42,157,143,.6); animation: mtxpulse 1.6s infinite; }
.mtx-chip.active .mtx-chip-count { color: #395b79; }
.mtx-chip-count { font-size: 11px; color: var(--c-sub); font-variant-numeric: tabular-nums; }
.mtx-empty-chip { color: var(--c-sub); font-size: 13px; font-style: italic; }
.mtx-chip-actions { display: inline-flex; align-items: center; gap: 6px; }
.mtx-chip-action {
  border: 1px solid #cfd8e3;
  border-radius: 999px;
  background: #fff;
  color: #46617a;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  cursor: pointer;
}
.mtx-chip-action:hover { border-color: #8ea7bf; background: #f5f9fd; }

.mtx-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--c-sub); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.mtx-field-search { min-width: 250px; }
.mtx-field-link { min-width: 210px; }
.mtx-select {
  border: 1px solid var(--c-line); border-radius: 9px; padding: 6px 10px; font-size: 13px;
  background: #fff; color: var(--c-ink); font-weight: 500; text-transform: none; letter-spacing: 0; min-width: 96px;
}
.mtx-select.sm { padding: 3px 8px; font-size: 12px; min-width: 84px; }
.mtx-search {
  border: 1px solid var(--c-line);
  border-radius: 9px;
  padding: 6px 10px;
  font-size: 13px;
  min-width: 230px;
  text-transform: none;
  letter-spacing: 0;
}
.mtx-link-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--c-line);
  border-radius: 9px;
  padding: 6px 10px;
  background: #fff;
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
}
.mtx-link-wrap label { cursor: pointer; }
.mtx-linked-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #ffd6a5;
  background: #fff6e8;
  color: #8d4a00;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
}
.mtx-linked-chip em { font-style: italic; }

/* + Panel dropdown */
.mtx-add { position: relative; display: flex; align-items: flex-end; }
.mtx-caret { font-size: 10px; margin-left: 4px; opacity: .85; }
.mtx-add-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 30;
  background: #fff; border: 1px solid var(--c-line); border-radius: 12px;
  box-shadow: 0 12px 32px -10px rgba(16,24,40,.35); padding: 6px; min-width: 230px;
}
.mtx-add-menu-head { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--c-sub); font-weight: 700; padding: 6px 8px 4px; }
.mtx-add-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  background: none; border: 0; border-radius: 9px; padding: 8px; cursor: pointer; color: var(--c-ink);
}
.mtx-add-item:hover { background: var(--c-soft); }
.mtx-add-ico { font-size: 17px; width: 22px; text-align: center; }
.mtx-add-item small { display: block; color: var(--c-sub); font-size: 11px; }
.mtx-add-empty { padding: 8px; font-size: 12px; color: var(--c-sub); }

.mtx-btn.primary { background: var(--c-navy); color: #fff; border-color: var(--c-navy); display: inline-flex; align-items: center; }
.mtx-btn.primary:hover { background: #1d3650; }
.mtx-btn {
  border: 1px solid var(--c-line); background: #fff; color: var(--c-navy);
  border-radius: 9px; padding: 6px 11px; font-size: 12.5px; cursor: pointer; font-weight: 600;
  transition: all .15s ease;
}
.mtx-btn:hover { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.mtx-btn.ghost { padding: 4px 9px; color: var(--c-sub); font-weight: 700; }
.mtx-btn.ghost:hover { background: var(--c-soft); color: var(--c-navy); }
.mtx-btn.ghost.danger:hover { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }

/* ---- section labels ---- */
.mtx-section-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700;
  color: var(--c-sub); margin: 6px 2px 10px;
}
.mtx-section-label-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.mtx-section-label-row .mtx-btn.sm {
  font-size: 11px; padding: 3px 9px; text-transform: none; letter-spacing: 0;
}

/* ---- grid + cards ---- */
.mtx-grid {
  display: grid; gap: 16px; margin-bottom: 22px;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
}
.mtx-card {
  background: var(--c-card); border: 1px solid var(--c-line); border-radius: 16px;
  box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 8px 24px -16px rgba(16,24,40,.25);
  overflow: hidden; display: flex; flex-direction: column;
}
.mtx-sunburst-card.focused { border-color: #9fb6cd; box-shadow: 0 0 0 2px rgba(39,71,102,.12), 0 8px 24px -16px rgba(16,24,40,.3); }
.mtx-card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 16px; border-bottom: 1px solid var(--c-line);
  background: linear-gradient(180deg, #fff, #fbfdfe);
}
.mtx-card-head h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--c-navy); display: flex; align-items: center; gap: 8px; }
.mtx-sb-dot { width: 9px; height: 9px; border-radius: 50%; background: #c2ccd6; }
.mtx-sb-dot.live { background: #2a9d8f; animation: mtxpulse 1.6s infinite; }
.mtx-panel-type {
  font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 800;
  color: #fff; background: var(--c-navy); padding: 2px 7px; border-radius: 6px;
}
.mtx-card-actions { display: flex; align-items: center; gap: 6px; }
.mtx-pill { font-size: 11px; background: var(--c-soft); color: var(--c-navy); padding: 3px 9px; border-radius: 999px; font-weight: 600; font-variant-numeric: tabular-nums; }

.mtx-sunburst-body { display: flex; flex-direction: column; gap: 18px; padding: 16px; align-items: stretch; }
.mtx-sunburst { position: relative; width: 100%; aspect-ratio: 1 / 1; display: flex; justify-content: center; align-items: center; }
.mtx-legend { width: 100%; }
.mtx-legend-title { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--c-sub); font-weight: 700; margin-bottom: 8px; }
.mtx-legend ul { list-style: none; margin: 0; padding: 0; }
.mtx-legend li { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 13px; }
.mtx-legend-click { cursor: pointer; border-radius: 6px; padding: 4px 6px; }
.mtx-legend-click:hover { background: #edf4fb; }
.mtx-legend-empty { color: var(--c-sub); font-style: italic; font-size: 12px; }
.mtx-swatch { width: 12px; height: 12px; border-radius: 3px; flex: none; }
.mtx-legend-name { flex: 1; text-transform: capitalize; }
.mtx-legend-pct { color: var(--c-sub); font-variant-numeric: tabular-nums; font-size: 12px; }

/* ---- in-panel sunburst legend (right of the dial) ---- */
.mtx-sb-wrap { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; width: 100%; }
.mtx-sb-chart { position: relative; flex: 1 1 320px; min-width: 280px; display: flex; justify-content: center; }
.mtx-sb-legend { flex: 0 1 240px; min-width: 210px; }
.mtx-sb-legend ul { list-style: none; margin: 0; padding: 0; }
.mtx-sb-legend li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 3px 6px; font-size: 13px; }
.mtx-sb-legend .mtx-legend-sub { flex: 1 1 100%; font-size: 11px; color: var(--c-sub); line-height: 1.3; margin-top: 1px; }
.mtx-legend-swatch { width: 11px; height: 11px; border-radius: 3px; flex: 0 0 auto; }

.mtx-panel-body { padding: 12px 14px; min-height: 60px; }
.mtx-nodata { color: var(--c-sub); font-size: 13px; font-style: italic; padding: 18px 4px; text-align: center; }

.mtx-sunburst,
.mtx-sb-chart {
  aspect-ratio: 1 / 1;
}
.mtx-sunburst svg,
.mtx-sb-chart svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* svg helpers */
.mtx-explore >>> .mtx-tick { fill: var(--c-ink); }
.mtx-explore >>> .mtx-val { fill: var(--c-sub); font-variant-numeric: tabular-nums; }
.mtx-explore >>> .mtx-axis text, .mtx-explore >>> .mtx-axis line, .mtx-explore >>> .mtx-axis path { color: #94a3b8; }
.mtx-explore >>> .mtx-tip {
  position: absolute; pointer-events: none; background: #1f2937; color: #fff;
  padding: 7px 10px; border-radius: 8px; font-size: 11.5px; line-height: 1.45;
  box-shadow: 0 6px 20px rgba(0,0,0,.25); z-index: 20; max-width: 240px;
}

/* table */
.mtx-explore >>> .mtx-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.mtx-explore >>> .mtx-tbl th { text-align: left; color: var(--c-sub); font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; padding: 6px 8px; border-bottom: 2px solid var(--c-line); }
.mtx-explore >>> .mtx-tbl th.n, .mtx-explore >>> .mtx-tbl td.n { text-align: right; font-variant-numeric: tabular-nums; }
.mtx-explore >>> .mtx-tbl td { padding: 6px 8px; border-bottom: 1px solid var(--c-soft); vertical-align: middle; }
.mtx-explore >>> .mtx-tbl tr:hover td { background: #f8fbfe; }
.mtx-explore >>> .mtx-tbl tr.mtx-row-active td { background: #fff3db; }
.mtx-explore >>> .mtx-sci { font-style: italic; display: block; }
.mtx-explore >>> .mtx-tid { font-size: 10px; color: #9aa7b4; }
.mtx-explore >>> .mtx-grp { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--c) 18%, #fff); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 35%, #fff); text-transform: capitalize; }
.mtx-explore >>> .mtx-mini { display: inline-block; width: 46px; height: 6px; border-radius: 3px; background: var(--c-soft); margin-right: 6px; vertical-align: middle; overflow: hidden; }
.mtx-explore >>> .mtx-mini i { display: block; height: 100%; background: var(--c-navy); }

/* pagination */
.mtx-explore >>> .mtx-pg-nav { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 0 2px; }
.mtx-explore >>> .mtx-pg-nav button { background: none; border: 1px solid #ccd6e0; border-radius: 4px; padding: 1px 8px; cursor: pointer; font-size: 14px; color: #33485c; line-height: 1.4; }
.mtx-explore >>> .mtx-pg-nav button:disabled { opacity: 0.35; cursor: default; }
.mtx-explore >>> .mtx-pg-nav button:not(:disabled):hover { background: #eef3f7; }
.mtx-explore >>> .mtx-pg-nav span { font-size: 11px; color: #6b8299; min-width: 40px; text-align: center; }
.mtx-explore >>> .mtx-legend-nav { justify-content: flex-start; margin-top: 6px; border-top: 1px solid #eef2f6; padding-top: 6px; }
.mtx-explore >>> .mtx-pg-nav-top-right { justify-content: flex-end; padding: 0 0 6px; }
.mtx-explore >>> .mtx-pg-nav-top {
  justify-content: flex-end;
  width: 100%;
  padding: 0 2px 6px;
  margin-bottom: 6px;
  border-bottom: 1px solid #eef2f6;
}
/* column wrapper: pagination is a full-width block above the chart/table */
.mtx-explore >>> .mtx-paginated { width: 100%; display: flex; flex-direction: column; gap: 6px; }
.mtx-explore >>> .mtx-paginated-chart { width: 100%; }

/* blank */
.mtx-blank { text-align: center; color: var(--c-sub); padding: 80px 20px; }
.mtx-blank-art { font-size: 56px; opacity: .25; }
.mtx-blank p { max-width: 460px; margin: 14px auto 0; font-size: 14px; }

@keyframes mtxpulse {
  0%   { box-shadow: 0 0 0 0 rgba(42,157,143,.55); transform: scale(1); }
  50%  { transform: scale(1.18); }
  70%  { box-shadow: 0 0 0 7px rgba(42,157,143,0); }
  100% { box-shadow: 0 0 0 0 rgba(42,157,143,0); transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .mtx-chip-dot.live, .mtx-sb-dot.live { animation: none; }
}

@media (max-width: 1024px) {
  .mtx-sb-chart { flex-basis: 260px; min-width: 220px; }
  .mtx-sb-legend { min-width: 180px; }
}
</style>
