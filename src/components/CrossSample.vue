<!--
  CrossSample.vue — cross-sample comparison tab.
  Rolls every per-sample detection into one row per organism across all samples
  in the run, with three sub-views:
    • Frequency table — sortable per-organism prevalence / reads
    • Occupancy bar   — # organisms detected in exactly k samples
    • Co-occurrence   — sample × sample similarity heatmap (Jaccard / cosine)
  Modeled on the MBON Cross-Sample tab. Self-contained (D3 + plain markup).
-->
<template>
  <v-container class="mtx-xs">
    <section class="mtx-xs-hero">
      <div class="mtx-xs-hero-title-wrap">
        <div class="mtx-xs-kicker">Cross-Sample Analysis</div>
        <h2 class="mtx-xs-hero-title">Sample Comparison</h2>
        <p class="mtx-xs-hero-sub">
          Every per-sample detection rolled into one row per organism across the
          {{ sampleKeys.length }} sample(s) in this run. Compare how widely organisms
          are shared and how similar samples are to one another.
        </p>
      </div>
      <div class="mtx-xs-hero-ctrl">
        <label class="mtx-xs-field">
          <span>Rank</span>
          <select v-model="rank">
            <option v-for="r in ranks" :key="r" :value="r">{{ rankLabel(r) }}</option>
          </select>
        </label>
      </div>
    </section>

    <div v-if="!hasData" class="mtx-xs-blank">No samples loaded yet.</div>
    <div v-else-if="sampleKeys.length < 2" class="mtx-xs-blank">
      Cross-sample analysis needs at least two samples — only {{ sampleKeys.length }} loaded.
    </div>

    <template v-else>
      <!-- KPI strip -->
      <div class="mtx-xs-kpis">
        <div class="mtx-xs-kpi"><div class="v">{{ kpis.organisms }}</div><div class="l">Organisms</div></div>
        <div class="mtx-xs-kpi"><div class="v">{{ kpis.samples }}</div><div class="l">Samples</div></div>
        <div class="mtx-xs-kpi"><div class="v">{{ kpis.core }}</div><div class="l">Core (all {{ kpis.samples }})</div></div>
        <div class="mtx-xs-kpi"><div class="v">{{ kpis.shared }}</div><div class="l">Shared</div></div>
        <div class="mtx-xs-kpi"><div class="v">{{ kpis.unique }}</div><div class="l">Unique (1)</div></div>
        <div class="mtx-xs-kpi"><div class="v">{{ kpis.meanPrev }}%</div><div class="l">Mean prevalence</div></div>
      </div>

      <!-- Sub-tabs -->
      <div class="mtx-xs-tabs">
        <button v-for="t in subTabs" :key="t.id"
                :class="['mtx-xs-tab', { active: subTab === t.id }]"
                @click="subTab = t.id">{{ t.label }}</button>
      </div>

      <!-- Frequency table -->
      <section v-show="subTab === 'table'" class="mtx-xs-card">
        <div class="mtx-xs-controls">
          <label class="mtx-xs-field">
            <span>Group</span>
            <select v-model="groupFilter">
              <option value="">All groups</option>
              <option v-for="g in groupList" :key="g" :value="g">{{ g }}</option>
            </select>
          </label>
          <label class="mtx-xs-field">
            <span>Min prevalence</span>
            <select v-model.number="minPrev">
              <option v-for="p in prevOptions" :key="p" :value="p">{{ p ? '≥ ' + p + '%' : 'Any' }}</option>
            </select>
          </label>
          <label class="mtx-xs-field mtx-xs-field-grow">
            <span>Search</span>
            <input v-model="query" type="text" placeholder="organism / group…" />
          </label>
          <span class="mtx-xs-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>
        <div class="mtx-xs-table-wrap">
          <table class="mtx-xs-table">
            <thead>
              <tr>
                <th @click="setSort('target')">Organism <span class="ar">{{ sortArrow('target') }}</span></th>
                <th @click="setSort('group')">Group <span class="ar">{{ sortArrow('group') }}</span></th>
                <th class="num" @click="setSort('nSamples')">Samples <span class="ar">{{ sortArrow('nSamples') }}</span></th>
                <th class="num" @click="setSort('prevalence')">Prevalence <span class="ar">{{ sortArrow('prevalence') }}</span></th>
                <th class="num" @click="setSort('reads')">Total reads <span class="ar">{{ sortArrow('reads') }}</span></th>
                <th>Occupancy</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filteredRows" :key="r.target">
                <td>{{ r.target }}</td>
                <td><span class="mtx-xs-chip" :style="{ background: groupColor(r.group) }"></span>{{ r.group }}</td>
                <td class="num">{{ r.nSamples }} / {{ kpis.samples }}</td>
                <td class="num">{{ Math.round(r.prevalence) }}%</td>
                <td class="num">{{ r.reads.toLocaleString() }}</td>
                <td>
                  <span class="mtx-xs-cat" :class="'cat-' + category(r.nSamples)">{{ category(r.nSamples) }}</span>
                </td>
              </tr>
              <tr v-if="!filteredRows.length"><td colspan="6" class="mtx-xs-empty">No organisms match the filters.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Occupancy bar -->
      <section v-show="subTab === 'occ'" class="mtx-xs-card">
        <h3 class="mtx-xs-h3">Organisms by number of samples detected</h3>
        <p class="mtx-xs-sub">How many organisms are detected in exactly <em>k</em> samples — core (every sample) through unique (one).</p>
        <div ref="occBar" class="mtx-xs-plot"></div>
        <div class="mtx-xs-legend">
          <span><i :style="{ background: CAT_COLOR.core }"></i>Core (all samples)</span>
          <span><i :style="{ background: CAT_COLOR.shared }"></i>Shared (some)</span>
          <span><i :style="{ background: CAT_COLOR.unique }"></i>Unique (one)</span>
        </div>
      </section>

      <!-- Co-occurrence heatmap -->
      <section v-show="subTab === 'heat'" class="mtx-xs-card">
        <div class="mtx-xs-heat-head">
          <div>
            <h3 class="mtx-xs-h3">Sample × sample co-occurrence</h3>
            <p class="mtx-xs-sub">
              Pairwise similarity of {{ rankLabel(rank).toLowerCase() }} profiles. Darker = more similar.
            </p>
          </div>
          <div class="mtx-xs-metric">
            <button v-for="m in metrics" :key="m.id"
                    :class="['mtx-xs-metric-btn', { active: metric === m.id }]"
                    @click="metric = m.id" :title="m.tip">{{ m.label }}</button>
          </div>
        </div>
        <div ref="heat" class="mtx-xs-plot mtx-xs-heatplot"></div>
        <div class="mtx-xs-heat-foot">
          <span class="mtx-xs-metric-note">{{ activeMetricNote }}</span>
          <div ref="heatScale" class="mtx-xs-heat-scale"></div>
        </div>
      </section>
    </template>
  </v-container>
</template>

<script>
import * as d3 from 'd3'
import taxaSource from '@/mixins/taxaSource'

const BASE_RANKS = ['D', 'P', 'C', 'O', 'F', 'G', 'S']
const PAL = d3.schemeTableau10.concat(d3.schemeSet3)
const CAT_COLOR = { core: '#1e6b97', shared: '#5aa9c9', unique: '#f0a35e' }

export default {
  name: 'CrossSample',
  // Store-backed data source: supplies `sampleData` on demand from the
  // columnar store instead of receiving every parsed row as a prop.
  mixins: [taxaSource],
  // `sampleData` now comes from the taxaSource mixin, derived from the store.
  props: ['socket', 'namesData', 'selectedsamples', 'sampleMeta', 'run', 'bundleconfig', 'fullsize'],
  data() {
    return {
      // Cross-sample comparison needs a wide slice per sample, but still a
      // bounded one -- prevalence across samples is decided by the top taxa.
      taxaLimit: 2000,
      CAT_COLOR,
      rank: 'S',
      subTab: 'table',
      metric: 'jaccard',
      groupFilter: '',
      minPrev: 0,
      query: '',
      sortField: 'nSamples',
      sortDir: 'desc',
      ranks: BASE_RANKS.slice(),
      prevOptions: [0, 10, 25, 50, 75],
      subTabs: [
        { id: 'table', label: 'Frequency table' },
        { id: 'occ', label: 'Occupancy bar' },
        { id: 'heat', label: 'Co-occurrence' }
      ],
      metrics: [
        { id: 'jaccard', label: 'Jaccard', tip: 'Presence/absence overlap of taxa between samples' },
        { id: 'cosine', label: 'Cosine', tip: 'Abundance-weighted similarity of taxa profiles' }
      ],
      groupColorScale: d3.scaleOrdinal(PAL)
    }
  },
  computed: {
    hasData() { return this.sampleData && Object.keys(this.sampleData).length > 0 },
    sampleKeys() { return Object.keys(this.sampleData || {}) },
    // taxon -> reads per sample, plus taxon -> group, at the selected rank
    profiles() {
      const perSample = {}
      const groupOf = {}
      this.sampleKeys.forEach((s) => {
        const rows = this.sampleData[s] || []
        let curDomain = '—'
        const vec = {}
        rows.forEach((r) => {
          if (r.taxid === -1) return
          if (r.rank_code === 'D') curDomain = r.target
          if (r.rank_code === this.rank) {
            const v = +r.num_fragments_clade || 0
            if (v > 0) {
              vec[r.target] = (vec[r.target] || 0) + v
              if (!(r.target in groupOf)) groupOf[r.target] = curDomain
            }
          }
        })
        perSample[s] = vec
      })
      return { perSample, groupOf }
    },
    rows() {
      const { perSample, groupOf } = this.profiles
      const N = this.sampleKeys.length || 1
      const agg = {}
      this.sampleKeys.forEach((s) => {
        const vec = perSample[s]
        Object.keys(vec).forEach((t) => {
          if (!agg[t]) agg[t] = { target: t, group: groupOf[t] || '—', reads: 0, nSamples: 0 }
          agg[t].reads += vec[t]
          agg[t].nSamples += 1
        })
      })
      return Object.values(agg).map((r) => {
        r.prevalence = (r.nSamples / N) * 100
        return r
      })
    },
    groupList() {
      return Array.from(new Set(this.rows.map((r) => r.group))).sort()
    },
    kpis() {
      const N = this.sampleKeys.length
      const rows = this.rows
      const core = rows.filter((r) => r.nSamples >= N && N > 0).length
      const unique = rows.filter((r) => r.nSamples <= 1).length
      const meanPrev = rows.length ? rows.reduce((a, r) => a + r.prevalence, 0) / rows.length : 0
      return {
        organisms: rows.length, samples: N, core,
        unique, shared: rows.length - core - unique,
        meanPrev: Math.round(meanPrev)
      }
    },
    filteredRows() {
      const q = this.query.trim().toLowerCase()
      let out = this.rows.filter((r) => {
        if (this.groupFilter && r.group !== this.groupFilter) return false
        if (this.minPrev && r.prevalence < this.minPrev) return false
        if (q && !((r.target || '').toLowerCase().includes(q) || (r.group || '').toLowerCase().includes(q))) return false
        return true
      })
      const f = this.sortField, dir = this.sortDir === 'asc' ? 1 : -1
      out = out.slice().sort((a, b) => {
        let av = a[f], bv = b[f]
        if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0 }
        return (av - bv) * dir
      })
      return out
    },
    activeMetricNote() {
      return this.metric === 'jaccard'
        ? 'Jaccard = shared taxa ÷ total distinct taxa (presence/absence). 1.0 = identical sets.'
        : 'Cosine = abundance-weighted angle between read-count profiles. 1.0 = identical proportions.'
    }
  },
  watch: {
    // Deep watch removed: see Heatmap.vue for the reasoning. This tab compares
    // taxa across every loaded sample, so it asks the store for a wider slice
    // (taxaLimit below) but still never holds full reports.
    storeTick() { this.syncRanks(); this.$nextTick(this.renderActive) },
    'taxaQuery.version'() { this.syncRanks(); this.$nextTick(this.renderActive) },
    rank() { this.$nextTick(this.renderActive) },
    subTab() { this.$nextTick(this.renderActive) },
    metric() { this.$nextTick(this.renderHeat) }
  },
  mounted() {
    this.syncRanks()
    this.$nextTick(this.renderActive)
  },
  methods: {
    rankLabel(code) {
      if (/^S\d+$/.test(String(code || ''))) return `Subspecies (${code})`
      return ({ D: 'Domain', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species' }[code]) || code
    },
    category(n) {
      const N = this.sampleKeys.length
      if (n >= N && N > 0) return 'core'
      if (n <= 1) return 'unique'
      return 'shared'
    },
    groupColor(g) { return this.groupColorScale(g) },
    syncRanks() {
      if (!this.sampleData) return
      const present = new Set()
      Object.values(this.sampleData).forEach((rows) => {
        if (rows) rows.forEach((r) => r.rank_code && r.taxid !== -1 && present.add(r.rank_code))
      })
      // Always keep Species in the list so the rank selector never loses it
      present.add('S')
      const base = BASE_RANKS.filter((r) => present.has(r))
      const subs = Array.from(present).filter((r) => /^S\d+$/.test(r))
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      const found = [...base, ...subs]
      if (found.length) this.ranks = found
      // Always default to Species
      if (this.ranks.indexOf(this.rank) === -1) {
        this.rank = 'S'
      }
    },
    setSort(f) {
      if (this.sortField === f) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
      else { this.sortField = f; this.sortDir = (f === 'target' || f === 'group') ? 'asc' : 'desc' }
    },
    sortArrow(f) { return this.sortField === f ? (this.sortDir === 'asc' ? '▲' : '▼') : '' },
    renderActive() {
      if (this.sampleKeys.length < 2) return
      if (this.subTab === 'occ') this.renderOcc()
      else if (this.subTab === 'heat') this.renderHeat()
    },
    renderOcc() {
      const host = this.$refs.occBar
      if (!host) return
      host.innerHTML = ''
      const N = this.sampleKeys.length
      const counts = {}
      for (let k = 1; k <= N; k++) counts[k] = 0
      this.rows.forEach((r) => { counts[r.nSamples] = (counts[r.nSamples] || 0) + 1 })
      const levels = d3.range(1, N + 1)
      const W = host.clientWidth || 600, H = 280
      const m = { t: 14, r: 14, b: 44, l: 46 }
      const iw = W - m.l - m.r, ih = H - m.t - m.b
      const x = d3.scaleBand().domain(levels).range([0, iw]).padding(0.18)
      const maxY = d3.max(levels, (k) => counts[k]) || 1
      const y = d3.scaleLinear().domain([0, maxY]).nice().range([ih, 0])
      const svg = d3.select(host).append('svg').attr('width', '100%').attr('height', H)
        .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMinYMin meet')
      const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`)
      const ticks = y.ticks(Math.min(5, maxY))
      g.selectAll('.gl').data(ticks).enter().append('line').attr('x1', 0).attr('x2', iw)
        .attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', '#eef2f7')
      g.selectAll('.yl').data(ticks).enter().append('text').attr('x', -8).attr('y', (d) => y(d) + 3)
        .attr('text-anchor', 'end').attr('font-size', 10).attr('fill', '#7a8a9a').text((d) => d)
      levels.forEach((k) => {
        const c = counts[k], cat = this.category(k)
        g.append('rect').attr('x', x(k)).attr('width', x.bandwidth())
          .attr('y', y(c)).attr('height', ih - y(c)).attr('rx', 3).attr('fill', CAT_COLOR[cat])
        g.append('text').attr('x', x(k) + x.bandwidth() / 2).attr('y', y(c) - 4)
          .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#44525f').text(c || '')
        g.append('text').attr('x', x(k) + x.bandwidth() / 2).attr('y', ih + 15)
          .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#5a6b7b').text(k)
      })
      g.append('text').attr('x', iw / 2).attr('y', ih + 34).attr('text-anchor', 'middle')
        .attr('font-size', 10.5).attr('fill', '#5a6b7b').text('# samples an organism is detected in')
    },
    similarity(a, b) {
      // a, b: { taxon: reads } maps
      if (this.metric === 'jaccard') {
        const ka = Object.keys(a), kb = new Set(Object.keys(b))
        let inter = 0
        ka.forEach((t) => { if (kb.has(t)) inter += 1 })
        const union = ka.length + kb.size - inter
        return union ? inter / union : 0
      }
      // cosine over union of taxa
      let dot = 0, na = 0, nb = 0
      const keys = new Set([...Object.keys(a), ...Object.keys(b)])
      keys.forEach((t) => {
        const va = a[t] || 0, vb = b[t] || 0
        dot += va * vb; na += va * va; nb += vb * vb
      })
      return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
    },
    renderHeat() {
      const host = this.$refs.heat
      if (!host) return
      host.innerHTML = ''
      const samples = this.sampleKeys
      const n = samples.length
      const { perSample } = this.profiles
      // matrix
      const M = samples.map((s1) => samples.map((s2) => this.similarity(perSample[s1], perSample[s2])))
      const avail = host.clientWidth || 600
      const MAX_CELL = 56
      const LABEL = 116
      const m = { t: 16, r: 16, b: LABEL, l: LABEL }
      // cap the cell size so a small matrix doesn't blow up to fill the column
      const cell = Math.min(MAX_CELL, Math.max(22, (avail - m.l - m.r) / n))
      const gridW = cell * n
      const CW = m.l + gridW + m.r
      const H = m.t + m.b + gridW
      const labelChars = cell >= 40 ? 16 : cell >= 30 ? 13 : 10
      const labelFont = Math.min(11, Math.max(8, cell / 2.6))
      const color = d3.scaleSequential(d3.interpolateYlGnBu).domain([0, 1])
      const svg = d3.select(host).append('svg').attr('height', H)
        .attr('width', CW).style('max-width', '100%').style('display', 'block').style('margin', '0 auto')
        .attr('viewBox', `0 0 ${CW} ${H}`).attr('preserveAspectRatio', 'xMinYMin meet')
      const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`)
      const tip = d3.select(host).append('div').attr('class', 'mtx-xs-tip').style('opacity', 0)
      const showText = cell >= 34
      M.forEach((rowVals, i) => {
        rowVals.forEach((v, j) => {
          g.append('rect').attr('x', j * cell).attr('y', i * cell)
            .attr('width', cell - 1).attr('height', cell - 1).attr('rx', 2)
            .attr('fill', color(v)).style('cursor', 'default')
            .on('mousemove', (e) => {
              tip.html(`<b>${samples[i]}</b> × <b>${samples[j]}</b><br>${this.metric === 'jaccard' ? 'Jaccard' : 'Cosine'}: ${v.toFixed(3)}`)
                .style('opacity', 1)
                .style('left', (e.offsetX + 14) + 'px').style('top', (e.offsetY + 14) + 'px')
            })
            .on('mouseleave', () => tip.style('opacity', 0))
          if (showText) {
            g.append('text').attr('x', j * cell + cell / 2).attr('y', i * cell + cell / 2 + 3)
              .attr('text-anchor', 'middle').attr('font-size', Math.min(11, cell / 3.4))
              .attr('fill', v > 0.55 ? '#fff' : '#33485c').text(v.toFixed(2))
          }
        })
      })
      // axis labels
      samples.forEach((s, i) => {
        const disp = this.$fmtSample(s)
        g.append('text').attr('x', -8).attr('y', i * cell + cell / 2 + 3).attr('text-anchor', 'end')
          .attr('font-size', labelFont).attr('fill', '#33485c').text(this.truncate(disp, labelChars))
          .append('title').text(disp)
        g.append('text')
          .attr('transform', `translate(${i * cell + cell / 2},${gridW + 8}) rotate(45)`)
          .attr('text-anchor', 'start').attr('font-size', labelFont)
          .attr('fill', '#33485c').text(this.truncate(disp, labelChars))
          .append('title').text(disp)
      })
      this.renderScale(color)
    },
    renderScale(color) {
      const host = this.$refs.heatScale
      if (!host) return
      host.innerHTML = ''
      const W = 160, H = 30, bw = 120
      const svg = d3.select(host).append('svg').attr('width', W).attr('height', H)
      const defs = svg.append('defs')
      const grad = defs.append('linearGradient').attr('id', 'mtx-xs-grad').attr('x1', '0%').attr('x2', '100%')
      d3.range(0, 1.01, 0.1).forEach((t) => {
        grad.append('stop').attr('offset', (t * 100) + '%').attr('stop-color', color(t))
      })
      svg.append('rect').attr('x', 0).attr('y', 2).attr('width', bw).attr('height', 10).attr('rx', 2)
        .attr('fill', 'url(#mtx-xs-grad)')
      svg.append('text').attr('x', 0).attr('y', 26).attr('font-size', 10).attr('fill', '#7a8a9a').text('0')
      svg.append('text').attr('x', bw).attr('y', 26).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', '#7a8a9a').text('1')
    },
    truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
  }
}
</script>

<style scoped>
.mtx-xs { padding-top: 8px; display: flex; flex-direction: column; gap: 12px; font-family: Inter, system-ui, sans-serif; }
.mtx-xs-hero {
  display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;
  background: linear-gradient(130deg, #0e3f6a 0%, #1e6b97 55%, #4a9bbb 100%);
  color: #fff; border-radius: 14px; padding: 14px 16px; box-shadow: 0 6px 16px rgba(20, 56, 84, 0.18);
}
.mtx-xs-hero-title-wrap { max-width: 760px; }
.mtx-xs-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; opacity: .85; margin-bottom: 2px; }
.mtx-xs-hero-title { margin: 0; font-size: 24px; line-height: 1.15; font-weight: 800; }
.mtx-xs-hero-sub { margin: 7px 0 0; font-size: 13px; line-height: 1.4; opacity: .95; }
.mtx-xs-hero-ctrl { display: flex; gap: 8px; }
.mtx-xs-hero-ctrl .mtx-xs-field span { color: rgba(255,255,255,.85); }
.mtx-xs-hero-ctrl select { background: rgba(255,255,255,.16); color: #fff; border-color: rgba(255,255,255,.3); }
.mtx-xs-hero-ctrl select option { color: #1f2937; }

.mtx-xs-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #5b6573; font-weight: 600; }
.mtx-xs-field-grow { flex: 1 1 auto; min-width: 120px; }
.mtx-xs-field select, .mtx-xs-field input {
  font-size: 12px; padding: 6px 9px; border: 1px solid #cfdbe8; border-radius: 8px; background: #fff; color: #274766;
  font-weight: 500; outline: none; transition: border-color .15s, box-shadow .15s;
}
.mtx-xs-field select:focus, .mtx-xs-field input:focus { border-color: #1e6b97; box-shadow: 0 0 0 3px rgba(30,107,151,.15); }

.mtx-xs-blank { color: #8a97a4; font-style: italic; padding: 60px; text-align: center; }

.mtx-xs-kpis { display: flex; gap: 8px; flex-wrap: wrap; }
.mtx-xs-kpi { flex: 1 1 0; min-width: 96px; background: #fff; border: 1px solid #e6eef5; border-radius: 11px; padding: 9px 12px; }
.mtx-xs-kpi .v { font-size: 19px; font-weight: 800; color: #274766; font-variant-numeric: tabular-nums; }
.mtx-xs-kpi .l { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #8a97a4; margin-top: 2px; }

.mtx-xs-tabs { display: flex; gap: 4px; border-bottom: 1px solid #e2e8f0; }
.mtx-xs-tab { background: transparent; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px;
  padding: 9px 14px; font-size: 13px; font-weight: 600; color: #5b6573; cursor: pointer; }
.mtx-xs-tab:hover { color: #1e6b97; }
.mtx-xs-tab.active { color: #0e3f6a; border-bottom-color: #1e6b97; }

.mtx-xs-card { background: #fff; border: 1px solid #d9e6f1; border-radius: 14px; padding: 14px 16px; }
.mtx-xs-h3 { margin: 0; font-size: 15px; color: #274766; font-weight: 700; }
.mtx-xs-sub { margin: 4px 0 10px; font-size: 12px; color: #5a6b7b; line-height: 1.4; }

.mtx-xs-controls { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; margin-bottom: 12px; }
.mtx-xs-count { font-size: 11px; color: #8a97a4; margin-left: auto; align-self: center; }

.mtx-xs-table-wrap { max-height: 540px; overflow: auto; border: 1px solid #e6eef5; border-radius: 10px; }
.mtx-xs-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.mtx-xs-table thead th { position: sticky; top: 0; background: #0e3f6a; color: #fff; text-align: left;
  padding: 8px 10px; font-weight: 600; cursor: pointer; white-space: nowrap; user-select: none; z-index: 1; }
.mtx-xs-table thead th.num { text-align: right; }
.mtx-xs-table thead th .ar { font-size: 9px; opacity: .9; }
.mtx-xs-table tbody td { padding: 6px 10px; border-bottom: 1px solid #eef2f7; color: #2f3e4c; }
.mtx-xs-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
.mtx-xs-table tbody tr:hover td { background: #f4f9fc; }
.mtx-xs-chip { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
.mtx-xs-cat { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; font-weight: 600; text-transform: capitalize; }
.mtx-xs-cat.cat-core { background: #dceaf3; color: #0e3f6a; }
.mtx-xs-cat.cat-shared { background: #e3f1f6; color: #2c6f8a; }
.mtx-xs-cat.cat-unique { background: #fcecd9; color: #b5701e; }
.mtx-xs-empty { text-align: center; color: #8a97a4; font-style: italic; padding: 24px; }

.mtx-xs-plot { width: 100%; position: relative; }
.mtx-xs-heatplot { margin-top: 4px; }
.mtx-xs-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; }
.mtx-xs-legend span { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: #5f7081; }
.mtx-xs-legend i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }

.mtx-xs-heat-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.mtx-xs-metric { display: inline-flex; background: #eef3f7; border-radius: 9px; padding: 3px; gap: 2px; flex: none; }
.mtx-xs-metric-btn { border: none; background: transparent; padding: 6px 14px; font-size: 12px; font-weight: 600;
  color: #5b6573; border-radius: 7px; cursor: pointer; transition: background .15s, color .15s; }
.mtx-xs-metric-btn:hover { color: #1e6b97; }
.mtx-xs-metric-btn.active { background: #fff; color: #0e3f6a; box-shadow: 0 1px 4px rgba(20,56,84,.14); }
.mtx-xs-heat-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
.mtx-xs-metric-note { font-size: 11px; color: #8a97a4; }
.mtx-xs-tip { position: absolute; pointer-events: none; background: rgba(15,40,60,.94); color: #fff; font-size: 11px;
  padding: 5px 8px; border-radius: 6px; line-height: 1.35; white-space: nowrap; z-index: 5; transition: opacity .1s; }

@media (max-width: 980px) {
  .mtx-xs-hero { flex-direction: column; }
  .mtx-xs-heat-head { flex-direction: column; }
}
</style>
