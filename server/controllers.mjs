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
        fs.rm(directoryPath, { recursive: true }, (err)=>{
            if (err){
                reject(err)
            } else {
                resolve()
            }
        })
    })
}



export function rmFile(filepath){
    return new Promise((resolve, reject)=>{
        fs.stat(filepath, (err)=>{
            if (!err){
                fs.unlink(filepath, (err, data)=>{
                    if (err){
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