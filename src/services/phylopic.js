/**
 * phylopic.js (frontend) — taxon silhouettes from a prebuilt local index.
 *
 * Strategy
 * --------
 * The whole title -> image index is generated OFFLINE and committed as
 * `src/assets/phylopic_image_index.json`. We import that JSON directly, so on
 * page load there is NO API fan-out — just an in-memory lookup built once from
 * the bundled file. Each organism entry carries the PhyloPic `svg` (vector)
 * URL plus `sourceFile`/`UUID`.
 *
 * Resolving a taxon is a pure in-memory lookup (the taxon name first, then each
 * lineage ancestor). The actual SVG is fetched only when a taxon is shown
 * (lazily, per tab/page) and every fetch is cached by URL, so a repeated
 * name/URL is never fetched twice.
 *
 * Loading an individual silhouette:
 *   1. Try the BACKEND proxy (`/phylopic/svg?url=...`). Fetching server-side
 *      avoids browser CORS and yields clean inline <svg> markup.
 *   2. If the backend is unreachable or fails (not running, network, non-OK),
 *      fall back to fetching the same URL DIRECTLY from images.phylopic.org.
 *      If that can't be inlined (CORS), hand the URL to the component as an
 *      <img> src.
 */

import indexData from '@/assets/phylopic_image_index.json'

const FETCH_TIMEOUT = 15000

// normalized title -> { svgUrl, sourceFile, uuid }  (built once from the JSON)
let indexMap = null

// svgUrl -> { svg:?string, imgUrl:?string }  (resolved source, fetched once)
const sourceCache = new Map()
const sourceInflight = new Map()

// Must match the offline index builder's normalization.
function normalizeName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])

function withTimeout(ms = FETCH_TIMEOUT) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { signal: ctrl.signal, done: () => clearTimeout(timer) }
}

/**
 * Resolve the backend base URL the same way App.vue builds the socket URL, so
 * the proxy targets whatever host/port the user configured in Settings. Read at
 * call time (not import time) so it tracks changes the user makes.
 */
function backendBase() {
  try {
    const proto = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'https:' : 'http:'
    const host = (typeof localStorage !== 'undefined' && localStorage.getItem('mtx_serverHost'))
      || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')
    const port = (typeof localStorage !== 'undefined' && localStorage.getItem('mtx_serverPort')) || '7689'
    return `${proto}//${host}:${port}`
  } catch (e) {
    return 'http://localhost:7689'
  }
}

/**
 * Pick a renderable entry from an organism value. The index value is either an
 * entry object or an array of them; prefer the first that exposes an SVG.
 */
function pickEntry(value) {
  const list = asArray(value)
  for (const e of list) {
    if (e && (e.svg || e.sourceFile)) return e
  }
  return list[0] || null
}

// ---------- build the normalized lookup once from the bundled JSON ----------
function buildIndex() {
  const map = Object.create(null)
  const organisms = (indexData && indexData.organisms) || {}

  // First pass: register every specific title that has an SVG.
  for (const title of Object.keys(organisms)) {
    const key = normalizeName(title)
    if (!key || key in map) continue
    const entry = pickEntry(organisms[title])
    const svgUrl = entry && (entry.svg || entry.sourceFile)
    if (!svgUrl) continue
    map[key] = {
      svgUrl,
      sourceFile: (entry && entry.sourceFile) || svgUrl,
      uuid: (entry && entry.UUID) || null,
    }
  }

  // Second pass: register generalNode.title values as fallbacks so that parent
  // taxa (e.g. "Homo sapiens" from a "Homo sapiens sapiens" entry, or "Homo"
  // from "Homo habilis") resolve correctly without needing their own dedicated
  // image in the index.  We only add a key when it's not already present, so
  // specific images always win over inherited ones.
  for (const title of Object.keys(organisms)) {
    const list = asArray(organisms[title])
    for (const entry of list) {
      if (!entry || !entry.generalNode || !entry.generalNode.title) continue
      const genKey = normalizeName(entry.generalNode.title)
      if (!genKey || genKey in map) continue
      const svgUrl = entry.svg || entry.sourceFile
      if (!svgUrl) continue
      map[genKey] = {
        svgUrl,
        sourceFile: entry.sourceFile || svgUrl,
        uuid: entry.UUID || null,
      }
    }
  }

  return map
}

/** Ensure the index is loaded. Safe to call many times; builds once. */
export function ensureIndex() {
  if (!indexMap) indexMap = buildIndex()
  return Promise.resolve(indexMap)
}

/** Synchronous accessor (the index is always available — it's bundled). */
export function getIndex() {
  if (!indexMap) indexMap = buildIndex()
  return indexMap
}

/** Look up an index record for a taxon by name, then by lineage ancestors. */
function lookupRecord(map, name, lineage) {
  const seen = new Set()
  for (const n of [name, ...asArray(lineage)]) {
    const key = normalizeName(n)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (map[key]) return map[key]
  }
  return null
}

// ---------- load a single SVG (cached per URL) ----------
function looksLikeSvg(text) {
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?<svg[\s>]/i.test(text)
}

/** Try the backend proxy first. Returns inline svg string, or null to fall back. */
async function tryBackend(svgUrl) {
  const t = withTimeout()
  try {
    const proxy = `${backendBase()}/phylopic/svg?url=${encodeURIComponent(svgUrl)}`
    const res = await fetch(proxy, { redirect: 'follow', signal: t.signal })
    if (!res.ok) return null
    const text = await res.text()
    return looksLikeSvg(text) ? text : null
  } catch (e) {
    // Backend down / not connecting / CORS — signal the caller to fall back.
    return null
  } finally {
    t.done()
  }
}

/** Fall back to fetching the SVG directly from the PhyloPic website. */
async function tryDirect(svgUrl) {
  const t = withTimeout()
  try {
    const res = await fetch(svgUrl, { redirect: 'follow', signal: t.signal })
    if (!res.ok) return { svg: null, imgUrl: svgUrl }
    const text = await res.text()
    if (looksLikeSvg(text)) return { svg: text, imgUrl: null }
    return { svg: null, imgUrl: svgUrl } // not inline-able — let <img> try
  } catch (e) {
    // CORS/network on the fetch — <img> loads aren't CORS-restricted.
    return { svg: null, imgUrl: svgUrl }
  } finally {
    t.done()
  }
}

async function loadSource(svgUrl) {
  if (!svgUrl) return null
  if (sourceCache.has(svgUrl)) return sourceCache.get(svgUrl)
  if (sourceInflight.has(svgUrl)) return sourceInflight.get(svgUrl)

  const p = (async () => {
    // 1) backend proxy first
    const fromBackend = await tryBackend(svgUrl)
    if (fromBackend) return { svg: fromBackend, imgUrl: null }
    // 2) direct from the website if the backend couldn't serve it
    return tryDirect(svgUrl)
  })()
    .then((r) => {
      sourceCache.set(svgUrl, r)
      sourceInflight.delete(svgUrl)
      return r
    })
    .catch(() => {
      const r = { svg: null, imgUrl: svgUrl }
      sourceCache.set(svgUrl, r)
      sourceInflight.delete(svgUrl)
      return r
    })

  sourceInflight.set(svgUrl, p)
  return p
}

/**
 * Resolve a taxon to a renderable silhouette using the prebuilt index.
 * @returns {Promise<{svg:?string, imgUrl:?string, href:?string}|null>}
 *   `svg` is inline markup (preferred); otherwise `imgUrl` is set for <img>.
 */
export async function resolveSvgMarkup(name, lineage = []) {
  if (!normalizeName(name)) return null
  const rec = lookupRecord(getIndex(), name, lineage)
  if (!rec) return null
  const loaded = await loadSource(rec.svgUrl)
  if (!loaded) return null
  return { svg: loaded.svg, imgUrl: loaded.imgUrl, href: rec.svgUrl }
}

/**
 * Warm the silhouettes for many taxa with bounded concurrency — pass the most
 * relevant (current page) first. Already-cached items return instantly, and a
 * URL that's already been fetched is never fetched again.
 * @param {Array<{name:string, lineage?:string[]}>} items
 * @param {number} [concurrency]
 */
export function prefetchSvg(items, concurrency = 6) {
  const queue = (items || []).filter((it) => it && it.name)
  let i = 0
  const worker = async () => {
    while (i < queue.length) {
      const it = queue[i++]
      try { await resolveSvgMarkup(it.name, it.lineage || []) } catch (e) { /* best-effort */ }
    }
  }
  const n = Math.max(1, Math.min(concurrency, queue.length))
  for (let w = 0; w < n; w += 1) worker()
}

// Build the in-memory lookup as soon as the app bundle loads ("on HTML load").
ensureIndex()

export default { ensureIndex, getIndex, resolveSvgMarkup, prefetchSvg }
