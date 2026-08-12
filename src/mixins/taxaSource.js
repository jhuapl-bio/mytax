/* ---------------------------------------------------------------------------
 * mixins/taxaSource.js
 *
 * The bridge between the columnar store and the chart components.
 *
 * Every tab used to receive a `sampleData` prop shaped { sample: [rows...] },
 * built in App.vue from state that held every row of every report at all times,
 * and re-created whenever anything anywhere changed. Components then deep-watched
 * it. That combination is what made a single arriving report re-render the whole
 * application.
 *
 * This mixin keeps the same `sampleData` shape — so the d3 code inside the
 * components did not have to be rewritten around a new data model — but derives
 * it lazily from the store, capped, cached, and recomputed only when the store's
 * tick or the display filters actually change.
 *
 * Two things make that cheap:
 *
 *   1. `taxaLimit`. No chart draws 30k bars. Components declare how many rows
 *      per sample they can possibly use (Explore's panels page through 12 at a
 *      time; the cross-sample matrix wants a few hundred). Hydration cost is
 *      proportional to that, not to report size.
 *
 *   2. The store's query cache. Two components asking for the same slice of the
 *      same sample at the same version get the same array back. No copies.
 *
 * Components that render one panel per sample should also mix in the
 * visibility helpers: observe() each panel element, and the mixin reports which
 * samples are actually on screen back to App.vue, which forwards it to the
 * server. Off-screen samples then stop being encoded into frames at all.
 * ------------------------------------------------------------------------- */

import taxaStore from '@/store/taxa'

export default {
  props: {
    // Sample names to display. Just strings.
    samples: { type: Array, default: () => [] },
    // Display filters from App.vue: { ranks, depthRange, minPercent, version }
    taxaQuery: { type: Object, default: () => ({}) },
    // Reactive "the store changed" counter.
    storeTick: { type: Number, default: 0 }
  },

  data() {
    return {
      // Overridden per component. The default suits summary views.
      taxaLimit: 500
    }
  },

  // NOTE: the IntersectionObserver and the visible-sample list are instance
  // properties set in created(), NOT data().
  //
  // Two reasons, both of which bite silently:
  //   * Vue 2 refuses to proxy keys beginning with `_` onto the instance, so a
  //     `_visible` returned from data() is simply undefined at `this._visible`.
  //   * Even named without the underscore, putting them in data() would make
  //     Vue observe them — and the observer holds DOM nodes.
  created() {
    this._visObserver = null
    this._visSelector = null
    this._visible = []
    // Until the observer has reported at least once we do not know what is on
    // screen, and MUST NOT claim nothing is. See isVisible().
    this._visReported = false
  },

  computed: {
    // Base query shared by every read this component makes.
    baseQuery() {
      const q = this.taxaQuery || {}
      return {
        ranks: q.ranks && q.ranks.length ? q.ranks : null,
        depthRange: q.depthRange,
        minPercent: q.minPercent || 0
      }
    },

    /**
     * { sampleName: [row, ...] } — the shape the existing chart code expects.
     *
     * Recomputed only when storeTick, the filters, or the sample list change.
     * Vue caches the result, and the store caches the row arrays underneath, so
     * repeated access within a render pass is free.
     */
    sampleData() {
      // Touch both reactive dependencies so Vue re-evaluates when the store
      // changes OR when a display filter moves.
      // eslint-disable-next-line no-unused-expressions
      this.storeTick
      // eslint-disable-next-line no-unused-expressions
      this.taxaQuery && this.taxaQuery.version
      const out = {}
      for (const name of this.samples || []) {
        out[name] = taxaStore.query(name, {
          ...this.baseQuery,
          sort: 'clade',
          limit: this.taxaLimit
        })
      }
      return out
    },

    // Samples that actually have data loaded, in the order given.
    loadedSamples() {
      // eslint-disable-next-line no-unused-expressions
      this.storeTick
      return (this.samples || []).filter((s) => taxaStore.count(s) > 0)
    },

    // Rank codes present across the loaded samples, taxonomically ordered.
    ranksPresent() {
      // eslint-disable-next-line no-unused-expressions
      this.storeTick
      return taxaStore.ranksPresent()
    }
  },

  methods: {
    // Rows for one sample with a component-specific query (a different rank, a
    // search term, a bigger limit for a table page).
    rowsFor(sample, opts) {
      return taxaStore.query(sample, { ...this.baseQuery, ...(opts || {}) })
    },

    // Total matching rows without hydrating them — for pagination counts.
    countFor(sample, opts) {
      return taxaStore.countMatching(sample, { ...this.baseQuery, ...(opts || {}) })
    },

    // Total directly-assigned reads for a sample.
    totalFor(sample) {
      return taxaStore.total(sample)
    },

    // Nested tree for hierarchical charts, built on demand for ONE sample.
    hierarchyFor(sample, opts) {
      return taxaStore.hierarchy(sample, opts)
    },

    // Does this sample contain this taxon? Index lookup, no hydration.
    sampleHasTaxon(sample, taxid) {
      return taxaStore.hasTaxon(sample, taxid)
    },

    // ---- viewport tracking -------------------------------------------------

    /**
     * Start observing per-sample panels. Call once from mounted() in components
     * that render a panel per sample.
     * @param {string} selector CSS selector for panel elements carrying a
     *                          `data-sample` attribute.
     */
    observeVisibility(selector) {
      if (typeof IntersectionObserver === 'undefined') {
        // No observer (old browser / test env): treat everything as visible so
        // behaviour degrades to "correct but not optimised".
        this._visible = (this.samples || []).slice()
        this.$emit('visibleSamples', this._visible)
        return
      }
      this._visSelector = selector
      this._visObserver = new IntersectionObserver((entries) => {
        let changed = false
        for (const entry of entries) {
          const name = entry.target.getAttribute('data-sample')
          if (!name) continue
          const at = this._visible.indexOf(name)
          if (entry.isIntersecting && at === -1) { this._visible.push(name); changed = true }
          else if (!entry.isIntersecting && at > -1) { this._visible.splice(at, 1); changed = true }
        }
        this._visReported = true
        if (changed) {
          // Tell the parent (and through it, the server) what is on screen.
          this.$emit('visibleSamples', this._visible.slice())
          // Panels that just became visible need to draw.
          this.$nextTick(() => { if (this.redraw) this.redraw() })
        }
      }, {
        // Start drawing slightly before a panel scrolls into view so it is
        // never visibly blank.
        rootMargin: '200px 0px',
        threshold: 0
      })
      this.$nextTick(() => this.refreshVisibilityTargets())
    },

    /**
     * Re-scan for panel elements.
     *
     * Must be called whenever the set of RENDERED panels changes — which is not
     * the same thing as the `samples` prop changing. Panels appear as data
     * arrives for samples that were already in the list, so watching `samples`
     * alone left newly rendered panels unobserved and therefore never drawn.
     * Components watch their own rendered list and call this.
     */
    refreshVisibilityTargets() {
      if (!this._visObserver || !this._visSelector) return
      this._visObserver.disconnect()
      const els = this.$el ? this.$el.querySelectorAll(this._visSelector) : []
      if (!els.length) {
        this._visible = []
        this._visReported = false
        this.$emit('visibleSamples', [])
        return
      }
      // Drop any samples whose panels no longer exist, so the reported viewport
      // does not keep the server encoding taxa for something that is gone.
      const live = new Set(Array.from(els).map((el) => el.getAttribute('data-sample')).filter(Boolean))
      this._visible = this._visible.filter((s) => live.has(s))
      // Re-observation is asynchronous. Until the observer reports for this new
      // element set, fail open so new samples draw immediately instead of
      // staying blank until a tab remount.
      this._visReported = false
      for (const el of els) this._visObserver.observe(el)
      this.$nextTick(() => { if (this.redraw) this.redraw() })
    },

    /**
     * Is this sample's panel on screen?
     *
     * FAILS OPEN, deliberately. IntersectionObserver reports asynchronously, so
     * between mounting a panel and the first callback we genuinely do not know.
     * Answering "no" during that window meant the panel was skipped by redraw()
     * and — because the legend is populated as a side effect of drawing — it sat
     * on its "building…" placeholder forever. Answering "yes" costs one extra
     * draw; answering "no" costs correctness.
     */
    isVisible(sample) {
      if (!this._visObserver) return true
      if (!this._visReported) return true
      return this._visible.indexOf(sample) > -1
    },

    // Ask the server for full (uncapped) detail on one sample. Named this way
    // rather than `focusSample` because components legitimately keep a
    // `focusSample` in their own data, and a mixin method would collide with it.
    requestFullDetail(sample) {
      this.$emit('focusSample', sample || null)
    }
  },

  beforeDestroy() {
    if (this._visObserver) {
      this._visObserver.disconnect()
      this._visObserver = null
    }
    // Release the server-side view scoping owned by this tab.
    this.$emit('visibleSamples', [])
    this.$emit('focusSample', null)
  }
}
