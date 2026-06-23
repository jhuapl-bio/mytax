<!--
  Selectable + droppable zone for loading Kraken2 reports straight into the
  frontend. Used as a prominent, always-visible card pinned to the top-right of
  the main content area. Works identically online and offline (GitHub Pages):
  every dropped/selected file is read locally and emitted as an "importData"
  event with origin === 'upload'.
-->
<template>
  <div
    class="mtx-dropzone"
    :class="{ 'mtx-dropzone--over': dragOver, 'mtx-dropzone--mini': mini }"
    @drop.prevent="onDrop"
    @dragover.prevent="dragOver = true"
    @dragenter.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @click="!mini && pickFiles()"
  >
    <!-- collapsed pill -->
    <button v-if="mini" class="mtx-dropzone-fab" @click.stop="mini = false" title="Add Kraken2 reports">
      <v-icon small color="white">mdi-tray-arrow-up</v-icon>
    </button>

    <template v-else>
      <div class="mtx-dropzone-head">
        <v-icon small color="#274766" class="mr-1">mdi-tray-arrow-up</v-icon>
        <span class="mtx-dropzone-title">Add Kraken2 reports</span>
        <v-spacer></v-spacer>
        <button class="mtx-dropzone-collapse" @click.stop="mini = true" title="Collapse">
          <v-icon x-small color="#5b7a90">mdi-chevron-up</v-icon>
        </button>
      </div>

      <div class="mtx-dropzone-body">
        <v-icon :color="dragOver ? '#1e6b97' : '#9bb1c4'" size="26">mdi-cloud-upload-outline</v-icon>
        <div class="mtx-dropzone-text">
          <strong>Drop</strong> .report / .txt files here
          <br />
          <span class="mtx-dropzone-or">or <u>click to browse</u></span>
        </div>
      </div>

      <div v-if="lastAdded.length" class="mtx-dropzone-recent">
        <v-icon x-small color="#15803d" class="mr-1">mdi-check-circle</v-icon>
        Added {{ lastAdded.length }}: {{ lastAdded.slice(0, 2).join(', ') }}{{ lastAdded.length > 2 ? '…' : '' }}
      </div>
    </template>

    <input
      ref="fileInput"
      type="file"
      accept=".report,.txt,.tsv,.kreport,text/plain"
      multiple
      class="mtx-dropzone-input"
      @change="onSelect"
    />
  </div>
</template>

<script>
import path from 'path'

export default {
  name: 'DropZone',
  data() {
    return {
      dragOver: false,
      mini: false,
      lastAdded: [],
    }
  },
  methods: {
    pickFiles() {
      this.$refs.fileInput && this.$refs.fileInput.click()
    },
    onSelect(e) {
      this.handleFiles(Array.from(e.target.files || []))
      // reset so selecting the same file again re-triggers change
      e.target.value = ''
    },
    onDrop(e) {
      this.dragOver = false
      const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []
      this.handleFiles(files)
    },
    handleFiles(files) {
      if (!files || !files.length) return
      const added = []
      files.forEach((file) => {
        const sample = path.parse(file.name).name
        added.push(sample)
        const reader = new FileReader()
        reader.addEventListener(
          'load',
          () => {
            this.$emit('importData', reader.result, sample, 'upload')
          },
          false
        )
        reader.readAsText(file)
      })
      this.lastAdded = added
    },
  },
}
</script>

<style scoped>
.mtx-dropzone {
  width: 230px;
  background: #ffffff;
  border: 2px dashed #bcd0e2;
  border-radius: 14px;
  padding: 10px 12px 12px;
  cursor: pointer;
  box-shadow: 0 8px 24px -14px rgba(16, 24, 40, 0.45);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  position: relative;
}
.mtx-dropzone:hover {
  border-color: #1e6b97;
  background: #f7fbff;
}
.mtx-dropzone--over {
  border-color: #1e6b97;
  background: #eaf4fc;
  box-shadow: 0 0 0 3px rgba(30, 107, 151, 0.18);
}
.mtx-dropzone--mini {
  width: auto;
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}
.mtx-dropzone-fab {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(120deg, #274766, #325b80);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px -8px rgba(39, 71, 102, 0.9);
  outline: none;
  border: none;
  cursor: pointer;
}
.mtx-dropzone-head {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}
.mtx-dropzone-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #274766;
}
.mtx-dropzone-collapse {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.mtx-dropzone-body {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.mtx-dropzone-text {
  font-size: 11.5px;
  color: #5b6573;
  line-height: 1.35;
}
.mtx-dropzone-or {
  font-size: 11px;
  color: #1e6b97;
}
.mtx-dropzone-recent {
  margin-top: 8px;
  font-size: 10.5px;
  color: #15803d;
  background: #ecfdf3;
  border: 1px solid #d1fadf;
  border-radius: 8px;
  padding: 3px 8px;
  text-align: left;
  word-break: break-word;
}
.mtx-dropzone-input {
  display: none;
}
</style>
