/**
 * phylopic.js (frontend) — resolve a taxon scientific name to a PhyloPic
 * silhouette, primarily CLIENT-SIDE so the feature works with no backend
 * (npm run serve, GitHub Pages static build, etc.).
 *
 * PhyloPic's own site is a static app that calls api.phylopic.org from the
 * browser, so the API supports CORS. We use the build-aware v2 flow:
 *   1. /nodes?filter_name=<name>            (metadata — discovers `build`)
 *      then ?build=<b>&page=0&embed_items=true   -> _embedded.items
 *      (fall back to /autocomplete?query=<name> -> retry each suggestion)
 *   2. /images?filter_clade=<nodeUuid> (then filter_node) -> image items
 *   3. /images/<imageUuid> -> _links.vectorFile.href (SVG) + thumbnailFiles (PNG)
 *
 * Display: we fetch the SVG markup and render it INLINE (an <img> renders the
 * vector blank). If the image CDN blocks the fetch, the caller can fall back to
 * the PNG thumbnail via <img> (which the official site uses successfully).
 *
 * If the direct API call fails entirely (e.g. CORS blocked in some locked-down
 * environment) AND a backend is configured, we silently retry through the
 * server proxy (/phylopic/svg). On a static deploy where the direct call works,
 * the proxy is never touched — so there's no connection error noise.
 *
 * Nothing is ever written to disk.
 */

const API_BASE = 'https://api.phylopic.org'
const API_HEADERS = { Accept: 'application/vnd.phylopic.v2+json' }
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const LS_PREFIX = 'phylopic:v4:'
const TTL_HIT = 30 * 24 * 60 * 60 * 1000
const TTL_MISS = 3 * 24 * 60 * 60 * 1000
const FETCH_TIMEOUT = 10000

let currentBuild = null
// Set once we learn the direct API is unreachable from the browser, so we stop
// retrying it and go straight to the proxy.
let directApiBlocked = false

// key (name|lineage) -> { svg, svgUrl, pngUrl, attribution, pageUrl } | null
const memCache = new Map()
const inflight = new Map()

function normalizeName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])

function withTimeout() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  return { signal: ctrl.signal, done: () => clearTimeout(timer) }
}

/** Base URL of our Express server (only used for the proxy fallback). */
function serverBase() {
  let host = 'localhost'
  let port = '7689'
  let proto = 'http:'
  try {
    if (typeof window !== 'undefined' && window.location) {
      proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
      host = window.location.hostname || host
    }
    if (typeof localStorage !== 'undefined') {
      host = localStorage.getItem('mtx_serverHost') || host
      port = localStorage.getItem('mtx_serverPort') || port
    }
  } catch (e) { /* defaults */ }
  return `${proto}//${host}:${port}`
}

// ---------- localStorage cache ----------
function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (!raw) return undefined
    const { r, t } = JSON.parse(raw)
    const ttl = r ? TTL_HIT : TTL_MISS
    if (Date.now() - t > ttl) {
      localStorage.removeItem(LS_PREFIX + key)
      return undefined
    }
    return r
  } catch (e) {
    return undefined
  }
}
function lsSet(key, r) {
  try {
    // Store everything EXCEPT the (potentially large) inline svg markup, to keep
    // localStorage small; svg markup is re-fetched per session (and HTTP-cached).
    const slim = r ? { svgUrl: r.svgUrl, pngUrl: r.pngUrl, attribution: r.attribution, pageUrl: r.pageUrl } : null
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ r: slim, t: Date.now() }))
  } catch (e) { /* quota / private mode */ }
}

// ---------- PhyloPic v2 API (build-aware) ----------
function apiUrl(path, params = {}) {
  const url = path.startsWith('http')
    ? new URL(path)
    : new URL(path.replace(/^\/+/, ''), `${API_BASE}/`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }
  return url
}
function rememberBuild(json, responseUrl) {
  if (json && json.build !== undefined && json.build !== null) {
    currentBuild = String(json.build)
    return
  }
  try {
    const b = new URL(responseUrl).searchParams.get('build')
    if (b) currentBuild = b
  } catch (e) { /* ignore */ }
}
async function fetchJson(url) {
  const t = withTimeout()
  try {
    const response = await fetch(url, { headers: API_HEADERS, redirect: 'follow', signal: t.signal })
    const text = await response.text()
    let json
    try { json = JSON.parse(text) } catch (e) { json = null }
    rememberBuild(json, response.url)
    return { response, json }
  } finally {
    t.done()
  }
}
async function apiGet(path, params = {}, options = {}) {
  const { allow404 = false } = options
  const url = apiUrl(path, params)
  if (currentBuild && !url.searchParams.has('build')) url.searchParams.set('build', currentBuild)

  let result = await fetchJson(url)

  if (
    !result.response.ok &&
    result.response.status === 400 &&
    !url.searchParams.has('build') &&
    result.json && result.json.build !== undefined && result.json.build !== null
  ) {
    currentBuild = String(result.json.build)
    url.searchParams.set('build', currentBuild)
    result = await fetchJson(url)
  }

  if (allow404 && result.response.status === 404) return null
  if (!result.response.ok) {
    const err = new Error(`PhyloPic API ${result.response.status}`)
    err.status = result.response.status
    throw err
  }
  return result.json
}
function embeddedItems(json) {
  const items = json && json._embedded && json._embedded.items
  if (Array.isArray(items)) return items
  if (items && typeof items === 'object') return Object.values(items)
  const links = asArray(json && json._links && json._links.items)
  return links
    .map((link) => {
      if (typeof link === 'string') return { href: link }
      if (link && typeof link === 'object') return { href: link.href, title: link.title, _links: { self: link } }
      return null
    })
    .filter(Boolean)
}
async function firstPage(endpoint, filters) {
  const metadata = await apiGet(endpoint, filters, { allow404: true })
  if (!metadata) return []
  const totalItems = Number(metadata.totalItems != null ? metadata.totalItems : metadata.total_items)
  if (Number.isFinite(totalItems) && totalItems === 0) return []
  const page = await apiGet(
    endpoint,
    { ...filters, build: metadata.build != null ? metadata.build : currentBuild, page: 0, embed_items: true },
    { allow404: true }
  )
  return page ? embeddedItems(page) : []
}
function extractUuid(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const m = value.match(UUID_RE)
    return m ? m[0] : null
  }
  if (typeof value !== 'object') return null
  for (const key of ['uuid', 'uid', 'id']) {
    if (typeof value[key] === 'string') {
      const u = extractUuid(value[key])
      if (u) return u
    }
  }
  if (typeof value.href === 'string') {
    const u = extractUuid(value.href)
    if (u) return u
  }
  const links = value._links || {}
  for (const linkValue of Object.values(links)) {
    for (const link of asArray(linkValue)) {
      if (typeof link === 'string') {
        const u = extractUuid(link)
        if (u) return u
      } else if (link && typeof link === 'object') {
        const u = extractUuid(link.href || link)
        if (u) return u
      }
    }
  }
  return null
}
function autocompleteSuggestions(json) {
  const pools = [json && json.matches, json && json.suggestions, json && json.items, json && json._embedded && json._embedded.items]
  const values = []
  for (const pool of pools) {
    for (const item of asArray(pool)) {
      if (typeof item === 'string') values.push(item)
      else if (item && typeof item === 'object') {
        for (const key of ['name', 'value', 'label', 'text', 'canonicalName']) {
          if (typeof item[key] === 'string') values.push(item[key])
        }
      }
    }
  }
  return [...new Set(values.map(normalizeName).filter(Boolean))]
}
async function findNodeByName(name) {
  let nodes = await firstPage('nodes', { filter_name: name })
  if (nodes.length) return nodes[0]
  const autocomplete = await apiGet('autocomplete', { query: name }, { allow404: true })
  const suggestions = autocomplete ? autocompleteSuggestions(autocomplete) : []
  for (const s of suggestions) {
    nodes = await firstPage('nodes', { filter_name: s })
    if (nodes.length) return nodes[0]
  }
  return null
}
function vectorUrlFromImage(image) {
  const link = image && image._links && image._links.vectorFile
  if (typeof link === 'string') return link
  if (link && typeof link.href === 'string') return link.href
  return null
}
function thumbUrlFromImage(image) {
  const links = (image && image._links) || {}
  const hrefs = asArray(links.thumbnailFiles).map((t) => t && t.href).filter(Boolean)
  return hrefs.find((h) => /192x192/.test(h)) || hrefs.find((h) => /128x128/.test(h)) || hrefs[0] || null
}

/** Direct client-side resolution of one normalized name -> meta or null. Throws on network/CORS. */
async function resolveOneNameDirect(name) {
  const node = await findNodeByName(name)
  if (!node) return null
  const nodeUuid = extractUuid(node)
  if (!nodeUuid) return null

  let images = await firstPage('images', { filter_clade: nodeUuid })
  if (!images.length) images = await firstPage('images', { filter_node: nodeUuid })
  if (!images.length) return null

  const image = images[0]
  const imageUuid = extractUuid(image)
  if (!imageUuid) return null

  let svgUrl = vectorUrlFromImage(image)
  let pngUrl = thumbUrlFromImage(image)
  let attribution = (image && image.attribution) || null
  if (!svgUrl) {
    try {
      const meta = await apiGet(`images/${imageUuid}`)
      svgUrl = vectorUrlFromImage(meta) || `https://images.phylopic.org/images/${imageUuid}/vector.svg`
      pngUrl = pngUrl || thumbUrlFromImage(meta)
      attribution = attribution || (meta && meta.attribution) || null
    } catch (e) {
      svgUrl = `https://images.phylopic.org/images/${imageUuid}/vector.svg`
    }
  }
  return {
    svgUrl,
    pngUrl: pngUrl || `https://images.phylopic.org/images/${imageUuid}/thumbnail/128x128.png`,
    attribution,
    pageUrl: `https://www.phylopic.org/images/${imageUuid}`,
  }
}

/** Try candidates (name + lineage) directly. Returns meta, or null (miss), or throws (network/CORS). */
async function resolveMetaDirect(candidates) {
  let hadNetworkError = false
  for (const c of candidates) {
    try {
      const meta = await resolveOneNameDirect(c)
      if (meta) return meta
    } catch (e) {
      hadNetworkError = true
    }
  }
  if (hadNetworkError) {
    const err = new Error('phylopic direct unreachable')
    err.network = true
    throw err
  }
  return null
}

async function fetchSvgText(url) {
  if (!url) return null
  const t = withTimeout()
  try {
    const res = await fetch(url, { headers: { Accept: 'image/svg+xml,*/*' }, redirect: 'follow', signal: t.signal })
    if (!res.ok) return null
    const text = await res.text()
    return /<svg[\s>]/i.test(text) ? text : null
  } catch (e) {
    return null
  } finally {
    t.done()
  }
}

/** Proxy fallback: ask our backend for the SVG markup. Returns {svg,...} or null. */
async function resolveViaProxy(name, lineage) {
  const t = withTimeout()
  try {
    const url =
      `${serverBase()}/phylopic/svg?name=${encodeURIComponent(name)}` +
      (lineage && lineage.length ? `&lineage=${encodeURIComponent(lineage.join(','))}` : '')
    const res = await fetch(url, { signal: t.signal })
    if (!res.ok) return null
    const svg = await res.text()
    if (!svg || !/<svg[\s>]/i.test(svg)) return null
    let attribution = null
    try {
      const raw = res.headers.get('X-Phylopic-Attribution')
      if (raw) attribution = decodeURIComponent(raw)
    } catch (e) { /* header hidden */ }
    return { svg, svgUrl: null, pngUrl: null, attribution, pageUrl: res.headers.get('X-Phylopic-Page') || null }
  } catch (e) {
    return null
  } finally {
    t.done()
  }
}

function candidatesFor(name, lineage) {
  const out = []
  const seen = new Set()
  for (const n of [name, ...asArray(lineage)]) {
    const norm = normalizeName(n)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}

/**
 * Resolve a name (+ lineage fallback) to a renderable silhouette.
 * @returns {Promise<{svg:?string, svgUrl:?string, pngUrl:?string, attribution:?string, pageUrl:?string}|null>}
 *   `svg` is inline markup (preferred). If null but `pngUrl` is set, the caller
 *   can render <img :src="pngUrl">.
 */
export async function resolveSvgMarkup(name, lineage = []) {
  const candidates = candidatesFor(name, lineage)
  if (!candidates.length) return null
  const key = candidates.join('|')

  if (memCache.has(key)) return memCache.get(key)
  const stored = lsGet(key)
  if (stored !== undefined && stored !== null) {
    // Re-hydrate svg markup for this session from the cached URL.
    const svg = await fetchSvgText(stored.svgUrl)
    const out = { ...stored, svg }
    memCache.set(key, out)
    return out
  }
  if (inflight.has(key)) return inflight.get(key)

  const run = (async () => {
    let meta = null
    if (!directApiBlocked) {
      try {
        meta = await resolveMetaDirect(candidates)
      } catch (e) {
        directApiBlocked = true // stop hammering the direct API this session
        meta = null
      }
    }

    if (meta) {
      const svg = await fetchSvgText(meta.svgUrl)
      const out = { ...meta, svg }
      lsSet(key, out)
      return out
    }

    if (directApiBlocked) {
      // Direct API unreachable (CORS/locked down) — try the backend proxy.
      const proxied = await resolveViaProxy(candidates[0], candidates.slice(1))
      if (proxied) return proxied
      return null
    }

    // Direct API worked but found no silhouette — cache the miss.
    lsSet(key, null)
    return null
  })()
    .then((r) => {
      memCache.set(key, r || null)
      inflight.delete(key)
      return r || null
    })
    .catch(() => {
      memCache.set(key, null)
      inflight.delete(key)
      return null
    })

  inflight.set(key, run)
  return run
}

/**
 * Warm the cache for many taxa with bounded concurrency. Pass the most relevant
 * taxa (current page) first. Already-cached/in-flight items are skipped fast.
 * @param {Array<{name:string, lineage?:string[]}>} items
 * @param {number} [concurrency]
 */
export function prefetchSvg(items, concurrency = 5) {
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

export default { resolveSvgMarkup, prefetchSvg }
