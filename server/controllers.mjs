import path, { resolve } from 'path'
import fs from "file-system"
import glob from "glob-all"
import { exec } from 'child_process';
import { logger } from './logger.js';
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