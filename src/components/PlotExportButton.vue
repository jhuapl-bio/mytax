<!--
  PlotExportButton.vue — a small download control pinned to the top-right of a
  plot, opening a modal where the user picks a format (PNG / JPEG / PDF / SVG)
  and the output dimensions, then downloads the file.

  Usage: drop it inside a position:relative wrapper around the plot and hand it
  a way to find the plot's DOM node:

    <div class="my-plot-wrap" style="position: relative">
      <PlotExportButton :target="() => $refs.plotDiv" filename="sankey_sample1" />
      <div ref="plotDiv"></div>
    </div>

  `target` may be an Element, a CSS selector, or a function returning either.
  Everything under it that is an <svg> is exported (chart + legend/scale strip),
  laid out as it appears on screen.
-->
<template>
  <div class="mtx-export" data-export-ignore>
    <button
      class="mtx-export-btn"
      type="button"
      title="Export this plot"
      aria-label="Export this plot"
      @click.stop="open"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path fill="currentColor" d="M12 3v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4L10 13.2V3h2zM4 19h16v2H4v-2z" />
      </svg>
    </button>

    <v-dialog v-model="dialog" max-width="440" @click:outside="dialog = false">
      <v-card class="mtx-export-card">
        <v-card-title class="mtx-export-title">
          Export plot
          <v-spacer />
          <v-btn icon small @click="dialog = false"><v-icon small>mdi-close</v-icon></v-btn>
        </v-card-title>

        <v-card-text class="mtx-export-body">
          <div class="mtx-export-name">{{ filename }}</div>

          <div class="mtx-export-row">
            <span class="mtx-export-label">Format</span>
            <div class="mtx-export-formats">
              <button
                v-for="f in formats"
                :key="f.value"
                type="button"
                class="mtx-export-fmt"
                :class="{ active: format === f.value }"
                @click="format = f.value"
              >{{ f.label }}</button>
            </div>
          </div>
          <div class="mtx-export-hint">{{ formatHint }}</div>

          <div class="mtx-export-row mtx-export-dims">
            <label class="mtx-export-dim">
              <span class="mtx-export-label">Width ({{ unit }})</span>
              <input v-model.number="width" type="number" min="16" max="20000" @input="syncHeight" />
            </label>
            <label class="mtx-export-dim">
              <span class="mtx-export-label">Height ({{ unit }})</span>
              <input v-model.number="height" type="number" min="16" max="20000" @input="syncWidth" />
            </label>
            <button
              type="button"
              class="mtx-export-lock"
              :class="{ active: lockAspect }"
              :title="lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'"
              @click="lockAspect = !lockAspect"
            >{{ lockAspect ? '🔒' : '🔓' }}</button>
          </div>

          <div class="mtx-export-row mtx-export-presets">
            <span class="mtx-export-label">Presets</span>
            <button type="button" class="mtx-export-chip" @click="applyScale(1)">Actual size</button>
            <button type="button" class="mtx-export-chip" @click="applyScale(2)">2&times;</button>
            <button type="button" class="mtx-export-chip" @click="applyScale(4)">4&times;</button>
            <button type="button" class="mtx-export-chip" @click="applyPreset(1920, 1080)">1920&times;1080</button>
          </div>

          <div class="mtx-export-row" v-if="isRaster">
            <span class="mtx-export-label">Resolution</span>
            <select v-model.number="scale" class="mtx-export-select">
              <option :value="1">1&times; (screen)</option>
              <option :value="2">2&times; (retina)</option>
              <option :value="3">3&times;</option>
              <option :value="4">4&times; (print)</option>
            </select>
          </div>

          <div class="mtx-export-row">
            <label class="mtx-export-check">
              <input type="checkbox" v-model="opaque" :disabled="forcesOpaque" />
              <span>White background{{ forcesOpaque ? ' (required for this format)' : '' }}</span>
            </label>
          </div>

          <div v-if="error" class="mtx-export-error">{{ error }}</div>
        </v-card-text>

        <v-card-actions class="mtx-export-actions">
          <v-spacer />
          <v-btn text small @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" small :loading="busy" @click="doExport">Download</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import { exportPlot, plotSize } from '@/utils/plotExport'

export default {
  name: 'PlotExportButton',
  props: {
    // Element | CSS selector | function returning either.
    target: { type: [Function, String, Object], required: true },
    // Base name of the downloaded file (extension is appended).
    filename: { type: String, default: 'plot' }
  },
  data() {
    return {
      dialog: false,
      busy: false,
      error: '',
      format: 'png',
      width: 0,
      height: 0,
      scale: 2,
      opaque: true,
      lockAspect: true,
      aspect: 1,
      formats: [
        { value: 'png', label: 'PNG' },
        { value: 'jpeg', label: 'JPEG' },
        { value: 'pdf', label: 'PDF' },
        { value: 'svg', label: 'SVG' }
      ]
    }
  },
  computed: {
    isRaster() { return this.format === 'png' || this.format === 'jpeg' || this.format === 'pdf' },
    forcesOpaque() { return this.format === 'jpeg' || this.format === 'pdf' },
    unit() { return this.format === 'pdf' ? 'pt' : 'px' },
    formatHint() {
      switch (this.format) {
        case 'png': return 'Lossless raster with optional transparency — best for slides and docs.'
        case 'jpeg': return 'Compressed raster on a solid background — smallest file.'
        case 'pdf': return 'Single page sized to the dimensions below (72 dpi points).'
        default: return 'Vector, infinitely scalable, editable in Illustrator or Inkscape.'
      }
    }
  },
  watch: {
    format(val) {
      if (val === 'jpeg' || val === 'pdf') this.opaque = true
    }
  },
  methods: {
    resolveTarget() {
      let t = this.target
      if (typeof t === 'function') t = t()
      if (typeof t === 'string') t = document.querySelector(t)
      // A ref inside a v-for resolves to an array of nodes.
      if (Array.isArray(t)) t = t[0]
      if (t && t.$el) t = t.$el
      return t || null
    },
    // Natural size of everything that will be exported (chart + legends).
    naturalSize() {
      const el = this.resolveTarget()
      return el ? plotSize(el) : null
    },
    open() {
      this.error = ''
      const size = this.naturalSize()
      if (!size) {
        this.error = 'This plot has not been drawn yet.'
        this.width = 900
        this.height = 600
      } else {
        this.width = size.width
        this.height = size.height
      }
      this.aspect = this.height ? this.width / this.height : 1
      this.dialog = true
    },
    syncHeight() {
      if (this.lockAspect && this.width > 0 && this.aspect) {
        this.height = Math.max(1, Math.round(this.width / this.aspect))
      }
    },
    syncWidth() {
      if (this.lockAspect && this.height > 0 && this.aspect) {
        this.width = Math.max(1, Math.round(this.height * this.aspect))
      }
    },
    applyScale(mult) {
      const size = this.naturalSize()
      if (!size) return
      this.width = Math.round(size.width * mult)
      this.height = Math.round(size.height * mult)
    },
    applyPreset(w, h) {
      this.width = w
      // Honour the lock so a 16:9 preset does not distort a square dial.
      this.height = this.lockAspect && this.aspect ? Math.round(w / this.aspect) : h
    },
    async doExport() {
      this.error = ''
      const el = this.resolveTarget()
      if (!el) {
        this.error = 'Could not find the plot to export.'
        return
      }
      this.busy = true
      try {
        await exportPlot(el, {
          format: this.format,
          width: this.width,
          height: this.height,
          scale: this.isRaster ? this.scale : 1,
          background: this.opaque ? '#ffffff' : null,
          filename: this.filename
        })
        this.dialog = false
      } catch (e) {
        this.error = (e && e.message) || 'Export failed.'
      } finally {
        this.busy = false
      }
    }
  }
}
</script>

<style scoped>
.mtx-export {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 6;
}
.mtx-export-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid #d9e6f1;
  background: rgba(255, 255, 255, 0.92);
  color: #476b8a;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.mtx-export-btn:hover {
  opacity: 1;
  color: #1565c0;
  border-color: #1565c0;
}

.mtx-export-card { border-radius: 12px; }
.mtx-export-title {
  font-size: 1rem;
  font-weight: 600;
  padding: 12px 12px 8px 16px;
}
.mtx-export-body { padding: 0 16px 8px 16px; }
.mtx-export-name {
  font-size: 0.75rem;
  color: #78909c;
  word-break: break-all;
  margin-bottom: 10px;
}
.mtx-export-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.mtx-export-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #607d8b;
  min-width: 62px;
}
.mtx-export-formats { display: flex; gap: 6px; }
.mtx-export-fmt {
  border: 1px solid #d9e6f1;
  background: #fff;
  border-radius: 7px;
  padding: 4px 12px;
  font-size: 0.78rem;
  cursor: pointer;
}
.mtx-export-fmt.active {
  background: #1565c0;
  border-color: #1565c0;
  color: #fff;
}
.mtx-export-hint {
  font-size: 0.72rem;
  color: #90a4ae;
  margin: -4px 0 12px 0;
}
.mtx-export-dims { align-items: flex-end; }
.mtx-export-dim { display: flex; flex-direction: column; gap: 2px; }
.mtx-export-dim input,
.mtx-export-select {
  border: 1px solid #d9e6f1;
  border-radius: 7px;
  padding: 5px 8px;
  font-size: 0.85rem;
  width: 110px;
  background: #fff;
}
.mtx-export-lock {
  border: 1px solid #d9e6f1;
  background: #fff;
  border-radius: 7px;
  padding: 5px 8px;
  cursor: pointer;
  line-height: 1;
}
.mtx-export-lock.active { border-color: #1565c0; }
.mtx-export-chip {
  border: 1px solid #d9e6f1;
  background: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.72rem;
  cursor: pointer;
}
.mtx-export-chip:hover { border-color: #1565c0; color: #1565c0; }
.mtx-export-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: #455a64;
  cursor: pointer;
}
.mtx-export-error {
  color: #c62828;
  font-size: 0.78rem;
  margin-top: 4px;
}
.mtx-export-actions { padding: 0 12px 12px 12px; }
</style>
