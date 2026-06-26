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
            const tarGzRegex = /\.tar\.gz$|\.tgz$/;
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

    // Render a textual progress bar like: [#########.........]  47%  (1.20 / 2.55 GB)
    renderProgressBar(downloaded, total, width = 30) {
        const fmt = (b) => {
            if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
            if (b > 1e6) return `${(b / 1e6).toFixed(2)} MB`;
            if (b > 1e3) return `${(b / 1e3).toFixed(2)} KB`;
            return `${b} B`;
        };
        if (!total || total <= 0) {
            // Unknown total (no Content-Length) -> just show bytes pulled so far.
            return `[downloading...] ${fmt(downloaded)}`;
        }
        const ratio = Math.min(downloaded / total, 1);
        const filled = Math.round(ratio * width);
        const bar = '#'.repeat(filled) + '.'.repeat(width - filled);
        const pct = `${(ratio * 100).toFixed(1)}%`.padStart(6);
        return `[${bar}] ${pct}  (${fmt(downloaded)} / ${fmt(total)})`;
    }

    // GET that transparently follows 3xx redirects (github media URLs redirect).
    _getFollow(url, onResponse, onError, redirectsLeft = 5) {
        const req = https.get(url, (response) => {
            const status = response.statusCode;
            if (status >= 300 && status < 400 && response.headers.location) {
                response.resume(); // drain
                if (redirectsLeft <= 0) {
                    return onError(new Error(`Too many redirects for ${url}`));
                }
                const next = new URL(response.headers.location, url).toString();
                return this._getFollow(next, onResponse, onError, redirectsLeft - 1);
            }
            if (status !== 200) {
                response.resume();
                return onError(new Error(`Unexpected status ${status} downloading ${url}`));
            }
            onResponse(response);
        });
        req.on('error', onError);
        return req;
    }

    async download(databaseName, onProgress) {
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

            logger.info(`Starting download of ${db.key}`);
            const fileStream = fs.createWriteStream(targetPath);
            this.databases[index].stream = fileStream;

            this._getFollow(url, (response) => {
                const total = parseInt(response.headers['content-length'], 10) || 0;
                let downloaded = 0;
                let lastLoggedPct = -1;   // throttle stdout to whole-percent steps

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    const pct = total > 0 ? (downloaded / total) * 100 : null;
                    // Push a progress bar to backend stdout, but only when the
                    // whole-number percent changes (or every ~8MB if size unknown)
                    // so we don't spam the log on every chunk.
                    const step = pct === null
                        ? Math.floor(downloaded / 8e6)
                        : Math.floor(pct);
                    if (step !== lastLoggedPct) {
                        lastLoggedPct = step;
                        logger.info(`${db.key}  ${this.renderProgressBar(downloaded, total)}`);
                        if (typeof onProgress === 'function') {
                            onProgress({
                                key: db.key,
                                downloaded,
                                total,
                                percent: pct === null ? null : Math.round(pct)
                            });
                        }
                    }
                });

                response.pipe(fileStream);
                fileStream.on('finish', async () => {
                    fileStream.close();
                    logger.info(`${db.key}  ${this.renderProgressBar(total || downloaded, total || downloaded)}`);
                    logger.info(`Downloaded '${url}' to '${targetPath}'`);

                    if (db.decompress) {
                        try {
                            logger.info(`${db.key}  extracting archive...`);
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
            }, (err) => {
                fs.unlink(targetPath, () => {}); // Delete the file on error
                logger.error(`Error downloading ${url}: ${err.message}`);
                reject(err.message);
            });
        });
    }

}
