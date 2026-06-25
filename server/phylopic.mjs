/**
 * phylopic.mjs — server-side resolver: taxon scientific name -> PhyloPic
 * silhouette. Runs in Node (no browser CORS), so the Vue frontend proxies
 * through this instead of calling api.phylopic.org directly.
 *
 * Ported from the v1.1 reference fetcher. The important detail vs. earlier
 * attempts: the PhyloPic v2 API requires the current `build` number on page
 * requests, so we discover it from a list-metadata call and then attach it to
 * every subsequent call (see firstPage / apiGet below). Without this, page
 * requests fail and nothing resolves.
 *
 * We resolve to the silhouette's SVG and fetch its markup IN MEMORY so the
 * server can stream it to the browser to render inline. Nothing is written to
 * disk.
 *
 * Flow (https://www.phylopic.org/articles/api-recipes):
 *   1. /nodes?filter_name=<name>  (metadata, discovers build)
 *      then ?page=0&embed_items=true&build=<build>  -> _embedded.items
 *      (fall back to /autocomplete?query=<name> -> retry each suggestion)
 *   2. /images?filter_clade=<nodeUuid> (then filter_node) -> image items
 *   3. /images/<imageUuid> -> _links.vectorFile.href -> fetch SVG markup
 */

const API_BASE = 'https://api.phylopic.org'
const API_HEADERS = {
  Accept: 'application/vnd.phylopic.v2+json',
  'User-Agent': 'mytax2-phylopic/1.1',
}
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

let currentBuild = null

// normalizedName -> { result, t }  (resolution metadata; positive + negative)
const resolveCache = new Map()
// svgUrl -> { svg, t }  (fetched SVG markup)
const svgCache = new Map()
const TTL_HIT = 30 * 24 * 60 * 60 * 1000
const TTL_MISS = 3 * 24 * 60 * 60 * 1000

class ApiError extends Error {
  constructor(message, status, url) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

function normalizeTaxonName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])

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
    const build = new URL(responseUrl).searchParams.get('build')
    if (build) currentBuild = build
  } catch (e) { /* ignore */ }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: API_HEADERS, redirect: 'follow' })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch (e) {
    throw new ApiError(`Expected JSON from ${url} (HTTP ${response.status})`, response.status, String(url))
  }
  rememberBuild(json, response.url)
  return { response, json }
}

async function apiGet(path, params = {}, options = {}) {
  const { allow404 = false } = options
  const url = apiUrl(path, params)
  if (currentBuild && !url.searchParams.has('build')) {
    url.searchParams.set('build', currentBuild)
  }

  let result = await fetchJson(url)

  // If a page request raced ahead of build discovery, retry once with build.
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
    throw new ApiError(`PhyloPic API ${result.response.status} on ${url}`, result.response.status, String(url))
  }
  return result.json
}

function embeddedItems(json) {
  const items = json && json._embedded && json._embedded.items
  if (Array.isArray(items)) return items
  if (items && typeof items === 'object') return Object.values(items)
  // Fallback to item links if embedding did not happen.
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
  // Step 1: list metadata (no page) — discovers/caches the current build.
  const metadata = await apiGet(endpoint, filters, { allow404: true })
  if (!metadata) return []
  const totalItems = Number(metadata.totalItems != null ? metadata.totalItems : metadata.total_items)
  if (Number.isFinite(totalItems) && totalItems === 0) return []

  // Step 2: the first page — now with build + embedded items.
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
  return [...new Set(values.map(normalizeTaxonName).filter(Boolean))]
}

async function findNodeByName(rawName) {
  const normalized = normalizeTaxonName(rawName)
  if (!normalized) return null

  let nodes = await firstPage('nodes', { filter_name: normalized })
  if (nodes.length) return nodes[0]

  const autocomplete = await apiGet('autocomplete', { query: normalized }, { allow404: true })
  const suggestions = autocomplete ? autocompleteSuggestions(autocomplete) : []
  for (const suggestion of suggestions) {
    nodes = await firstPage('nodes', { filter_name: suggestion })
    if (nodes.length) return nodes[0]
  }
  return null
}

async function findImagesForNode(nodeUuid, direct) {
  const filterName = direct ? 'filter_node' : 'filter_clade'
  return firstPage('images', { [filterName]: nodeUuid })
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

/** Resolve one taxon name (with image #1) -> metadata, or null. No caching. */
async function resolveOneName(name) {
  const node = await findNodeByName(name)
  if (!node) return null
  const nodeUuid = extractUuid(node)
  if (!nodeUuid) return null

  let images = await findImagesForNode(nodeUuid, false) // clade (incl. descendants)
  if (!images.length) images = await findImagesForNode(nodeUuid, true) // direct node
  if (!images.length) return null

  const image = images[0]
  const imageUuid = extractUuid(image)
  if (!imageUuid) return null

  // The embedded item usually carries the file links; only fetch the full
  // image entity if the vector link is missing.
  let svgUrl = vectorUrlFromImage(image)
  let thumbUrl = thumbUrlFromImage(image)
  let attribution = (image && image.attribution) || null
  if (!svgUrl) {
    try {
      const meta = await apiGet(`images/${imageUuid}`)
      svgUrl = vectorUrlFromImage(meta) || `https://images.phylopic.org/images/${imageUuid}/vector.svg`
      thumbUrl = thumbUrl || thumbUrlFromImage(meta)
      attribution = attribution || (meta && meta.attribution) || (meta && meta._links && meta._links.contributor && meta._links.contributor.title) || null
    } catch (e) {
      svgUrl = `https://images.phylopic.org/images/${imageUuid}/vector.svg`
    }
  }

  return {
    svgUrl,
    pngUrl: thumbUrl || `https://images.phylopic.org/images/${imageUuid}/thumbnail/128x128.png`,
    imageUuid,
    nodeUuid,
    attribution,
    pageUrl: `https://www.phylopic.org/images/${imageUuid}`,
    matchedName: normalizeTaxonName(name),
  }
}

function cacheGet(map, key) {
  const hit = map.get(key)
  if (!hit) return undefined
  const ttl = hit.result || hit.svg ? TTL_HIT : TTL_MISS
  if (Date.now() - hit.t > ttl) {
    map.delete(key)
    return undefined
  }
  return hit
}

/**
 * Resolve silhouette metadata for a name, trying `lineage` ancestor names
 * (specific -> general) as a fallback. Returns metadata object or null.
 */
export async function resolveSilhouette(name, lineage = []) {
  const candidates = []
  const seen = new Set()
  for (const n of [name, ...asArray(lineage)]) {
    const norm = normalizeTaxonName(n)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      candidates.push(norm)
    }
  }
  for (const c of candidates) {
    const cached = cacheGet(resolveCache, c)
    if (cached !== undefined) {
      if (cached.result) return cached.result
      continue
    }
    let result = null
    try {
      result = await resolveOneName(c)
    } catch (e) {
      result = null
    }
    resolveCache.set(c, { result: result || null, t: Date.now() })
    if (result) return result
  }
  return null
}

/** Fetch SVG markup for a resolved svgUrl, in memory (cached). Never writes disk. */
export async function fetchSvgMarkup(svgUrl) {
  if (!svgUrl) return null
  const cached = cacheGet(svgCache, svgUrl)
  if (cached !== undefined) return cached.svg
  try {
    const response = await fetch(svgUrl, { headers: { Accept: 'image/svg+xml,*/*' }, redirect: 'follow' })
    const text = await response.text()
    if (!response.ok || !/<svg[\s>]/i.test(text)) {
      svgCache.set(svgUrl, { svg: null, t: Date.now() })
      return null
    }
    svgCache.set(svgUrl, { svg: text, t: Date.now() })
    return text
  } catch (e) {
    svgCache.set(svgUrl, { svg: null, t: Date.now() })
    return null
  }
}

/**
 * Resolve a name (+ lineage) all the way to SVG markup. Returns
 * { svg, svgUrl, attribution, ... } or null.
 */
export async function resolveSvg(name, lineage = []) {
  const meta = await resolveSilhouette(name, lineage)
  if (!meta) return null
  const svg = await fetchSvgMarkup(meta.svgUrl)
  if (!svg) return null
  return { ...meta, svg }
}

export default { resolveSilhouette, fetchSvgMarkup, resolveSvg }
