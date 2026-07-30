<template>
  <!--
    Reusable, queue-board-styled log viewer.

    Props
    ------
    command   : String  - optional command line shown in a highlighted block.
    lines     : Array    - log lines. Each item may be a plain string, or an
                           object like { level, message } (server logs) or any
                           object (falls back to JSON). Newlines inside a line
                           are split out into their own rows.
    title     : String  - header title.
    subtitle  : String  - optional dimmed sub-title (e.g. filepath).
    state     : String  - optional status pill: running|queued|done|historical|error|cancelled.
    closable  : Boolean  - show an × that emits `close`.
    reverse   : Boolean  - newest-first (used by the Server Logs feed).
    maxHeight  : String  - CSS max-height for the scroll body (default 60vh).
  -->
  <div class="lv-root">
    <div class="lv-head">
      <v-icon small color="#9fb3c8">mdi-text-box-outline</v-icon>
      <span class="lv-ttl">{{ title }}</span>
      <span v-if="subtitle" class="lv-sub" :title="subtitle">{{ subtitle }}</span>
      <span v-if="state" class="lv-state" :class="state">{{ stateLabel }}</span>
      <span class="lv-count">{{ filteredLines.length }}<template v-if="search"> / {{ normLines.length }}</template> lines</span>

      <v-spacer></v-spacer>

      <div class="lv-search">
        <v-icon x-small color="#67809a">mdi-magnify</v-icon>
        <input
          v-model="search"
          class="lv-search-input"
          type="text"
          placeholder="Filter…"
          spellcheck="false"
        />
        <button v-if="search" class="lv-search-x" title="Clear filter" @click="search = ''">&times;</button>
      </div>

      <button class="lv-btn" :class="{ on: filterOnly }" title="Show only matching lines" @click="filterOnly = !filterOnly">
        <v-icon x-small>mdi-filter-variant</v-icon>
      </button>
      <button class="lv-btn" :class="{ on: wrap }" title="Toggle line wrap" @click="wrap = !wrap">
        <v-icon x-small>mdi-wrap</v-icon>
      </button>
      <button class="lv-btn" :class="{ on: follow }" title="Auto-scroll to newest" @click="toggleFollow">
        <v-icon x-small>mdi-arrow-down-bold-box-outline</v-icon>
      </button>
      <button class="lv-btn" title="Copy log to clipboard" @click="copyLog">
        <v-icon x-small>{{ copied ? 'mdi-check' : 'mdi-content-copy' }}</v-icon>
      </button>
      <button class="lv-btn" title="Download log" @click="downloadLog">
        <v-icon x-small>mdi-download</v-icon>
      </button>
      <button v-if="closable" class="lv-btn lv-close" title="Hide logs" @click="$emit('close')">
        <v-icon x-small>mdi-close</v-icon>
      </button>
    </div>

    <pre v-if="command" class="lv-cmd"><span class="lv-cmd-tag">$</span>{{ command }}</pre>

    <div ref="body" class="lv-body" :style="{ maxHeight: maxHeight }" @scroll="onScroll">
      <template v-if="filteredLines.length">
        <div
          v-for="(ln, i) in filteredLines"
          :key="i"
          class="lv-line"
          :class="ln.level"
        >
          <span class="lv-gutter">{{ ln.n }}</span>
          <span class="lv-text" :class="{ nowrap: !wrap }" v-html="ln.html"></span>
        </div>
      </template>
      <div v-else class="lv-empty">
        <template v-if="normLines.length && search">No lines match “{{ search }}”.</template>
        <template v-else>No log output captured for this job yet.</template>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LogViewer',
  props: {
    command: { type: String, default: '' },
    lines: { type: Array, default: () => [] },
    title: { type: String, default: 'Logs' },
    subtitle: { type: String, default: '' },
    state: { type: String, default: '' },
    closable: { type: Boolean, default: false },
    reverse: { type: Boolean, default: false },
    maxHeight: { type: String, default: '60vh' }
  },
  data () {
    return {
      search: '',
      filterOnly: false,
      wrap: true,
      follow: true,
      copied: false
    }
  },
  computed: {
    stateLabel () {
      const m = {
        running: 'Running', queued: 'Queued', done: 'Done',
        historical: 'Already run', error: 'Error', cancelled: 'Cancelled'
      }
      return m[this.state] || this.state
    },
    // Flatten the incoming lines into a uniform [{ text, level, n }] shape.
    normLines () {
      const out = []
      let n = 0
      for (const raw of this.lines || []) {
        let text
        let level = ''
        if (raw == null) continue
        if (typeof raw === 'string') {
          text = raw
        } else if (typeof raw === 'object') {
          level = raw.level || ''
          text = raw.message != null ? String(raw.message) : JSON.stringify(raw)
        } else {
          text = String(raw)
        }
        // split embedded newlines so long blobs read as separate rows
        const parts = String(text).replace(/\r/g, '').split('\n')
        for (const p of parts) {
          out.push({ text: p, level: level || this.detectLevel(p), n: ++n })
        }
      }
      return this.reverse ? out.reverse() : out
    },
    filteredLines () {
      const q = this.search.trim().toLowerCase()
      const rows = this.normLines
      const result = []
      for (const r of rows) {
        const match = q && r.text.toLowerCase().includes(q)
        if (this.filterOnly && q && !match) continue
        result.push({ ...r, html: this.highlight(r.text, match ? q : '') })
      }
      return result
    }
  },
  watch: {
    lines: {
      handler () { this.$nextTick(this.scrollToBottomIfFollowing) },
      deep: true
    }
  },
  mounted () {
    this.$nextTick(this.scrollToBottom)
  },
  methods: {
    detectLevel (text) {
      const t = text.toLowerCase()
      if (/\b(error|err|fail(ed|ure)?|fatal|exception|traceback|cannot|denied|no such)\b/.test(t)) return 'error'
      if (/\b(warn(ing)?|deprecat)/.test(t)) return 'warn'
      if (/\b(done|success(fully)?|complete[d]?|finished|ok|passed)\b/.test(t)) return 'success'
      return ''
    },
    escapeHtml (s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    },
    highlight (text, q) {
      const safe = this.escapeHtml(text)
      if (!q) return safe || '&nbsp;'
      // highlight every occurrence of the query (case-insensitive)
      const lower = text.toLowerCase()
      let out = ''
      let i = 0
      while (i < text.length) {
        const idx = lower.indexOf(q, i)
        if (idx === -1) { out += this.escapeHtml(text.slice(i)); break }
        out += this.escapeHtml(text.slice(i, idx))
        out += '<mark class="lv-hit">' + this.escapeHtml(text.slice(idx, idx + q.length)) + '</mark>'
        i = idx + q.length
      }
      return out || '&nbsp;'
    },
    onScroll () {
      const el = this.$refs.body
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      // let the user break auto-follow by scrolling up
      if (!atBottom && this.follow && !this.reverse) this.follow = false
    },
    toggleFollow () {
      this.follow = !this.follow
      if (this.follow) this.scrollToBottom()
    },
    scrollToBottom () {
      const el = this.$refs.body
      if (el && !this.reverse) el.scrollTop = el.scrollHeight
    },
    scrollToBottomIfFollowing () {
      if (this.follow) this.scrollToBottom()
    },
    plainText () {
      const head = this.command ? '$ ' + this.command + '\n\n' : ''
      return head + this.normLines.map(l => l.text).join('\n')
    },
    async copyLog () {
      const text = this.plainText()
      try {
        await navigator.clipboard.writeText(text)
      } catch (e) {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      this.copied = true
      setTimeout(() => { this.copied = false }, 1400)
    },
    downloadLog () {
      const blob = new Blob([this.plainText()], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safe = (this.title || 'log').replace(/[^a-z0-9._-]+/gi, '_')
      a.href = url
      a.download = safe + '.log'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
}
</script>

<style scoped>
.lv-root {
  display: flex;
  flex-direction: column;
  background: #0c141e;
  border: 1px solid #24384f;
  border-radius: 8px;
  overflow: hidden;
  font-family: "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
}

/* header / toolbar */
.lv-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  background: #16263a;
  border-bottom: 1px solid #24384f;
  flex-wrap: wrap;
}
.lv-ttl { font-size: .82rem; font-weight: 600; color: #e6edf3; font-family: inherit; }
.lv-sub {
  font-size: .72rem; color: #9fb3c8; max-width: 260px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lv-state {
  font-size: .68rem; padding: 1px 8px; border-radius: 9px;
  background: #274157; color: #dbe7f2; text-transform: capitalize;
}
.lv-state.running { background: #1d4ed8; color: #fff; }
.lv-state.done, .lv-state.historical, .lv-state.success { background: #15803d; color: #fff; }
.lv-state.error { background: #b91c1c; color: #fff; }
.lv-state.cancelled { background: #4b5563; color: #fff; }
.lv-count { font-size: .66rem; color: #6d829a; margin-left: 2px; }

/* search box */
.lv-search {
  display: flex; align-items: center; gap: 4px;
  background: #0e1a28; border: 1px solid #24384f; border-radius: 6px;
  padding: 2px 6px;
}
.lv-search-input {
  background: transparent; border: none; outline: none;
  color: #cfe0f0; font-size: .74rem; width: 120px; font-family: inherit;
}
.lv-search-input::placeholder { color: #5f7387; }
.lv-search-x {
  background: transparent; border: none; color: #7d93a8;
  font-size: 15px; line-height: 1; cursor: pointer; padding: 0 2px;
}
.lv-search-x:hover { color: #e6edf3; }

/* toolbar buttons */
.lv-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 24px;
  background: #0e1a28; border: 1px solid #24384f; border-radius: 6px;
  color: #9fb3c8; cursor: pointer; padding: 0;
}
.lv-btn:hover { background: #1b2d43; color: #e6edf3; border-color: #3b82f6; }
.lv-btn.on { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.lv-btn .v-icon { color: inherit !important; }
.lv-close:hover { border-color: #b91c1c; background: #7f1d1d; }

/* command block */
.lv-cmd {
  margin: 0; padding: 8px 12px;
  background: #13202f; border-bottom: 1px solid #21344a;
  color: #8fd1ff; font-size: .74rem; line-height: 1.5;
  white-space: pre-wrap; word-break: break-all; font-family: inherit;
}
.lv-cmd-tag { color: #4b708f; margin-right: 8px; user-select: none; }

/* scroll body */
.lv-body {
  overflow: auto;
  padding: 6px 0;
  background: #0a121b;
  min-height: 60px;
}
.lv-line {
  display: flex;
  align-items: flex-start;
  padding: 0 12px;
  font-size: .74rem;
  line-height: 1.5;
}
.lv-line:hover { background: #10202f; }
.lv-gutter {
  flex: 0 0 auto;
  width: 42px;
  text-align: right;
  padding-right: 12px;
  color: #3f556d;
  user-select: none;
  -webkit-user-select: none;
}
.lv-text {
  flex: 1 1 auto;
  color: #c4d2e0;
  white-space: pre-wrap;
  word-break: break-word;
}
.lv-text.nowrap { white-space: pre; }

/* per-level coloring */
.lv-line.error .lv-text { color: #ff8f8f; }
.lv-line.error { background: rgba(185, 28, 28, .10); box-shadow: inset 3px 0 0 #b91c1c; }
.lv-line.warn .lv-text { color: #f6c667; }
.lv-line.warn { box-shadow: inset 3px 0 0 #b7791f; }
.lv-line.success .lv-text { color: #7ee2a8; }

.lv-empty {
  color: #64788d; font-size: .78rem; font-style: italic;
  padding: 14px 14px; font-family: inherit;
}

/* search hit */
.lv-body >>> .lv-hit {
  background: #f5d90a; color: #1a1a1a; border-radius: 2px; padding: 0 1px;
}
</style>
