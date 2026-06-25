<!--
  PhyloPicIcon.vue — a fixed-size taxon silhouette.

  Given a scientific `name` (and optional `lineage` for fallback), it resolves a
  PhyloPic silhouette (client-side against the PhyloPic API, so it works with no
  backend) and renders it. Preferred path is the SVG markup rendered INLINE
  (an <img> renders PhyloPic vectors blank); if the inline markup can't be
  fetched, we fall back to the PNG thumbnail via <img> (which the official site
  uses). Nothing is downloaded to disk. Every icon occupies the same square box,
  so names stay aligned whether or not a silhouette exists.
-->
<template>
  <span
    class="mtx-phylopic"
    :style="{ width: size + 'px', height: size + 'px' }"
    :title="titleText"
  >
    <span v-if="svg" class="mtx-phylopic-svg" v-html="svg"></span>
    <img
      v-else-if="imgUrl"
      :src="imgUrl"
      class="mtx-phylopic-img"
      :alt="name + ' silhouette'"
      loading="lazy"
      decoding="async"
      @error="onImgError"
    />
    <span v-else-if="loading" class="mtx-phylopic-loading" aria-hidden="true"></span>
    <span v-else class="mtx-phylopic-empty" aria-hidden="true"></span>
  </span>
</template>

<script>
import { resolveSvgMarkup } from '@/services/phylopic'

export default {
  name: 'PhyloPicIcon',
  props: {
    name: { type: String, default: '' },
    lineage: { type: Array, default: () => [] },
    size: { type: Number, default: 22 },
  },
  data() {
    return { svg: null, imgUrl: null, loading: false }
  },
  computed: {
    titleText() {
      return (this.svg || this.imgUrl)
        ? `${this.name} — silhouette via PhyloPic`
        : this.name
    },
  },
  watch: {
    name: 'resolve',
    lineage() { this.resolve() },
  },
  mounted() {
    this.resolve()
  },
  methods: {
    async resolve() {
      const name = this.name
      if (!name) {
        this.svg = null
        this.imgUrl = null
        return
      }
      this.loading = true
      const hit = await resolveSvgMarkup(name, this.lineage)
      // Guard against a race where the prop changed while we awaited.
      if (this.name !== name) return
      this.loading = false
      if (hit && (hit.svg || hit.imgUrl)) {
        this.svg = hit.svg || null
        this.imgUrl = hit.svg ? null : (hit.imgUrl || null)
      } else {
        this.svg = null
        this.imgUrl = null
      }
    },
    onImgError() {
      // The source image failed to load — show the neutral placeholder.
      this.imgUrl = null
    },
  },
}
</script>

<style scoped>
.mtx-phylopic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  vertical-align: middle;
  border-radius: 4px;
  overflow: hidden;
}
.mtx-phylopic-svg {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.82;
}
/* Force the injected SVG to fill the fixed box at a uniform size. */
.mtx-phylopic-svg ::v-deep svg {
  width: 100%;
  height: 100%;
  display: block;
}
.mtx-phylopic-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.82;
}
.mtx-phylopic-empty {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background:
    repeating-linear-gradient(
      45deg,
      #eef2f6,
      #eef2f6 3px,
      #f6f9fb 3px,
      #f6f9fb 6px
    );
  opacity: 0.6;
}
/* Loading shimmer — clearly distinct from the "no silhouette" placeholder. */
.mtx-phylopic-loading {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(100deg, #eef3f8 30%, #dce8f2 50%, #eef3f8 70%);
  background-size: 200% 100%;
  animation: mtx-phylopic-shimmer 1.1s ease-in-out infinite;
}
@keyframes mtx-phylopic-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
