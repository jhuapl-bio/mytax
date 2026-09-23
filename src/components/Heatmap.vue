<!--
  Heatmap.vue — standalone heatmap tab (replaces the old Run Stats tab).
  Wraps the Plates heatmap (top taxa per sample) and exposes the rank /
  name-type controls that Run Stats used to provide in its toolbar.
-->
<template>
  <v-container class="mtx-heatmap">
    <section class="mtx-heat-hero">
      <div class="mtx-heat-hero-title-wrap">
        <div class="mtx-heat-kicker">Comparative Taxonomy</div>
        <h2 class="mtx-heat-hero-title">Sample Heatmap</h2>
        <p class="mtx-heat-hero-sub">Organisms run down the left axis and samples across the top. Hover a cell to inspect exact values and click a genus to drill into species.</p>
      </div>
      <div class="mtx-heat-hero-stats">
        <div class="mtx-stat">
          <span class="k">Samples</span>
          <strong>{{ sampleKeys.length }}</strong>
        </div>
        <div class="mtx-stat mtx-stat-rank">
          <span class="k">Rank <InfoIcon text="Taxonomic rank used to group taxa on the heatmap's left (Y) axis. Switch between Domain, Phylum, Class, Order, Family, Genus, and Species." /></span>
          <v-select
            v-model="selectedAttribute"
            :items="ranks"
            dense
            hide-details
            solo
            flat
            class="mtx-stat-rank-select"
          ></v-select>
        </div>
      </div>
    </section>

    <section class="mtx-heat-body">
      <Plates
        v-if="hasData"
        :inputdata="sampleData"
        :samplenames="sampleKeys"
        :selectedAttribute="selectedAttribute"
        :namesData="namesData"
        :selectedTaxid="selectedTaxid"
        :legendPlacement="legendPlacement"
        :socket="socket"
      />
      <div v-else class="mtx-heatmap-blank">No samples loaded yet.</div>
    </section>
  </v-container>
</template>

<script>
import Plates from '@/components/Plates.vue'
import InfoIcon from '@/components/InfoIcon.vue'
import taxaSource from '@/mixins/taxaSource'

export default {
  name: 'Heatmap',
  // Store-backed data source: supplies `sampleData` on demand from the
  // columnar store instead of receiving every parsed row as a prop.
  mixins: [taxaSource],
  components: { Plates, InfoIcon },
  // `samples` / `taxaQuery` / `storeTick` arrive via the taxaSource mixin;
  // `sampleData` is derived from the store there rather than passed in.
  props: ['socket', 'namesData', 'selectedsamples', 'sampleMeta', 'run', 'bundleconfig', 'fullsize'],
  data() {
    return {
      // The heatmap shows a fixed number of taxa per rank.
      taxaLimit: 1000,
      selectedTaxid: 0,
      selectedAttribute: 'G',
      legendPlacement: 'bottom',
      ranks: [
        { text: 'Domain', value: 'D' }, { text: 'Phylum', value: 'P' },
        { text: 'Class', value: 'C' }, { text: 'Order', value: 'O' },
        { text: 'Family', value: 'F' }, { text: 'Genus', value: 'G' },
        { text: 'Species', value: 'S' }, { text: 'Subspecies (S1)', value: 'S1' }
      ]
    }
  },
  computed: {
    hasData() {
      return this.sampleData && Object.keys(this.sampleData).length > 0
    },
    sampleKeys() {
      return Object.keys(this.sampleData || {})
    },
  },
  watch: {
    // Was `sampleData: { deep: true }`. Deep-watching an object of row arrays
    // meant Vue traversed every row of every sample just to decide whether this
    // handler should run -- on every arriving report. `storeTick` is one
    // integer that changes exactly when the data does.
    storeTick: {
      immediate: true,
      handler() {
        const val = this.sampleData
        // Keep the rank list in sync with what's present in the data, preserving
        // distinct subspecies depth ranks (S1, S2, S3, ...).
        if (!val) return
        const present = new Set()
        Object.values(val).forEach((rows) => {
          if (rows) rows.forEach((r) => {
            if (r.rank_code) present.add(String(r.rank_code))
          })
        })
        const rankLabel = (code) => /^S\d+$/.test(code)
          ? `Subspecies (${code})`
          : ({ D: 'Domain', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species' }[code] || code)
        const base = ['D', 'P', 'C', 'O', 'F', 'G', 'S'].filter((r) => present.has(r))
        const subs = Array.from(present).filter((r) => /^S\d+$/.test(r))
          .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
        const found = [...base, ...subs]
        if (found.length) this.ranks = found.map((c) => ({ text: rankLabel(c), value: c }))
        if (this.ranks.findIndex((r) => r.value === this.selectedAttribute) === -1) {
          this.selectedAttribute = present.has('G')
            ? 'G'
            : (found[found.length - 1] || 'G')
        }
      }
    }
  }
}
</script>

<style scoped>
.mtx-heatmap {
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mtx-heat-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  background: linear-gradient(130deg, #0e3f6a 0%, #1e6b97 55%, #4a9bbb 100%);
  color: #fff;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 6px 16px rgba(20, 56, 84, 0.18);
}
.mtx-heat-hero-title-wrap { max-width: 760px; }
.mtx-heat-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  opacity: .85;
  margin-bottom: 2px;
}
.mtx-heat-hero-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.15;
  font-weight: 800;
}
.mtx-heat-hero-sub {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.4;
  opacity: .95;
}
.mtx-heat-hero-stats { display: flex; gap: 8px; align-items: stretch; }
.mtx-stat {
  min-width: 88px;
  background: rgba(255,255,255,.15);
  border: 1px solid rgba(255,255,255,.24);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.mtx-stat .k {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .06em;
  opacity: .88;
}
.mtx-stat strong { font-size: 18px; margin-top: 2px; }

.mtx-stat-rank { min-width: 100px; }
.mtx-stat-rank-select { margin-top: 2px; }
.mtx-stat-rank-select ::v-deep .v-input__control { min-height: unset !important; }
.mtx-stat-rank-select ::v-deep .v-input__slot {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  min-height: unset !important;
}
.mtx-stat-rank-select ::v-deep .v-select__selection {
  color: #fff !important;
  font-size: 18px !important;
  font-weight: 700;
  margin: 0;
}
.mtx-stat-rank-select ::v-deep .v-icon { color: rgba(255,255,255,.7) !important; font-size: 18px !important; }
.mtx-stat-rank-select ::v-deep .v-text-field__details { display: none; }

.mtx-heat-body {
  background: #fff;
  border: 1px solid #d9e6f1;
  border-radius: 14px;
  padding: 6px 6px 2px;
}
.mtx-heatmap-blank { color: #8a97a4; font-style: italic; padding: 60px; text-align: center; }

@media (max-width: 980px) {
  .mtx-heat-hero { flex-direction: column; }
  .mtx-heat-hero-stats { width: 100%; }
}
</style>
