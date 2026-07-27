import path, { resolve } from 'path'
import fs from "file-system"
import glob from "glob-all"
import { exec } from 'child_process';
import { logger } from './logger.js';
// Delimiter that joins a parent run/folder name to a barcode label to form a
// unique, path- and shell-safe sample id. The frontend splits on the same token
// to render the grouped hierarchy (parent run -> barcode rows).
export const SAMPLE_ID_SEP = '__';

// Build a unique sample id scoped to its parent group. Sanitises both parts so
// the result is safe to use as a directory name, a shell argument and an object
// key. If no parent is supplied the bare (sanitised) label is returned so that
// single, non-barcoded samples keep their original flat name (backwards compat).
export function sanitizeIdPart(s) {
    return String(s == null ? '' : s)
        .trim()
        .replace(/[\\/\s]+/g, '_')   // no slashes or whitespace
        .replace(/_{3,}/g, '__');     // don't let it collide with the separator
}
export function makeSampleId(group, label) {
    const g = sanitizeIdPart(group);
    const l = sanitizeIdPart(label);
    if (!g || g === l) return l;
    return `${g}${SAMPLE_ID_SEP}${l}`;
}

export function removeExtension(filename, illumina, extraExtension) {
    // let filetrim = path.basename(filename.replace(/\.[^\/.]+$/, ''));
    let filetrim = path.basename(filename);
    if (illumina){
        filetrim = filetrim.replace(/_[\d]?$/g, "")
    }
    if (extraExtension){
        extraExtension.map((ext)=>{
            
            if (filetrim.endsWith(ext)) {
                filetrim = filetrim.slice(0, -ext.length);
            }
        })
            
    }
    return filetrim
}
export function getKrakenConfigDefault(){
    return {
        'memory-mapping':true,
        'gzip-compressed': false,
        'bzip2-compressed': false,
        'minimum-hit-groups': false,
        'report-minimizer-data': false,
        'report-zero-counts': false,
        'quick': false,
        'threads': 1,
        'confidence': 0,
        'minimum-base-quality': 0,
    }
}
export function searchPath(dir, fileallowed) {
    return new Promise((resolve, reject) => {
      // Extract the directory name and base name from the input path
      // if path doesnt end with "/" then get dirname
      if (!dir.endsWith("/")){
        dir = path.dirname(dir)
      }
      dir = path.join(dir, "*")
      glob(dir, { mark: true }, (err, matches) => {
        if (err) {
            reject(err);
            return;
        }
            // Filter out only directories (glob marks directories with a trailing '/')
            if(fileallowed){
                // let files = matches.filter(match => !match.endsWith('/'));
                resolve(matches);
            } else {
                let directories = matches.filter(match => match.endsWith('/'));
                resolve(directories);
            }
            
        });
    });
}
// ---------------------------------------------------------------------------
// Paired-read (R1/R2) helpers
//
// Sequencers commonly emit two files per sample that differ only by an R1/R2
// marker, e.g. "2132132_R1.fastq.gz" + "2132132_R2.fastq.gz". These helpers let
// the UI (a) auto-detect the R2 mate for a chosen R1 file and (b) scan a whole
// directory and pair every R1 with its R2 in one shot. The markers are
// user-definable (defaults "_R1"/"_R2") so schemes like ".R1."/".R2." or
// "_1"/"_2" work too.
// ---------------------------------------------------------------------------
const READ_EXTS = ['.fastq.gz', '.fq.gz', '.fastq', '.fq'];

// Strip a known fastq extension, returning [stem, ext] ('' ext if none matched).
export function splitReadExt(basename){
    const lower = String(basename || '').toLowerCase();
    for (const ext of READ_EXTS){
        if (lower.endsWith(ext)){
            return [basename.slice(0, basename.length - ext.length), basename.slice(basename.length - ext.length)];
        }
    }
    return [basename, ''];
}

// Replace the LAST occurrence of the R1 marker with the R2 marker in a basename.
// Returns null when the marker isn't present.
export function swapReadMarker(basename, r1Marker, r2Marker){
    if (!r1Marker) return null;
    const i = String(basename).lastIndexOf(r1Marker);
    if (i === -1) return null;
    return basename.slice(0, i) + r2Marker + basename.slice(i + r1Marker.length);
}

// Derive the shared sample name from an R1 basename: drop the fastq extension,
// then remove the R1 marker. "2132132_R1.fastq.gz" + "_R1" -> "2132132".
export function deriveSampleName(basename, r1Marker){
    let [stem] = splitReadExt(basename);
    if (r1Marker){
        let i = stem.lastIndexOf(r1Marker);
        let markerLen = r1Marker.length;
        if (i === -1){
            // The marker's own separator may have been absorbed by the extension
            // (e.g. ".R1." against a stem ending "...R1"). Retry with trailing
            // separators trimmed off the marker so the name still comes out clean.
            const alt = r1Marker.replace(/[._-]+$/, '');
            if (alt && alt !== r1Marker){
                i = stem.lastIndexOf(alt);
                markerLen = alt.length;
            }
        }
        if (i !== -1){
            stem = stem.slice(0, i) + stem.slice(i + markerLen);
        }
    }
    // trim a trailing separator left behind (e.g. "sample_" -> "sample")
    const trimmed = stem.replace(/[._-]+$/, '');
    return trimmed || stem;
}

// Given an absolute R1 file path, compute its R2 mate in the SAME directory and
// report whether that mate exists on disk.
export function autodetectMate(r1Path, r1Marker = '_R1', r2Marker = '_R2'){
    try{
        if (!r1Path) return { found: false, reason: 'no-r1' };
        const dir = path.dirname(r1Path);
        const base = path.basename(r1Path);
        const mateBase = swapReadMarker(base, r1Marker, r2Marker);
        if (!mateBase || mateBase === base){
            return { found: false, reason: 'no-marker', r1: base };
        }
        const matePath = path.join(dir, mateBase);
        const exists = fs.existsSync(matePath);
        return { found: exists, path_2: exists ? matePath : null, tried: matePath, mateBase };
    } catch (err){
        return { found: false, reason: 'error', error: String(err) };
    }
}

// Scan a directory and pair every R1 file with its R2 mate.
// Returns { pairs: [{ sample, path_1, path_2, r2Found }], unpaired: [basename...] }.
// R1 files with no mate are still returned (path_2 null, r2Found false) so they
// can be added single-ended, and are also listed in `unpaired` for a warning.
export function findReadPairs(dir, r1Marker = '_R1', r2Marker = '_R2'){
    const pairs = [];
    const unpaired = [];
    if (!dir) return { pairs, unpaired };
    let entries = [];
    try{
        entries = fs.readdirSync(dir).filter((name) => splitReadExt(name)[1] !== '');
    } catch (err){
        logger.error(`${err} reading directory for read pairs ${dir}`);
        return { pairs, unpaired, error: String(err) };
    }
    const present = new Set(entries);
    entries.forEach((name) => {
        // Only start from R1 files so each pair is emitted once.
        if (!r1Marker || name.indexOf(r1Marker) === -1) return;
        const mateBase = swapReadMarker(name, r1Marker, r2Marker);
        const sample = deriveSampleName(name, r1Marker);
        const path_1 = path.join(dir, name);
        if (mateBase && mateBase !== name && present.has(mateBase)){
            pairs.push({ sample, path_1, path_2: path.join(dir, mateBase), r2Found: true });
        } else {
            pairs.push({ sample, path_1, path_2: null, r2Found: false });
            unpaired.push(name);
        }
    });
    const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    pairs.sort((a, b) => coll.compare(a.sample, b.sample));
    return { pairs, unpaired };
}

export function getReportName(path_1, outpath, illumina){
    try{
        let path_reports = removeExtension(path_1)
        if (illumina){
            path_reports = path_reports.replace(/_[\d]?$/g, "")
        }
        let exts = ['.fastq', '.fq', '.fq.gz', '.fastq.gz']
        exts.map((extraExtension)=>{
            if (extraExtension && path_reports.endsWith(extraExtension)) {
                path_reports = path_reports.slice(0, -extraExtension.length);
            }
        })
        
        return path.join(outpath, `${removeExtension(path_reports)}.report`)
    } catch (err){
        throw err
    }
}
export function rmDir(directoryPath){
    return new Promise((resolve, reject)=>{
        if (!directoryPath){
            resolve()
            return
        }
        // force:true makes this a no-op (instead of an ENOENT rejection) when the
        // directory never existed (e.g. a sample that never received any reads),
        // so callers can always await this without extra existence checks.
        fs.rm(directoryPath, { recursive: true, force: true }, (err)=>{
            if (err){
                logger.error(`${err} error removing directory ${directoryPath}`)
                reject(err)
                return
            }
            // Verify the removal actually took (defensive: surfaces permission /
            // busy-file failures that fs.rm can silently swallow on some platforms).
            fs.stat(directoryPath, (statErr)=>{
                if (!statErr){
                    logger.error(`Directory ${directoryPath} still exists after rmDir`)
                }
                resolve()
            })
        })
    })
}



export function rmFile(filepath){
    return new Promise((resolve, reject)=>{
        if (!filepath){
            resolve()
            return
        }
        fs.stat(filepath, (err)=>{
            if (!err){
                fs.unlink(filepath, (err)=>{
                    if (err){
                        logger.error(`${err} error removing file ${filepath}`)
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            } else {
                resolve()
            }
        })
    })
}
export 
async function listReportFiles(directoryPath) {
    return new Promise((resolve, reject)=>{
        glob(directoryPath, (err, files) => {
            if (err) {
                console.error('Error:', err);
                return;
            }
            const filteredFiles = files.filter(file => !file.includes('full.report'));
            
        });
    })
}
export function openPath(directoryPath) {
    return new Promise((resolve, reject)=>{
        // if is Mac or Darwin

        let isDarwin = process.platform === "darwin";
        if (isDarwin){
            try{
                exec(`open ${directoryPath}`, (err, stdout, stderr) => {
                    if (err) {
                        logger.error('Error:', err);
                        reject(err);
                    }
                    logger.info('stdout:', stdout);
                    logger.error('stderr:', stderr);
                    resolve()
                });
            } catch {
                logger.error("couldn't open on mac...")
            }
        }
        else{
            try{
                exec(`xdg-open ${directoryPath}`, (err, stdout, stderr) => {
                    if (err) {
                        logger.error('Error:', err);
                        reject(err);
                    }
                    logger.info('stdout:', stdout);
                    logger.error('stderr:', stderr);
                    resolve()
                });
            } catch {
                logger.error("couldn't open on mac...")
            }
        }
    })
}
// ---------------------------------------------------------------------------
// browsePath(kind)
//
// Pop the OS-native file/folder chooser on the machine running the backend so a
// user can point-and-click an input instead of typing a path. macOS uses
// osascript (`choose file` / `choose folder`); Linux uses zenity. Resolves to
// { path } on success, { cancelled: true } if the user dismissed the dialog, or
// { error } if no dialog tool is available. Never rejects, so the websocket
// handler can always emit a clean result.
// ---------------------------------------------------------------------------
export function browsePath(kind = 'file'){
    return new Promise((resolve) => {
        const wantDir = kind === 'directory'
        const isDarwin = process.platform === 'darwin'
        let cmd
        if (isDarwin){
            const chooser = wantDir ? 'choose folder' : 'choose file'
            cmd = `osascript -e 'POSIX path of (${chooser} with prompt "Select a ${wantDir ? 'folder' : 'file'}")'`
        } else {
            const flag = wantDir ? '--directory' : ''
            cmd = `zenity --file-selection ${flag} --title="Select a ${wantDir ? 'folder' : 'file'}"`
        }
        try {
            exec(cmd, (err, stdout, stderr) => {
                if (err){
                    // osascript returns -128 and zenity exits 1 when the user cancels.
                    const msg = String(stderr || err)
                    const cancelled = err.code === 1 || /-128|cancel/i.test(msg)
                    resolve({ cancelled, error: cancelled ? null : msg })
                    return
                }
                const p = String(stdout || '').trim()
                resolve(p ? { path: p } : { cancelled: true })
            })
        } catch (e){
            resolve({ cancelled: false, error: String(e) })
        }
    })
}

// Reference-file suggestions for minimap2: keep sub-directories (so the user can
// keep navigating) plus FASTA/MMI reference files; drop everything else. Used by
// the "searchPathRef" typeahead so the minimap2 custom-path box lists fasta files
// instead of only kraken2 database directories.
export function filterReferencePaths(matches){
    const exts = ['.fasta', '.fa', '.fna', '.fasta.gz', '.fa.gz', '.fna.gz', '.mmi']
    return (matches || []).filter((m) => {
        if (m.endsWith('/')) return true            // directories (glob marks with trailing '/')
        const lower = m.toLowerCase()
        return exts.some((e) => lower.endsWith(e))
    })
}

export async function writeRun(filepath, config){
    try{
        // set a configuration with run name, smaplesheet, and the bundle config information in it as a json
        // check if the run directory exists, if it does not make a directory
        if (config.run){
            let exists = await fs.existsSync(path.dirname(filepath))
            if (!exists) {
                await fs.mkdirSync(path.dirname(filepath), { recursive: true });
            }
            await fs.writeFileSync(filepath, JSON.stringify(config, null, 4))
        } else {
            throw new Error("No run name provided")
        }
    } catch (err){
        throw err
    }
}
export function globFiles(pattern, options){
    const $this = this
    if (!options){
        options = { ignore: [] }
    }
    let globoptions = options 
    if (options.cwd){
        globoptions.cwd = options.cwd
    }
    return new Promise((resolve, reject)=>{
        glob(pattern ,globoptions, (err, files)=>{
            if (err){
                logger.error(err)
                reject(err)
            } else {
                if (options.furtherfilter){
                    let re = new RegExp(options.furtherfilter, "g")
                    let files_true  = files.filter((file)=>{
                        let returnable = file.match(re)
                        return returnable
                    })
                    files = files_true
                }
                resolve(files)
            }
        })
    })
}

// ---------------------------------------------------------------------------
// resolveKrakenDbDirSync(baseDir)
//
// kraken2 needs the directory that DIRECTLY contains its index files
// (taxo.k2d / hash.k2d / opts.k2d). Most genome-idx tarballs put these at the
// top of the extracted folder, but some 16S sets (e.g. Silva, RDP) nest them
// one level deeper inside a subfolder like `16S_SILVA138_k2db/`. Pointing
// kraken2 at the parent then fails with:
//   "database (...) does not contain necessary file taxo.k2d"
//
// This walks baseDir and up to 2 levels of subdirectories to find the real
// index directory. Falls back to baseDir unchanged if nothing is found, so
// non-nested databases keep working exactly as before. Synchronous so it can
// be used from the (sync) kraken2 command builder.
// ---------------------------------------------------------------------------
export function resolveKrakenDbDirSync(baseDir){
    try {
        if (!baseDir) return baseDir;
        const hasIndex = (d) => {
            try { return fs.existsSync(path.join(d, 'taxo.k2d')); } catch (e){ return false; }
        };
        if (hasIndex(baseDir)) return baseDir;

        const subdirs = (dir) => {
            let out = [];
            try {
                for (const name of fs.readdirSync(dir)){
                    const child = path.join(dir, name);
                    try { if (fs.statSync(child).isDirectory()) out.push(child); } catch (e){ /* skip */ }
                }
            } catch (e){ /* not readable */ }
            return out;
        };

        // Level 1: a direct child holds the index?
        const level1 = subdirs(baseDir);
        for (const d of level1){ if (hasIndex(d)) return d; }
        // Level 2: a grandchild holds the index?
        for (const d of level1){
            for (const g of subdirs(d)){ if (hasIndex(g)) return g; }
        }
        return baseDir;
    } catch (err){
        return baseDir;
    }
}

// ---------------------------------------------------------------------------
// killProcessTree(child, { grace })
//
// Jobs are spawned as `bash -c "...kraken2..."` with detached:true, which makes
// the spawned bash a process-group leader. Calling child.kill() would only
// signal bash and leave the real worker (kraken2 / guppy) running until it
// finishes loading/scanning the large DB -> cancellation feels slow.
//
// Signalling the negative PID targets the entire process group, so the worker
// dies with its wrapper. We send SIGTERM for a graceful stop, then escalate to
// SIGKILL after a short grace window for anything that ignores SIGTERM.
// Falls back to a direct child.kill() if group signalling isn't available.
// ---------------------------------------------------------------------------
export function killProcessTree(child, { grace = 1500 } = {}){
    if (!child || typeof child.pid !== 'number') return;
    const pid = child.pid;
    const signalGroup = (signal) => {
        try {
            process.kill(-pid, signal);   // negative pid => whole process group
        } catch (err) {
            // Group not available (e.g. not detached) or already gone -> try direct.
            try { child.kill(signal); } catch (e) { /* already exited */ }
        }
    };

    let exited = false;
    if (typeof child.once === 'function') {
        child.once('exit', () => { exited = true; });
    }

    signalGroup('SIGTERM');
    const timer = setTimeout(() => {
        if (!exited) {
            logger.info(`Process group ${pid} did not exit on SIGTERM, sending SIGKILL`);
            signalGroup('SIGKILL');
        }
    }, grace);
    if (typeof timer.unref === 'function') timer.unref();
}