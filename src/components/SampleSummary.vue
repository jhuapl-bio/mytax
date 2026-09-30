<!--
  SampleSummary — at-a-glance overview of ONE sample.

  Reads / % classified / taxa come from the sample's current full.report (via
  the columnar taxa store); files, input size and yield come from the server's
  sample rollup. Everything updates live while the sample is classifying.
-->
<template>
  <v-card class="ssum">
    <div class="ssum-head">
      <v-icon color="white" class="mr-2">mdi-test-tube</v-icon>
      <div class="ssum-titles">
        <div class="ssum-kicker">{{ group ? group + ' · ' : '' }}Sample overview</div>
        <div class="ssum-title" :title="sample">{{ label || sample }}</div>
      </div>
      <v-spacer></v-spacer>
      <span class="ssum-state" :class="'ssum-state--' + stateKey">
        <v-icon x-small class="mr-1">{{ stateIcon }}</v-icon>{{ stateText }}
      </span>
      <v-btn icon dark small class="ml-2" @click="$emit('close')"><v-icon>mdi-close</v-icon></v-btn>
    </div>

    <v-card-text class="ssum-body">
      <div v-if="!stats" class="ssum-empty">
        <v-icon color="#7d97ad" class="mr-2">mdi-timer-sand</v-icon>
        No report yet — figures appear once the first file of this sample has been classified.
      </div>

      <div class="ssum-tiles">
        <div class="ssum-tile">
          <div class="ssum-tile-label">Reads in report</div>
          <div class="ssum-tile-value">{{ stats ? fmtCount(stats.reads) : '—' }}</div>
          <div class="ssum-tile-sub" v-if="stats">{{ fmtCount(stats.classified) }} classified</div>
        </div>
        <div class="ssum-tile">
          <div class="ssum-tile-label">Classified</div>
          <div class="ssum-tile-value">{{ stats ? fmtPct(stats.pctClassified) : '—' }}</div>
          <div class="ssum-tile-sub" v-if="stats">{{ fmtCount(stats.unclassified) }} unclassified</div>
        </div>
        <div class="ssum-tile">
          <div class="ssum-tile-label">Taxa detected</div>
          <div class="ssum-tile-value">{{ stats ? fmtCount(stats.taxa) : '—' }}</div>
          <div class="ssum-tile-sub" v-if="stats">{{ fmtCount(stats.rankCount) }} at species level</div>
        </div>
        <div class="ssum-tile">
          <div class="ssum-tile-label">Files processed</div>
          <div class="ssum-tile-value">{{ queue.done || 0 }}<span class="ssum-of"> / {{ filesTotal }}</span></div>
          <div class="ssum-tile-sub">
            <template v-if="queue.running">{{ queue.running }} running · </template>
            <template v-if="queue.queued">{{ queue.queued }} queued · </template>
            <template v-if="queue.error"><span class="ssum-err">{{ queue.error }} failed</span> · </template>
            {{ queue.percent || 0 }}% complete
          </div>
        </div>
        <div class="ssum-tile">
          <div class="ssum-tile-label">Input size</div>
          <div class="ssum-tile-value">{{ status.inputBytes ? fmtBytes(status.inputBytes) : '—' }}</div>
          <div class="ssum-tile-sub" v-if="status.inputBytes && filesTotal">~{{ fmtBytes(status.inputBytes / filesTotal) }} per file</div>
        </div>
        <div class="ssum-tile">
          <div class="ssum-tile-label">Sequencing yield</div>
          <div class="ssum-tile-value">{{ status.yieldMbp ? fmtMbp(status.yieldMbp) : '—' }}</div>
          <div class="ssum-tile-sub" v-if="status.yieldFiles">
            {{ fmtCount(status.yieldReads) }} reads<template v-if="status.yieldFiles < (queue.done || 0)"> · from {{ status.yieldFiles }} of {{ queue.done }} files</template>
          </div>
          <div class="ssum-tile-sub" v-else>from kraken2 as files are classified</div>
        </div>
      </div>

      <!-- classified vs unclassified: one proportion, two tones, labeled -->
      <div v-if="stats && stats.reads" class="ssum-split">
        <div class="ssum-split-bar" role="img" :aria-label="`${fmtPct(stats.pctClassified)} classified`">
          <span class="ssum-split-cls" :style="{ width: stats.pctClassified + '%' }"
            :title="`Classified: ${fmtCount(stats.classified)} reads (${fmtPct(stats.pctClassified)})`"></span>
          <span class="ssum-split-unc" :style="{ width: (100 - stats.pctClassified) + '%' }"
            :title="`Unclassified: ${fmtCount(stats.unclassified)} reads (${fmtPct(100 - stats.pctClassified)})`"></span>
        </div>
        <div class="ssum-split-legend">
          <span><i class="ssum-key ssum-key--cls"></i>Classified {{ fmtPct(stats.pctClassified) }}</span>
          <span><i class="ssum-key ssum-key--unc"></i>Unclassified {{ fmtPct(100 - stats.pctClassified) }}</span>
        </div>
      </div>

      <div v-if="stats && stats.top.length" class="ssum-block">
        <div class="ssum-block-head">Most abundant species</div>
        <div v-for="t in stats.top" :key="t.taxid" class="ssum-taxon" :title="`${t.name}: ${fmtCount(t.reads)} reads (${fmtPct(t.pct, 2)} of all reads)`">
          <span class="ssum-taxon-name">{{ t.name }}</span>
          <span class="ssum-taxon-track"><span class="ssum-taxon-fill" :style="{ width: barWidth(t.pct) }"></span></span>
          <span class="ssum-taxon-val">{{ fmtPct(t.pct) }}</span>
          <span class="ssum-taxon-reads">{{ fmtCount(t.reads) }}</span>
        </div>
      </div>

      <div class="ssum-block">
        <div class="ssum-block-head">Setup</div>
        <table class="ssum-kv">
          <tr><td>Input</td><td><code :title="sheet.path_1">{{ sheet.path_1 || '—' }}</code><template v-if="sheet.path_2"><br><code>{{ sheet.path_2 }}</code></template></td></tr>
          <tr><td>Classifier</td><td>{{ classifierText }}<span v-if="sheet.fastp"> · fastp pre-filter</span></td></tr>
          <tr><td>Database</td><td><code :title="dbText">{{ dbText || '—' }}</code></td></tr>
          <tr v-if="sheet.platform"><td>Platform</td><td>{{ sheet.platform }}</td></tr>
          <tr><td>Real-time watch</td><td>{{ status.watching ? 'Listening for new reads' : (sheet.watch === false ? 'Off (one-time run)' : 'Not active') }}</td></tr>
        </table>
      </div>
    </v-card-text>

    <v-divider></v-divider>
    <v-card-actions class="px-4">
      <v-btn small text color="primary" v-if="online" @click="$emit('open-jobs', sample)">
        <v-icon small left>mdi-format-list-checks</v-icon>View jobs
      </v-btn>
      <v-btn small text v-if="online" @click="$emit('rerun', sample)">
        <v-icon small left>mdi-replay</v-icon>Re-run sample
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn small depressed @click="$emit('close')">Close</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script>
import taxaStore from '@/store/taxa'
import { formatBytes, formatCount, formatPct } from '@/utils/format'

export default {
  name: 'SampleSummary',
  props: {
    sample: { type: String, required: true },
    label: { type: String, default: '' },
    group: { type: String, default: '' },
    row: { type: Object, default: () => ({}) },
    queue: { type: Object, default: () => ({}) },
    sheet: { type: Object, default: () => ({}) },
    online: { type: Boolean, default: true }
  },
  computed: {
    status() { return (this.row && this.row.status) || {} },
    // Reactive handle on this sample's taxa version so the figures refresh
    // as new reports arrive.
    ver() { const s = taxaStore.state.samples[this.sample]; return s ? s.ver : 0 },
    stats() {
      // eslint-disable-next-line no-unused-expressions
      this.ver
      const s = taxaStore.summary(this.sample, { topN: 6 })
      return s && s.reads ? s : null
    },
    filesTotal() { return Math.max(this.queue.total || 0, this.status.files || 0, this.status.total || 0) },
    stateKey() {
      if (this.queue.running) return 'running'
      if (this.queue.error) return 'error'
      if (this.queue.queued) return 'queued'
      if (this.filesTotal && this.queue.done >= this.filesTotal) return 'done'
      return this.status.watching ? 'listening' : 'idle'
    },
    stateText() {
      return ({ running: 'Classifying', error: 'Has errors', queued: 'Queued', done: 'Up to date', listening: 'Listening', idle: 'Idle' })[this.stateKey]
    },
    stateIcon() {
      return ({ running: 'mdi-progress-clock', error: 'mdi-alert-circle', queued: 'mdi-tray-full', done: 'mdi-check-circle', listening: 'mdi-radar', idle: 'mdi-pause-circle-outline' })[this.stateKey]
    },
    classifierText() {
      const c = this.sheet.classifier || this.status.classifier || 'kraken2'
      return ({ kraken2: 'Kraken2', bracken: 'Kraken2 → Bracken', minimap2: 'minimap2 alignment' })[c] || c
    },
    dbText() {
      if ((this.sheet.classifier || this.status.classifier) === 'minimap2') return this.sheet.minimapDatabase || this.status.database
      return this.sheet.database || this.status.database
    },
    maxTopPct() { return this.stats && this.stats.top.length ? this.stats.top[0].pct : 0 }
  },
  methods: {
    fmtBytes: formatBytes,
    fmtCount: formatCount,
    fmtPct: formatPct,
    fmtMbp(mbp) { return mbp >= 1000 ? `${(mbp / 1000).toFixed(2)} Gbp` : `${mbp.toFixed(1)} Mbp` },
    barWidth(pct) { return this.maxTopPct ? `${Math.max(2, (100 * pct) / this.maxTopPct)}%` : '0%' }
  }
}
</script>

<style scoped>
.ssum { overflow: hidden; text-align: left; }
.ssum-tile { text-align: left; }
.ssum-head {
  display: flex; align-items: center; padding: 12px 14px;
  background: linear-gradient(120deg, #0e3f6a, #1e6b97); color: #fff;
}
.ssum-titles { min-width: 0; }
.ssum-kicker { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; opacity: .8; }
.ssum-title { font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 440px; }
.ssum-state {
  display: inline-flex; align-items: center; font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,.16); color: #fff;
}
.ssum-state--error { background: #fde8e8; color: #b91c1c; }
.ssum-state--done { background: #dcfce7; color: #15803d; }
.ssum-state--running { background: #dbeafe; color: #1e40af; }
.ssum-body { padding: 14px 16px !important; }
.ssum-empty { display: flex; align-items: center; font-size: 13px; color: #4b6275; background: #f4f8fb; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.ssum-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ssum-tile { border: 1px solid #e1e8ef; border-radius: 8px; padding: 8px 10px; background: #fbfdff; min-width: 0; }
.ssum-tile-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #6b7f92; }
.ssum-tile-value { font-size: 20px; font-weight: 700; color: #1d2b3a; font-variant-numeric: tabular-nums; line-height: 1.3; }
.ssum-of { font-size: 13px; font-weight: 500; color: #6b7f92; }
.ssum-tile-sub { font-size: 11px; color: #5b6f82; }
.ssum-err { color: #b91c1c; font-weight: 600; }

.ssum-split { margin-top: 14px; }
.ssum-split-bar { display: flex; gap: 2px; height: 10px; }
.ssum-split-cls { background: #1e6b97; border-radius: 4px 0 0 4px; }
.ssum-split-unc { background: #c5d0da; border-radius: 0 4px 4px 0; }
.ssum-split-legend { display: flex; gap: 14px; margin-top: 5px; font-size: 11.5px; color: #3b4f61; }
.ssum-key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.ssum-key--cls { background: #1e6b97; }
.ssum-key--unc { background: #c5d0da; }

.ssum-block { margin-top: 16px; }
.ssum-block-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #4b6275; margin-bottom: 6px; }
.ssum-taxon { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 52px 56px; align-items: center; gap: 8px; font-size: 12.5px; padding: 3px 0; }
.ssum-taxon-name { font-style: italic; color: #1d2b3a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ssum-taxon-track { height: 8px; background: #eef3f8; border-radius: 4px; overflow: hidden; }
.ssum-taxon-fill { display: block; height: 100%; background: #1e6b97; border-radius: 0 4px 4px 0; }
.ssum-taxon-val { text-align: right; font-variant-numeric: tabular-nums; color: #1d2b3a; }
.ssum-taxon-reads { text-align: right; font-variant-numeric: tabular-nums; color: #6b7f92; font-size: 11px; }
.ssum-kv { width: 100%; border-collapse: collapse; font-size: 12px; }
.ssum-kv td { padding: 4px 0; vertical-align: top; border-bottom: 1px solid #eef2f6; }
.ssum-kv td:first-child { width: 120px; color: #6b7f92; }
.ssum-kv code { font-size: 11px; background: #f2f5f8; padding: 1px 4px; border-radius: 3px; word-break: break-all; }
@media (max-width: 600px) { .ssum-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
