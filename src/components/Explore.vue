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
        <span class="mtx-bar-label">Samples</span>
        <div class="mtx-chips">
          <button
            v-for="s in availableSamples"
            :key="s"
            class="mtx-chip"
            :class="{ active: s === focusSample }"
            @click="setFocus(s)"
          >
            <span class="mtx-chip-dot" :class="{ live: isLive(s) }"></span>
            {{ s }}
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
                <strong>{{ s }}</strong>
                <small>Adds a panel for this sample</small>
              </span>
            </button>
            <div v-if="!availableSamples.length" class="mtx-add-empty">No samples available</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ sunbursts: one per sample ============ -->
    <div class="mtx-section-label" v-if="availableSamples.length">
      Taxonomic sunbursts · one per sample
    </div>
    <div class="mtx-grid mtx-sb-grid" v-if="availableSamples.length">
      <section
        v-for="s in availableSamples"
        :key="'sb-card-' + s"
        class="mtx-card mtx-sunburst-card"
        :class="{ focused: s === focusSample }"
      >
        <header class="mtx-card-head">
          <h3>
            <span class="mtx-sb-dot" :class="{ live: isLive(s) }"></span>
            {{ s }}
          </h3>
          <div class="mtx-card-actions">
            <span class="mtx-pill" v-if="sampleReadTotal(s)">{{ sampleReadTotal(s) | kfmt }} reads</span>
            <InfoIcon text="Chart type for this sample card. Sunburst shows the full taxonomic hierarchy; Lollipop and Bar show top taxa by read count; Table gives a sortable breakdown." />
            <select class="mtx-select sm" :value="viewOf(s)" @change="setSampleView(s, $event.target.value)"
              title="Plot type for this sample">
              <option v-for="t in panelTypes" :key="t.type" :value="t.type">{{ t.label }}</option>
            </select>
            <button class="mtx-btn ghost" @click="setFocus(s)" :title="'Focus ' + s">
              {{ s === focusSample ? '★' : '☆' }}
            </button>
          </div>
        </header>
        <div class="mtx-sunburst-body">
          <div class="mtx-sunburst" :ref="'sb-' + safe(s)"></div>
          <div class="mtx-legend" v-if="viewOf(s) === 'sunburst'">
            <div class="mtx-legend-title">{{ rankLabel(primaryRank) }}</div>
            <ul>
              <li v-for="g in pagedLegend(s)" :key="g.name" class="mtx-legend-click" @click="legendZoom(s, g)">
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
      Panels · focused on {{ focusSample }}
    </div>
    <div class="mtx-grid" v-if="panels.length">
      <section v-for="p in panels" :key="p.id" class="mtx-card mtx-panel-card">
        <header class="mtx-card-head">
          <h3>
            <span class="mtx-panel-type">{{ p.type }}</span>
            {{ p.sample }} · {{ rankLabel(p.rank) }}
          </h3>
          <div class="mtx-card-actions">
            <InfoIcon text="Sample this panel is bound to." />
            <select v-model="p.sample" class="mtx-select sm" @change="drawPanelSoon(p)">
              <option v-for="s in availableSamples" :key="'panel-s-' + s" :value="s">{{ s }}</option>
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
    <div class="mtx-blank" v-if="!availableSamples.length">
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

// Standard Kraken2 rank hierarchy (primary ranks shown as panel choices)
// Subspecies are rolled up to one canonical 'S1' rank upstream, so only a single
// "Subspecies" choice is offered here.
const RANK_ORDER = ['R', 'D', 'K', 'P', 'C', 'O', 'F', 'G', 'S', 'S1']
const RANK_LABELS = {
  R: 'Root', D: 'Domain', K: 'Kingdom', P: 'Phylum', C: 'Class',
  O: 'Order', F: 'Family', G: 'Genus', S: 'Species',
  S1: 'Subspecies', S2: 'Subspecies', S3: 'Subspecies'
}
const GROUP_PALETTE = d3.schemeTableau10.concat(d3.schemeSet3)

export default {
  name: 'Explore',
  components: { InfoIcon },
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
    // map: { sampleName: [ parsed kraken2 rows ] }
    sampleData: { type: Object, default: () => ({}) },
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
      liveStamp: {},
      addMenuOpen: false,
      globalSearch: '',
      linkPanels: true,
      selectedOrganism: '',
      panelTypes: [
        { type: 'lollipop', label: 'Lollipop', icon: '🎯', hint: 'ranked taxa' },
        { type: 'bar', label: 'Bar chart', icon: '📊', hint: 'read counts' },
        { type: 'table', label: 'Table', icon: '▦', hint: 'taxa + groups' },
        { type: 'sunburst', label: 'Sunburst', icon: '◍', hint: 'full hierarchy' }
      ]
    }
  },
  computed: {
    availableSamples() {
      return Object.keys(this.sampleData || {}).filter(s => (this.sampleData[s] || []).length)
    },
    rankChoices() {
      return RANK_ORDER.filter(c => c !== 'R').map(c => ({ code: c, label: RANK_LABELS[c] }))
    },
    focusRows() {
      return (this.sampleData && this.sampleData[this.focusSample]) || []
    }
  },
  watch: {
    sampleData: {
      deep: true,
      handler() { this.onData() }
    },
    primaryRank() { this.redraw() },
    globalSearch() { this.cardPage = {}; this.redraw() },
    selectedOrganism() { this.redraw() },
    linkPanels(v) {
      if (!v) this.selectedOrganism = ''
      this.redraw()
    }
  },
  mounted() {
    this.onData()
    window.addEventListener('resize', this.redraw)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.redraw)
  },
  methods: {
    safe(s) { return (s || '').replace(/[^A-Za-z0-9_-]/g, '_') },
    rankLabel(code) { return RANK_LABELS[code] || code },
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
    legendZoom(sample, g) {
      if (!g) return
      // Zoom every loaded sunburst, not just the one whose legend was clicked
      Object.keys(this.sunburstApi).forEach(s => {
        const api = this.sunburstApi[s]
        if (!api) return
        // For the originating sample prefer the exact taxid; for others match by group name
        if (s === sample && g.taxid != null && typeof api.zoomTaxid === 'function') {
          api.zoomTaxid(g.taxid)
        } else if (typeof api.zoomLegendName === 'function') {
          api.zoomLegendName(g.name)
        }
      })
    },

    // --- live / totals ---
    onData() {
      const avail = this.availableSamples
      avail.forEach(s => {
        const sig = (this.sampleData[s] || []).length
        if (this.liveStamp[s] !== sig) {
          this.$set(this.liveStamp, s, sig)
          this.$set(this.liveStamp, '_t_' + s, Date.now())
        }
      })
      if (!this.focusSample && avail.length) this.focusSample = avail[0]
      if (this.focusSample && !avail.includes(this.focusSample) && avail.length) {
        this.focusSample = avail[0]
      }
      this.redraw()
    },
    isLive(s) {
      return Date.now() - (this.liveStamp['_t_' + s] || 0) < 4000
    },
    sampleReadTotal(s) {
      const rows = (this.sampleData && this.sampleData[s]) || []
      const base = rows.find(r => r.depth === 0 || r.taxid === -1 || r.taxid === '-1')
      if (base && base.num_fragments_clade) return base.num_fragments_clade
      return d3.sum(rows.filter(r => r.rank_code === 'D'), r => r.num_fragments_clade)
    },
    setFocus(s) { this.focusSample = s; this.redraw() },

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
        .filter(r => r.rank_code === rank && r.taxid !== -1)
        .filter(r => this.organismMatches(r.target))
        .filter(r => !this.linkPanels || !this.selectedOrganism || r.target === this.selectedOrganism)
        .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
        .slice(0, n)
        .map(r => ({
          name: r.target,
          common: this.commonGroup(sample, r),
          group: this.commonGroup(sample, r) || r.target,
          reads: r.num_fragments_clade,
          pct: r.value,
          taxid: r.taxid,
          rank: r.rank_code
        }))
    },

    // all taxa at a rank (no topN slice) — used for paginated panels
    topTaxaAll(sample, rank) {
      const rows = (this.sampleData && this.sampleData[sample]) || []
      return rows
        .filter(r => r.rank_code === rank && r.taxid !== -1)
        .filter(r => this.organismMatches(r.target))
        .filter(r => !this.linkPanels || !this.selectedOrganism || r.target === this.selectedOrganism)
        .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
        .map(r => ({
          name: r.target,
          common: this.commonGroup(sample, r),
          group: this.commonGroup(sample, r) || r.target,
          reads: r.num_fragments_clade,
          pct: r.value,
          taxid: r.taxid,
          rank: r.rank_code
        }))
    },

    // --- redraw orchestration ---
    redraw() {
      clearTimeout(this.redrawTimer)
      this.redrawTimer = setTimeout(() => {
        this.$nextTick(() => {
          this.availableSamples.forEach(s => this.drawSampleCard(s))
          this.panels.forEach(p => this.drawPanel(p))
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
        // the global Rank drives this card's legend; dial still zooms on click
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
      if (type === 'lollipop') this.drawLollipop(el, data)
      else if (type === 'bar') this.drawBar(el, data)
      else if (type === 'table') this.drawTable(el, data)
      if (totalPages > 1) this.appendPageNav(el, pg, totalPages, setPage)
    },

    // Shared prev / "n / total" / next nav used by paginated charts.
    appendPageNav(el, page, totalPages, setPage) {
      const nav = document.createElement('div')
      nav.className = 'mtx-pg-nav'
      const prev = document.createElement('button')
      prev.textContent = '‹'; prev.disabled = page === 0
      prev.addEventListener('click', () => setPage(page - 1))
      const info = document.createElement('span')
      info.textContent = `${page + 1} / ${totalPages}`
      const next = document.createElement('button')
      next.textContent = '›'; next.disabled = page >= totalPages - 1
      next.addEventListener('click', () => setPage(page + 1))
      nav.appendChild(prev); nav.appendChild(info); nav.appendChild(next)
      el.appendChild(nav)
    },

    // ============ ROBUST TREE BUILD (depth-stack, no stratify) ============
    // Returns a d3.hierarchy root or null. Works even if intermediate ranks
    // are missing from a partial report, because parents are resolved by the
    // nearest shallower row rather than by taxid links.
    buildHierarchy(sample) {
      const rowsAll = (this.sampleData[sample] || []).filter(r => r && r.target)
      let rows = rowsAll
      const q = (this.globalSearch || '').trim().toLowerCase()
      const selected = (this.linkPanels && this.selectedOrganism) ? this.selectedOrganism : ''
      if (q || selected) {
        const keep = new Set()
        const rowMatch = (r) => {
          const byQ = q ? String(r.target || '').toLowerCase().indexOf(q) > -1 : true
          const bySel = selected ? r.target === selected : true
          return byQ && bySel
        }
        rowsAll.forEach((r, i) => {
          if (!rowMatch(r)) return
          keep.add(i)
          let d = Number(r.depth) - 1
          for (let j = i - 1; j >= 0 && d >= 0; j--) {
            const prev = rowsAll[j]
            if (Number(prev.depth) === d) {
              keep.add(j)
              d -= 1
            }
          }
        })
        rows = rowsAll.filter((_, i) => keep.has(i))
      }
      if (rows.length < 2) return null
      const root = { data: { target: sample, rank_code: 'R', taxid: -1, num_fragments_clade: 0, value: 100 }, children: [] }
      const stack = [root]          // stack[k] = current open node at relative level k
      let minDepth = Infinity
      rows.forEach(r => { if (r.taxid !== -1 && r.depth < minDepth) minDepth = r.depth })
      if (!isFinite(minDepth)) minDepth = 0

      rows.forEach(r => {
        if (r.taxid === -1) return            // skip synthetic base row
        const level = Math.max(1, (r.depth - minDepth) + 1)
        const node = { data: r, children: [] }
        // trim stack to the parent level
        while (stack.length > level) stack.pop()
        const parent = stack[stack.length - 1] || root
        parent.children.push(node)
        stack[level] = node
        stack.length = level + 1
      })

      try {
        return d3.hierarchy(root, d => d.children)
          .sum(d => (d.children && d.children.length) ? 0 : Math.max(0, +d.data.num_fragments_clade || 0))
          .sort((a, b) => b.value - a.value)
      } catch (e) {
        return null
      }
    },

    // ============ ZOOMABLE SUNBURST ============
    // back-compat alias (called by other code paths)
    drawSunburst(sample) { this.drawSampleCard(sample) },

    // Click a slice to zoom: the clicked node expands to the full circle and its
    // subtree fills the rings (the classic zoomable sunburst). The current focus
    // is persisted per-sample in this.sbFocus so streaming redraws keep the zoom.
    drawSunburstInto(el, sample, opts = {}) {
      const legendRank = opts.legendRank || null
      const inlineLegend = !!opts.inlineLegend
      d3.select(el).selectAll('*').remove()

      // Panels render an in-card legend to the RIGHT of the dial; the per-sample
      // cards keep using the Vue-template legend (this.legends).
      let chartEl = el
      let legendEl = null
      if (inlineLegend) {
        const wrap = document.createElement('div'); wrap.className = 'mtx-sb-wrap'
        chartEl = document.createElement('div'); chartEl.className = 'mtx-sb-chart'
        legendEl = document.createElement('div'); legendEl.className = 'mtx-sb-legend'
        wrap.appendChild(chartEl); wrap.appendChild(legendEl); el.appendChild(wrap)
      }

      const root = this.buildHierarchy(sample)
      if (!root || !root.value) {
        d3.select(chartEl).append('div').attr('class', 'mtx-nodata').text('building…')
        return
      }

      const size = Math.min(chartEl.clientWidth || el.clientWidth || 360, 360) || 320
      const rings = (root.height || 1) + 1
      const ringUnit = (size / 2) / rings
      d3.partition().size([2 * Math.PI, rings])(root)

      // resolve persisted focus (by taxid) → default to root
      let focus = root
      const focTaxid = this.sbFocus[sample]
      if (focTaxid != null) {
        const hit = root.descendants().find(d => d.data.data && d.data.data.taxid === focTaxid)
        if (hit) focus = hit
      }

      // map any node to its top-level group colour key
      const groupOf = d => {
        let cur = d
        while (cur.depth > 1 && cur.parent) cur = cur.parent
        const gdata = cur.data.data
        return this.commonGroup(sample, gdata) || gdata.target || 'other'
      }

      // legend refresh: rank-driven for panels, focus-children for the cards.
      // This lets the panel's Rank dropdown change ONLY the legend; the dial
      // itself re-frames solely on a slice click.
      const refreshLegend = (f) => {
        if (legendRank) {
          const items = this.rankLegendData(sample, legendRank)
          if (inlineLegend) this.renderInlineLegend(legendEl, sample, items, this.rankLabel(legendRank))
          else this.$set(this.legends, sample, items)
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
        .innerRadius(d => d.y0 * ringUnit)
        .outerRadius(d => Math.max(d.y0 * ringUnit, d.y1 * ringUnit - 1))

      const svg = d3.select(chartEl).append('svg')
        .attr('viewBox', [-size / 2, -size / 2, size, size])
        .attr('width', '100%')
        .style('max-width', size + 'px')
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
        .attr('fill', d => d3.color(this.groupColor(groupOf(d)))
          .copy({ opacity: Math.max(0.42, 1 - Math.max(0, d.depth - 1) * 0.11) }))
        .attr('fill-opacity', d => arcVisible(d.current) ? 1 : 0)
        .attr('pointer-events', d => arcVisible(d.current) ? 'auto' : 'none')
        .attr('d', d => arc(d.current))
        .style('cursor', 'pointer')
        .on('mousemove', (ev, d) => {
          const data = d.data.data
          const cn = this.commonGroup(sample, data)
          tip.style('opacity', 1)
            .style('left', (ev.offsetX + 14) + 'px')
            .style('top', (ev.offsetY + 8) + 'px')
            .html(`<b>${data.target}</b>${cn ? ' <i>(' + cn + ')</i>' : ''}<br>` +
              `${RANK_LABELS[data.rank_code] || data.rank_code} · taxid ${data.taxid}<br>` +
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
          // Propagate to all other loaded sunbursts by group/target name
          const nodeData = d.data && d.data.data
          if (nodeData) {
            const zoomName = this.commonGroup(sample, nodeData) || nodeData.target
            Object.keys(self.sunburstApi).forEach(s => {
              if (s === sample) return
              const api = self.sunburstApi[s]
              if (api && typeof api.zoomLegendName === 'function') {
                api.zoomLegendName(zoomName)
              }
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

        const tx = (focus && focus !== root && focus.data && focus.data.data) ? focus.data.data.taxid : null
        self.$set(self.sbFocus, sample, tx)
        updateCenter(focus)
        refreshLegend(focus)
      }

      this.$set(this.sunburstApi, sample, {
        zoomTaxid: (taxid) => {
          const hit = root.descendants().find(d => d.data && d.data.data && d.data.data.taxid === taxid)
          if (hit) zoomTo(hit)
        },
        zoomLegendName: (name) => {
          if (!name) return
          const hit = root.descendants().find(d => {
            if (!d.data || !d.data.data) return false
            const data = d.data.data
            const grp = this.commonGroup(sample, data) || data.target
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
    rankLegendData(sample, rank) {
      const all = this.topTaxaAll(sample, rank)
      return all.map(t => ({
        name: t.group || t.name,
        taxid: t.taxid,
        pct: t.pct != null ? +t.pct : 0,
        reads: t.reads,
        color: this.groupColor(t.group || t.name)
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
      const sz = Math.min(chartEl.clientWidth || size || 320, 360) || 320
      const svg = d3.select(chartEl).append('svg')
        .attr('viewBox', [-sz / 2, -sz / 2, sz, sz])
        .attr('width', '100%')
        .style('max-width', sz + 'px')
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
        name: data.target,
        taxid: data.taxid,
        pct: +data.value,
        reads: +data.num_fragments_clade,
        color,
        sub: `${RANK_LABELS[data.rank_code] || data.rank_code}` +
          `${cn ? ' · ' + cn : ''} · ${(+data.num_fragments_clade).toLocaleString()} reads · taxid ${data.taxid}`
      }
      if (inlineLegend) this.renderInlineLegend(legendEl, sample, [item], 'Selected taxon')
      else this.$set(this.legends, sample, [item])
    },

    buildLegend(sample, part, focusNode) {
      const focus = focusNode || part
      const baseNode = (focus && focus.children && focus.children.length)
        ? focus
        : ((focus && focus.parent && focus.parent.children && focus.parent.children.length) ? focus.parent : part)

      const totals = {}
      ;(baseNode.children || []).forEach(d => {
        const data = d.data ? d.data.data : null
        const name = data
          ? (this.commonGroup(sample, data) || data.target)
          : ((d.data && d.data.name) ? d.data.name : 'other')
        if (!totals[name]) {
          totals[name] = { value: 0, taxid: (data && data.taxid != null) ? data.taxid : null }
        }
        totals[name].value += (d.value || 0)
      })

      if (!Object.keys(totals).length) {
        this.$set(this.legends, sample, [])
        return
      }

      const total = d3.sum(Object.values(totals).map(v => v.value)) || 1
      const legend = Object.entries(totals)
        .sort((a, b) => b[1].value - a[1].value)
        .map(([name, v]) => ({
          name,
          taxid: v.taxid,
          pct: (v.value / total) * 100,
          color: this.groupColor(name)
        }))
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
    drawLollipop(el, data) {
      const w = el.clientWidth || 420, rowH = 22, m = { l: 150, r: 56, t: 8, b: 8 }
      const h = data.length * rowH + m.t + m.b
      const x = d3.scaleLinear().domain([0, d3.max(data, d => d.reads)]).range([0, w - m.l - m.r])
      const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', [0, 0, w, h])
        .style('font', '11px Inter, system-ui, sans-serif')
      const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`)
      const rows = g.selectAll('g').data(data).join('g').attr('transform', (d, i) => `translate(0,${i * rowH + rowH / 2})`)
      rows.append('text').attr('x', -10).attr('dy', '0.32em').attr('text-anchor', 'end')
        .attr('class', 'mtx-tick').text(d => this.trunc(d.name, 22))
      rows.append('line').attr('x1', 0).attr('x2', d => x(d.reads)).attr('stroke', '#cbd5e1').attr('stroke-width', 2)
      rows.append('circle').attr('cx', d => x(d.reads)).attr('r', 5)
        .attr('fill', d => this.groupColor(d.group))
        .attr('stroke', d => (this.linkPanels && this.selectedOrganism && d.name === this.selectedOrganism) ? '#f97316' : '#ffffff')
        .attr('stroke-width', d => (this.linkPanels && this.selectedOrganism && d.name === this.selectedOrganism) ? 2 : 0.8)
      rows.append('text').attr('x', d => x(d.reads) + 10).attr('dy', '0.32em')
        .attr('class', 'mtx-val').text(d => this.kf(d.reads))
      rows.append('title').text(d => `${d.name}${d.common ? ' (' + d.common + ')' : ''} — ${d.reads.toLocaleString()} reads (${d.pct}%)`)
      rows.style('cursor', 'pointer').on('click', (ev, d) => this.setSelectedOrganism(d.name))
    },
    drawBar(el, data) {
      const w = el.clientWidth || 420, h = 240, m = { l: 40, r: 12, t: 10, b: 64 }
      const x = d3.scaleBand().domain(data.map(d => d.name)).range([m.l, w - m.r]).padding(0.25)
      const y = d3.scaleLinear().domain([0, d3.max(data, d => d.reads)]).nice().range([h - m.b, m.t])
      const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', [0, 0, w, h])
        .style('font', '10px Inter, system-ui, sans-serif')
      svg.append('g').selectAll('rect').data(data).join('rect')
        .attr('x', d => x(d.name)).attr('y', d => y(d.reads))
        .attr('width', x.bandwidth()).attr('height', d => y(0) - y(d.reads))
        .attr('rx', 3).attr('fill', d => this.groupColor(d.group))
        .attr('stroke', d => (this.linkPanels && this.selectedOrganism && d.name === this.selectedOrganism) ? '#f97316' : 'none')
        .attr('stroke-width', d => (this.linkPanels && this.selectedOrganism && d.name === this.selectedOrganism) ? 2 : 0)
        .style('cursor', 'pointer')
        .on('click', (ev, d) => this.setSelectedOrganism(d.name))
        .append('title').text(d => `${d.name}${d.common ? ' (' + d.common + ')' : ''} — ${d.reads.toLocaleString()} (${d.pct}%)`)
      svg.append('g').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickSize(0))
        .selectAll('text').attr('transform', 'rotate(-40)').attr('text-anchor', 'end').attr('dx', '-0.4em').attr('dy', '0.6em')
        .text(d => this.trunc(d, 14)).attr('class', 'mtx-tick')
      svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(this.kf))
        .attr('class', 'mtx-axis')
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
.mtx-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.mtx-chip {
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--c-line); background: #fff; color: var(--c-ink);
  border-radius: 999px; padding: 5px 12px; font-size: 13px; cursor: pointer;
  transition: all .15s ease;
}
.mtx-chip:hover { border-color: #9fb6cd; }
.mtx-chip.active { background: var(--c-navy); color: #fff; border-color: var(--c-navy); }
.mtx-chip-dot { width: 8px; height: 8px; border-radius: 50%; background: #c2ccd6; }
.mtx-chip-dot.live { background: #2a9d8f; box-shadow: 0 0 0 0 rgba(42,157,143,.6); animation: mtxpulse 1.6s infinite; }
.mtx-chip.active .mtx-chip-count { color: #cfe0ee; }
.mtx-chip-count { font-size: 11px; color: var(--c-sub); font-variant-numeric: tabular-nums; }
.mtx-empty-chip { color: var(--c-sub); font-size: 13px; font-style: italic; }

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

.mtx-sunburst-body { display: flex; flex-wrap: wrap; gap: 18px; padding: 16px; align-items: center; }
.mtx-sunburst { position: relative; flex: 1 1 220px; min-width: 200px; display: flex; justify-content: center; }
.mtx-legend { flex: 1 1 160px; min-width: 150px; }
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
.mtx-sb-chart { position: relative; flex: 1 1 220px; min-width: 200px; display: flex; justify-content: center; }
.mtx-sb-legend { flex: 1 1 170px; min-width: 150px; }
.mtx-sb-legend ul { list-style: none; margin: 0; padding: 0; }
.mtx-sb-legend li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 3px 6px; font-size: 13px; }
.mtx-sb-legend .mtx-legend-sub { flex: 1 1 100%; font-size: 11px; color: var(--c-sub); line-height: 1.3; margin-top: 1px; }
.mtx-legend-swatch { width: 11px; height: 11px; border-radius: 3px; flex: 0 0 auto; }

.mtx-panel-body { padding: 12px 14px; min-height: 60px; }
.mtx-nodata { color: var(--c-sub); font-size: 13px; font-style: italic; padding: 18px 4px; text-align: center; }

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

/* blank */
.mtx-blank { text-align: center; color: var(--c-sub); padding: 80px 20px; }
.mtx-blank-art { font-size: 56px; opacity: .25; }
.mtx-blank p { max-width: 460px; margin: 14px auto 0; font-size: 14px; }

@keyframes mtxpulse {
  0% { box-shadow: 0 0 0 0 rgba(42,157,143,.5); }
  70% { box-shadow: 0 0 0 7px rgba(42,157,143,0); }
  100% { box-shadow: 0 0 0 0 rgba(42,157,143,0); }
}
</style>
