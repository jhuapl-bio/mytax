import path, { resolve } from 'path'
import fs from "file-system"
import glob from "glob-all"

export function removeExtension(filename, illumina) {
    let filetrim = path.basename(filename.replace(/\.[^\/.]+/g, ''));
    if (illumina){
        filetrim = filetrim.replace(/_[\d]?$/g, "")
    }
    return filetrim
}
export function getReportName(path_1, outpath, illumina){
    try{
        let path_reports = removeExtension(path_1)
        
        if (illumina){
            path_reports = path_reports.replace(/_[\d]?$/g, "")
        }
        return path.join(outpath, `${removeExtension(path_reports)}.report`)
    } catch (err){
        throw err
    }
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