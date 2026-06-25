#!/usr/bin/env node
/**
 * build-phylopic-index.mjs — build a local PhyloPic name -> image-file index.
 *
 * Runs OFFLINE on your machine (it needs network access to api.phylopic.org,
 * which the app itself no longer touches at runtime).
 *
 * What it does
 * ------------
 *   1. GET /images                       -> { build, totalPages, ... }
 *   2. for page in 0..totalPages-1:
 *        GET /images?build=<b>&embed_items=true&page=<page>
 *      For every image it records, keyed by title (_links.self.title):
 *        - sourceFile  (_links.sourceFile.href)   original upload
 *        - vectorFile  (_links.vectorFile.href)    clean SVG silhouette
 *        - thumbnail   (_links.thumbnailFiles[0])  PNG fallback
 *        - source      (_links.source.href)        attribution / origin
 *      If a page doesn't embed those file links, it falls back to fetching each
 *      image's own resource (_links.items[].href) to read them.
 *   3. Optionally filters titles against NCBI names.dmp (off by default; pass
 *      --filter --names <path> to enable).
 *   4. Writes src/assets/phylopic-index.json.
 *
 * The app imports that JSON at build time, so there is NO 261-page fan-out and
 * NO backend call when the page loads. Re-run when PhyloPic bumps its `build`.
 *
 * Usage:
 *   node scripts/build-phylopic-index.mjs
 *   node scripts/build-phylopic-index.mjs --filter --names /path/to/names.dmp
 *
 * Options:
 *   --out <path>        Output JSON           (default src/assets/phylopic-index.json)
 *   --concurrency <n>   Parallel page fetches (default 8)
 *   --filter            Keep only titles found in names.dmp (requires --names)
 *   --names <path>      NCBI names.dmp        (default ./names.dmp, only with --filter)
 *   --classes <list>    Name classes to use   (default scientific name,genbank common name,common name,synonym)
 *
 * Requires Node 18+ (uses the global fetch).
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const API_BASE = 'https://api.phylopic.org'
const API_HEADERS = { Accept: 'application/vnd.phylopic.v2+json' }

// ---------- args ----------
function parseArgs(argv) {
  const out = {
    names: 'names.dmp',
    out: path.join('src', 'assets', 'phylopic-index.json'),
    concurrency: 8,
    classes: 'scientific name,genbank common name,common name,synonym',
    filter: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--names') out.names = argv[++i]
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--concurrency') out.concurrency = Math.max(1, Number(argv[++i]) || 8)
    else if (a === '--classes') out.classes = argv[++i]
    else if (a === '--filter') out.filter = true
    else if (a === '--no-filter') out.filter = false
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else throw new Error(`Unknown argument: ${a}`)
  }
  return out
}

function printHelp() {
  console.log(`build-phylopic-index.mjs

  --out <path>        output JSON                   (default src/assets/phylopic-index.json)
  --concurrency <n>   parallel page fetches         (default 8)
  --filter            keep only titles in names.dmp (requires --names)
  --names <path>      NCBI names.dmp                (default ./names.dmp)
  --classes <list>    comma-separated name classes  (default scientific name,genbank common name,common name,synonym)
`)
}

// Must match normalizeName() in src/services/phylopic.js exactly.
function normalizeName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- NCBI names -> normalized Set (only with --filter) ----------
async function loadNcbiNames(namesPath, wantedClasses) {
  const abs = path.isAbsolute(namesPath) ? namesPath : path.resolve(process.cwd(), namesPath)
  if (!fs.existsSync(abs)) {
    throw new Error(`names.dmp not found at ${abs}\nPass its location with --names /path/to/names.dmp`)
  }
  const wanted = new Set(wantedClasses.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean))
  const set = new Set()
  const rl = readline.createInterface({ input: fs.createReadStream(abs), crlfDelay: Infinity })
  let lines = 0
  for await (const line of rl) {
    lines += 1
    const parts = line.split('\t|\t') // tax_id | name_txt | unique_name | name_class |
    if (parts.length < 4) continue
    const nameClass = parts[3].replace(/\t\|\s*$/, '').trim().toLowerCase()
    if (!wanted.has(nameClass)) continue
    const n = normalizeName(parts[1])
    if (n) set.add(n)
  }
  console.log(`  names.dmp: ${lines.toLocaleString()} lines -> ${set.size.toLocaleString()} unique normalized names`)
  return set
}

// ---------- HTTP ----------
async function apiJson(url, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: API_HEADERS, redirect: 'follow' })
      if (res.ok) return await res.json()
      if (res.status === 429 || res.status >= 500) { await sleep(500 * attempt); continue }
      return null
    } catch (e) {
      if (attempt === tries) throw e
      await sleep(500 * attempt)
    }
  }
  return null
}

// ---------- pull the file links off one image resource's _links ----------
function extractFiles(links) {
  if (!links) return null
  const href = (rel) => (rel && rel.href) || null
  const thumbs = Array.isArray(links.thumbnailFiles) ? links.thumbnailFiles : []
  const entry = {
    sourceFile: href(links.sourceFile),
    vectorFile: href(links.vectorFile),
    thumbnail: thumbs.length ? href(thumbs[0]) : null,
    source: href(links.source),
  }
  // Only useful if we got at least one renderable file or a source.
  if (!entry.sourceFile && !entry.vectorFile && !entry.thumbnail && !entry.source) return null
  return entry
}

async function runPool(total, concurrency, worker) {
  let next = 0
  let done = 0
  const runner = async () => {
    while (next < total) {
      const i = next++
      await worker(i)
      done += 1
      if (done % 10 === 0 || done === total) process.stdout.write(`\r  fetched ${done}/${total} pages`)
    }
  }
  const runners = []
  const n = Math.min(concurrency, Math.max(1, total))
  for (let k = 0; k < n; k += 1) runners.push(runner())
  await Promise.all(runners)
  process.stdout.write('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  console.log('Building PhyloPic index')
  console.log(`  filter by names.dmp: ${args.filter ? 'yes' : 'no'}`)

  const nameSet = args.filter ? await loadNcbiNames(args.names, args.classes) : null

  const meta = await apiJson(`${API_BASE}/images`)
  if (!meta || meta.build == null) throw new Error('Could not read /images metadata from PhyloPic')
  const build = String(meta.build)
  const totalPages = Number(meta.totalPages) || 0
  const itemsPerPage = Number(meta.itemsPerPage) || null
  const totalItems = Number(meta.totalItems) || null
  console.log(`  PhyloPic build ${build}: ${totalItems ?? '?'} images across ${totalPages} pages`)
  if (!totalPages) throw new Error('PhyloPic reported 0 pages')

  const map = {}            // title -> { sourceFile, vectorFile, thumbnail, source } (first wins)
  let seenItems = 0
  let droppedNoFiles = 0
  let droppedFilter = 0
  let detailFetches = 0

  await runPool(totalPages, args.concurrency, async (page) => {
    const json = await apiJson(`${API_BASE}/images?build=${build}&embed_items=true&page=${page}`)
    if (!json) return

    // Preferred path: fully embedded image resources.
    let embedded = (json._embedded && json._embedded.items) || []

    // Build a uniform list of { title, links } to process.
    const records = []
    if (embedded.length) {
      for (const item of embedded) {
        const links = item._links || {}
        records.push({ title: links.self && links.self.title, links })
      }
    } else {
      // Fallback: only href+title were returned — fetch each image's resource
      // to read its file links.
      const listItems = (json._links && json._links.items) || []
      const fetched = await Promise.all(listItems.map(async (li) => {
        const detail = await apiJson(`${API_BASE}${li.href}`)
        detailFetches += 1
        return { title: li.title, links: (detail && detail._links) || {} }
      }))
      records.push(...fetched)
    }

    for (const rec of records) {
      seenItems += 1
      const title = rec.title
      if (!title) { droppedNoFiles += 1; continue }
      if (nameSet && !nameSet.has(normalizeName(title))) { droppedFilter += 1; continue }
      const files = extractFiles(rec.links)
      if (!files) { droppedNoFiles += 1; continue }
      if (!(title in map)) map[title] = files // first occurrence wins
    }
  })

  const result = {
    build: Number(build),
    builtAt: new Date().toISOString(),
    source: `${API_BASE}/images`,
    itemsPerPage,
    totalItems,
    totalPages,
    filtered: args.filter,
    classes: args.filter ? args.classes.split(',').map((c) => c.trim()) : null,
    count: Object.keys(map).length,
    map,
  }

  const outAbs = path.isAbsolute(args.out) ? args.out : path.resolve(REPO_ROOT, args.out)
  fs.mkdirSync(path.dirname(outAbs), { recursive: true })
  fs.writeFileSync(outAbs, `${JSON.stringify(result, null, 0)}\n`)

  console.log('Done.')
  console.log(`  images seen:         ${seenItems.toLocaleString()}`)
  if (detailFetches) console.log(`  per-image fetches:   ${detailFetches.toLocaleString()} (embed fallback)`)
  console.log(`  no file links:       ${droppedNoFiles.toLocaleString()}`)
  if (args.filter) console.log(`  filtered out:        ${droppedFilter.toLocaleString()}`)
  console.log(`  kept (unique title): ${result.count.toLocaleString()}`)
  console.log(`  wrote: ${outAbs}`)
}

main().catch((err) => {
  console.error('\nbuild-phylopic-index failed:', err.message)
  process.exit(1)
})
