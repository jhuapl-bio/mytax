<!--
  ToolsPanel — basecalling / demultiplexing tools and the compute device.

  Shows where dorado and guppy_barcoder will be taken from (custom path →
  in-app download → $PATH), their versions, lets the user download dorado for
  the server's platform or point at another install, and pick the device
  (Auto / GPU / CPU) with the GPUs the server actually detected.
  Emits `send` with a socket message; the parent forwards it.
-->
<template>
  <div class="tp">
    <!-- device -->
    <div class="tp-device">
      <div class="tp-row">
        <div class="tp-label">Compute device</div>
        <v-spacer></v-spacer>
        <v-btn x-small text :disabled="!online" @click="$emit('send', { type: 'getTools', refresh: true })" title="Re-detect GPUs and tools">
          <v-icon x-small left>mdi-refresh</v-icon>Re-check
        </v-btn>
      </div>
      <v-btn-toggle :value="status.device || 'auto'" mandatory dense class="tp-toggle"
        @change="(v) => $emit('send', { type: 'setToolSettings', device: v })">
        <v-btn small value="auto" :disabled="!online"><v-icon small left>mdi-auto-fix</v-icon>Auto</v-btn>
        <v-btn small value="gpu" :disabled="!online"><v-icon small left>mdi-expansion-card</v-icon>GPU</v-btn>
        <v-btn small value="cpu" :disabled="!online"><v-icon small left>mdi-cpu-64-bit</v-icon>CPU</v-btn>
      </v-btn-toggle>
      <div class="tp-gpu" :class="{ 'tp-gpu--none': !hasGpu }">
        <v-icon small class="mr-1" :color="hasGpu ? 'green darken-1' : 'orange darken-2'">{{ hasGpu ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}</v-icon>
        <span v-if="gpu.cuda">
          {{ gpu.devices.length }} × {{ gpuNames }}<template v-if="gpu.driver"> · driver {{ gpu.driver }}</template>
          — dorado uses <code>--device cuda:all</code>, guppy <code>-x cuda:all</code>
        </span>
        <span v-else-if="gpu.metal">Apple silicon GPU — dorado uses <code>--device metal</code></span>
        <span v-else>{{ gpu.note || 'No GPU detected' }}. Basecalling on CPU works but is very slow; demultiplexing is fine on CPU.</span>
      </div>
    </div>

    <!-- tools -->
    <div v-for="t in toolList" :key="t.key" class="tp-tool" :class="'tp-tool--' + toolState(t)">
      <div class="tp-row">
        <span class="tp-dot"></span>
        <div class="tp-tool-main">
          <div class="tp-tool-name">
            {{ t.label }}
            <span class="tp-can" v-for="c in t.can" :key="c">{{ c }}</span>
          </div>
          <div class="tp-tool-sub">
            <template v-if="t.present">
              <b class="tp-ok">{{ t.version || 'found' }}</b>
              <span class="tp-src">{{ sourceLabel(t.source) }}</span>
            </template>
            <b v-else class="tp-missing">Not found</b>
            <span v-if="t.customInvalid" class="tp-warn"> · custom path not usable: {{ t.customInvalid }}</span>
          </div>
        </div>
        <div class="tp-actions">
          <template v-if="t.download && t.download.downloading">
            <v-btn x-small outlined color="red darken-1" :disabled="t.download.phase === 'extracting'"
              @click="$emit('send', { type: 'cancelToolDownload', tool: t.key })">
              <v-icon x-small left>mdi-close</v-icon>Cancel
            </v-btn>
          </template>
          <v-btn v-else-if="t.downloadable" x-small :depressed="!t.present" :outlined="t.present" color="primary" :disabled="!online"
            @click="$emit('send', { type: 'downloadTool', tool: t.key })"
            :title="`Download dorado ${status.dorado && status.dorado.version} for ${status.dorado && status.dorado.platform}`">
            <v-icon x-small left>mdi-download</v-icon>{{ t.present ? 'Download v' + ((status.dorado && status.dorado.version) || '') : 'Download' }}
          </v-btn>
          <v-btn x-small text :disabled="!online" @click="togglePathEdit(t)">
            <v-icon x-small left>mdi-folder-cog-outline</v-icon>{{ t.customPath ? 'Change path' : 'Set path' }}
          </v-btn>
        </div>
      </div>

      <code v-if="t.path" class="tp-path" :title="t.path">{{ t.path }}</code>

      <div v-if="t.download && (t.download.downloading || t.download.error || t.download.lastResult === 'cancelled')" class="tp-dl">
        <template v-if="t.download.downloading">
          <v-progress-linear :indeterminate="t.download.phase === 'extracting' || t.download.progress == null"
            :value="t.download.progress || 0" height="6" rounded
            :color="t.download.phase === 'extracting' ? 'deep-purple lighten-2' : 'blue darken-1'" background-color="#dbe6f0"></v-progress-linear>
          <div class="tp-dl-meta">
            <span v-if="t.download.phase === 'extracting'">Unpacking…</span>
            <span v-else>{{ fmtBytes(t.download.downloaded) }}<template v-if="t.download.total"> of {{ fmtBytes(t.download.total) }}</template><template v-if="t.download.progress != null"> · {{ t.download.progress }}%</template></span>
            <span>{{ rate(t.download) }}</span>
          </div>
        </template>
        <div v-else-if="t.download.error" class="tp-err">
          <v-icon x-small color="red darken-1" class="mr-1">mdi-alert-circle-outline</v-icon>
          Download failed: {{ t.download.error }}
          <div class="tp-hint">If the server can't reach Oxford Nanopore's CDN, download dorado on another machine and use "Set path", or set a mirror URL under Advanced.</div>
        </div>
        <div v-else class="tp-hint">Download cancelled.</div>
      </div>

      <div v-if="editing === t.key" class="tp-pathedit">
        <v-text-field v-model="pathDraft" dense outlined hide-details clearable
          :placeholder="`/path/to/${t.key === 'guppy' ? 'guppy_barcoder' : 'dorado'} (or its install folder)`"
          prepend-inner-icon="mdi-console" @keyup.enter="savePath(t)"></v-text-field>
        <v-btn small depressed color="primary" class="ml-2" @click="savePath(t)">Save</v-btn>
        <v-btn small text v-if="t.customPath" @click="pathDraft = ''; savePath(t)">Use default</v-btn>
      </div>
      <div class="tp-desc">{{ t.description }}</div>
    </div>

    <!-- advanced -->
    <div class="tp-adv">
      <button class="tp-adv-toggle" @click="showAdv = !showAdv">
        <v-icon x-small>{{ showAdv ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon> Advanced: dorado version / download mirror
      </button>
      <div v-if="showAdv" class="tp-adv-body">
        <v-text-field v-model="versionDraft" dense outlined hide-details label="dorado version" :placeholder="status.dorado && status.dorado.defaultVersion" class="mr-2" style="max-width: 150px"></v-text-field>
        <v-text-field v-model="urlDraft" dense outlined hide-details clearable label="Custom download URL (optional)" placeholder="https://…/dorado-x.y.z-linux-x64.tar.gz"></v-text-field>
        <v-btn small depressed class="ml-2" :disabled="!online" @click="saveAdv">Save</v-btn>
        <div class="tp-hint tp-adv-url">Downloads from: <code>{{ status.dorado && status.dorado.url || 'no build for this platform' }}</code></div>
      </div>
    </div>
  </div>
</template>

<script>
import { formatBytes, formatDuration } from '@/utils/format'

export default {
  name: 'ToolsPanel',
  props: {
    status: { type: Object, default: () => ({}) },
    online: { type: Boolean, default: true }
  },
  data() {
    return { editing: null, pathDraft: '', showAdv: false, versionDraft: '', urlDraft: '', now: Date.now() }
  },
  computed: {
    gpu() { return this.status.gpu || { devices: [] } },
    hasGpu() { return !!(this.gpu.cuda || this.gpu.metal) },
    gpuNames() {
      const names = Array.from(new Set((this.gpu.devices || []).map((d) => d.memoryMB ? `${d.name} (${Math.round(d.memoryMB / 1024)} GB)` : d.name)))
      return names.join(', ')
    },
    toolList() {
      const t = this.status.tools || {}
      return ['dorado', 'guppy'].map((k) => t[k]).filter(Boolean)
    },
    anyDownloading() { return this.toolList.some((t) => t.download && t.download.downloading) }
  },
  watch: {
    status: {
      immediate: true,
      handler(s) {
        if (s && s.dorado && !this.showAdv) {
          this.versionDraft = s.dorado.version || ''
          this.urlDraft = s.dorado.customUrl || ''
        }
      }
    },
    anyDownloading: {
      immediate: true,
      handler(on) {
        if (on && !this._clock) this._clock = setInterval(() => { this.now = Date.now() }, 1000)
        if (!on && this._clock) { clearInterval(this._clock); this._clock = null }
      }
    }
  },
  beforeDestroy() { if (this._clock) clearInterval(this._clock) },
  methods: {
    fmtBytes: formatBytes,
    sourceLabel(src) {
      return ({ custom: 'custom path', managed: 'downloaded in-app', path: 'from $PATH' })[src] || ''
    },
    toolState(t) {
      if (t.download && t.download.downloading) return 'busy'
      return t.present ? 'ready' : 'missing'
    },
    rate(d) {
      if (!d || !d.startedAt || !d.downloaded) return ''
      const secs = (this.now - d.startedAt) / 1000
      if (secs < 1) return ''
      const speed = d.downloaded / secs
      const left = d.total && d.total > d.downloaded ? (d.total - d.downloaded) / speed : null
      return `${formatBytes(speed)}/s${left != null ? ` · ~${formatDuration(left)} left` : ''}`
    },
    togglePathEdit(t) {
      if (this.editing === t.key) { this.editing = null; return }
      this.editing = t.key
      this.pathDraft = t.customPath || ''
    },
    savePath(t) {
      this.$emit('send', { type: 'setToolPath', tool: t.key, path: this.pathDraft || null })
      this.editing = null
    },
    saveAdv() {
      this.$emit('send', { type: 'setToolSettings', doradoVersion: this.versionDraft, doradoUrl: this.urlDraft || '' })
      this.showAdv = false
    }
  }
}
</script>

<style scoped>
.tp { text-align: left; display: flex; flex-direction: column; gap: 10px; }
.tp-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tp-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #4b6275; }
.tp-device { border: 1px solid #e1e8ef; border-radius: 10px; padding: 10px 12px; background: #fbfdff; }
.tp-toggle { margin: 6px 0 8px; }
.tp-gpu { display: flex; align-items: flex-start; font-size: 12px; color: #1d2b3a; line-height: 1.45; }
.tp-gpu--none { color: #92400e; }
.tp-gpu code, .tp-hint code { font-size: 11px; background: #eef3f8; padding: 0 4px; border-radius: 3px; }
.tp-tool { border: 1px solid #d8e2ec; border-left: 3px solid #9aa9b8; border-radius: 10px; padding: 10px 12px; background: #fff; }
.tp-tool--ready { border-left-color: #22a06b; }
.tp-tool--missing { border-left-color: #e0a100; }
.tp-tool--busy { border-left-color: #1e6b97; }
.tp-dot { width: 9px; height: 9px; border-radius: 50%; background: #9aa9b8; flex: 0 0 auto; }
.tp-tool--ready .tp-dot { background: #22a06b; }
.tp-tool--missing .tp-dot { background: #e0a100; }
.tp-tool--busy .tp-dot { background: #1e6b97; }
.tp-tool-main { flex: 1 1 auto; min-width: 0; }
.tp-tool-name { font-size: 14px; font-weight: 700; color: #1d2b3a; display: flex; align-items: center; gap: 6px; }
.tp-can { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #4b6275; background: #eef3f8; border-radius: 8px; padding: 0 6px; }
.tp-tool-sub { font-size: 12px; color: #5b6f82; }
.tp-ok { color: #15803d; }
.tp-missing { color: #a16207; }
.tp-warn { color: #b91c1c; }
.tp-src { margin-left: 6px; font-size: 11px; color: #4b6275; background: #f2f5f8; border-radius: 8px; padding: 0 6px; }
.tp-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.tp-path { display: block; margin-top: 6px; font-size: 11px; background: #f4f7fa; padding: 3px 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tp-dl { margin-top: 8px; }
.tp-dl-meta { display: flex; justify-content: space-between; font-size: 11px; color: #4b6275; margin-top: 4px; }
.tp-err { font-size: 12px; color: #b91c1c; }
.tp-hint { font-size: 11px; color: #6b7f92; margin-top: 3px; }
.tp-pathedit { display: flex; align-items: center; margin-top: 8px; }
.tp-desc { font-size: 11.5px; color: #6b7f92; margin-top: 6px; }
.tp-adv-toggle { background: none; border: 0; font-size: 12px; color: #1e6b97; cursor: pointer; padding: 0; }
.tp-adv-body { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tp-adv-url { flex-basis: 100%; }
</style>
