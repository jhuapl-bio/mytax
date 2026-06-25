/**
 * phylopic.mjs — server-side builder for the PhyloPic image index.
 *
 * Builds ONE map of every PhyloPic image's scientific name
 * (_links.self.title) -> source-file URL (_links.sourceFile.href) by paging
 * /images server-side (no browser CORS, no per-page cost for the client). The
 * result is cached in memory keyed by the current PhyloPic build, so the
 * frontend can fetch the whole index in a single request via /phylopic/index.
 *
 * This is the *first attempt*; if the backend isn't running, the frontend falls
 * back to building the same index directly against the PhyloPic API. Nothing is
 * written to disk.
 */

const API_BASE = 'https://api.phylopic.org'
const API_HEADERS = { Accept: 'application/vnd.phylopic.v2+json' }
const CONCURRENCY = 8

let cached = null      // { build, map }
let building = null    // in-flight build Promise

function normalizeName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

async function apiJson(url) {
  try {
    const res = await fetch(url, { headers: API_HEADERS, redirect: 'follow' })
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    return null
  }
}

async function runConcurrent(total, concurrency, worker) {
  let next = 0
  const runOne = async () => {
    while (next < total) {
      const i = next++
      // eslint-disable-next-line no-await-in-loop
      await worker(i)
    }
  }
  const runners = []
  const n = Math.max(1, Math.min(concurrency, total))
  for (let k = 0; k < n; k += 1) runners.push(runOne())
  await Promise.all(runners)
}

async function buildIndex() {
  const meta = await apiJson(`${API_BASE}/images`)
  if (!meta || meta.build == null) return null
  const build = String(meta.build)
  const totalPages = Number(meta.totalPages) || 0
  if (!totalPages) return null

  const map = {}
  await runConcurrent(totalPages, CONCURRENCY, async (page) => {
    const json = await apiJson(`${API_BASE}/images?build=${build}&embed_items=true&page=${page}`)
    const items = (json && json._embedded && json._embedded.items) || []
    for (const item of items) {
      const links = (item && item._links) || {}
      const title = links.self && links.self.title
      const src = links.sourceFile && links.sourceFile.href
      if (title && src) {
        const key = normalizeName(title)
        if (key && !map[key]) map[key] = src
      }
    }
  })
  return { build, map }
}

/** Return the cached index ({ build, map }) if ready, else null. */
export function getCachedIndex() {
  return cached
}

/** Start building the index if it isn't ready/in progress. Fire-and-forget. */
export function ensureIndexBuilding() {
  if (cached || building) return
  building = buildIndex()
    .then((result) => {
      if (result) cached = result
      building = null
    })
    .catch(() => {
      building = null
    })
}

export default { getCachedIndex, ensureIndexBuilding }
