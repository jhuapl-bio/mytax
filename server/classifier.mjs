
import path, { dirname } from 'path'
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

import  { spawn } from 'child_process';
import { removeExtension,  getReportName, globFiles, killProcessTree, resolveKrakenDbDirSync } from './controllers.mjs';
import {logger} from './logger.js'
import fs from "file-system"
import { broadcastToAllActiveConnections, queueJobUpdate } from './messenger.mjs';
export  class Classifier { 
    constructor(sample){    

        this.name = sample.sample
        this.run = sample.run
        this.filepath = sample.filepath
        this.fullreport = sample.fullreport
        this.outputdir = sample.outputdir
        this.bundleconfig = sample.bundleconfig
        this.config = sample.config
        this.dirpath = path.dirname(this.filepath)
        this.sampleReport = sample.reportPath
        this.database = sample.database
        // Which classification engine to run for this sample: 'kraken2' (default),
        // 'minimap2' (reference alignment) or 'bracken' (kraken2 -> bracken chain).
        this.classifier = (sample.classifier || 'kraken2')
        // Optional low-quality-read filtering with fastp BEFORE classification.
        this.fastp = sample.fastp === true || sample.fastp === 'true'
        // FASTA/MMI reference used when classifier === 'minimap2'.
        this.minimapDatabase = sample.minimapDatabase || null
        this.paired = ( sample.path_1 && sample.path_2 && sample.path_2 != sample.path_1 ? true : false)
        this.gpu = ''
        this.reportPath = sample.reportPath
        this.reportfiles_seen = []
        this.overwrite   = sample.overwrite
        this.ws = null
        this.process = null
        sample.filepath = this.filepath
        this.sample = sample
        this.recombine = null
        this.status = {
            running: false, 
            error: null,    
            historical: false, 
            success: null, 
            logs: []
        } 
        this.listeners = new Map(); 
 
        
        this.initialize()
       


    } 
    formatcommandstring(){
        let command = this.command
        let formatted = `${command.main} ${command.args.join(" ")}`
        return formatted
    }
    sendJobStatus(){
        let info = {
            command: this.formatcommandstring(),
            fullreport: this.fullreport,
            outputdir: this.outputdir,
            reportPath: this.reportPath,
            database: this.database,
            sampleReport: this.sampleReport,
            filepath: this.filepath,
            path_2: this.sample.path_2,
            index: this.index,
            run: this.run,
            sample: this.sample.sample,
            classifier: this.classifier,
            fastp: this.fastp,
            minimapDatabase: this.minimapDatabase,
        }
        // Previously this broadcast an unthrottled 'status' frame to every socket
        // for EACH job, twice (on start + exit). With 2000+ jobs that alone
        // saturated the connection. Now it's coalesced per (sample,index) into the
        // run-scoped batched 'runUpdate' frame, and dropped entirely if nobody is
        // viewing this run.
        queueJobUpdate(this.run, this.name, this.index, {
            status: this.status,
            config: info
        })
    }
    initialize(){
        this.generateKrakenCommand()
    } 
    

   

    async stop(){
        logger.info(`Attempting to stop process: ${this.name}`)
        if (this.process){
            try{
                // We spawn `bash -c "...kraken2..."`, so this.process is the bash
                // wrapper. A plain this.process.kill() only signals bash and leaves
                // the heavyweight kraken2 child running (still loading/holding the
                // large DB) until it finishes on its own -> cancel feels slow.
                // Because we spawn with detached:true, the child gets its own
                // process group, so we can signal the WHOLE group (negative pid)
                // and take kraken2 down with it. SIGTERM first, then a short
                // SIGKILL escalation so it stops near-instantly.
                killProcessTree(this.process)
                this.status.running = false
                this.status.error=`Canceled job`
                this.status.success = -1
                logger.info(`Process is ended in a midrun, exiting and continuing the queue if it exists currently......`)
                return
            } catch (err){
                logger.error(`${err} failure to exit process appropriately`)
                throw err
            }
        }
    }
    getName(){
        return this.sample.run ? this.sample.run : this.name
    }

    async start(){ 
        const $this=this 
        return new Promise((resolve, reject)=>{
            if ($this.status.cancelled){
                logger.info(`Job was cancelled, exiting`)
                resolve('cancelled')
            }
            else {
                logger.info("No cancel status, continuing to run job")
                $this.check_and_classify().then((exists)=>{
                    $this.status.historical = true
                    if (!exists.sample || $this.overwrite || (exists.sample && !exists.full)){
                        $this.generateKrakenCommand()
                        logger.info(`Starting classifier run for job: ${$this.name}, ${$this.filepath}`)
                        $this.status.running = true  
                        $this.status.cancelled = false
                        $this.status.error = ''
                        $this.status.success = null
                        $this.status.logs = []
                        let command = $this.command
                        // detached:true puts kraken2 (and the bash wrapper) in their
                        // own process group so stop() can kill the whole group fast.
                        let classify = spawn(command.main, command.args, { detached: true });
                        $this.sendJobStatus()
                        classify.stdout.on('data', (data) => {
                            $this.status.logs.push(`${data}`) 
                            $this.status.logs.slice(0,20)
                            logger.info(`${data} `);
                        });   
                    
                        classify.stderr.on('data', (data) => {
                            $this.status.logs.push(`${data}`)
                            $this.status.logs.slice(0,20)
                            if (data){
                                $this.status.error = `${$this.status.error}\n${data}`
                            }
                            logger.error(`${data}`);
                        });
                        classify.on('error', function(error) {
                            logger.error(`Error happened during classification of ${$this.filepath} ${error}`);
                            $this.status.error = err
                            $this.status.running = false
                            reject(error)
                        })  
                        classify.on('exit', (code) => {
                            logger.info(`finished classification for: ${$this.filepath}, generated: ${$this.sampleReport} with code ${code}`);
                            $this.status.success = code !== 0 ? false : true
                            $this.status.running = false
                            $this.status.historical = false
                            $this.process = null
                            $this.sendJobStatus()

                            resolve( `${code}`)                 
                        });
                        $this.process = classify
                    } else { 
                        $this.status.success = true
                        $this.status.running = false
                        $this.status.historical = true
                        logger.info(`${this.fullreport} exists already`)
                        $this.status.logs.push['Historically gathered report, pre-run already']
                        $this.sendJobStatus()
                        
                        resolve()
                    }
                }).catch((err)=>{
                    logger.info(`${err} Error in starting classification job for sample ${$this.name}`)
                    reject(err)
                })
            }
        })
    }   
    sendFullReportSample(){
        const $this = this
        logger.info(`${$this.fullreport}: file done, sending sample data for sample ${$this.name}`)
        fs.readFile($this.fullreport,(err,data)=>{
            if (err){
                logger.error(err)
            }  
        
        })
    }
    // Build the full per-file shell pipeline. Depending on the sample's
    // `classifier` and `fastp` settings this expands to:
    //
    //   [ mkdir ] &&
    //   [ fastp (optional low-quality read filtering) ] &&
    //   [ kraken2 | (kraken2 -> bracken) | (minimap2 -> kreport) ] &&
    //   [ combine_kreports.py -> full.report ]
    //
    // Every classifier is normalised so it writes a Kraken2-style report to
    // `this.sampleReport`, which keeps the downstream combine step + all the
    // sunburst/Sankey/heatmap visualisations working unchanged.
    generateKrakenCommand(){
        const s = this.sample
        const dirname = path.dirname(this.sampleReport)
        const classifier = String(s.classifier || 'kraken2').toLowerCase()
        this.classifier = classifier
        this.fastp = (s.fastp === true || s.fastp === 'true')
        this.minimapDatabase = s.minimapDatabase || null
        const threads = (this.config && this.config.threads) ? this.config.threads : 1
        const paired = (s.path_2 && s.path_2 != s.path_1 && s.path_2 != "") ? true : false
        this.paired = paired

        // step 0: ensure the output dir exists
        const steps = [`mkdir -p '${dirname}'`]

        // step 1: optional fastp preprocessing. When on, the classifier reads the
        // filtered fastq(s) instead of the raw input.
        let input1 = this.filepath
        let input2 = paired ? s.path_2 : ''
        let fastpUsed = false
        if (this.fastp){
            const fp = this.buildFastpStep(dirname, input1, input2, paired, threads)
            steps.push(fp.cmd)
            input1 = fp.out1
            input2 = fp.out2
            fastpUsed = true
        }

        // step 2: the classifier itself
        if (classifier === 'minimap2'){
            steps.push(this.buildMinimap2Cmd(input1, input2, paired, threads))
        } else if (classifier === 'bracken'){
            steps.push(this.buildBrackenCmd(input1, input2, paired, threads, fastpUsed))
        } else {
            steps.push(this.buildKraken2Cmd(input1, input2, paired, fastpUsed, this.sampleReport))
        }

        // step 3: merge this file's report into the sample-level full.report
        steps.push(this.generateKReportCommand())

        const command = {
            main: "bash",
            args: ['-c', steps.join(' && \\\n')]
        }
        this.command = command
        return command
    }
    // fastp: drop low-quality reads before classification. Outputs plain (un-gzipped)
    // fastq into <outputdir>/fastp so the compression flags handed to kraken2 stay
    // consistent (see buildKraken2Cmd, which drops the gzip/bzip flags when fastp
    // ran). Returns the command plus the filtered input path(s).
    buildFastpStep(dirname, in1, in2, paired, threads){
        const cfg = this.sample.fastpConfig || {}
        const q = (cfg.quality !== undefined && cfg.quality !== null && cfg.quality !== '') ? cfg.quality : 20
        const minlen = (cfg.minLength !== undefined && cfg.minLength !== null && cfg.minLength !== '') ? cfg.minLength : 15
        const fpdir = path.join(dirname, 'fastp')
        const base = path.basename(this.sampleReport).replace(/\.report$/, '')
        const out1 = path.join(fpdir, `${base}.fastp.R1.fastq`)
        const out2 = paired ? path.join(fpdir, `${base}.fastp.R2.fastq`) : ''
        const json = path.join(fpdir, `${base}.fastp.json`)
        const html = path.join(fpdir, `${base}.fastp.html`)
        let cmd = `mkdir -p '${fpdir}' && fastp -i '${in1}' -o '${out1}'`
        if (paired && in2){
            cmd += ` -I '${in2}' -O '${out2}'`
        }
        cmd += ` -q ${q} -l ${minlen} --thread ${threads} -j '${json}' -h '${html}'`
        return { cmd, out1, out2 }
    }
    // Assemble the kraken2 `--key value` / `--flag` string from this.config.
    // When fastp ran, the intermediate fastq is plain text, so the gzip/bzip
    // compression flags are skipped to avoid kraken2 mis-reading the input.
    buildKrakenAdditionals(fastpUsed){
        let additionals = ""
        if (this.config){
            for (let [key, value] of Object.entries(this.config)){
                if (fastpUsed && (key === 'gzip-compressed' || key === 'bzip2-compressed')) continue
                if (key == "minimum-hit-groups" && value >= 0 && value != "" && value){
                    additionals = `${additionals}  --${key} ${value}`
                } else if (value && value === true && typeof value == 'boolean'){
                    additionals = `${additionals}  --${key}`
                } else if (value && value !== true){
                    if (Array.isArray(value)){
                        if (value.length > 0){
                            additionals = `${additionals}  --${key} ${value.join(",")}`
                        }
                    } else {
                        additionals = `${additionals}  --${key} ${value}`
                    }
                }
            }
        }
        return additionals
    }
    // kraken2 -> Kraken2-style report at `outReport`.
    buildKraken2Cmd(input1, input2, paired, fastpUsed, outReport){
        // Some DBs (e.g. Silva/RDP 16S) nest the kraken2 index in a subfolder, so
        // resolve to the directory that actually holds taxo.k2d.
        const dbpath = resolveKrakenDbDirSync(this.sample.database)
        this.database = dbpath
        let cmd = `kraken2 --db '${dbpath}' --report "${outReport}" --out "${outReport}.out"`
        if (paired) cmd += ` --paired`
        cmd += this.buildKrakenAdditionals(fastpUsed)
        cmd += ` '${input1}'${input2 ? ` '${input2}'` : ''}`
        return cmd
    }
    // bracken: run kraken2 first, then re-estimate abundance with bracken, writing
    // a fresh Kraken2-style report (bracken -w) to this.sampleReport. Bracken needs
    // the DB to carry kmer_distrib files; if they're absent we log a warning and
    // fall back to the raw kraken2 report so the pipeline still produces output.
    buildBrackenCmd(input1, input2, paired, threads, fastpUsed){
        const k2report = `${this.sampleReport}.k2`
        const kcmd = this.buildKraken2Cmd(input1, input2, paired, fastpUsed, k2report)
        const dbpath = this.database   // set by buildKraken2Cmd above
        const bcfg = this.sample.brackenConfig || {}
        const readlen = bcfg.readLength || 100
        const level = bcfg.level || 'S'
        const thresh = (bcfg.threshold !== undefined && bcfg.threshold !== null && bcfg.threshold !== '') ? bcfg.threshold : 10
        const bracken = `bracken -d '${dbpath}' -i "${k2report}" -o "${this.sampleReport}.bracken" -w "${this.sampleReport}" -r ${readlen} -l ${level} -t ${thresh}`
        return `${kcmd} && ( if ls '${dbpath}'/database*mers.kmer_distrib >/dev/null 2>&1 || ls '${dbpath}'/*kmer_distrib >/dev/null 2>&1; then ${bracken}; else echo "WARNING: no Bracken kmer_distrib files in '${dbpath}'; falling back to kraken2 report" >&2; cp "${k2report}" "${this.sampleReport}"; fi )`
    }
    // minimap2: align reads to a FASTA/MMI reference producing a sorted+indexed
    // BAM (via samtools), then convert the BAM alignments into a Kraken2-style
    // report. References map to NCBI taxids via a seqid2taxid.map beside the
    // reference, and — when a taxdump (nodes.dmp/names.dmp) is available — the
    // converter builds the full lineage so the hierarchy views work.
    buildMinimap2Cmd(input1, input2, paired, threads){
        const ref = this.sample.minimapDatabase || this.sample.database
        this.database = ref
        const platform = String(this.sample.platform || '').toLowerCase()
        // Short-read presets for Illumina-family platforms; long-read (ONT) otherwise.
        const shortRead = /^(ill|mis|next|nova|hiseq|sr|short)/.test(platform)
        const preset = shortRead ? 'sr' : 'map-ont'
        const bam = `${this.sampleReport}.bam`
        const inputs = `'${input1}'${input2 ? ` '${input2}'` : ''}`
        const conv = path.join(__dirname, 'scripts', 'minimap2_to_kreport.py')
        // Index caching: building the minimap2 index from a large FASTA can take
        // many seconds, and this command runs once PER FASTQ file. Without caching,
        // a real-time run rebuilds the whole index for every read file -> the queue
        // looks "stuck" grinding through repeated index builds. So we build a
        // preset-specific `.mmi` next to the reference ONCE (k/w are baked into the
        // index, hence per-preset), then every subsequent file loads it in seconds.
        // The whole thing stays &&-chained; if the reference dir is read-only the
        // build quietly fails (|| true) and we fall back to mapping the FASTA.
        const mmi = `${ref}.${preset}.mmi`
        // Emit a clear, human one-time notice to STDOUT (logged as info, so it
        // isn't styled as an error like minimap2's own stderr progress) only when
        // the index is actually being built -- so the first file doesn't look idle.
        const buildMsg = `echo "[mytax] Building minimap2 ${preset} index (one-time; subsequent files reuse it)…"`
        const doneMsg = `echo "[mytax] minimap2 ${preset} index ready — classifying reads"`
        const buildOnce = `( [ -s '${mmi}' ] || ( ${buildMsg} ; minimap2 -x ${preset} -t ${threads} -d '${mmi}.tmp.'"$$" '${ref}' && mv '${mmi}.tmp.'"$$" '${mmi}' && ${doneMsg} ) || true )`
        // Prefer the cached index; fall back to the FASTA if it never got created.
        const target = `$( [ -s '${mmi}' ] && printf %s '${mmi}' || printf %s '${ref}' )`
        // Align (SAM) -> sort -> BAM -> index. pipefail in a subshell so a minimap2
        // failure aborts instead of leaving a truncated BAM look "successful".
        const align = `( set -o pipefail; minimap2 -a -x ${preset} -t ${threads} --secondary=no "${target}" ${inputs} | samtools sort -@ ${threads} -o "${bam}" - ) && samtools index "${bam}"`
        let cmd = `${buildOnce} && ${align}`
        cmd += ` && python3 '${conv}' --bam "${bam}" --report "${this.sampleReport}" --ref '${ref}'`
        return cmd
    }
    generateKReportCommand(){ 
        let combinedfiles = this.reportfiles_seen.length > 0 ? `${this.reportfiles_seen.join(" ")} ${this.reportPath}` : this.reportPath
        let command = `combine_kreports.py \\
        --only-combined --no-headers \\
        -o ${this.fullreport} -r ${combinedfiles} `
        return command 
    }
    async check_and_classify(){ 
        let exists = { 
            full: false, 
            sample: false
        }
        let fullreport = this.fullreport
        try {
            const pattern = `${this.outputdir}/*.report`;
            let files = await globFiles(pattern)
            // Filter and display the files
            const reportFiles = files.filter(file =>  {
                if (file == fullreport){
                    exists.full = true
                }   
                if (file == this.reportPath){  
                    exists.sample = true  
                }  
                return file.endsWith('.report') && file !== fullreport  ;
            });  
            this.reportfiles_seen = reportFiles
        } catch (err) {
            logger.error(`Error reading directory for reports on classifier pre-check: ${err}`);
        } finally {
            return exists  
        }
    }
}