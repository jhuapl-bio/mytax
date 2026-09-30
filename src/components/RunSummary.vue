<!--
  RunSummary — overview of a whole run (or one barcode group within it).

  Headline tiles (samples, reads, median reads/sample, % classified, files,
  input size, yield), the most abundant species pooled across samples, and a
  sortable per-sample table. Clicking a sample opens its own overview.
-->
<template>
  <v-card class="rsum">
    <div class="rsum-head">
      <v-icon color="white" class="mr-2">{{ icon }}</v-icon>
      <div class="rsum-titles">
        <div class="rsum-kicker">{{ kicker }}</div>
        <div class="rsum-title" :title="title">{{ title || 'No run selected' }}</div>
      </div>
      <v-spacer></v-spacer>
      <span class="rsum-live" v-if="totals.running">
        <span class="rsum-pulse"></span>{{ totals.running }} classifying
      </span>
      <v-btn icon dark small class="ml-2" @click="$emit('close')"><v-icon>mdi-close</v-icon></v-btn>
    </div>

    <v-card-text class="rsum-body">
      <div v-if="!rows.length" class="rsum-empty">No samples in this {{ scope }} yet.</div>
      <template v-else>
        <div class="rsum-tiles">
          <div class="rsum-tile">
            <div class="rsum-tile-label">Samples</div>
            <div class="rsum-tile-value">{{ rows.length }}</div>
            <div class="rsum-tile-sub">
              {{ withData.length }} with results<template v-if="totals.errorSamples"> · <span class="rsum-err">{{ totals.errorSamples }} with errors</span></template>
            </div>
          </div>
          <div class="rsum-tile">
            <div class="rsum-tile-label">Total reads</div>
            <div class="rsum-tile-value">{{ fmtCount(totals.reads) }}</div>
            <div class="rsum-tile-sub">across {{ withData.length }} sample{{ withData.length === 1 ? '' : 's' }}</div>
          </div>
          <div class="rsum-tile">
            <div class="rsum-tile-label">Median reads / sample</div>
            <div class="rsum-tile-value">{{ totals.medianReads == null ? '—' : fmtCount(totals.medianReads) }}</div>
            <div class="rsum-tile-sub" v-if="withData.length > 1">range {{ fmtCount(totals.minReads) }} – {{ fmtCount(totals.maxReads) }}</div>
          </div>
          <div class="rsum-tile">
            <div class="rsum-tile-label">Classified (pooled)</div>
            <div class="rsum-tile-value">{{ fmtPct(totals.pooledPct) }}</div>
            <div class="rsum-tile-sub" v-if="withData.length > 1">
              median {{ fmtPct(totals.medianPct) }} · lowest {{ fmtPct(totals.lowest.pct) }} ({{ totals.lowest.label }})
            </div>
          </div>
          <div class="rsum-tile">
            <div class="rsum-tile-label">Files processed</div>
            <div class="rsum-tile-value">{{ fmtCount(totals.done) }}<span class="rsum-of"> / {{ fmtCount(totals.files) }}</span></div>
            <div class="rsum-tile-sub">
              {{ totals.files ? Math.round((100 * totals.done) / totals.files) : 0 }}% complete<template v-if="totals.pending"> · {{ fmtCount(totals.pending) }} to go</template><template v-if="totals.failed"> · <span class="rsum-err">{{ totals.failed }} failed</span></template>
            </div>
          </div>
          <div class="rsum-tile">
            <div class="rsum-tile-label">Input size</div>
            <div class="rsum-tile-value">{{ totals.bytes ? fmtBytes(totals.bytes) : '—' }}</div>
            <div class="rsum-tile-sub">
              <template v-if="totals.mbp">{{ fmtMbp(totals.mbp) }} sequenced</template>
              <template v-else>fastq/fasta on disk</template>
            </div>
          </div>
        </div>

        <div v-if="pooledTop.length" class="rsum-block">
          <div class="rsum-block-head">Most abundant species (all samples pooled)</div>
          <div v-for="t in pooledTop" :key="t.taxid" class="rsum-taxon"
            :title="`${t.name}: ${fmtCount(t.reads)} reads, ${fmtPct(t.pct, 2)} of all reads, found in ${t.samples} of ${withData.length} samples`">
            <span class="rsum-taxon-name">{{ t.name }}</span>
            <span class="rsum-track"><span class="rsum-fill" :style="{ width: topWidth(t.pct) }"></span></span>
            <span class="rsum-num">{{ fmtPct(t.pct) }}</span>
            <span class="rsum-muted">{{ t.samples }}/{{ withData.length }} samples</span>
          </div>
        </div>

        <div class="rsum-block">
          <div class="rsum-block-head">
            Per sample
            <span class="rsum-hint">click a column to sort · click a sample for its overview</span>
          </div>
          <div class="rsum-table-wrap">
            <table class="rsum-table">
              <thead>
                <tr>
                  <th v-for="c in columns" :key="c.key" :class="['rsum-th', c.align, { active: sortKey === c.key }]" @click="sortBy(c.key)">
                    {{ c.text }}<v-icon v-if="sortKey === c.key" x-small>{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in sortedRows" :key="r.sample" class="rsum-row" @click="$emit('open-sample', r.sample)">
                  <td class="rsum-name" :title="r.sample">
                    <span class="rsum-dot" :class="'rsum-dot--' + r.state" :title="r.stateText"></span>{{ r.label }}
                  </td>
                  <td class="num">{{ r.reads ? fmtCount(r.reads) : '—' }}</td>
                  <td class="rsum-pctcell">
                    <template v-if="r.pct != null">
                      <span class="rsum-track rsum-track--sm"><span class="rsum-fill" :style="{ width: r.pct + '%' }"></span></span>
                      <span class="rsum-num">{{ fmtPct(r.pct) }}</span>
                    </template>
                    <span v-else class="rsum-muted">—</span>
                  </td>
                  <td class="num">{{ r.species != null ? r.species : '—' }}</td>
                  <td class="num">{{ r.done }}/{{ r.files }}<span v-if="r.failed" class="rsum-err"> · {{ r.failed }}✕</span></td>
                  <td class="num">{{ r.bytes ? fmtBytes(r.bytes) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </v-card-text>

    <v-divider></v-divider>
    <v-card-actions class="px-4">
      <span class="rsum-foot">Reads and % classified come from each sample's combined report; they update live as files finish.</span>
      <v-spacer></v-spacer>
      <v-btn small depressed @click="$emit('close')">Close</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script>
import taxaStore from '@/store/taxa'
import { formatBytes, formatCount, formatPct, median } from '@/utils/format'

export default {
  name: 'RunSummary',
  props: {
    title: { type: String, default: '' },
    kicker: { type: String, default: 'Run overview' },
    scope: { type: String, default: 'run' },
    icon: { type: String, default: 'mdi-flask-outline' },
    // [{ sample, label, row, queue }]
    samples: { type: Array, default: () => [] }
  },
  data() {
    return { sortKey: 'label', sortDesc: false }
  },
  computed: {
    columns() {
      return [
        { key: 'label', text: 'Sample', align: '' },
        { key: 'reads', text: 'Reads', align: 'num' },
        { key: 'pct', text: 'Classified', align: '' },
        { key: 'species', text: 'Species', align: 'num' },
        { key: 'done', text: 'Files', align: 'num' },
        { key: 'bytes', text: 'Size', align: 'num' }
      ]
    },
    // touch every sample's taxa version so the table refreshes live
    vers() {
      return this.samples.map((s) => { const v = taxaStore.state.samples[s.sample]; return v ? v.ver : 0 }).join(',')
    },
    rows() {
      // eslint-disable-next-line no-unused-expressions
      this.vers
      return this.samples.map((s) => {
        const st = (s.row && s.row.status) || {}
        const q = s.queue || {}
        const sum = taxaStore.summary(s.sample)
        const files = Math.max(q.total || 0, st.files || 0, st.total || 0)
        let state = 'idle'
        if (q.running) state = 'running'
        else if (q.error) state = 'error'
        else if (q.queued) state = 'queued'
        else if (files && (q.done || 0) >= files) state = 'done'
        return {
          sample: s.sample,
          label: s.label || s.sample,
          reads: sum && sum.reads ? sum.reads : 0,
          classified: sum ? sum.classified : 0,
          pct: sum && sum.reads ? sum.pctClassified : null,
          species: sum ? sum.rankCount : null,
          files,
          done: q.done || 0,
          pending: q.pending || 0,
          failed: q.error || 0,
          running: q.running || 0,
          bytes: st.inputBytes || 0,
          mbp: st.yieldMbp || 0,
          state,
          stateText: ({ running: 'Classifying', error: 'Has errors', queued: 'Queued', done: 'Up to date', idle: 'Idle' })[state]
        }
      })
    },
    withData() { return this.rows.filter((r) => r.reads > 0) },
    totals() {
      const t = { reads: 0, classified: 0, files: 0, done: 0, pending: 0, failed: 0, running: 0, bytes: 0, mbp: 0, errorSamples: 0 }
      for (const r of this.rows) {
        t.reads += r.reads; t.classified += r.classified
        t.files += r.files; t.done += r.done; t.pending += r.pending; t.failed += r.failed
        t.running += r.running; t.bytes += r.bytes; t.mbp += r.mbp
        if (r.failed) t.errorSamples += 1
      }
      const reads = this.withData.map((r) => r.reads)
      const pcts = this.withData.map((r) => r.pct)
      t.medianReads = median(reads)
      t.minReads = reads.length ? Math.min(...reads) : null
      t.maxReads = reads.length ? Math.max(...reads) : null
      t.pooledPct = t.reads ? (100 * t.classified) / t.reads : null
      t.medianPct = median(pcts)
      const low = this.withData.slice().sort((a, b) => a.pct - b.pct)[0]
      t.lowest = low ? { pct: low.pct, label: low.label } : { pct: null, label: '' }
      return t
    },
    pooledTop() {
      // eslint-disable-next-line no-unused-expressions
      this.vers
      return taxaStore.pooledTop(this.withData.map((r) => r.sample), { topN: 6 })
    },
    sortedRows() {
      const k = this.sortKey
      const dir = this.sortDesc ? -1 : 1
      const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      return this.rows.slice().sort((a, b) => {
        if (k === 'label') return dir * coll.compare(a.label, b.label)
        const av = a[k] == null ? -Infinity : a[k]
        const bv = b[k] == null ? -Infinity : b[k]
        return dir * (av - bv)
      })
    },
    maxTop() { return this.pooledTop.length ? this.pooledTop[0].pct : 0 }
  },
  methods: {
    fmtBytes: formatBytes,
    fmtCount: formatCount,
    fmtPct: formatPct,
    fmtMbp(mbp) { return mbp >= 1000 ? `${(mbp / 1000).toFixed(2)} Gbp` : `${mbp.toFixed(1)} Mbp` },
    topWidth(pct) { return this.maxTop ? `${Math.max(2, (100 * pct) / this.maxTop)}%` : '0%' },
    sortBy(key) {
      if (this.sortKey === key) this.sortDesc = !this.sortDesc
      else { this.sortKey = key; this.sortDesc = key !== 'label' }
    }
  }
}
</script>

<style scoped>
.rsum { overflow: hidden; text-align: left; }
.rsum-head { display: flex; align-items: center; padding: 12px 14px; background: linear-gradient(120deg, #0e3f6a, #1e6b97); color: #fff; }
.rsum-titles { min-width: 0; }
.rsum-kicker { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; opacity: .8; }
.rsum-title { font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 520px; }
.rsum-live { display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; background: rgba(255,255,255,.16); padding: 2px 9px; border-radius: 10px; }
.rsum-pulse { width: 7px; height: 7px; border-radius: 50%; background: #7dd3fc; margin-right: 6px; animation: rsum-p 1.2s ease-in-out infinite; }
@keyframes rsum-p { 50% { opacity: .3; } }
.rsum-body { padding: 14px 16px !important; }
.rsum-empty { font-size: 13px; color: #4b6275; background: #f4f8fb; border-radius: 8px; padding: 10px 12px; }
.rsum-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.rsum-tile { border: 1px solid #e1e8ef; border-radius: 8px; padding: 8px 10px; background: #fbfdff; min-width: 0; }
.rsum-tile-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #6b7f92; }
.rsum-tile-value { font-size: 20px; font-weight: 700; color: #1d2b3a; font-variant-numeric: tabular-nums; line-height: 1.3; }
.rsum-of { font-size: 13px; font-weight: 500; color: #6b7f92; }
.rsum-tile-sub { font-size: 11px; color: #5b6f82; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rsum-err { color: #b91c1c; font-weight: 600; }
.rsum-block { margin-top: 16px; }
.rsum-block-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #4b6275; margin-bottom: 6px; display: flex; align-items: baseline; gap: 8px; }
.rsum-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: #8a9bab; font-size: 11px; }
.rsum-taxon { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 52px 90px; align-items: center; gap: 8px; font-size: 12.5px; padding: 3px 0; }
.rsum-taxon-name { font-style: italic; color: #1d2b3a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rsum-track { display: block; height: 8px; background: #eef3f8; border-radius: 4px; overflow: hidden; }
.rsum-track--sm { display: inline-block; width: 70px; height: 7px; vertical-align: middle; margin-right: 6px; }
.rsum-fill { display: block; height: 100%; background: #1e6b97; border-radius: 0 4px 4px 0; }
.rsum-num { font-variant-numeric: tabular-nums; color: #1d2b3a; text-align: right; }
.rsum-muted { color: #8a9bab; font-size: 11px; text-align: right; }
.rsum-table-wrap { max-height: 320px; overflow: auto; border: 1px solid #e1e8ef; border-radius: 8px; }
.rsum-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.rsum-th { position: sticky; top: 0; background: #f4f8fb; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #4b6275; padding: 6px 8px; cursor: pointer; user-select: none; white-space: nowrap; border-bottom: 1px solid #e1e8ef; }
.rsum-th.active { color: #0e3f6a; }
.rsum-th.num, .rsum-table td.num { text-align: right; }
.rsum-table td { padding: 5px 8px; border-bottom: 1px solid #eef2f6; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rsum-row { cursor: pointer; }
.rsum-row:hover { background: #f2f7fb; }
.rsum-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; font-weight: 600; color: #1d2b3a; }
.rsum-pctcell { white-space: nowrap; }
.rsum-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; background: #b8c4cf; }
.rsum-dot--running { background: #2563eb; }
.rsum-dot--queued { background: #9aa9b8; }
.rsum-dot--done { background: #22a06b; }
.rsum-dot--error { background: #d64545; }
.rsum-foot { font-size: 11px; color: #8a9bab; }
@media (max-width: 700px) { .rsum-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
