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
              <span class="mtx-dock-coord">
                {{ fmt(active.lat) }}, {{ fmt(active.lon) }}
                <template v-if="groupMembers.length > 1"> · {{ groupMembers.length }} samples here</template>
              </span>
            </div>
            <button class="mtx-dock-close" @click="closeDock" title="Close">×</button>
          </div>

          <!-- When several samples share a location, the segmented dot expands
               into one chip per sample so you can inspect each in turn. -->
          <div v-if="groupMembers.length > 1" class="mtx-dock-chips">
            <button v-for="m in groupMembers" :key="m.sample"
                    :class="['mtx-dock-chip', { active: m.sample === selectedSample }]"
                    @click="selectedSample = m.sample">
              <span class="mtx-dock-chip-dot" :style="{ background: m.color }"></span>
              {{ m.sample }}
            </button>
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
            <div v-show="dockTab === 'bar'" class="mtx-pg-nav">
              <button :disabled="dockPage.bar === 0" @click="dockPage = { ...dockPage, bar: dockPage.bar - 1 }; $nextTick(renderDock)">‹</button>
              <span>{{ dockPage.bar + 1 }} / {{ barTotalPages }}</span>
              <button :disabled="dockPage.bar >= barTotalPages - 1" @click="dockPage = { ...dockPage, bar: dockPage.bar + 1 }; $nextTick(renderDock)">›</button>
            </div>
            <div v-show="dockTab === 'heat'" ref="dockHeat" class="mtx-dock-plot"></div>
            <div v-show="dockTab === 'heat'" class="mtx-pg-nav">
              <button :disabled="dockPage.heat === 0" @click="dockPage = { ...dockPage, heat: dockPage.heat - 1 }; $nextTick(renderDock)">‹</button>
              <span>{{ dockPage.heat + 1 }} / {{ heatTotalPages }}</span>
              <button :disabled="dockPage.heat >= heatTotalPages - 1" @click="dockPage = { ...dockPage, heat: dockPage.heat + 1 }; $nextTick(renderDock)">›</button>
            </div>
            <div v-show="dockTab === 'donut'" ref="dockDonut" class="mtx-dock-plot mtx-dock-plot-donut"></div>
          </div>

          <div class="mtx-dock-rank">
            <label>Rank</label>
            <select v-if="dockTab !== 'donut'" v-model="dockRank">
              <option v-for="r in availableRanks" :key="r" :value="r">{{ rankLabel(r) }}</option>
            </select>
            <select v-else v-model="donutRank">
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
      mapZoom: 2,
      clusterPx: 38,        // screen-pixel radius for merging nearby dots
      selectedSample: null,
      selectedGroup: [],    // all samples at the clicked location
      dockTab: 'bar',
      dockRank: 'S',
      donutRank: 'G',
      dockPageSize: 10,
      dockPage: { bar: 0, heat: 0 },
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
    groupMembers() {
      // The set of samples sharing the active location (for the dock chips).
      if (this.selectedGroup.length) {
        return this.selectedGroup
          .map(s => this.placed.find(p => p.sample === s))
          .filter(Boolean)
      }
      return this.active ? [this.active] : []
    },
    availableRanks() {
      if (!this.active) return ['S']
      const present = new Set(this.active.rows.filter(r => r.taxid !== -1).map(r => r.rank_code))
      // Always keep Species in the list
      present.add('S')
      const found = RANKS.filter(r => present.has(r))
      return found.length ? found : ['S']
    },
    barTotalPages() {
      if (!this.active) return 1
      const n = this.active.rows.filter(r => r.rank_code === this.dockRank && r.taxid !== -1 && r.num_fragments_clade > 0).length
      return Math.max(1, Math.ceil(n / this.dockPageSize))
    },
    heatTotalPages() {
      if (!this.active) return 1
      const n = this.active.rows.filter(r => r.rank_code === this.dockRank && r.taxid !== -1 && r.num_fragments_clade > 0).length
      return Math.max(1, Math.ceil(n / this.dockPageSize))
    },
    dockTitle() {
      const rl = this.rankLabel(this.dockRank)
      if (this.dockTab === 'bar') return `Top ${rl} by reads`
      if (this.dockTab === 'heat') return `${rl} abundance heatmap`
      return `${this.rankLabel(this.donutRank)} composition`
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
      // Always default to Species for bar/heat tabs; keep donutRank at Genus unless unavailable
      this.dockRank = 'S'
      if (this.availableRanks.indexOf(this.donutRank) === -1) {
        this.donutRank = this.availableRanks.indexOf('G') > -1 ? 'G' : this.availableRanks[this.availableRanks.length - 1]
      }
      this.dockPage = { bar: 0, heat: 0 }
      this.$nextTick(this.renderDock)
    },
    dockTab() { this.$nextTick(this.renderDock) },
    dockRank() {
      this.dockPage = { bar: 0, heat: 0 }
      this.$nextTick(this.renderDock)
    },
    donutRank() { this.$nextTick(this.renderDock) }
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

      // Re-cluster whenever the projection changes (zoom merges/splits dots).
      this.map.on('zoomend moveend', this.recluster)
      this.mapZoom = this.map.getZoom()
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
    // Fit the viewport to all placed samples, then draw clustered markers.
    // Called on mount and whenever the underlying sample set changes.
    renderLeafletData() {
      if (!this.map || !this.markersLayer) return
      if (!this.placed.length) {
        this.markersLayer.clearLayers()
        this.map.setView([20, 0], 2)
        return
      }
      const bounds = this.placed.map(p => [p.lat, p.lon])
      if (bounds.length === 1) {
        this.map.setView(bounds[0], 6)
      } else {
        this.map.fitBounds(bounds, { padding: [44, 44], maxZoom: 12 })
      }
      this.recluster()
    },
    // Group samples by location, merge nearby groups by on-screen distance at
    // the current zoom, and render each result as one segmented dot. Re-runs on
    // every zoom/pan so dots split apart as you zoom in and merge as you zoom out.
    recluster() {
      if (!this.map || !this.markersLayer) return
      this.markersLayer.clearLayers()
      const placed = this.placed
      if (!placed.length) return
      this.mapZoom = this.map.getZoom()

      // 1) collapse exactly co-located samples into stacks (one per coordinate)
      const byCoord = new Map()
      placed.forEach((p) => {
        const key = p.lat.toFixed(5) + ',' + p.lon.toFixed(5)
        let st = byCoord.get(key)
        if (!st) { st = { lat: p.lat, lon: p.lon, members: [] }; byCoord.set(key, st) }
        st.members.push(p)
      })
      const stacks = Array.from(byCoord.values())

      // 2) greedily merge stacks whose screen positions fall within clusterPx
      const proj = stacks.map(s => ({ s, pt: this.map.latLngToLayerPoint([s.lat, s.lon]) }))
      const used = new Array(proj.length).fill(false)
      const clusters = []
      for (let i = 0; i < proj.length; i++) {
        if (used[i]) continue
        used[i] = true
        const grp = [proj[i]]
        for (let j = i + 1; j < proj.length; j++) {
          if (used[j]) continue
          if (proj[i].pt.distanceTo(proj[j].pt) <= this.clusterPx) { used[j] = true; grp.push(proj[j]) }
        }
        clusters.push(grp)
      }

      // 3) one segmented marker per cluster
      const maxZoom = this.map.getMaxZoom() || 19
      clusters.forEach((grp) => {
        const stackList = grp.map(g => g.s)
        const members = stackList.reduce((acc, s) => acc.concat(s.members), [])
        const distinctCoords = stackList.length
        const isCluster = distinctCoords > 1
        const lat = d3.mean(stackList, s => s.lat)
        const lon = d3.mean(stackList, s => s.lon)

        const marker = L.marker([lat, lon], { icon: this.segIcon(members, isCluster) })
        marker.bindTooltip(this.clusterTip(members, isCluster), {
          direction: 'top', offset: [0, -6], opacity: 0.92
        })
        marker.on('click', () => {
          if (isCluster && this.mapZoom < maxZoom) {
            // zoom in to break the merged dot back into its locations
            const b = L.latLngBounds(stackList.map(s => [s.lat, s.lon]))
            this.map.flyToBounds(b.pad(0.5), { maxZoom: Math.min(maxZoom, this.mapZoom + 3) })
          } else {
            this.openGroup(members)
          }
        })
        marker.addTo(this.markersLayer)
      })
    },
    // Build an SVG divIcon: a filled dot for a lone sample, or a donut split
    // into one wedge per sample (with the total count in the hole) otherwise.
    segIcon(members, isCluster) {
      const count = members.length
      let R
      if (count === 1 && !isCluster) {
        R = Math.max(6, members[0].r || 8)
      } else {
        R = 13 + Math.min(16, (count - 1) * 2.4)
      }
      const pad = 3
      const size = Math.ceil(2 * R + pad * 2)
      const c = size / 2
      let inner
      if (count === 1 && !isCluster) {
        const m = members[0]
        inner = `<circle cx="${c}" cy="${c}" r="${R}" fill="${m.color}" stroke="#fff" stroke-width="1.6"/>`
      } else {
        const ir = R * 0.5
        const pie = d3.pie().sort(null).value(() => 1)(members)
        const arc = d3.arc().innerRadius(ir).outerRadius(R)
        const wedges = pie.map(d =>
          `<path d="${arc(d)}" fill="${d.data.color}" stroke="#fff" stroke-width="1.4"/>`).join('')
        const label =
          `<circle cx="0" cy="0" r="${ir - 0.5}" fill="#ffffff" fill-opacity="0.94"/>` +
          `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" ` +
          `font-family="Inter, system-ui, sans-serif" font-size="${Math.max(10, ir * 0.95).toFixed(1)}" ` +
          `font-weight="700" fill="#274766">${count}</text>`
        inner = `<g transform="translate(${c},${c})">${wedges}${label}</g>`
      }
      const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ` +
        `xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${inner}</svg>`
      return L.divIcon({ className: 'mtx-seg-icon', html: svg, iconSize: [size, size], iconAnchor: [c, c] })
    },
    clusterTip(members, isCluster) {
      if (members.length === 1) {
        const p = members[0]
        return `${p.sample} · ${p.reads.toLocaleString()} reads` + (p.top ? ` · ${p.top}` : '')
      }
      const names = members.map(m => m.sample).join(', ')
      const action = isCluster ? 'click to zoom in' : 'click to inspect'
      return `${members.length} samples: ${names} (${action})`
    },
    openGroup(members) {
      this.selectedGroup = members.map(m => m.sample)
      this.selectedSample = members[0].sample
    },
    closeDock() {
      this.selectedSample = null
      this.selectedGroup = []
    },
    rankLabel(code) {
      return ({ D: 'Domain', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species' }[code]) || code
    },
    topRows(n, page = 0) {
      if (!this.active) return []
      const sorted = this.active.rows
        .filter(r => r.rank_code === this.dockRank && r.taxid !== -1 && r.num_fragments_clade > 0)
        .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
      if (page !== undefined && n !== undefined) {
        return sorted.slice(page * n, (page + 1) * n)
      }
      return sorted.slice(0, n)
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
      const data = this.topRows(this.dockPageSize, this.dockPage.bar)
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
      const data = this.topRows(this.dockPageSize, this.dockPage.heat)
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
      // Compute composition at the selected donutRank (default Genus)
      const rows = this.active.rows.filter(r => r.rank_code === this.donutRank && r.taxid !== -1)
      const totals = {}
      rows.forEach(r => {
        totals[r.target] = (totals[r.target] || 0) + r.num_fragments_clade
      })
      const gtot = d3.sum(Object.values(totals)) || 1
      const groups = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, v]) => ({ name, pct: (v / gtot) * 100, color: this.groupColor(name) }))
      if (!groups.length) { host.innerHTML = '<div class="mtx-dock-empty">No composition data at this rank.</div>'; return }
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
.mtx-pg-nav { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 0 2px; }
.mtx-pg-nav button { background: none; border: 1px solid #ccd6e0; border-radius: 4px; padding: 1px 7px; cursor: pointer; font-size: 14px; color: #33485c; line-height: 1.4; }
.mtx-pg-nav button:disabled { opacity: 0.35; cursor: default; }
.mtx-pg-nav button:not(:disabled):hover { background: #eef3f7; }
.mtx-pg-nav span { font-size: 11px; color: #6b8299; min-width: 40px; text-align: center; }
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

/* segmented dot / cluster markers (divIcon) */
.mtx-map ::v-deep .mtx-seg-icon,
.mtx-map ::v-deep .leaflet-div-icon { background: transparent; border: none; }
.mtx-map ::v-deep .mtx-seg-icon { cursor: pointer; filter: drop-shadow(0 2px 3px rgba(20,56,84,.28)); }
.mtx-map ::v-deep .mtx-seg-icon svg { transition: transform .12s ease; }
.mtx-map ::v-deep .mtx-seg-icon:hover svg { transform: scale(1.08); }

/* per-location sample chips in the dock */
.mtx-dock-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 9px 12px 2px; }
.mtx-dock-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 999px;
  border: 1px solid #d3e0ec; background: #f4f8fb; color: #33485c; font-size: 11px; font-weight: 600; cursor: pointer; }
.mtx-dock-chip:hover { background: #e9f2fa; }
.mtx-dock-chip.active { background: #0e3f6a; border-color: #0e3f6a; color: #fff; }
.mtx-dock-chip-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; box-shadow: 0 0 0 1px rgba(255,255,255,.7); }

.mtx-map ::v-deep .leaflet-control-attribution { font-size: 10px; }
.mtx-map ::v-deep .leaflet-popup-content { margin: 8px 10px; }
.mtx-map ::v-deep .mtx-leaflet-pop { font-size: 12px; line-height: 1.35; color: #1f2937; }
.mtx-map ::v-deep .mtx-leaflet-pop strong { color: #274766; font-size: 13px; }
</style>
