<!--
  DataTableTab.vue — live, searchable classifications table across all loaded
  samples. Updates in real time as report data streams in. Common-name groups
  resolved via the bundled NCBI mapping.
-->
<template>
  <div class="mtx-dt">
    <div class="mtx-dt-bar">
      <div class="mtx-dt-title">Classifications · {{ rows.length | n }} rows · {{ sampleCount }} samples</div>
      <div class="mtx-dt-controls">
        <select v-model="rank" class="mtx-dt-select">
          <option value="">All ranks</option>
          <option v-for="r in rankChoices" :key="r.code" :value="r.code">{{ r.label }}</option>
        </select>
        <input v-model="search" class="mtx-dt-search" placeholder="Search taxon / sample…" />
      </div>
    </div>
    <div class="mtx-dt-scroll">
      <table class="mtx-dt-table">
        <thead>
          <tr>
            <th v-for="c in cols" :key="c.key" :class="{ n: c.num }" @click="sortBy(c.key)">
              {{ c.label }}
              <span v-if="sort.key === c.key">{{ sort.dir > 0 ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in pageRows" :key="i">
            <td>{{ r.sample }}</td>
            <td><span class="mtx-sci">{{ r.displayTarget }}</span></td>
            <td><span v-if="r.common" class="mtx-grp">{{ r.common }}</span><span v-else>—</span></td>
            <td>{{ r.rankLabel }}</td>
            <td class="n">{{ r.taxid }}</td>
            <td class="n">{{ r.num_fragments_clade | n }}</td>
            <td class="n">{{ r.value }}</td>
          </tr>
          <tr v-if="!pageRows.length"><td colspan="7" class="mtx-dt-empty">No matching classifications yet.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="mtx-dt-foot" v-if="filtered.length > pageSize">
      <button class="mtx-dt-btn" :disabled="page === 0" @click="page--">‹ Prev</button>
      <span>{{ page + 1 }} / {{ pageCount }}</span>
      <button class="mtx-dt-btn" :disabled="page >= pageCount - 1" @click="page++">Next ›</button>
    </div>
  </div>
</template>

<script>
import commonNames from '@/assets/taxon_common_names.json'
const RANK_LABELS = { R: 'Root', D: 'Domain', K: 'Kingdom', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species', U: 'Unclassified' }

export default {
  name: 'DataTableTab',
  props: { sampleData: { type: Object, default: () => ({}) } },
  filters: { n(v) { return (+v || 0).toLocaleString() } },
  data() {
    return {
      search: '', rank: '', page: 0, pageSize: 50,
      sort: { key: 'num_fragments_clade', dir: -1 },
      cols: [
        { key: 'sample', label: 'Sample' },
        { key: 'target', label: 'Taxon' },
        { key: 'common', label: 'Group' },
        { key: 'rankLabel', label: 'Rank' },
        { key: 'taxid', label: 'TaxID', num: true },
        { key: 'num_fragments_clade', label: 'Reads', num: true },
        { key: 'value', label: '%', num: true }
      ]
    }
  },
  computed: {
    sampleCount() { return Object.keys(this.sampleData || {}).length },
    rankChoices() {
      const present = new Set(this.rows.map(r => r.rank_code))
      const base = ['D', 'K', 'P', 'C', 'O', 'F', 'G', 'S'].filter((c) => present.has(c))
      const subs = Array.from(present).filter((c) => /^S\d+$/.test(c))
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      return [...base, ...subs].map((code) => ({ code, label: this.rankLabel(code) }))
    },
    rows() {
      const out = []
      Object.entries(this.sampleData || {}).forEach(([sample, list]) => {
        const map = {}; (list || []).forEach(r => { map[String(r.taxid)] = r })
        ;(list || []).forEach(r => {
          if (r.taxid === -1) return
          out.push({
            sample, target: r.target, taxid: r.taxid, value: r.value,
            num_fragments_clade: r.num_fragments_clade, rank_code: r.rank_code,
            displayTarget: this.displayTarget(r, map),
            rankLabel: this.rankLabel(r.rank_code),
            common: this.commonGroup(r, map)
          })
        })
      })
      return out
    },
    filtered() {
      let r = this.rows
      if (this.rank) r = r.filter(x => x.rank_code === this.rank)
      if (this.search) {
        const q = this.search.toLowerCase()
        r = r.filter(x => (x.target + ' ' + x.displayTarget + ' ' + x.sample + ' ' + (x.common || '')).toLowerCase().includes(q))
      }
      const k = this.sort.key, d = this.sort.dir
      return r.slice().sort((a, b) => {
        const av = a[k], bv = b[k]
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * d
        return String(av).localeCompare(String(bv)) * d
      })
    },
    pageCount() { return Math.max(1, Math.ceil(this.filtered.length / this.pageSize)) },
    pageRows() { return this.filtered.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize) }
  },
  watch: { search() { this.page = 0 }, rank() { this.page = 0 } },
  methods: {
    isSubRank(code) { return /^S\d+$/.test(String(code || '')) },
    rankLabel(code) {
      if (/^S\d+$/.test(String(code || ''))) return `Subspecies (${code})`
      return RANK_LABELS[code] || code
    },
    subspeciesPath(row, map) {
      if (!row || !this.isSubRank(row.rank_code)) return row ? row.target : ''
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
    displayTarget(row, map) {
      return this.isSubRank(row.rank_code) ? this.subspeciesPath(row, map) : row.target
    },
    commonGroup(row, map) {
      let cur = row, g = 0
      while (cur && g++ < 60) {
        const hit = commonNames.by_scientific_name[cur.target] || commonNames.by_taxid[String(cur.taxid)]
        if (hit) return hit
        cur = map[String(cur.parenttaxid)]
      }
      return null
    },
    sortBy(k) {
      if (this.sort.key === k) this.sort.dir *= -1
      else this.sort = { key: k, dir: -1 }
    }
  }
}
</script>

<style scoped>
.mtx-dt { font-family: Inter, system-ui, sans-serif; text-align: left; color: #1f2937; padding: 4px 6px 30px; }
.mtx-dt-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.mtx-dt-title { font-weight: 700; color: #274766; font-size: 14px; }
.mtx-dt-controls { display: flex; gap: 8px; }
.mtx-dt-select, .mtx-dt-search { border: 1px solid #e2e8f0; border-radius: 9px; padding: 7px 11px; font-size: 13px; background: #fff; }
.mtx-dt-search { min-width: 240px; }
.mtx-dt-scroll { border: 1px solid #e2e8f0; border-radius: 14px; overflow: auto; max-height: 64vh; background: #fff; }
.mtx-dt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mtx-dt-table th { position: sticky; top: 0; background: #f3f7fb; text-align: left; padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #5b6573; cursor: pointer; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
.mtx-dt-table th.n, .mtx-dt-table td.n { text-align: right; font-variant-numeric: tabular-nums; }
.mtx-dt-table td { padding: 8px 12px; border-bottom: 1px solid #eef3f7; }
.mtx-dt-table tr:hover td { background: #f8fbfe; }
.mtx-sci { font-style: italic; }
.mtx-grp { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: #eef3f7; color: #274766; text-transform: capitalize; }
.mtx-dt-empty { text-align: center; color: #8a97a4; font-style: italic; padding: 28px; }
.mtx-dt-foot { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 12px; font-size: 13px; color: #5b6573; }
.mtx-dt-btn { border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 5px 12px; cursor: pointer; font-weight: 600; color: #274766; }
.mtx-dt-btn:disabled { opacity: .4; cursor: default; }
</style>
