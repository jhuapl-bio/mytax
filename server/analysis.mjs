import path, { dirname } from 'path'
import { storage } from "./storage.mjs";
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { logger } from './logger.js'
import { broadcastToAllActiveConnections } from './messenger.mjs';
import { Job } from './job.mjs';

export  class Anlayses { 
    constructor(ws){
        this.runs = {}
        this.runNames = []
        this.ws = storage.ws
        this.jobtypes = [
            {
                name: "kraken2",
                description: "Kraken2 - Metagenomics classification on a set of files",
                command: "kraken2",
                status: false
            },
            {
                name: "fastp",
                description: "Fastp - Quality Control of Reads in a run directory",
                command: "fastp",
                status: false
            },
            {
                name: "python",
                description: "PYthon - Used to parse kraken2 output files",
                command: "python",
                status: false
            },

        ]
    }
    checkCommandExistence(command) {
        return new Promise((resolve, reject) => {
            const checkCmd = process.platform === 'win32' ? 'where' : 'which';
            exec(`${checkCmd} ${command}`, (error, stdout, stderr) => {
                if (error) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async checkCommands() {
        for (const job of this.jobtypes) {
            const exists = await this.checkCommandExistence(job.command);
            this.status = exists ? 'exists' : 'does not exist';
            broadcastToAllActiveConnections("commandStatus", {
                command: job.command,
                name: job.name,
                status: this.status
            })
        }
    }

}