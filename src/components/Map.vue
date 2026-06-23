<!--
  Map.vue — geographic view backed by Leaflet + OSM tiles.
  Uses true world projection/tiles (not hand-drawn polygons).
-->
<template>
  <div class="mtx-map">
    <div class="mtx-map-head">
      <h3>Sample Map</h3>
      <span class="mtx-map-sub">
        {{ placed.length }} of {{ totalSamples }} samples placed
      </span>
    </div>

    <div class="mtx-map-stage">
      <div class="mtx-map-wrap" :class="{ 'mtx-map-wrap-empty': !placed.length }">
        <div ref="leafletMap" class="mtx-leaflet"></div>

        <div v-if="!placed.length" class="mtx-map-overlay">
          <div class="mtx-map-overlay-art">⌖</div>
          <p><strong>No coordinates yet.</strong></p>
          <p>Add latitude / longitude on the <em>Metadata</em> tab — per sample, or
            “Apply to whole run” — and your samples will appear here.</p>
        </div>
      </div>

      <!-- Per-sample dock: appears when a map dot is clicked -->
      <transition name="mtx-dock-fade">
        <aside v-if="active" class="mtx-dock">
          <div class="mtx-dock-head">
            <span class="mtx-dock-dot" :style="{ background: active.color }"></span>
            <div class="mtx-dock-title">
              <strong>{{ active.sample }}</strong>
              <span class="mtx-dock-coord">{{ fmt(active.lat) }}, {{ fmt(active.lon) }}</span>
            </div>
            <button class="mtx-dock-close" @click="selectedSample = null" title="Close">×</button>
          </div>

          <div class="mtx-dock-kpis">
            <div class="mtx-dock-kpi"><span class="v">{{ active.reads.toLocaleString() }}</span><span class="l">reads</span></div>
            <div class="mtx-dock-kpi"><span class="v">{{ active.nTaxa }}</span><span class="l">taxa</span></div>
            <div class="mtx-dock-kpi"><span class="v">{{ active.groups.length }}</span><span class="l">groups</span></div>
          </div>

          <div class="mtx-dock-tabs">
            <button v-for="t in dockTabs" :key="t.id"
                    :class="['mtx-dock-tab', { active: dockTab === t.id }]"
                    @click="dockTab = t.id">{{ t.label }}</button>
          </div>

          <div class="mtx-dock-body">
            <div class="mtx-dock-plot-ttl">{{ dockTitle }}</div>
            <div v-show="dockTab === 'bar'" ref="dockBar" class="mtx-dock-plot"></div>
            <div v-show="dockTab === 'heat'" ref="dockHeat" class="mtx-dock-plot"></div>
            <div v-show="dockTab === 'donut'" ref="dockDonut" class="mtx-dock-plot mtx-dock-plot-donut"></div>
          </div>

          <div class="mtx-dock-rank" v-if="dockTab !== 'donut'">
            <label>Rank</label>
            <select v-model="dockRank">
              <option v-for="r in availableRanks" :key="r" :value="r">{{ rankLabel(r) }}</option>
            </select>
          </div>
        </aside>
      </transition>
    </div>

    <div class="mtx-map-list" v-if="placed.length">
      <div v-for="p in placed" :key="p.sample + '-row'" class="mtx-map-row">
        <span class="mtx-map-dot" :style="{ background: p.color }"></span>
        <span class="mtx-map-name">{{ p.sample }}</span>
        <span class="mtx-map-coord">{{ fmt(p.lat) }}, {{ fmt(p.lon) }}</span>
        <span class="mtx-map-reads">{{ p.reads.toLocaleString() }} reads</span>
        <span class="mtx-map-top" v-if="p.top">{{ p.top }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import * as d3 from 'd3'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const PAL = d3.schemeTableau10.concat(d3.schemeSet3)
const RANKS = ['D', 'P', 'C', 'O', 'F', 'G', 'S']

export default {
  name: 'Map',
  props: {
    sampleData: { type: Object, default: () => ({}) },
    sampleMeta: { type: Object, default: () => ({}) }
  },
  data() {
    return {
      color: d3.scaleOrdinal(PAL),
      groupColor: d3.scaleOrdinal(PAL),
      map: null,
      markersLayer: null,
      tileLayer: null,
      selectedSample: null,
      dockTab: 'bar',
      dockRank: 'S',
      dockTabs: [
        { id: 'bar', label: 'Top hits' },
        { id: 'heat', label: 'Heatmap' },
        { id: 'donut', label: 'Composition' }
      ]
    }
  },
  computed: {
    totalSamples() { return Object.keys(this.sampleData || {}).length },
    placed() {
      const out = []
      let maxReads = 1
      Object.keys(this.sampleData || {}).forEach((s) => {
        const m = this.sampleMeta[s]
        if (!m || m.lat == null || m.lat === '' || m.lon == null || m.lon === '') return
        const lat = Number(m.lat)
        const lon = Number(m.lon)
        if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return
        const rows = this.sampleData[s] || []
        const base = rows.find(r => r.taxid === -1 || r.depth === 0)
        const reads = base ? base.num_fragments_clade : d3.sum(rows.filter(r => r.rank_code === 'D'), r => r.num_fragments_clade)
        const species = rows.filter(r => r.rank_code === 'S' && r.taxid !== -1)
          .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
        // rank coverage (distinct taxa per rank)
        const ranks = RANKS.map(code => ({
          code, count: rows.filter(r => r.rank_code === code && r.taxid !== -1).length
        }))
        // domain-level composition
        const totals = {}
        rows.filter(r => r.rank_code === 'D' && r.taxid !== -1).forEach(r => {
          totals[r.target] = (totals[r.target] || 0) + r.num_fragments_clade
        })
        const gtot = d3.sum(Object.values(totals)) || 1
        const groups = Object.entries(totals).sort((a, b) => b[1] - a[1])
          .map(([name, v]) => ({ name, pct: (v / gtot) * 100, color: this.groupColor(name) }))
        const nTaxa = rows.filter(r => r.rank_code === 'S' && r.taxid !== -1).length
        maxReads = Math.max(maxReads, reads)
        out.push({
          sample: s, lat, lon, reads, ranks, groups, nTaxa,
          rows,
          top: species[0] ? species[0].target : null,
          topCommon: groups[0] ? groups[0].name : null,
          color: this.color(s)
        })
      })
      const rScale = d3.scaleSqrt().domain([0, maxReads]).range([5, 18])
      out.forEach(p => {
        p.r = rScale(p.reads)
        p.tip = `${p.sample}\n${this.fmt(p.lat)}, ${this.fmt(p.lon)}\n${p.reads.toLocaleString()} reads` +
          (p.top ? `\nTop: ${p.top}` : '') + `\n(click for details)`
      })
      return out
    },
    active() {
      if (!this.selectedSample) return null
      return this.placed.find(p => p.sample === this.selectedSample) || null
    },
    availableRanks() {
      if (!this.active) return ['S']
      const present = new Set(this.active.rows.filter(r => r.taxid !== -1).map(r => r.rank_code))
      const found = RANKS.filter(r => present.has(r))
      return found.length ? found : ['S']
    },
    dockTitle() {
      const rl = this.rankLabel(this.dockRank)
      if (this.dockTab === 'bar') return `Top ${rl} by reads`
      if (this.dockTab === 'heat') return `${rl} abundance heatmap`
      return 'Domain composition'
    }
  },
  watch: {
    placed: {
      deep: true,
      handler() {
        this.renderLeafletData()
      }
    },
    selectedSample() {
      // keep the rank selector valid for the newly selected sample
      if (this.availableRanks.indexOf(this.dockRank) === -1) {
        this.dockRank = this.availableRanks.indexOf('S') > -1 ? 'S' : this.availableRanks[this.availableRanks.length - 1]
      }
      this.$nextTick(this.renderDock)
    },
    dockTab() { this.$nextTick(this.renderDock) },
    dockRank() { this.$nextTick(this.renderDock) }
  },
  mounted() {
    this.$nextTick(() => {
      this.initMap()
      this.renderLeafletData()
    })
  },
  beforeDestroy() {
    if (this.map) {
      this.map.remove()
      this.map = null
    }
  },
  methods: {
    initMap() {
      if (this.map || !this.$refs.leafletMap) return

      // Fix default Leaflet marker assets in webpack builds.
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: markerIcon2x,
        iconUrl: markerIcon,
        shadowUrl: markerShadow
      })

      this.map = L.map(this.$refs.leafletMap, {
        worldCopyJump: true,
        minZoom: 2,
        zoomControl: true
      }).setView([20, 0], 2)

      this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(this.map)

      this.markersLayer = L.layerGroup().addTo(this.map)
    },
    popupHtml(p) {
      const topGroups = (p.groups || []).slice(0, 3).map((g) => `${g.name} ${g.pct.toFixed(1)}%`).join(', ')
      const ranks = (p.ranks || []).map((r) => `${r.code}:${r.count}`).join(' | ')
      return `
        <div class="mtx-leaflet-pop">
          <strong>${p.sample}</strong><br/>
          <span>${this.fmt(p.lat)}, ${this.fmt(p.lon)}</span><br/>
          <span>${p.reads.toLocaleString()} reads</span><br/>
          <span>Top: ${p.top || '-'}</span><br/>
          <span>Groups: ${topGroups || '-'}</span><br/>
          <span>Ranks: ${ranks || '-'}</span>
        </div>
      `
    },
    renderLeafletData() {
      if (!this.map || !this.markersLayer) return

      this.markersLayer.clearLayers()
      if (!this.placed.length) {
        this.map.setView([20, 0], 2)
        return
      }

      const bounds = []
      this.placed.forEach((p) => {
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: p.r,
          stroke: true,
          color: '#ffffff',
          weight: 1.4,
          fillColor: p.color,
          fillOpacity: 0.88
        })

        marker.bindPopup(this.popupHtml(p), { maxWidth: 300 })
        marker.bindTooltip(p.sample, {
          direction: 'top',
          offset: [0, -6],
          opacity: 0.9
        })
        marker.on('click', () => {
          this.selectedSample = p.sample
        })

        marker.addTo(this.markersLayer)
        bounds.push([p.lat, p.lon])
      })

      if (bounds.length === 1) {
        this.map.setView(bounds[0], 4)
      } else {
        this.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 5 })
      }
    },
    rankLabel(code) {
      return ({ D: 'Domain', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species' }[code]) || code
    },
    topRows(n) {
      if (!this.active) return []
      return this.active.rows
        .filter(r => r.rank_code === this.dockRank && r.taxid !== -1 && r.num_fragments_clade > 0)
        .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
        .slice(0, n)
    },
    renderDock() {
      if (!this.active) return
      if (this.dockTab === 'bar') this.renderBar()
      else if (this.dockTab === 'heat') this.renderHeat()
      else this.renderDonut()
    },
    renderBar() {
      const host = this.$refs.dockBar
      if (!host) return
      host.innerHTML = ''
      const data = this.topRows(10)
      if (!data.length) { host.innerHTML = '<div class="mtx-dock-empty">No taxa at this rank.</div>'; return }
      const W = host.clientWidth || 300
      const rowH = 22, m = { t: 6, r: 46, b: 6, l: 4 }
      const labelW = Math.min(140, Math.max(80, W * 0.42))
      const H = m.t + m.b + data.length * rowH
      const iw = W - m.l - m.r - labelW
      const x = d3.scaleLinear().domain([0, d3.max(data, d => d.num_fragments_clade)]).range([0, Math.max(10, iw)])
      const svg = d3.select(host).append('svg').attr('width', '100%').attr('height', H)
        .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMinYMin meet')
      const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`)
      const rows = g.selectAll('g.row').data(data).enter().append('g')
        .attr('transform', (d, i) => `translate(0,${i * rowH})`)
      rows.append('text').attr('x', 0).attr('y', rowH / 2 + 3).attr('font-size', 11).attr('fill', '#33485c')
        .text(d => this.truncate(d.target, 20))
        .append('title').text(d => d.target)
      rows.append('rect').attr('x', labelW).attr('y', 3).attr('height', rowH - 8).attr('rx', 3)
        .attr('width', d => x(d.num_fragments_clade)).attr('fill', this.active.color).attr('fill-opacity', 0.85)
      rows.append('text').attr('x', d => labelW + x(d.num_fragments_clade) + 5).attr('y', rowH / 2 + 3)
        .attr('font-size', 10).attr('fill', '#5f7081').attr('font-variant-numeric', 'tabular-nums')
        .text(d => d.num_fragments_clade.toLocaleString())
    },
    renderHeat() {
      const host = this.$refs.dockHeat
      if (!host) return
      host.innerHTML = ''
      const data = this.topRows(15)
      if (!data.length) { host.innerHTML = '<div class="mtx-dock-empty">No taxa at this rank.</div>'; return }
      const W = host.clientWidth || 300
      const cellH = 20, m = { t: 4, r: 8, b: 4, l: 4 }
      const labelW = Math.min(150, Math.max(90, W * 0.5))
      const cellW = W - m.l - m.r - labelW
      const H = m.t + m.b + data.length * cellH
      const color = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, Math.log10((d3.max(data, d => d.num_fragments_clade) || 10) + 1)])
      const svg = d3.select(host).append('svg').attr('width', '100%').attr('height', H)
        .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMinYMin meet')
      const g = svg.append('g').attr('transform', `translate(${m.l},${m.t})`)
      const rows = g.selectAll('g.row').data(data).enter().append('g')
        .attr('transform', (d, i) => `translate(0,${i * cellH})`)
      rows.append('text').attr('x', 0).attr('y', cellH / 2 + 3).attr('font-size', 11).attr('fill', '#33485c')
        .text(d => this.truncate(d.target, 22)).append('title').text(d => d.target)
      rows.append('rect').attr('x', labelW).attr('y', 2).attr('width', Math.max(20, cellW)).attr('height', cellH - 4)
        .attr('rx', 3).attr('fill', d => color(Math.log10(d.num_fragments_clade + 1)))
      rows.append('text').attr('x', labelW + Math.max(20, cellW) / 2).attr('y', cellH / 2 + 3)
        .attr('text-anchor', 'middle').attr('font-size', 9.5)
        .attr('fill', d => Math.log10(d.num_fragments_clade + 1) > color.domain()[1] * 0.55 ? '#fff' : '#33485c')
        .text(d => d.num_fragments_clade.toLocaleString())
    },
    renderDonut() {
      const host = this.$refs.dockDonut
      if (!host) return
      host.innerHTML = ''
      const groups = (this.active.groups || []).slice(0, 8)
      if (!groups.length) { host.innerHTML = '<div class="mtx-dock-empty">No composition data.</div>'; return }
      const W = host.clientWidth || 300
      const size = Math.min(W, 200), r = size / 2, ir = r * 0.58
      const H = size + 8
      const svg = d3.select(host).append('svg').attr('width', '100%').attr('height', H)
        .attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMinYMin meet')
      const g = svg.append('g').attr('transform', `translate(${W / 2},${r + 4})`)
      const pie = d3.pie().sort(null).value(d => d.pct)(groups)
      const arc = d3.arc().innerRadius(ir).outerRadius(r)
      g.selectAll('path').data(pie).enter().append('path').attr('d', arc)
        .attr('fill', d => d.data.color).attr('stroke', '#fff').attr('stroke-width', 1.5)
        .append('title').text(d => `${d.data.name}: ${d.data.pct.toFixed(1)}%`)
      g.append('text').attr('text-anchor', 'middle').attr('dy', '-2').attr('font-size', 12).attr('font-weight', 700)
        .attr('fill', '#274766').text(groups[0].name)
      g.append('text').attr('text-anchor', 'middle').attr('dy', '14').attr('font-size', 11).attr('fill', '#5f7081')
        .text(groups[0].pct.toFixed(1) + '%')
      // legend
      const legend = d3.select(host).append('div').attr('class', 'mtx-dock-legend')
      legend.selectAll('span').data(groups).enter().append('span').html(d =>
        `<i style="background:${d.color}"></i>${this.truncate(d.name, 16)} ${d.pct.toFixed(1)}%`)
    },
    truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s },
    fmt(v) { return (+v).toFixed(2) }
  }
}
</script>

<style scoped>
.mtx-map { font-family: Inter, system-ui, sans-serif; text-align: left; color: #1f2937; padding: 4px 6px 30px; }
.mtx-map-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.mtx-map-head h3 { margin: 0; color: #274766; font-size: 16px; font-weight: 700; }
.mtx-map-sub { font-size: 12px; color: #8a97a4; }
.mtx-map-wrap { position: relative; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: #fff; }
.mtx-leaflet { width: 100%; height: 430px; }
.mtx-map-wrap-empty .mtx-leaflet { filter: saturate(.9) brightness(1.02); }
.mtx-map-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: rgba(238,246,251,.82); color: #5b6573; padding: 20px; }
.mtx-map-overlay-art { font-size: 46px; color: #9fb6cd; }
.mtx-map-overlay p { margin: 6px 0; max-width: 380px; font-size: 13px; }
.mtx-map-overlay strong { color: #274766; }
.mtx-map-list { margin-top: 14px; display: flex; flex-direction: column; gap: 4px; }
.mtx-map-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid #eef3f7; border-radius: 10px; font-size: 13px; }
.mtx-map-row:hover { background: #f8fbfe; }
.mtx-map-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.mtx-map-name { font-weight: 600; color: #274766; min-width: 120px; }
.mtx-map-coord { color: #5b6573; font-variant-numeric: tabular-nums; min-width: 130px; }
.mtx-map-reads { color: #8a97a4; font-variant-numeric: tabular-nums; }
.mtx-map-top { font-style: italic; color: #5b6573; margin-left: auto; }

/* ---- per-sample dock ---- */
.mtx-map-stage { display: flex; gap: 12px; align-items: flex-start; }
.mtx-map-stage .mtx-map-wrap { flex: 1 1 auto; min-width: 0; }
.mtx-dock {
  flex: 0 0 320px;
  width: 320px;
  align-self: stretch;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 8px 22px rgba(20, 56, 84, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mtx-dock-head { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: 1px solid #eef3f7;
  background: linear-gradient(120deg, #0e3f6a 0%, #1e6b97 100%); color: #fff; }
.mtx-dock-dot { width: 12px; height: 12px; border-radius: 50%; flex: none; box-shadow: 0 0 0 2px rgba(255,255,255,.6); }
.mtx-dock-title { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.mtx-dock-title strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mtx-dock-coord { font-size: 11px; opacity: .82; font-variant-numeric: tabular-nums; }
.mtx-dock-close { margin-left: auto; background: rgba(255,255,255,.16); border: none; color: #fff; width: 24px; height: 24px;
  border-radius: 7px; font-size: 17px; line-height: 1; cursor: pointer; flex: none; }
.mtx-dock-close:hover { background: rgba(255,255,255,.3); }
.mtx-dock-kpis { display: flex; gap: 6px; padding: 10px 12px 4px; }
.mtx-dock-kpi { flex: 1; background: #f4f8fb; border: 1px solid #e6eef5; border-radius: 9px; padding: 6px 8px;
  display: flex; flex-direction: column; align-items: flex-start; }
.mtx-dock-kpi .v { font-size: 14px; font-weight: 700; color: #274766; font-variant-numeric: tabular-nums; }
.mtx-dock-kpi .l { font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #8a97a4; }
.mtx-dock-tabs { display: flex; gap: 4px; padding: 8px 12px 0; }
.mtx-dock-tab { flex: 1; background: transparent; border: none; border-bottom: 2px solid transparent; padding: 6px 4px;
  font-size: 12px; color: #5b6573; cursor: pointer; font-weight: 600; }
.mtx-dock-tab:hover { color: #1e6b97; }
.mtx-dock-tab.active { color: #0e3f6a; border-bottom-color: #1e6b97; }
.mtx-dock-body { padding: 8px 12px; border-top: 1px solid #eef3f7; margin-top: -1px; }
.mtx-dock-plot-ttl { font-size: 11px; color: #5a6b7b; font-weight: 600; margin-bottom: 6px; }
.mtx-dock-plot { min-height: 40px; }
.mtx-dock-plot-donut { display: flex; flex-direction: column; align-items: center; }
.mtx-dock-empty { color: #8a97a4; font-style: italic; font-size: 12px; padding: 16px 4px; }
.mtx-dock-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 8px; }
.mtx-dock-legend span { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #5f7081; }
.mtx-dock-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; flex: none; }
.mtx-dock-rank { display: flex; align-items: center; gap: 8px; padding: 6px 12px 12px; }
.mtx-dock-rank label { font-size: 11px; color: #5b6573; font-weight: 600; }
.mtx-dock-rank select { flex: 1; font-size: 12px; padding: 5px 8px; border: 1px solid #cfdbe8; border-radius: 8px;
  background: #fff; color: #274766; }
.mtx-dock-fade-enter-active, .mtx-dock-fade-leave-active { transition: opacity .2s ease, transform .2s ease; }
.mtx-dock-fade-enter, .mtx-dock-fade-leave-to { opacity: 0; transform: translateX(10px); }
@media (max-width: 900px) {
  .mtx-map-stage { flex-direction: column; }
  .mtx-dock { flex-basis: auto; width: 100%; }
}

.mtx-map ::v-deep .leaflet-control-attribution { font-size: 10px; }
.mtx-map ::v-deep .leaflet-popup-content { margin: 8px 10px; }
.mtx-map ::v-deep .mtx-leaflet-pop { font-size: 12px; line-height: 1.35; color: #1f2937; }
.mtx-map ::v-deep .mtx-leaflet-pop strong { color: #274766; font-size: 13px; }
</style>
