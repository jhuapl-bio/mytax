<template>
  <v-app  >
      <v-app-bar
        app
        color="light"
        dark absolute
        dense
      >
        
        <v-toolbar-title>Real Time Nanopore Report Analysis</v-toolbar-title>
        <v-spacer>
        </v-spacer>
        <span style="margin-right: 10px" v-if="!samplesheetdata || samplesheetdata.length <= 0 ">No Data Loaded</span>
        <v-checkbox 
          v-model="runBundle" style="text-align:center" @click="runBundleUpdate($event)"  
        >   
          <template v-slot:label>
              <v-tooltip bottom>
                <template v-slot:activator="{ on }">
                  <div v-on="on">
                    <v-icon>
                      mdi-card-plus
                    </v-icon>
                    Enable Name Mapping
                  </div>
                </template>
                If you have a names.dmp file (pre-loaded as well), map additional names to taxids such as common name
              </v-tooltip>
          </template>
        </v-checkbox>
        <v-spacer></v-spacer>
        <v-checkbox 
            v-model="gpu" style="text-align:center"   
        >   
          <template v-slot:label>
              <v-tooltip bottom>
                <template v-slot:activator="{ on }">
                  <div v-on="on">
                    <v-icon>
                      mdi-expansion-card
                    </v-icon>
                    Enable GPU
                  </div>
                </template>
                If you have a NVIDIA GPU Card with Cuda installed, enable GPU
              </v-tooltip>
          </template>
        </v-checkbox>
        
        <v-spacer></v-spacer>
        <v-btn btn-and-icon  color="blue "  @mouseover="navigation.shown=true" @click="navigation.shown = true" >
          <v-progress-circular
              v-if="anyRunning "
              :indeterminate="true" top
              stream   class="mr-2" size="14"
              color="white"
          ></v-progress-circular>
          Data Sheet
          <span  v-if="!samplesheetdata || samplesheetdata.length <= 0 " class="pulse"></span>
          <v-icon v-else class="ml-2">mdi-export</v-icon>
          
        </v-btn>
        
      </v-app-bar> 
      <div class="pt-6 mx-3"> 
        
        <v-navigation-drawer permanent class="pt-6 mx-3"
          app ref="information_panel_drawer"  left :width="navigation.width" v-model="navigation.shown"
          
        >   
        <!-- <div style="width: 100%; height:100%; overflow-y:auto"> -->
            
          <Samplesheet
              :samplesheet="samplesheetdata"
              :queueLength="queueLength"
              :bundleconfig="bundleconfig"
              :seen="samplekeys"
              :current="current"
              :queueList="status"
              @sendNewWatch="sendNewWatch"
              @sendMessage="sendMessage"
              @cancel="cancel"
              @updateData="updateData"
              @barcode="barcode"
              @rerun="rerun"
              :anyRunning="anyRunning"
              @pausedChange="pausedChange"
              :pausedServer="pausedServer"
              :logs="logs"
              @updateConfig="updateConfig"
              @deleteRow="deleteRow"
              :samplesheetName="samplesheet"
            >
          </Samplesheet>
          <div id="file"   @drop.prevent="addDropFileData" @dragover.prevent style="overflow-y: auto"  >
            <v-file-input
                :hint="'Add Another Kraken2 Report File'"
                persistent-hint @input="addData" v-model="recentDataFileadded"
                counter show-size overlap
            >
            </v-file-input>
          </div>
          <div class="mx-4">
            
            <v-autocomplete class="mt-3"
              v-model="selectedsamples"
              :items="selectedsamplesAll"
              chips outlined
              label="Samples"
              multiple
            >
            
            <template v-slot:prepend-item>
              <v-list-item
                ripple
                @mousedown.prevent
                @click="toggleSamples"
              >
                <v-list-item-action>
                  <v-icon :color="selectedsamples.length > 0 ? 'indigo darken-4' : ''">
                    {{ icon  }}
                  </v-icon>
                </v-list-item-action>
                <v-list-item-content>
                  <v-list-item-title>
                    Select All
                  </v-list-item-title>
                </v-list-item-content>
              </v-list-item>
              <v-divider class=""></v-divider>
            </template>
            <template v-slot:selection="{ attr, on, item, selected }">
              <v-chip
                v-bind="attr" small
                :input-value="selected"
                color="blue-grey"
                class="white--text "
                v-on="on"
              >
                <v-progress-circular
                    indeterminate v-if="( current && current[item])"
                    color="white" small size="15"
                ></v-progress-circular>
                <v-icon
                    small v-else 
                    :color="samplekeys && samplekeys.indexOf(item) > -1 ? 'white': 'white'"
                >
                  {{ !status[item] || status[item] && status[item].success != -1  ? 'mdi-check-circle' : 'mdi-exclamation'}}
                </v-icon>
                <span class="ml-2" v-text="item"></span>
                <v-icon
                    small v-if="manuals[item]" @click="deleteRow(item)"
                    :color="`white`"
                >
                  mdi-cancel
                </v-icon>
                
              </v-chip>
            </template>
              
            
            </v-autocomplete>
            
            <v-spacer class="py-0"></v-spacer>
            
            <v-text-field
              hint="Max Depth of Tax Tree"
              v-model="maxDepth"
              persistent-hint 
              single-line
              type="number"
            ></v-text-field>
            <v-text-field
              hint="Min Depth of Tax Tree"
              v-model="minDepth"
              persistent-hint 
              single-line
              type="number"
            ></v-text-field>
            <v-spacer class="py-4"></v-spacer>
            <v-text-field
              hint="Min Percent in Sample"
              v-model="minPercent"
              persistent-hint 
              single-line
              type="number"
            ></v-text-field>
      
            <v-slider
              v-model="minPercent"
              :min="0" 
              :step="0.005"
              :max="1"
            ></v-slider>
            <v-spacer class="py-4"></v-spacer>
            <v-select
              label="Tax Rank Codes"
              v-model="defaults" multiple
              :items="defaultsList"
              item-text="value"
              @change="filter"
              item-value="value"
              persistent-hint 
              
              >
              <template v-slot:prepend-item>
                <v-list-item
                  ripple
                  @mousedown.prevent
                  @click="toggle"
                >
                  <v-list-item-action>
                    <v-icon :color="defaults.length > 0 ? 'indigo darken-4' : ''">
                      {{ icon }}
                    </v-icon>
                  </v-list-item-action>
                  <v-list-item-content>
                    <v-list-item-title>
                      Select All
                    </v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
                <v-divider class="mt-2"></v-divider>
              </template>
            
            </v-select>
          </div>
          </v-navigation-drawer>
        </div> 
      <v-main >
        <v-alert
          type="error" v-if="connectedStatus != 'Connected'"
        >{{  connectedStatus }}</v-alert>
        <v-row class="ml-4">
          
          <v-col
              sm="12"
              id=""
              class="overflow-y-auto  my-0"
          >
             
          
              <v-tabs-items v-model="tab"
              >

              <v-tab-item
                  align-with-title v-for="(tabItem, key) in tabs" 
                  :key="`${key}-item`"
              >   
                  <v-container class="my-3">
                      <component
                          :is="tabItem.component"
                          :sampleData="selectedData"
                          :bundleconfig="bundleconfig"
                          :namesData="uniquenametypes"
                          :fullsize="fullsize"
                          :selectedsamples="selectedsamples"
                          :socket="socket"
                      >
                      </component>

                  </v-container>
              </v-tab-item>


              </v-tabs-items>
              
              
          </v-col>
        </v-row>
      </v-main>
      
      
  </v-app>
</template>

<script>
import Plates from "@/components/Plates"
import * as d3 from 'd3'
import Samplesheet from "@/components/Samplesheet"
import RunStats from "@/components/RunStats"
import _ from 'lodash'
import path from "path"


export default {
    name: 'App',
    components: {
      Plates, 
      Samplesheet,
      RunStats,
    },
    beforeDestroy(){ 
      if (this.interval){
        try{
          clearInterval(this.interval)
        } catch (err){
          console.error(err)
        }
      }
    },
    computed: {
      direction() {
            return this.navigation.shown === false ? "Open" : "Closed";
      },
      samplekeys(){
        return Object.keys(this.fullData)
      },
      icon () {
        if (this.selectedAllSamples) return 'mdi-checkbox-marked'
        if (this.selectedSomeSamples) return 'mdi-minus-box'
        return 'mdi-checkbox-blank-outline'
      },
      selectedAllRanks () {
        return this.defaultsList.length === this.defaults.length
      },
      selectedSomeRanks () {
        return this.defaults.length > 0 && !this.selectedAllRanks
      },
      selectedAllSamples () {
        return this.samplekeys.length === this.selectedsamples.length
      },
      selectedSomeSamples () {
        return this.selectedsamples.length > 0 && !this.selectedAllSamples
      },
      
    },
    
    data() {
        return {
          search: '',
            queueLength: 0,
            manuals: {},
            recentDataFileadded: null,
            socket: {},
            navigation: {
                shown: true,
                width: 550,
                borderSize: 3
            },
            anyRunning: false,
            pausedServer: false,
            selectedsamples: [],
            selectedsamplesAll: [],
            status: {},
            uniquenametypes: {
              'default (scientific name)': 1
            },
            uniquenametypesarr: [],
            config: {},
            current: {},
            bundleindex:1,
            topLevelSampleNames: [],
            names_file_input: null,
            names_file: "/names.tsv",
            seen: [],
            mapped_names : {},
            // samplekeys: [],
            database_file: null,
            db_option: "file",
            selectedData: {},
            db_options: [
              "file",
              "path"
            ],
            stagedData: {},
            paused: false,
            dialog: false,
            connectedStatus: 'Not connected!',
            message: 'No message yet!',
            inputdata: null,
            sampledata: {},
            samples: [],
            selectedsample: null,
            fullData: [],
            type: "single",
            database:null,
            watchdir:null,
            playbackdata: null,
            bundleconfig: null,
            runBundle: true,
            interval: null,
            nodeCountMax: 0,
            defaults: ['K','R', 'R1', "U", 'P', "G", 'D', 'D1', 'O','C','S','F','S1','S2','S3', 'S4'],
            defaultsList: ['U','K', 'P', 'D','D1','G', 'O','C','S','F','S1','S2','S3', 'S4'],
            maxDepth: 30,
            samplesheetdata: [],
            samplesheet: null,
            minDepth: 0,
            minPercent: 0.005, 
            jsondata: null, 
            matchPaired: ".*_[1-2].fastq.gz",
            logs: [], 
            fullsize: {},
            matchSingle: ".*fastq",
            ext: ".fastq", 
            compressed: false,
            filepath: "sample_metagenome.second.report",
            tab: 0, 
            gpu: false,
            tabs: [
                {
                  name: 'Run Stats',
                  icon: "square",
                  component: "RunStats"
                },
                
            ]
        }
    },
    watch: {
      gpu(val){
        try{
          this.sendMessage(JSON.stringify({
                type: "gpu", 
                gpu:  val
            }
          ));
        } catch (err){
          console.error(err)
        }
      },
      selectedsamples(val){
        let data = {}
        let unique_names = []
        val.map((sample)=>{
          

          

        
          return data[sample] = this.sampledata[sample]
        
        
        })
        
        this.selectedData = data
      },
      async names_file_input(newVal){
        let reader = new FileReader(); // no arguments
        const $this = this;
        reader.addEventListener("load", parseFile, false);
        reader.readAsText(newVal);
        async function parseFile(){
          let data = await d3.tsvParse(reader.result)
          $this.mapData(data)
        }
      },
      maxDepth(){
        this.filter()
      },
      
      paused(newValue){
        this.sendMessage(JSON.stringify({type: "pause", pause: newValue }));
      },
      minDepth(){
        this.filter()
      },
      defaults(){
        this.minDepth = 0
        this.maxDepth = 20
        this.minPercent=0
        this.filter()     
      },
      minPercent(){
        this.filter()
      },
      
    },
    async mounted() {
        // Calculate the URL for the websocket. If you have a fixed URL, then you can remove all this and simply put in
        // ws://your-url-here.com or wss:// for secure websockets.
        this.setBorderWidth();
        this.setEvents();
        this.importNames(this.names_file)
        try{
          let samplesheet = `${process.env.BASE_URL}/data/Samplesheet.csv`.replace("//",'/')
          let data = await d3.csv(`${samplesheet}`)
          data = data.filter((f)=>{
            f.demux = (f.demux == "true" || f.demux == "TRUE" || f.demux == "True" ? true : false )
            f.compressed = (f.compressed == "true" || f.compressed == "TRUE" || f.compressed == "True" ? true : false )
            return f.sample && f.sample != ''
          }) 
          this.samplesheet = samplesheet
          this.samplesheetdata = data
          if (this.samplesheetdata.length == 0){
              this.navigation.shown=true
          }
        } catch (err){
          console.error(err,"<<<")
        }
        let mappings = {}
        const $this = this
        let value = "Acinetobacter johnsonii;Acinetobacter genomospecies 7 (synonym), Acinetobacter genomosp. 7 (not a cat) (synonym)"
        let val = $this.extractValue(value)
        // this.matchPaired = process.env.VUE_APP_paired_string
        // this.matchSingle = process.env.VUE_APP_single_string
        
        
        this.connect()
      

    },
    methods: {
      deleteRow(sample){
        this.$delete(this.selectedData, sample)
        this.manuals[sample] = null
        let index = this.selectedsamplesAll.findIndex(x => x === sample);
        if (index >= 0){
          this.selectedsamplesAll.splice(index, 1)
          this.selectedsamples.splice(index, 1)
        }
        if (this.topLevelSampleNames[sample]){
          this.topLevelSampleNames[sample].map((d)=>{
            this.$delete(this.selectedData,d )
            let index = this.selectedsamples.findIndex(x => x === d);
            if (index >= 0){
              this.selectedsamples.splice(index, 1)
              this.selectedsamplesAll.splice(index, 1)
            }
            
          })
        }
      },
      addDropFileData(e) {
        this.addData(e.dataTransfer.files[0])
      },
      addDropFile(e) { 
        this.names_file_input = e.dataTransfer.files[0]; 
      },
      addData(val){
          const $this  = this
          let reader = new FileReader();  
          reader.addEventListener("load", parseFile, false);
          reader.readAsText(val);
          let name  = path.parse(val.name).name
          async function parseFile(){
            await $this.importData(reader.result, null, name, true)
          }
      },
      setBorderWidth() {
          let i = this.$refs.information_panel_drawer.$el.querySelector(
              ".v-navigation-drawer__border"
          );
          i.style.width = this.navigation.borderSize + "px";
          i.style.cursor = "ew-resize";
        },
        setEvents() {
            const minSize = this.navigation.borderSize;
            const el = this.$refs.information_panel_drawer.$el;
            const drawerBorder = el.querySelector(".v-navigation-drawer__border");
            const vm = this;
            const direction = el.classList.contains("v-navigation-drawer--right")
                ? "right"
                : "left";

            function resize(e) {
                document.body.style.cursor = "ew-resize";
                let f = direction === "right"
                    ? document.body.scrollWidth - e.clientX
                    : e.clientX;
                el.style.width = f + "px";
            }

            drawerBorder.addEventListener(
                "mousedown",
                function (e) {
                    if (e.offsetX < minSize) {
                        let m_pos = e.x;
                        el.style.transition = 'initial'; document.addEventListener("mousemove", resize, false);
                    }
                },
                false
            );

            document.addEventListener(
                "mouseup",
                function () {
                    el.style.transition = '';
                    vm.navigation.width = el.style.width;
                    document.body.style.cursor = "";
                    document.removeEventListener("mousemove", resize, false);
                },
                false
            );
        },
        pausedChange(val){
          this.paused = val
        },
        async connect(){
          const socketProtocol = (window.location.protocol === 'https:' ? 'wss:' : 'ws:')
          const port = ':3000';
          // this.ext = process.env.VUE_APP_ext
          // this.compressed = process.env.VUE_APP_compressed
          const echoSocketUrl = socketProtocol + '//' + window.location.hostname + port + '/ws'
          // this.defaults = this.defaultsList
          // Define socket and attach it to our data object
          
          const $this  = this
          $this.socket = await new WebSocket(echoSocketUrl);
          $this.socket.onopen = (basepath) => {
              console.log('Websocket connected.');
              $this.connectedStatus = 'Connected';
              

              $this.sendMessage(JSON.stringify({type: "message", "message" : "Hello, server."}));
              $this.sendMessage(JSON.stringify({type: "gpu", gpu: $this.gpu }));
              $this.sendMessage(JSON.stringify({type: "start", samplesheet: $this.samplesheetdata, overwrite: false }));
          }

          this.socket.onmessage = (event) => {
            // We can parse the data we know to be JSON, and then check it for data attributes
            let parsedMessage = JSON.parse(event.data);
            // If those data attributes exist, we can then console log or show data to the user on their web page.
            if (parsedMessage.type == 'data'){
              ( async ()=>{
                await this.importData(parsedMessage.data, null, parsedMessage.samplename)
                if (!this.topLevelSampleNames[parsedMessage.topLevelSampleNames]){
                  this.topLevelSampleNames[parsedMessage.topLevelSampleNames] = []
                }
                let index = this.topLevelSampleNames[parsedMessage.topLevelSampleNames].indexOf(parsedMessage.samplename)
                if (index < 0 ){
                  this.topLevelSampleNames[parsedMessage.topLevelSampleNames].push(parsedMessage.samplename)
                }
              })().catch((Err)=>{
                console.error(Err)
              })
                
            } else if (parsedMessage.type == 'add'){
              this.samplesheetdata.push(parsedMessage.data)
            } else if (parsedMessage.type == 'playback'){
              this.playbackdata = parsedMessage.message;
            } else if (parsedMessage.type == 'basepathserver'){
              this.basepathserver = parsedMessage.data;
            } else if (parsedMessage.type == 'getbundleconfig'){
              this.bundleconfig = parsedMessage.data;
            } else if (parsedMessage.type == 'queueLength'){
              this.queueLength = parsedMessage.data
            } else if (parsedMessage.type == 'logs'){
              this.logs.push(parsedMessage.data)
              const lasts = this.logs.slice(-100);
              this.logs = lasts 

            } else if (parsedMessage.type == 'config'){
              this.config = parsedMessage.message
            } else if (parsedMessage.type == 'flushed'){
              for(let key of Object.keys(this.current)){
                this.current[key]= null
              }
            } else if (parsedMessage.type == 'reads'){
              this.reads = parsedMessage.message
            } else if (parsedMessage.type == 'error'){
            } else if (parsedMessage.type == 'message'){
            } else if (parsedMessage.type == 'paused'){
              this.pausedServer=parsedMessage.message
            } else if (parsedMessage.type == 'anyRunning'){
              this.anyRunning = parsedMessage.status
            } else if (parsedMessage.type == 'recentQueue'){
              if (!this.status[parsedMessage.data.name]){
                this.status[parsedMessage.data.name] = []
              } 
              
              if (parsedMessage.data.index >=0){
                this.$set(this.status[parsedMessage.data.name], parsedMessage.data.index, parsedMessage.data)
              } else {
                this.$set(this.status[parsedMessage.data.name], this.status[parsedMessage.data.name].length > 0 ? this.status[parsedMessage.data.name].length-1:0, parsedMessage.data)
              }
              
            } else if (parsedMessage.type == 'status'){
              if (!this.status[parsedMessage.samplename]){
                this.status[parsedMessage.samplename] = []
              } 
              this.$set(this.status[parsedMessage.samplename][parsedMessage.index], 'status', parsedMessage.status)
              // this.status[parsedMessage.samplename][parsedMessage.index] = Object.assign({}, this.status[parsedMessage.samplename][parsedMessage.index], parsedMessage.status, )
              this.$set(this.status[parsedMessage.samplename][parsedMessage.index], 'sample', parsedMessage.sample)
              // this.$set(this.status[parsedMessage.samplename][parsedMessage.index].status, 'running', parsedMessage.status.running)              
              this.$set(this.current, parsedMessage.samplename, parsedMessage.status.running)   
            }
            else{ 
              this.message = parsedMessage.message;
            }
          }

          $this.socket.onclose = function(e) {
            // console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
            setTimeout(function() {
              $this.connect();
            }, 2000);
          };

          $this.socket.onerror = function(err) {
            // console.error('Socket encountered error: ', err.message, 'Closing socket');
            $this.connectedStatus = 'Disconnected Server, reattempting every 1 second. Check Logs and Network Settings'
            $this.socket.close();
          };
        },
        extractValue(value){
          let mappings = {}
          if (value){
            let split =value.split(";")
            if (split.length >1){
              split = split[1]
              split=split.split(", ")
              if (split && split.length > 0 ){
                  split.forEach((f)=>{
                    var regExp = new RegExp(/(?<=\()(.*?)(?=\))|(?<=^)(.*)(?=\()/, "g");
                    
                    var matches = f.match(regExp)
                    let attr = null
                    let val = null
                    if(matches && matches.length>1){
                      val = matches[0].trim()
                      attr = matches[1].trim()
                      if (!this.uniquenametypes[attr]){
                        this.uniquenametypes[attr] = 1
                      }
                      if (!mappings[attr]){
                        mappings[attr] = [val]
                      } else {
                        mappings[attr].push(val)

                      }

                    }
                  })

              }
            } else {
              split =  value
            }
          }
        return mappings
      },
      
        
        runBundleUpdate(){
          this.sendMessage(JSON.stringify({
                type: "runbundle", 
                config: this.runBundle,
                  "message" : `Run Bundle config updates ${this.runBundle} `
              }
          ));
        },
        updateConfig(data, val){
          if (val =='kraken2'){
            this.sendMessage(JSON.stringify({
                  type: "updateConfig", 
                  config: data,
                   "message" : `Config Updated for data, select restart run  next please `
                }
            ));
          } else if (val =='bundle'){
            this.sendMessage(JSON.stringify({
                  type: "updateBundleconfig", 
                  config: data,
                    "message" : `Bundle Config Updated for data, select restart run  next please `
                }
            ));
          }

        },
        filter(){
          let dataFull = {}
          const $this = this;
          this.selectedsamples.map((sample)=>{
            let data = $this.filterData(_.cloneDeep($this.fullData[sample]))
            data = $this.parseData(data)
            dataFull[sample] = data
          })
          this.selectedData = dataFull
        },
        async barcode(sample){
          this.sendMessage(JSON.stringify({
                type: "barcode", 
                sample: sample.sample,
                kits: sample.kits,
                dirpath: sample.path_1
            }
          ));
        },
        async rerun(index, sample){
          this.sendMessage(JSON.stringify({
                type: "rerun", 
                overwrite: true,
                sample: sample,
                index: index,
                "message" : `Begin rerun of ${sample}, job # ${index}`
            }
          ));
        },
        async sendNewWatch(params){
          let restart = params.overwrite
          let sample = params.sample
          this.sampledata = {}
          this.stagedData = {}
          if (sample){
            this.sendMessage(JSON.stringify({
                  type: "restart", 
                  overwrite: restart,
                  sample: sample,
                  "message" : `Begin watching directory ${this.watchdir}, classify with ${this.database} `
              }
            ));
          } else {
            this.sendMessage(JSON.stringify({
                  type: "start", 
                    samplesheet: this.samplesheetdata,
                    overwrite: restart,
                    "message" : `Begin watching directory ${this.watchdir}, classify with ${this.database} `
                }
            ));
          }
          
        },
        cancel(data){
          this.sendMessage(JSON.stringify({
                  type: "cancel", 
                  index: data.index,
                  sample: data.sample,
                  "message" : `Cancel Index Job: ${data.index} for sample: ${data.sample}`
              }
          ));
        },
        updateData(data){
          this.samplesheetdata = data
          this.sendMessage(JSON.stringify({
                  type: "start", 
                  samplesheet: this.samplesheetdata,
                  overwrite: false,
                  "message" : `Begin watching directory ${this.watchdir}, classify with ${this.database} `
              }
          ));
        },
        addDropFiles(e) {
          this.value = Array.from(e.dataTransfer.files);
          this.database_file = this.value[0].path
        },
        toggleSamples () {
          this.$nextTick(() => {
            if (this.selectedAllSamples) {
              this.$set(this, 'selectedsamples', [])
            } else {
              this.selectedsamples = this.samplekeys.slice()
            }
          })
        },
        toggle () {
          this.$nextTick(() => {
            if (this.selectedAllRanks) {
              this.defaults = []
            } else {
              this.defaults = this.defaultsList
            }
          })
        },
        waitForOpenConnection: function() {
            // We use this to measure how many times we have tried to connect to the websocket server
            // If it fails, it throws an error.
            return new Promise((resolve, reject) => {
                const maxNumberOfAttempts = 10
                const intervalTime = 200 

                let currentAttempt = 0
                const interval = setInterval(() => {
                    if (currentAttempt > maxNumberOfAttempts - 1) {
                        clearInterval(interval)
                        reject(new Error('Maximum number of attempts exceeded.'));
                    } else if (this.socket.readyState === this.socket.OPEN) {
                        clearInterval(interval)
                        resolve()
                    }
                    currentAttempt++
                }, intervalTime)
            })
        },
        sendMessage: async function(message) {
            // We use a custom send message function, so that we can maintain reliable connection with the
            // websocket server.
            if (this.socket.readyState !== this.socket.OPEN) {
                try {
                    await this.waitForOpenConnection(this.socket)
                    this.socket.send(message)
                } catch (err) { console.error(err) }
            } else {
                this.socket.send(message)
            }
        },
        parseData(data){
          function find_latest(obj, found){
            if (found-1 <= -1 ){
              return {
                name: 'base', 
                taxid: -1,
                value: 0
              }
            } else {
              if (last[found-1]){
                return obj[found-1]
              } else {
                return find_latest(obj, found-1)
              }
            }
          }
          let last = {}
          
          data  = data.map((d)=>{
            
            let source = find_latest(last, d.depth)
            if (d.taxid == -1){
              d.source = null
              d.parenttaxid = null
            } else {
              d.source = source.name  
              d.parenttaxid = source.taxid
            }
            
            last[d.depth] = {
              name: d.target,
              taxid: d.taxid,
              value: d.num_fragments_assigned
            }
            
            return d
          })
          return data
          
        },
        
        filterData(d){
          let data = _.cloneDeep(d)
          data = data.filter((f)=>{
            
            let v = ( f.taxid == -1 || this.defaults.indexOf(f.rank_code) > -1 && f.depth <= this.maxDepth && f.depth >= this.minDepth && this.minPercent <= f.value/100 )
            
            
            return  v
          })
          return data
        },
        mapData(data){
          data.forEach((entry)=>{
            this.mapped_names[entry.Taxid] = entry
          })
          
        },
        async importNames(filepath){
          
          try{
            let text = await d3.tsv(filepath)
            this.mapData(text)
          } catch (Err){
            console.error(Err)
          }
        },
        async importData(information, type, sample, manual){
          let text;
          if (type == 'file'){
            text = await d3.text(information)
          } else {
            text = information
          }
          let indexSamples = this.selectedsamplesAll.indexOf(sample)
          if(indexSamples == -1){
            this.selectedsamplesAll.push(sample)
            this.selectedsamples.push(sample)
          }
          let fullsize = 0
          const $this = this
          let uniques  = {}
          let base = {
              value: 0,
              num_fragments_clade: 0,
              num_fragments_assigned: 0,
              rank_code: '1B',
              taxid: -1,
              target: "base",
              source: null,
              depth: 0
          }
          let data = d3.tsvParseRows(text, (d)=>{
            d[0] = d[0].trim()
            d[5]  = d[5] ? d[5] : "Unknown"
            d[5] = d[5].replace(/\t/, '')
            let found = d[5].search(/\S/);
            
            d[5] = d[5].trim()
            let size = 0
            let value =  ( d[5] ? `${d[5]}` : "root" )
            let target = value.replace(/\;.*/, "")
            let fullMap = {}
            let mappings = {}
            
            
            let val = $this.extractValue(value)
            let data = {
              value: parseFloat(d[0]),
              num_fragments_clade: parseInt(d[1]),
              num_fragments_assigned: parseInt(d[2]),
              rank_code: d[3],
              taxid: d[4],
              size: size ,
              target: target,
              full: `${d[4]} ${value}`,
              objfull: val,
              source: null,
              depth: found
            }
            fullsize += parseInt(d[2])
            if ( found == 0  ){
              base.value += parseFloat(data.value)
              base.num_fragments_clade+= parseInt(data.num_fragments_clade)
             
            }
            
            uniques[d[3]] = 1
            
            return data
          })
       
          this.fullsize[sample] = fullsize
          data.unshift(base)
          this.fullData[sample] = data
          data = this.filterData(data)
          data = this.parseData(data)
          Object.keys(uniques).forEach((f)=>{
            if (this.defaultsList.indexOf(f)==-1){
              this.defaultsList.push(f)
            }
          })
          this.stagedData[sample] = data
          if (!this.paused){
            
            this.sampledata[sample] = data
            
            let index = this.selectedsamples.indexOf(sample)
            if ( index > -1){
              this.selectedData[sample] = data
            } else  if (index == -1 && this.selectedData[sample]){
              delete this.selectedData[sample]
            }
        
          } 
          if (manual){
            this.manuals[sample] = 1
          }
          return data 
          
          
          
          
          
      },
    }
}
</script>

<style>
th, td {
  white-space: normal
}
.class-on-data-table table {
    table-layout: fixed;
  }
#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: center;
    color: #2c3e50;
    margin-top: 0px;
}
.container {
  max-width: 100000px
}
.pulse {
  display: block;
  margin-left: 10px;
  margin-right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #da4040;
  box-shadow: 0 0 0 rgba(255, 255, 255, 0.4);
  animation: pulse 2s infinite;
}
.pulse:hover {
  animation: none;
}

@-webkit-keyframes pulse {
  0% {
    -webkit-box-shadow: 0 0 0 0 rgba(252, 251, 248, 0.4);
  }
  70% {
      -webkit-box-shadow: 0 0 0 30px rgba(204,169,44, 0);
  }
  100% {
      -webkit-box-shadow: 0 0 0 0 rgba(204,169,44, 0);
  }
}
@keyframes pulse {
  0% {
    -moz-box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
  }
  70% {
      -moz-box-shadow: 0 0 0 30px rgba(204,169,44, 0);
      box-shadow: 0 0 0 30px rgba(204,169,44, 0);
  }
  100% {
      -moz-box-shadow: 0 0 0 0 rgba(204,169,44, 0);
      box-shadow: 0 0 0 0 rgba(204,169,44, 0);
  }
}
</style>