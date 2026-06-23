<!--
  Metadata.vue — per-sample summary cards (read totals, rank coverage, top
  organism, dominant group) + run/sample geo-metadata (lat/long). Live-updates
  as report data streams in. Boxes show rich hover tooltips (v-tip directive →
  shared floating tooltip).
-->
<template>
  <div class="mtx-meta">
    <!-- run-level metadata: apply coordinates to every sample in the run -->
    <div class="mtx-run-meta" v-if="cards.length">
      <div class="mtx-run-meta-head">
        <span class="mtx-run-meta-title">Run metadata</span>
        <span class="mtx-run-meta-sub">{{ run || 'current run' }} · applies to all {{ cards.length }} samples</span>
      </div>
      <div class="mtx-run-meta-form">
        <label class="mtx-mfield" v-tip="'Decimal latitude, e.g. 39.16 (north positive)'">
          <span>Latitude</span>
          <input v-model="runLat" type="number" step="any" placeholder="—" />
        </label>
        <label class="mtx-mfield" v-tip="'Decimal longitude, e.g. -76.62 (east positive)'">
          <span>Longitude</span>
          <input v-model="runLon" type="number" step="any" placeholder="—" />
        </label>
        <button class="mtx-mbtn" @click="applyRun" v-tip="'Apply these coordinates to every sample in the run — they all appear on the Map tab'">
          Apply to whole run
        </button>
      </div>
    </div>

    <div class="mtx-meta-grid" v-if="cards.length">
      <article v-for="c in cards" :key="c.sample" class="mtx-meta-card">
        <header>
          <h3 v-tip="'Sample ' + c.sample">{{ c.sample }}</h3>
          <span class="mtx-meta-reads" v-tip="c.reads.toLocaleString() + ' total classified + unclassified reads in this sample'">{{ c.reads | n }} reads</span>
        </header>
        <div class="mtx-meta-top">
          <span class="mtx-meta-label">Top organism</span>
          <span class="mtx-meta-org" v-tip="topTip(c)">{{ c.topName || '—' }}</span>
          <span v-if="c.topCommon" class="mtx-grp" v-tip="'Common group: ' + c.topCommon">{{ c.topCommon }}</span>
        </div>
        <div class="mtx-meta-ranks">
          <div v-for="r in c.ranks" :key="r.code"
            class="mtx-meta-rank"
            v-tip="r.count + ' distinct taxa classified at ' + r.label + ' rank (Kraken2 code ' + r.code + ')'">
            <span class="mtx-meta-rcount">{{ r.count }}</span>
            <span class="mtx-meta-rlabel">{{ r.label }}</span>
          </div>
        </div>
        <div class="mtx-meta-groups" v-if="c.groups.length">
          <span class="mtx-meta-label">Composition</span>
          <div class="mtx-meta-stack">
            <i v-for="g in c.groups" :key="g.name"
              :style="{ width: g.pct + '%', background: g.color }"
              v-tip="g.name + ' — ' + g.pct.toFixed(1) + '% of domain-level reads'"></i>
          </div>
          <div class="mtx-meta-chips">
            <span v-for="g in c.groups.slice(0, 5)" :key="g.name" class="mtx-meta-gchip"
              v-tip="g.name + ' — ' + g.pct.toFixed(1) + '% of domain-level reads'">
              <i :style="{ background: g.color }"></i>{{ g.name }} {{ g.pct.toFixed(0) }}%
            </span>
          </div>
        </div>

        <!-- per-sample coordinate editor -->
        <div class="mtx-meta-coords">
          <span class="mtx-meta-label">
            Coordinates
            <span v-if="hasCoords(c.sample)" class="mtx-coord-ok" v-tip="'Coordinates set — this sample appears on the Map tab'">● on map</span>
            <span v-else class="mtx-coord-missing" v-tip="'No coordinates yet — add lat/long to place this sample on the Map tab'">○ not on map</span>
          </span>
          <div class="mtx-coord-form">
            <input :value="coordVal(c.sample, 'lat')"
              @input="buf(c.sample, 'lat', $event.target.value)"
              type="number" step="any" placeholder="lat" v-tip="'Latitude for ' + c.sample" />
            <input :value="coordVal(c.sample, 'lon')"
              @input="buf(c.sample, 'lon', $event.target.value)"
              type="number" step="any" placeholder="lon" v-tip="'Longitude for ' + c.sample" />
            <button class="mtx-mbtn sm" @click="saveSample(c.sample)" v-tip="'Save coordinates for this sample'">Save</button>
          </div>
        </div>
      </article>
    </div>
    <div class="mtx-meta-blank" v-else>No samples loaded yet.</div>
  </div>
</template>

<script>
import * as d3 from 'd3'
import commonNames from '@/assets/taxon_common_names.json'
const RANK_LABELS = { D: 'Domain', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species' }
const PAL = d3.schemeTableau10.concat(d3.schemeSet3)

// ---- shared floating tooltip (singleton appended to <body>) ----
let TIP_EL = null
function tipEl() {
  if (!TIP_EL) {
    TIP_EL = document.createElement('div')
    TIP_EL.className = 'mtx-floattip'
    document.body.appendChild(TIP_EL)
  }
  return TIP_EL
}
function showTip(text, e) {
  const el = tipEl()
  el.textContent = text
  el.style.opacity = '1'
  moveTip(e)
}
function moveTip(e) {
  const el = tipEl()
  const pad = 14
  let x = e.clientX + pad
  let y = e.clientY + pad
  const w = el.offsetWidth || 200, h = el.offsetHeight || 40
  if (x + w > window.innerWidth - 8) x = e.clientX - w - pad
  if (y + h > window.innerHeight - 8) y = e.clientY - h - pad
  el.style.left = x + 'px'
  el.style.top = y + 'px'
}
function hideTip() { if (TIP_EL) TIP_EL.style.opacity = '0' }

export default {
  name: 'Metadata',
  directives: {
    tip: {
      bind(el, binding) {
        el.__tipText = binding.value
        el.__onEnter = (e) => showTip(el.__tipText, e)
        el.__onMove = (e) => moveTip(e)
        el.__onLeave = () => hideTip()
        el.addEventListener('mouseenter', el.__onEnter)
        el.addEventListener('mousemove', el.__onMove)
        el.addEventListener('mouseleave', el.__onLeave)
      },
      update(el, binding) { el.__tipText = binding.value },
      unbind(el) {
        el.removeEventListener('mouseenter', el.__onEnter)
        el.removeEventListener('mousemove', el.__onMove)
        el.removeEventListener('mouseleave', el.__onLeave)
        hideTip()
      }
    }
  },
  props: {
    sampleData: { type: Object, default: () => ({}) },
    sampleMeta: { type: Object, default: () => ({}) },
    run: { type: [String, Number], default: null }
  },
  filters: { n(v) { return (+v || 0).toLocaleString() } },
  data() { return { color: d3.scaleOrdinal(PAL), runLat: null, runLon: null, edit: {} } },
  beforeDestroy() { hideTip() },
  computed: {
    cards() {
      return Object.entries(this.sampleData || {}).map(([sample, list]) => {
        const rows = list || []
        const map = {}; rows.forEach(r => { map[String(r.taxid)] = r })
        const base = rows.find(r => r.taxid === -1 || r.depth === 0)
        const reads = base ? base.num_fragments_clade : d3.sum(rows.filter(r => r.rank_code === 'D'), r => r.num_fragments_clade)
        const species = rows.filter(r => r.rank_code === 'S' && r.taxid !== -1)
          .sort((a, b) => b.num_fragments_clade - a.num_fragments_clade)
        const top = species[0]
        const totals = {}
        rows.filter(r => r.rank_code === 'D' && r.taxid !== -1).forEach(r => {
          const name = this.group(r, map) || r.target
          totals[name] = (totals[name] || 0) + r.num_fragments_clade
        })
        const gtot = d3.sum(Object.values(totals)) || 1
        const groups = Object.entries(totals).sort((a, b) => b[1] - a[1])
          .map(([name, v]) => ({ name, pct: (v / gtot) * 100, color: this.color(name) }))
        return {
          sample, reads,
          topName: top ? top.target : null,
          topCommon: top ? this.group(top, map) : null,
          ranks: ['D', 'P', 'C', 'O', 'F', 'G', 'S'].map(code => ({
            code, label: RANK_LABELS[code],
            count: rows.filter(r => r.rank_code === code && r.taxid !== -1).length
          })),
          groups
        }
      })
    }
  },
  methods: {
    group(row, map) {
      let cur = row, g = 0
      while (cur && g++ < 60) {
        const hit = commonNames.by_scientific_name[cur.target] || commonNames.by_taxid[String(cur.taxid)]
        if (hit) return hit
        cur = map[String(cur.parenttaxid)]
      }
      return null
    },
    topTip(c) {
      if (!c.topName) return 'No species-level classification yet'
      return `${c.topName}${c.topCommon ? ' (' + c.topCommon + ')' : ''} — most abundant species in ${c.sample}`
    },
    hasCoords(sample) {
      const m = this.sampleMeta[sample]
      return !!(m && m.lat != null && m.lat !== '' && m.lon != null && m.lon !== '')
    },
    coordVal(sample, key) {
      if (this.edit[sample] && this.edit[sample][key] != null) return this.edit[sample][key]
      const m = this.sampleMeta[sample]
      return m && m[key] != null ? m[key] : ''
    },
    buf(sample, key, val) {
      const cur = this.edit[sample] || {}
      cur[key] = val
      this.$set(this.edit, sample, cur)
    },
    saveSample(sample) {
      const b = this.edit[sample] || {}
      const lat = b.lat != null ? b.lat : this.coordVal(sample, 'lat')
      const lon = b.lon != null ? b.lon : this.coordVal(sample, 'lon')
      this.$emit('updateMeta', {
        sample,
        lat: lat === '' ? null : parseFloat(lat),
        lon: lon === '' ? null : parseFloat(lon)
      })
    },
    applyRun() {
      if (this.runLat === null || this.runLat === '' || this.runLon === null || this.runLon === '') return
      this.$emit('updateRunMeta', {
        lat: parseFloat(this.runLat),
        lon: parseFloat(this.runLon)
      })
    }
  }
}
</script>

<style scoped>
.mtx-meta { font-family: Inter, system-ui, sans-serif; text-align: left; color: #1f2937; padding: 4px 6px 30px; }
.mtx-meta-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.mtx-meta-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; box-shadow: 0 8px 24px -16px rgba(16,24,40,.25); transition: box-shadow .15s ease, transform .15s ease; }
.mtx-meta-card:hover { box-shadow: 0 12px 30px -16px rgba(16,24,40,.4); transform: translateY(-1px); }
.mtx-meta-card header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.mtx-meta-card h3 { margin: 0; font-size: 15px; color: #274766; font-weight: 700; cursor: default; }
.mtx-meta-reads { font-size: 12px; color: #5b6573; font-variant-numeric: tabular-nums; cursor: default; }
.mtx-meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #8a97a4; font-weight: 700; display: block; margin-bottom: 4px; }
.mtx-meta-top { margin-bottom: 14px; }
.mtx-meta-org { font-style: italic; font-size: 14px; margin-right: 8px; cursor: default; }
.mtx-grp { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: #eef3f7; color: #274766; text-transform: capitalize; cursor: default; }
.mtx-meta-ranks { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.mtx-meta-rank { flex: 1 1 0; min-width: 36px; text-align: center; background: #f3f7fb; border-radius: 9px; padding: 6px 2px; cursor: default; transition: background .15s ease, transform .12s ease; }
.mtx-meta-rank:hover { background: #e3edf6; transform: translateY(-1px); }
.mtx-meta-rcount { display: block; font-weight: 800; color: #274766; font-size: 15px; font-variant-numeric: tabular-nums; }
.mtx-meta-rlabel { font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; color: #8a97a4; }
.mtx-meta-stack { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: #eef3f7; margin: 6px 0 8px; }
.mtx-meta-stack i { display: block; height: 100%; cursor: default; transition: filter .12s ease; }
.mtx-meta-stack i:hover { filter: brightness(1.12) saturate(1.1); }
.mtx-meta-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mtx-meta-gchip { font-size: 11px; color: #5b6573; display: inline-flex; align-items: center; gap: 5px; text-transform: capitalize; cursor: default; }
.mtx-meta-gchip i { width: 9px; height: 9px; border-radius: 2px; }
.mtx-meta-blank { color: #8a97a4; font-style: italic; padding: 60px; text-align: center; }

/* run-level metadata panel */
.mtx-run-meta { background: linear-gradient(180deg,#fbfdff,#f1f6fb); border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin-bottom: 16px; }
.mtx-run-meta-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.mtx-run-meta-title { font-weight: 700; color: #274766; font-size: 14px; }
.mtx-run-meta-sub { font-size: 12px; color: #8a97a4; }
.mtx-run-meta-form { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.mtx-mfield { display: flex; flex-direction: column; gap: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #5b6573; font-weight: 700; }
.mtx-mfield input { border: 1px solid #e2e8f0; border-radius: 9px; padding: 7px 10px; font-size: 13px; width: 130px; }
.mtx-mbtn { border: 1px solid #274766; background: #274766; color: #fff; border-radius: 9px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.mtx-mbtn:hover { background: #1d3650; }
.mtx-mbtn.sm { padding: 5px 11px; font-size: 12px; }

/* per-sample coordinate editor */
.mtx-meta-coords { margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0; }
.mtx-coord-ok { color: #2a9d8f; font-size: 10px; margin-left: 6px; cursor: default; }
.mtx-coord-missing { color: #c2876b; font-size: 10px; margin-left: 6px; cursor: default; }
.mtx-coord-form { display: flex; gap: 8px; margin-top: 6px; }
.mtx-coord-form input { border: 1px solid #e2e8f0; border-radius: 9px; padding: 6px 10px; font-size: 13px; width: 90px; }
</style>

<!-- global (un-scoped) style for the body-level floating tooltip -->
<style>
.mtx-floattip {
  position: fixed; z-index: 9999; pointer-events: none;
  background: #1f2937; color: #fff; padding: 7px 11px; border-radius: 8px;
  font-family: Inter, system-ui, sans-serif; font-size: 12px; line-height: 1.45;
  max-width: 280px; box-shadow: 0 8px 24px rgba(0,0,0,.28);
  opacity: 0; transition: opacity .12s ease; top: 0; left: 0;
}
</style>
