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
        <p class="mtx-heat-hero-sub">Taxa are shown on the top axis. Hover a cell to inspect exact values and click a genus to drill into species.</p>
      </div>
      <div class="mtx-heat-hero-stats">
        <div class="mtx-stat">
          <span class="k">Samples</span>
          <strong>{{ sampleKeys.length }}</strong>
        </div>
        <div class="mtx-stat mtx-stat-rank">
          <span class="k">Rank <InfoIcon text="Taxonomic rank used to group taxa on the heatmap x-axis. Switch between Domain, Phylum, Class, Order, Family, Genus, and Species." /></span>
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

export default {
  name: 'Heatmap',
  components: { Plates, InfoIcon },
  props: ['socket', 'sampleData', 'namesData', 'selectedsamples', 'sampleMeta', 'run', 'bundleconfig', 'fullsize'],
  data() {
    return {
      selectedTaxid: 0,
      selectedAttribute: 'G',
      legendPlacement: 'bottom',
      // Subspecies are rolled up to the single canonical 'S1' rank upstream, so the
      // selector offers one "Subspecies" option rather than S1/S2/S3.
      ranks: [
        { text: 'Domain', value: 'D' }, { text: 'Phylum', value: 'P' },
        { text: 'Class', value: 'C' }, { text: 'Order', value: 'O' },
        { text: 'Family', value: 'F' }, { text: 'Genus', value: 'G' },
        { text: 'Species', value: 'S' }, { text: 'Subspecies', value: 'S1' }
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
    sampleData: {
      deep: true,
      immediate: true,
      handler(val) {
        // keep the rank list in sync with what's actually present in the data.
        // Any rolled-up sub-rank is normalised to the canonical 'S1' ("Subspecies").
        if (!val) return
        const present = new Set()
        Object.values(val).forEach((rows) => {
          if (rows) rows.forEach((r) => {
            if (r.rank_code) present.add(/^S\d+$/.test(r.rank_code) ? 'S1' : r.rank_code)
          })
        })
        const LABELS = { D: 'Domain', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species', S1: 'Subspecies' }
        const order = ['D', 'P', 'C', 'O', 'F', 'G', 'S', 'S1']
        const found = order.filter((r) => present.has(r))
        if (found.length) this.ranks = found.map((c) => ({ text: LABELS[c], value: c }))
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
