
import path from 'path'
import  { spawn } from 'child_process';
import { removeExtension, globFiles } from './controllers.mjs';
import {logger} from './logger.js'

export  class Barcoder { 
    constructor(sample){ 
        this.name = sample.sample
        this.filepath  = sample.path_1 ? sample.path_1 : sample.path_2
        this.dirpath = path.dirname(this.filepath)
        this.outputdir = path.join(this.dirpath, 'demultiplexed')
        this.sample = sample
        this.watcher = null
        this.run = sample.run
        this.generateCommandString()
        this.seenfiles = []
        this.status = {
            running: false, 
            error: null, 
            success: null,
            historical: null, 
            logs: []
        }
        
       


    
    }
    
    async check_and_barcode(){
        let basename = removeExtension(this.filepath)
        let files = []
        let err = false
        try{
            files = await globFiles([
            `${this.demux_outpath}/**/${basename}*fastq.gz`,
            `${this.demux_outpath}/**/${basename}*fastq`,
            `${this.demux_outpath}/**/${basename}*fq.gz`, 
            `${this.demux_outpath}/**/${basename}*fq`], {})   
        } catch (Err){
            logger.error(`${Err} error in getting output files from demux for ${this.demux_outpath}`)
            err = true
        } finally {
            return (err || files.length == 0 || this.overwrite)
        }
    }

    async check_barcode(filepath){
        const $this = this
        let runBC = true 
        try{
            runBC = await this.check_and_barcode()
            if (runBC){
                logger.info(`output from ${$this.filepath} doesn't exist, demuxing now`)
                $this.seenfiles.push(filepath)
            } else {
                // logger.info(`skipping demux for ${$this.filepath}`)
            } 
        } catch (err){
            logger.error(`${err} error in checking barcode status`)
        } finally {
            return runBC
        }
    }
    async stop(){
        if (this.process){
            try{
                logger.info(`Attempting to stop demux process: ${this.name}`)
                this.process.kill();
                this.status.running = false
                this.status.error=`Canceled job`
                this.status.success = -1
                logger.info(`Process of demux is ended in a midrun, exiting and continuing the queue if it exists currently......`)
                return 
            } catch (err){
                logger.error(`${err} failure to exit process appropriately`)
                throw err
            }
        }
    }
    async start(){ 
        const $this = this
        return new Promise((resolve, reject)=>{
            const sample = $this.sample
            this.generateCommandString() 
            const command = $this.command  
            $this.check_barcode().then((rundemux)=>{   
                if (rundemux){  
                    var  ls = spawn('bash', ['-c', command ]);
                    $this.status.running = true
                    $this.ws.emit( "status",  {samplename: $this.name, sample: $this.sample,  index: $this.index, 'status' :  $this.status })
                    ls.stdout.on('data', (data) => { 
                        $this.status.logs.push(`${data}`)
                        $this.status.logs.slice(0,14)
                        logger.info(`stdout: ${data}`);
                    });
 
                    ls.stderr.on('data', (data) => {
                        $this.status.logs.push(`${data}`)
                        $this.status.logs.slice(0,14)
                        logger.error(`stderr: ${data}`); 
                    });
                    ls.on('error', function(error) {
                        logger.error(`Error happened ${error}`);
                        $this.status.error = err
                        $this.status.running = false
                        resolve(error) 
                    })  
                    ls.on('exit', (code) => {
                        logger.info(`child process exited with code for demux ${code} : ${sample.sample}`);
                        $this.status.success = code
                        $this.status.historical = false
                        $this.status.running = false
                        $this.status.error  = code !== 0 ? 'Error in job' : null
                        $this.ws.emit( "status", {samplename: $this.name, sample: $this.sample,  index: $this.index, 'status' :  $this.status })
                        resolve( code )
                    }); 
                    $this.process = ls
                    
                } else {
                    $this.status.success = 0
                    $this.status.historical = true
                    // logger.info(`${$this.name} already seen file, overwrite disabled`)
                    $this.ws.emit( "status", {samplename: $this.name, sample: $this.sample,  index: $this.index, 'status' :  $this.status })
                    resolve(0)
                }
            }).catch((err)=>{
                logger.error(`${err}`)
                reject(err)
            })
        })
        
    }
    trimExtensions(filepath){
        let iterations_max = 5
        let iterations=0
        try{
            while (iterations < iterations_max) {
                // ...
                if (filepath.includes(".")) {            
                    filepath = path.parse(filepath).name
                }  else{
                    break
                }
                iterations+=1
            }
            return filepath
        } catch (err){
            logger.error(`${err} error in trimming extensions`)
            return filepath
        }
        
    }
    generateCommandString(){
        let filepath = this.filepath
        let dirpath =  this.dirpath 
        let basepath=path.basename(this.filepath)
        let basename = removeExtension(filepath);
        let stagepath_demux = path.join(dirpath, 'staged', this.trimExtensions(path.basename(filepath)) )
        let stagepath_Demux_filename = path.join(stagepath_demux, path.basename(filepath))
        let output_path = this.outputdir
        this.stagepath_demux = stagepath_demux
        this.demux_outpath = output_path
        let ext = ".fastq.gz"
        let individual_output_path = path.join(stagepath_demux, 'demultiplexed')
        // let guppy_version = ( this.gpu ? 'guppy_barcoder_gpu' : 'guppy_barcoder_cpu')
        let kits = this.sample.kits ? `--barcode_kits ${this.sample.kits}` : ''
        let command = `rm -r ${stagepath_demux}; mkdir -p ${stagepath_demux};  \\
        ln -sf ${filepath} ${stagepath_Demux_filename};  guppy_barcoder  --compress_fastq --disable_pings  \\
        -i "${path.dirname(stagepath_Demux_filename)}" \\
        -s "${individual_output_path}" \\
        ${kits} ${this.gpu ? this.gpu : ''};  \\
        for f in $(find ${individual_output_path} -type d -name "barcode*"); do \\
            for file in $(find $f -type f ); do \\
                mkdir -p ${output_path}/$(basename $f);\\
                cp $file ${output_path}/$(basename $f)/${basename}${ext}; \\
            done; \\
        done\\
        `
        this.command = command
        // logger.info(`${command}`)
        return command
    }
}