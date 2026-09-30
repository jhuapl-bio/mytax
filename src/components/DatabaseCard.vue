<!--
  DatabaseCard — one reference database's status + actions.

  Used in three places so a database looks and behaves the same everywhere:
    * the left panel (the currently selected database),
    * Settings → Reference databases (every database, dense),
    * the Add/Edit sample dialog (the database the sample will use).

  States: ready (on disk) · missing (not downloaded) · downloading (bytes,
  speed, time left) · extracting (archives unpack after download) · failed.
-->
<template>
  <div class="dbc" :class="['dbc--' + state, { 'dbc--dense': dense }]">
    <div class="dbc-head">
      <span class="dbc-dot" :title="stateLabel"></span>
      <div class="dbc-title">
        <div class="dbc-name" :title="db.key">{{ db.label || db.key }}</div>
        <div class="dbc-sub">
          <span class="dbc-state">{{ stateLabel }}</span>
          <span v-if="onDisk && db.size && !downloading" class="dbc-size">· {{ db.size }}</span>
          <span v-if="showEngine" class="dbc-engine">{{ engine }}</span>
        </div>
      </div>

      <div class="dbc-actions" v-if="actions">
        <template v-if="downloading">
          <v-btn x-small outlined color="red darken-1" :disabled="!online || extracting"
            :title="extracting ? 'Extraction can\'t be cancelled' : 'Stop this download'"
            @click="$emit('cancel', db)">
            <v-icon x-small left>mdi-close</v-icon>Cancel
          </v-btn>
        </template>
        <template v-else-if="!onDisk">
          <v-btn x-small depressed color="primary" :disabled="!online" @click="$emit('download', db)"
            :title="online ? 'Download to the server\'s databases folder' : 'Needs a backend connection'">
            <v-icon x-small left>{{ failed ? 'mdi-refresh' : 'mdi-download' }}</v-icon>{{ failed ? 'Retry' : 'Download' }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn x-small icon :disabled="!online" title="Open this database's folder on the server" @click="$emit('open', db)">
            <v-icon small>mdi-folder-open-outline</v-icon>
          </v-btn>
          <v-btn x-small icon :disabled="!online" title="Re-download (overwrite the copy on disk)" @click="$emit('download', db)">
            <v-icon small>mdi-cloud-refresh-outline</v-icon>
          </v-btn>
          <v-btn v-if="deletable" x-small icon color="red darken-1" :disabled="!online" title="Delete from disk" @click="$emit('delete', db)">
            <v-icon small>mdi-delete-outline</v-icon>
          </v-btn>
        </template>
      </div>
    </div>

    <div v-if="downloading" class="dbc-progress">
      <v-progress-linear
        :indeterminate="extracting || progress == null"
        :value="progress || 0"
        height="6" rounded
        :color="extracting ? 'deep-purple lighten-2' : 'blue darken-1'"
        background-color="#dbe6f0"
      ></v-progress-linear>
      <div class="dbc-progress-meta">
        <span v-if="extracting">Extracting archive… large databases can take several minutes</span>
        <span v-else>
          {{ fmtBytes(db.downloaded || 0) }}<template v-if="db.total"> of {{ fmtBytes(db.total) }}</template>
          <template v-if="progress != null"> · {{ progress }}%</template>
        </span>
        <span class="dbc-rate" v-if="!extracting && speed">
          {{ fmtBytes(speed) }}/s<template v-if="eta != null"> · ~{{ fmtDuration(eta) }} left</template>
        </span>
      </div>
    </div>

    <div v-if="failed" class="dbc-msg dbc-msg--error">
      <v-icon x-small color="red darken-1" class="mr-1">mdi-alert-circle-outline</v-icon>
      <span>Download failed: {{ db.error }}</span>
    </div>
    <div v-else-if="!downloading && db.lastResult === 'cancelled' && !onDisk" class="dbc-msg">
      <v-icon x-small class="mr-1">mdi-information-outline</v-icon>Download cancelled.
    </div>
    <div v-else-if="!downloading && db.lastResult === 'downloaded' && onDisk && justFinished" class="dbc-msg dbc-msg--ok">
      <v-icon x-small color="green darken-1" class="mr-1">mdi-check-circle-outline</v-icon>Downloaded and ready to use.
    </div>

    <div v-if="showDescription && db.description" class="dbc-desc">{{ db.description }}</div>
  </div>
</template>

<script>
import { formatBytes, formatDuration } from '@/utils/format'

export default {
  name: 'DatabaseCard',
  props: {
    db: { type: Object, required: true },
    online: { type: Boolean, default: true },
    dense: { type: Boolean, default: false },
    actions: { type: Boolean, default: true },
    deletable: { type: Boolean, default: true },
    showDescription: { type: Boolean, default: true },
    showEngine: { type: Boolean, default: true }
  },
  data() {
    return { now: Date.now(), justFinished: false }
  },
  computed: {
    onDisk() {
      const d = this.db || {}
      return !!(d.exists || (d.size && d.size !== 0))
    },
    downloading() { return !!(this.db && this.db.downloading) },
    extracting() { return this.downloading && this.db.phase === 'extracting' },
    failed() { return !this.downloading && !!(this.db && this.db.error) },
    progress() {
      const p = this.db && this.db.progress
      return p === null || p === undefined ? null : Math.max(0, Math.min(100, Math.round(p)))
    },
    state() {
      if (this.extracting) return 'extracting'
      if (this.downloading) return 'downloading'
      if (this.failed) return 'error'
      return this.onDisk ? 'ready' : 'missing'
    },
    stateLabel() {
      return ({
        extracting: 'Extracting…',
        downloading: 'Downloading…',
        error: 'Download failed',
        ready: 'Ready',
        missing: 'Not downloaded'
      })[this.state]
    },
    engine() {
      const t = this.db && this.db.type
      if (t === 'minimap2') return 'minimap2'
      if (t === 'taxdump') return 'support'
      return 'kraken2'
    },
    // Average speed since the download started. Steadier than instantaneous
    // speed and survives reconnects (startedAt comes from the server).
    speed() {
      const d = this.db || {}
      if (!d.startedAt || !d.downloaded) return 0
      const secs = (this.now - d.startedAt) / 1000
      return secs > 1 ? d.downloaded / secs : 0
    },
    eta() {
      const d = this.db || {}
      if (!this.speed || !d.total || d.total <= d.downloaded) return null
      return (d.total - d.downloaded) / this.speed
    }
  },
  watch: {
    downloading: {
      immediate: true,
      handler(on, was) {
        if (on) this.startClock()
        else this.stopClock()
        if (was && !on) {
          // briefly confirm completion
          this.justFinished = true
          clearTimeout(this._doneTimer)
          this._doneTimer = setTimeout(() => { this.justFinished = false }, 8000)
        }
      }
    }
  },
  beforeDestroy() {
    this.stopClock()
    clearTimeout(this._doneTimer)
  },
  methods: {
    fmtBytes: formatBytes,
    fmtDuration: formatDuration,
    startClock() {
      if (this._clock) return
      this.now = Date.now()
      this._clock = setInterval(() => { this.now = Date.now() }, 1000)
    },
    stopClock() {
      if (this._clock) { clearInterval(this._clock); this._clock = null }
    }
  }
}
</script>

<style scoped>
.dbc {
  text-align: left;
  border: 1px solid #d8e2ec;
  border-left: 3px solid #9aa9b8;
  border-radius: 8px;
  background: #fbfdff;
  padding: 8px 10px;
}
.dbc--dense { padding: 6px 8px; }
.dbc--ready { border-left-color: #22a06b; }
.dbc--missing { border-left-color: #e0a100; }
.dbc--downloading { border-left-color: #1e6b97; }
.dbc--extracting { border-left-color: #7e57c2; }
.dbc--error { border-left-color: #d64545; background: #fff8f8; }

.dbc-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dbc-dot { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%; background: #9aa9b8; }
.dbc--ready .dbc-dot { background: #22a06b; }
.dbc--missing .dbc-dot { background: #e0a100; }
.dbc--downloading .dbc-dot { background: #1e6b97; animation: dbc-pulse 1.2s ease-in-out infinite; }
.dbc--extracting .dbc-dot { background: #7e57c2; animation: dbc-pulse 1.2s ease-in-out infinite; }
.dbc--error .dbc-dot { background: #d64545; }
@keyframes dbc-pulse { 50% { opacity: .35; } }

.dbc-title { flex: 1 1 auto; min-width: 0; }
.dbc-name { font-size: 13px; font-weight: 600; color: #1d2b3a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dbc-sub { font-size: 11px; color: #5b6f82; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.dbc-state { font-weight: 600; }
.dbc--ready .dbc-state { color: #15803d; }
.dbc--missing .dbc-state { color: #a16207; }
.dbc--downloading .dbc-state { color: #1e6b97; }
.dbc--extracting .dbc-state { color: #6d4bb5; }
.dbc--error .dbc-state { color: #b91c1c; }
.dbc-engine {
  margin-left: 2px; padding: 0 6px; border-radius: 9px;
  background: #eef3f8; color: #4b6275; font-size: 10px; line-height: 16px;
}
.dbc-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; }

.dbc-progress { margin-top: 7px; }
.dbc-progress-meta {
  display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  margin-top: 4px; font-size: 11px; color: #4b6275;
}
.dbc-rate { color: #1e6b97; font-variant-numeric: tabular-nums; }
.dbc-msg { margin-top: 6px; font-size: 11px; color: #4b6275; display: flex; align-items: flex-start; }
.dbc-msg--error { color: #b91c1c; }
.dbc-msg--ok { color: #15803d; }
.dbc-desc { margin-top: 6px; font-size: 11px; line-height: 1.4; color: #5b6f82; }
</style>
