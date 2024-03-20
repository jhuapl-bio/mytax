import fs from 'fs';
import path from 'path';
import https from 'https';
import unzipper from 'unzipper';
import zlib from 'zlib';
import { logger } from './logger.js';
import tar from 'tar';
import { rmFile } from './controllers.mjs';
export class Downloader {
    constructor(databaseSavePath) {
        
        this.databaseSavePath = databaseSavePath;
    }

    async extractFile(filePath, targetDirectory) {
        return new Promise( async (resolve, reject) => {   
            const tarGzRegex = /\.tar\.gz$/;
            const gzRegex = /\.gz$/;
            const zipRegex = /\.zip$/;
            const tarRegex = /\.tar$/;
            const tarBz2Regex = /\.tar\.bz2$/;
            
            // check that target directory exists if not then make it 
            if (!fs.existsSync(targetDirectory)) {
                await fs.mkdirSync(targetDirectory);
            }
            if (tarGzRegex.test(filePath)) {
                // Handle .tar.gz files
                tar.x({
                    file: filePath,
                    C: targetDirectory
                }).then(() =>resolve(`Extracted ${filePath}`)).catch((err) => reject(err));    
            } else if (tarBz2Regex.test(filePath)) {
                // Handle .tar.bz2 files
                logger.info('Extraction for .tar.bz2 is not implemented yet.');
                resolve()
            } else if (gzRegex.test(filePath)) {
                // Handle .gz files (not tar.gz)
                logger.info('Extraction for standalone .gz files is not implemented yet.');
                resolve()
            } else if (zipRegex.test(filePath)) {
                // Handle .zip files
                fs.createReadStream(filePath)
                    .pipe(unzipper.Extract({ path: targetDirectory }))
                    .on('close', () => resolve(`Extracted ${filePath}`)).catch((err) => reject(err));    
            } else if (tarRegex.test(filePath)) {
                // Handle .tar files
                tar.x({
                    file: filePath,
                    C: targetDirectory
                }).then(() => resolve(`Extracted ${filePath}`)).catch((err) => reject(err));    
            } else {
                resolve('Unknown or unsupported file type.');
            }
        });
    }

    async download(databaseName) {
        return new Promise(async (resolve, reject) => {
            let index = this.databases.findIndex((d) => d.key === databaseName);
            if (index === -1) {
                return reject(new Error(`Database ${databaseName} not found.`));
            }
    
            this.databases[index].downloading = true;
            const db = this.databases[index];
    
            if (!fs.existsSync(this.databaseSavePath)) {
                fs.mkdirSync(this.databaseSavePath, { recursive: true });
            }
    
            const basename = path.basename(db.url);
            const targetPath = path.join(this.databaseSavePath, basename);
            const url = db.url;
    
            logger.info("Starting download");
            const fileStream = fs.createWriteStream(targetPath);
            this.databases[index].stream = fileStream    
            https.get(url, (response) => {
                response.pipe(fileStream);
                fileStream.on('finish', async () => {
                    fileStream.close();
                    logger.info(`Downloaded '${url}' to '${targetPath}'`);
                    
                    if (db.decompress) {
                        try {
                            const msg = await this.extractFile(targetPath, path.join(this.databaseSavePath, db.nested ? '' : db.final));
                            try{
                                // try to remove the url donwloaded file
                                await rmFile(targetPath)
                                
                            } catch (err){
                                console.error(err)
                            }
                            logger.info(msg);
                            resolve(msg);
                        } catch (err) {
                            reject(err);
                        }
                    } 
                    else {
                        resolve(`Downloaded '${url}' to '${targetPath}'`);
                    }
                });
            }).on('error', (err) => {
                fs.unlink(targetPath, () => {}); // Delete the file on error
                logger.error(`Error downloading ${url}: ${err.message}`);
                reject(err.message);
            });
        });
    }  
    
}
