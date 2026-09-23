<template>
  <v-tooltip bottom :disabled="!tooltip">
    <template v-slot:activator="{ on, attrs }">
      <span class="rsw" v-bind="attrs" v-on="on">
        <!-- Running: indeterminate spinner. This is the state that answers
             "is something happening on ANOTHER run right now?" -->
        <v-progress-circular
          v-if="state === 'running'"
          indeterminate
          :size="size"
          :width="width"
          color="light-blue darken-1"
        />
        <!-- Queued but nothing in flight for this run yet: determinate ring at
             the current completion share, drawn muted so it reads as "waiting"
             rather than "working". -->
        <v-progress-circular
          v-else-if="state === 'queued'"
          :value="status.percent || 0"
          :rotate="-90"
          :size="size"
          :width="width"
          color="amber darken-2"
        />
        <!-- Terminal states collapse to an icon; a ring at 100% is just a
             circle, and an icon distinguishes success from failure at a glance. -->
        <v-icon v-else-if="state === 'error'" :size="size" color="red darken-1">
          mdi-alert-circle
        </v-icon>
        <v-icon v-else-if="state === 'done'" :size="size" color="green darken-1">
          mdi-check-circle
        </v-icon>
        <v-icon v-else :size="size" color="grey lighten-1">
          mdi-circle-outline
        </v-icon>
      </span>
    </template>
    <span>{{ tooltip }}</span>
  </v-tooltip>
</template>

<script>
// Small status indicator for a single run, driven by the scheduler's
// per-run summary (queueBoardAll.runs[]). Because the classification queue is
// shared across every run, this is what makes work on a NON-selected run
// visible in the run dropdown instead of silently invisible until you switch.
export default {
  name: 'RunStatusWheel',
  props: {
    // { running, pending, done, failed, total, percent }
    status: {
      type: Object,
      default: () => ({ running: 0, pending: 0, done: 0, failed: 0, total: 0, percent: 0 })
    },
    size: { type: Number, default: 18 },
    width: { type: Number, default: 2 },
    // Set false to render bare (e.g. inside an already-tooltipped row).
    showTooltip: { type: Boolean, default: true }
  },
  computed: {
    s () {
      return this.status || {}
    },
    state () {
      if ((this.s.running || 0) > 0) return 'running'
      if ((this.s.pending || 0) > 0) return 'queued'
      if ((this.s.failed || 0) > 0) return 'error'
      if ((this.s.total || 0) > 0) return 'done'
      return 'idle'
    },
    tooltip () {
      if (!this.showTooltip) return ''
      const s = this.s
      switch (this.state) {
        case 'running':
          return `${s.running} job${s.running === 1 ? '' : 's'} classifying now` +
            (s.pending ? `, ${s.pending} queued` : '')
        case 'queued':
          return `${s.pending} job${s.pending === 1 ? '' : 's'} queued (${s.percent || 0}% of this run done)`
        case 'error':
          return `${s.failed} job${s.failed === 1 ? '' : 's'} failed`
        case 'done':
          return `All ${s.total} job${s.total === 1 ? '' : 's'} finished`
        default:
          return 'Idle — no jobs queued for this run'
      }
    }
  }
}
</script>

<style scoped>
.rsw {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
</style>
