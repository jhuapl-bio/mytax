// ---------------------------------------------------------------------------
// tools.mjs — ONT basecalling / demultiplexing tools (dorado, guppy_barcoder)
// and GPU detection.
//
// Where a tool is taken from, in priority order:
//   1. a custom path the user set in the UI     (source: 'custom')
//   2. a copy downloaded by this app            (source: 'managed')
//      -> ~/.config/mytax2/tools/dorado-<version>-<platform>/bin/dorado
//   3. whatever is on the server's $PATH        (source: 'path')
//
// dorado is downloadable in-app from Oxford Nanopore's CDN for the server's
// platform. guppy is discontinued upstream and no longer publicly
// distributed, so it can only be used from $PATH or a custom path.
//
// Settings persist in ~/.config/mytax2/tools.json:
//   { paths: { dorado, guppy }, doradoVersion, doradoUrl, device }
// `device` is 'auto' | 'gpu' | 'cpu'. auto = use a GPU when one is detected.
// ---------------------------------------------------------------------------
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import http from 'http'
import { exec } from 'child_process'
import tar from 'tar'
import unzipper from 'unzipper'
import { logger } from './logger.js'
import { broadcastToAllActiveConnections, broadcastThrottled, flushThrottled } from './messenger.mjs'

export const DEFAULT_DORADO_VERSION = '2.1.1'
const CDN = 'https://cdn.oxfordnanoportal.com/software/analysis'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'mytax2')
const CONFIG_FILE = path.join(CONFIG_DIR, 'tools.json')
export const TOOLS_DIR = path.join(CONFIG_DIR, 'tools')

export const TOOLS = {
    dorado: {
        key: 'dorado',
        label: 'Dorado',
        bin: process.platform === 'win32' ? 'dorado.exe' : 'dorado',
        versionArgs: '--version',
        downloadable: true,
        can: ['basecall', 'demux'],
        docs: 'https://github.com/nanoporetech/dorado',
        description: 'Oxford Nanopore basecaller + demultiplexer. Basecalls POD5/FAST5 to reads and splits reads by barcode.'
    },
    guppy: {
        key: 'guppy',
        label: 'Guppy barcoder',
        bin: 'guppy_barcoder',
        versionArgs: '--version',
        downloadable: false,
        can: ['demux'],
        docs: 'https://community.nanoporetech.com',
        description: 'Legacy ONT demultiplexer (discontinued upstream). Use an existing install from $PATH or a custom path.'
    }
}

// ---- persisted settings ----------------------------------------------------
let _config = null
function loadConfig() {
    if (_config) return _config
    _config = { paths: {}, doradoVersion: DEFAULT_DORADO_VERSION, doradoUrl: null, device: 'auto' }
    try {
        if (fs.existsSync(CONFIG_FILE)) _config = { ..._config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }
    } catch (err) {
        logger.error(`Could not read ${CONFIG_FILE}: ${err}`)
    }
    _config.paths = _config.paths || {}
    return _config
}
function saveConfig() {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(loadConfig(), null, 2))
    } catch (err) {
        logger.error(`Could not write ${CONFIG_FILE}: ${err}`)
    }
}
export function getToolSettings() { return loadConfig() }

function sh(cmd, timeout = 10000) {
    return new Promise((resolve) => {
        exec(cmd, { timeout, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() })
        })
    })
}
function isExecutable(p) {
    try {
        const st = fs.statSync(p)
        if (!st.isFile()) return false
        if (process.platform === 'win32') return true
        fs.accessSync(p, fs.constants.X_OK)
        return true
    } catch (e) { return false }
}
const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

// ---- platform / download target -------------------------------------------
export function doradoPlatform() {
    const a = os.arch()
    if (process.platform === 'linux' && a === 'x64') return { id: 'linux-x64', ext: 'tar.gz' }
    if (process.platform === 'linux' && a === 'arm64') return { id: 'linux-arm64', ext: 'tar.gz' }
    if (process.platform === 'darwin' && a === 'arm64') return { id: 'osx-arm64', ext: 'zip' }
    if (process.platform === 'win32' && a === 'x64') return { id: 'win64', ext: 'zip' }
    return null // e.g. Intel macOS: no current dorado builds
}
export function doradoDownloadUrl(version) {
    const cfg = loadConfig()
    if (cfg.doradoUrl) return cfg.doradoUrl
    const plat = doradoPlatform()
    if (!plat) return null
    return `${CDN}/dorado-${version || cfg.doradoVersion || DEFAULT_DORADO_VERSION}-${plat.id}.${plat.ext}`
}

// Newest app-managed install of a tool, if any.
function managedPath(key) {
    if (key !== 'dorado') return null
    try {
        const dirs = fs.readdirSync(TOOLS_DIR)
            .filter((d) => d.startsWith('dorado-') && fs.statSync(path.join(TOOLS_DIR, d)).isDirectory())
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        for (const d of dirs) {
            const p = path.join(TOOLS_DIR, d, 'bin', TOOLS.dorado.bin)
            if (isExecutable(p)) return p
        }
    } catch (e) { /* no tools dir yet */ }
    return null
}

// -> { path, source } | { path: null, source: null, customInvalid? }
export async function resolveTool(key) {
    const tool = TOOLS[key]
    if (!tool) return { path: null, source: null }
    const cfg = loadConfig()
    const custom = cfg.paths[key]
    let customInvalid = null
    if (custom) {
        if (isExecutable(custom)) return { path: custom, source: 'custom' }
        customInvalid = custom
    }
    const managed = managedPath(key)
    if (managed) return { path: managed, source: 'managed', customInvalid }
    const found = await sh(`command -v ${tool.bin}`)
    if (found.ok && found.stdout) return { path: found.stdout.split('\n')[0].trim(), source: 'path', customInvalid }
    return { path: null, source: null, customInvalid }
}

async function toolVersion(key, binPath) {
    if (!binPath) return null
    const r = await sh(`${quote(binPath)} ${TOOLS[key].versionArgs} 2>&1`, 15000)
    const line = (r.stdout || r.stderr || '').split('\n').map((s) => s.trim()).filter(Boolean)
    // dorado prints e.g. "2.1.1+abc123"; guppy prints a banner with "Version x.y.z"
    const hit = line.find((l) => /\d+\.\d+\.\d+/.test(l))
    return hit ? hit.replace(/^.*?Version\s*/i, '').slice(0, 80) : (line[0] || null)
}

// ---- GPU detection ----------------------------------------------------------
let _gpuCache = null
export async function detectGpu(force = false) {
    if (_gpuCache && !force && Date.now() - _gpuCache.at < 60000) return _gpuCache.info
    const info = { cuda: false, metal: false, devices: [], driver: null, note: null }
    if (process.platform === 'darwin' && os.arch() === 'arm64') {
        info.metal = true
        info.devices.push({ index: 0, name: 'Apple silicon GPU (Metal)' })
    } else {
        const smi = await sh('nvidia-smi --query-gpu=index,name,memory.total,driver_version --format=csv,noheader,nounits', 8000)
        if (smi.ok && smi.stdout) {
            for (const line of smi.stdout.split('\n')) {
                const [index, name, mem, driver] = line.split(',').map((s) => s.trim())
                if (!name) continue
                info.devices.push({ index: Number(index), name, memoryMB: Number(mem) || null })
                info.driver = driver || info.driver
            }
            info.cuda = info.devices.length > 0
        } else {
            info.note = 'No NVIDIA GPU detected (nvidia-smi not found or reported no devices).'
        }
    }
    _gpuCache = { at: Date.now(), info }
    return info
}

// Resolve the user's device preference into concrete CLI flags.
//   dorado: --device cuda:all | metal | cpu
//   guppy_barcoder: -x cuda:all (GPU builds) or nothing for CPU
export async function deviceFlags(pref) {
    const want = pref || loadConfig().device || 'auto'
    const gpu = await detectGpu()
    const useGpu = want !== 'cpu' && (gpu.cuda || gpu.metal)
    if (want === 'gpu' && !useGpu) {
        return { useGpu: false, dorado: '--device cpu', guppy: '', label: 'CPU (no GPU found)', warning: 'GPU requested but none was detected — running on CPU (basecalling will be very slow).' }
    }
    if (!useGpu) return { useGpu: false, dorado: '--device cpu', guppy: '', label: 'CPU' }
    if (gpu.metal) return { useGpu: true, dorado: '--device metal', guppy: '', label: 'Apple GPU (Metal)' }
    return { useGpu: true, dorado: '--device cuda:all', guppy: '-x cuda:all', label: `CUDA × ${gpu.devices.length}` }
}

// ---- download state (dorado) -------------------------------------------------
const _dl = { dorado: null }
function publicDl(key) {
    const d = _dl[key]
    if (!d) return null
    const out = {}
    for (const k of Object.keys(d)) if (!k.startsWith('_')) out[k] = d[k]
    return out
}
function emitToolsStatusSoon() {
    getToolsStatus().then((s) => broadcastThrottled('toolsStatus', s, 'toolsStatus', 400)).catch((e) => logger.error(e))
}

export async function getToolsStatus() {
    const cfg = loadConfig()
    const tools = {}
    for (const key of Object.keys(TOOLS)) {
        const t = TOOLS[key]
        // eslint-disable-next-line no-await-in-loop
        const r = await resolveTool(key)
        // eslint-disable-next-line no-await-in-loop
        const version = r.path ? await toolVersion(key, r.path) : null
        tools[key] = {
            key, label: t.label, description: t.description, docs: t.docs, can: t.can,
            present: !!r.path, path: r.path, source: r.source, version,
            customPath: cfg.paths[key] || null,
            customInvalid: r.customInvalid || null,
            downloadable: t.downloadable && !!doradoPlatform(),
            download: publicDl(key)
        }
    }
    const plat = doradoPlatform()
    return {
        tools,
        gpu: await detectGpu(),
        device: cfg.device || 'auto',
        dorado: {
            version: cfg.doradoVersion || DEFAULT_DORADO_VERSION,
            defaultVersion: DEFAULT_DORADO_VERSION,
            platform: plat ? plat.id : null,
            url: doradoDownloadUrl(),
            customUrl: cfg.doradoUrl || null,
            installDir: TOOLS_DIR
        },
        os: { platform: process.platform, arch: os.arch() },
        ts: Date.now()
    }
}

export async function broadcastToolsStatus() {
    try { broadcastToAllActiveConnections('toolsStatus', await getToolsStatus()) } catch (e) { logger.error(`toolsStatus: ${e}`) }
}

// Set / clear a custom binary path. Returns { ok, error }.
export async function setToolPath(key, p) {
    if (!TOOLS[key]) return { ok: false, error: `Unknown tool ${key}` }
    const cfg = loadConfig()
    const value = p && String(p).trim()
    if (!value) {
        delete cfg.paths[key]
    } else {
        // Accept a folder that contains the binary (or its bin/) as well.
        let candidate = value
        try {
            if (fs.statSync(candidate).isDirectory()) {
                const inBin = path.join(candidate, 'bin', TOOLS[key].bin)
                const direct = path.join(candidate, TOOLS[key].bin)
                candidate = isExecutable(direct) ? direct : inBin
            }
        } catch (e) { /* handled below */ }
        if (!isExecutable(candidate)) return { ok: false, error: `${value} is not an executable ${TOOLS[key].bin}` }
        cfg.paths[key] = candidate
    }
    saveConfig()
    await broadcastToolsStatus()
    return { ok: true }
}

export async function setToolSettings({ device, doradoVersion, doradoUrl } = {}) {
    const cfg = loadConfig()
    if (device && ['auto', 'gpu', 'cpu'].includes(device)) cfg.device = device
    if (doradoVersion !== undefined) cfg.doradoVersion = String(doradoVersion || '').trim() || DEFAULT_DORADO_VERSION
    if (doradoUrl !== undefined) cfg.doradoUrl = String(doradoUrl || '').trim() || null
    saveConfig()
    await broadcastToolsStatus()
}

function getFollow(url, onResponse, onError, redirects = 5) {
    const client = String(url).startsWith('http:') ? http : https
    const req = client.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            if (redirects <= 0) return onError(new Error('Too many redirects'))
            return getFollow(new URL(res.headers.location, url).toString(), onResponse, onError, redirects - 1)
        }
        if (res.statusCode !== 200) {
            res.resume()
            return onError(new Error(`HTTP ${res.statusCode} from ${url}`))
        }
        onResponse(res, req)
    })
    req.on('error', onError)
    return req
}

// Download + unpack dorado into TOOLS_DIR. Progress streams as 'toolsStatus'.
export async function downloadDorado() {
    if (_dl.dorado && _dl.dorado.downloading) return
    const url = doradoDownloadUrl()
    if (!url) {
        _dl.dorado = { downloading: false, error: `No dorado build for ${process.platform}/${os.arch()}. Install it manually and set a custom path.`, lastResult: 'failed' }
        return broadcastToolsStatus()
    }
    fs.mkdirSync(TOOLS_DIR, { recursive: true })
    const archive = path.join(TOOLS_DIR, path.basename(new URL(url).pathname) || 'dorado-download')
    const state = { downloading: true, phase: 'downloading', progress: null, downloaded: 0, total: 0, startedAt: Date.now(), error: null, lastResult: null, url }
    _dl.dorado = state
    logger.info(`Downloading dorado from ${url}`)
    await broadcastToolsStatus()

    const finish = async (err) => {
        state.downloading = false
        state.phase = null
        if (err) {
            try { fs.unlinkSync(archive) } catch (e) { /* ignore */ }
            if (err.cancelled) { state.lastResult = 'cancelled'; state.error = null; logger.info('dorado download cancelled') }
            else { state.lastResult = 'failed'; state.error = err.message || String(err); logger.error(`dorado download failed: ${state.error}`) }
        } else {
            state.lastResult = 'downloaded'
            state.progress = 100
        }
        flushThrottled('toolsStatus')
        await broadcastToolsStatus()
    }

    const file = fs.createWriteStream(archive)
    Object.defineProperty(state, '_file', { value: file, enumerable: false, writable: true })
    Object.defineProperty(state, '_cancel', {
        enumerable: false, writable: true,
        value: () => {
            try { if (state._res) state._res.destroy() } catch (e) { /* ignore */ }
            try { if (state._req) state._req.destroy() } catch (e) { /* ignore */ }
            try { file.destroy() } catch (e) { /* ignore */ }
            const e = new Error('cancelled'); e.cancelled = true
            if (!state._done) { state._done = true; finish(e) }
        }
    })
    const req = getFollow(url, (res) => {
        Object.defineProperty(state, '_res', { value: res, enumerable: false, writable: true })
        state.total = parseInt(res.headers['content-length'], 10) || 0
        res.on('data', (chunk) => {
            state.downloaded += chunk.length
            state.progress = state.total ? Math.round((100 * state.downloaded) / state.total) : null
            emitToolsStatusSoon()
        })
        res.pipe(file)
        file.on('finish', async () => {
            if (state._done) return
            file.close()
            state.phase = 'extracting'
            await broadcastToolsStatus()
            try {
                if (archive.endsWith('.zip')) {
                    await fs.createReadStream(archive).pipe(unzipper.Extract({ path: TOOLS_DIR })).promise()
                } else {
                    await tar.x({ file: archive, cwd: TOOLS_DIR })
                }
                try { fs.unlinkSync(archive) } catch (e) { /* ignore */ }
                // zip extraction drops the executable bit
                const bin = managedPath('dorado') || (() => {
                    const d = fs.readdirSync(TOOLS_DIR).find((n) => n.startsWith('dorado-'))
                    return d ? path.join(TOOLS_DIR, d, 'bin', TOOLS.dorado.bin) : null
                })()
                if (bin && fs.existsSync(bin)) { try { fs.chmodSync(bin, 0o755) } catch (e) { /* ignore */ } }
                if (!managedPath('dorado')) throw new Error('Archive unpacked but no dorado binary was found inside it.')
                state._done = true
                await finish(null)
            } catch (err) {
                state._done = true
                await finish(err)
            }
        })
    }, (err) => { if (!state._done) { state._done = true; finish(err) } })
    Object.defineProperty(state, '_req', { value: req, enumerable: false, writable: true })
}

export function cancelToolDownload(key) {
    const d = _dl[key]
    if (d && d.downloading && typeof d._cancel === 'function' && d.phase !== 'extracting') d._cancel()
}
