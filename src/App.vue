<template>
  <v-app  style="padding-bottom: 0px;">
      <v-app-bar
        app
        color="light"
        dark absolute class=""
        dense
      >
        
        <v-toolbar-title>Real Time Nanopore Report Analysis</v-toolbar-title>
        <v-spacer>
        </v-spacer>
        <span style="margin-right: 10px" v-if="!selectedsamples || selectedsamplesAll.length <= 0 ">No Data Loaded</span>
        <v-spacer></v-spacer>
        <v-checkbox 
            v-model="gpu" style="text-align:center"    class="mt-6"
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
        <v-btn   color="blue "  @click="sendMessage({type: 'message', message: 'Message' })">Send message </v-btn>

          <v-progress-circular
              v-if="anyRunning "
              :indeterminate="true" top
              stream   class="mr-2" size="14"
              color="white"
          ></v-progress-circular>        
      </v-app-bar> 
      <div class="pt-6 "> 
        
        <v-navigation-drawer permanent class="pt-6"
          app ref="information_panel_drawer"  left :width="navigation.width" v-model="navigation.shown"
        >    
          <v-row class="mt-10 ml-2">
              <v-select  
                v-model="database" 
                :items="databases" 
                label="Database" 
                item-key="url"
                item-value="key"
                return-object
                item-text="final"
                :hint="`${database.size}`"
                persistent-hint class="mx-3 flex " >
                <template v-slot:prepend>
                  <v-tooltip bottom>
                  <template v-slot:activator="{ on }">
                    <v-btn @click="downloaddb" v-on="on" icon>
                      <v-icon>mdi-download</v-icon>
                    </v-btn>
                  </template> 
                  Download Database to home directory
                  </v-tooltip>
                </template>
                <template v-slot:selection="{ item }">
                  {{ item.key }} <v-spacer vertical></v-spacer>
                    <v-progress-circular :indeterminate="true" top
                      stream   
                      class="mr-2" 
                      size="14"  color="blue lighten-2"
                      v-if="item.downloading" >
                    </v-progress-circular>
                    <v-icon v-else
                      :color="item.size != 0 ? 'green' : 'orange lighten-1' "
                      large
                    >{{ item.size != 0 ? 'mdi-check' : 'mdi-alert'  }}
                    </v-icon>
                </template>
              </v-select>
              <v-btn class="mr-10" @click="canceldownload" v-if="database.downloading" icon>
                <v-icon>mdi-cancel</v-icon>
              </v-btn>
              
              <v-select
                :items="runs"
                v-model="selectedRun"
                v-if="runs && runs.length > 0"
                label="Available Runs"
                hint="Select a run of number of samples"
                persistent-hint
                class="mx-3 flex "
              >
              </v-select>
              <AddRun ref="addRun" 
                @sendMessage="sendMessage"
                :selectedRun="selectedRun"
                :samples="selectedsamplesAll"
                :pathOptions="pathOptions"
                :reportSavePath="reportSavePath"
              >
              </AddRun> 
              <v-tooltip bottom>
                <template v-slot:activator="{ on }">
                  <v-btn v-on="on"  icon
                    @click="sendMessage({type: 'openPath' })"
                    class="mr-10 mb-2">
                    <v-icon color="black"  >mdi-home</v-icon>
                  </v-btn>
                </template>
                Open Base Path to default database(s), reports, information
              </v-tooltip>
             
          </v-row>
            

          <!-- Button click to save run information, sned to backend as a method -->
          <Samplesheet
              :samplesheet="samplesheet"
              :queueLength="queueLength"
              :queueList="queueList"
              :databases="databases"
              :selectedsamples="selectedsamples"
              :bundleconfig="bundleconfig"
              :seen="samplekeys"
              :current="current"
              v-if="selectedRun"
              :socket="socket"
              @sendNewWatch="sendNewWatch"
              @importData="importData"
              :pathOptions1="pathOptions1"
              :pathOptions2="pathOptions2"
              :pathOptionsDb="pathOptionsDb"
              @updateSampleStatus="updateSampleStatus"
              @sendMessage="sendMessage"
              @updateData="updateData"
              @updateEntry="updateEntry"
              @deleteEntry="deleteEntry"
              @barcode="barcode"
              @sampleStatus="sampleStatus"
              @rerun="rerun"
              :anyRunning="anyRunning"
              @pausedChange="pausedChange"
              :pausedServer="pausedServer"
              :logs="logs"
              @updateConfig="updateConfig"
              :samplesheetName="samplesheet"
              :status="status"
              :selectedRun="selectedRun"
              :selectedsamplesAll="selectedsamplesAll"
              :statussent="statussent"
            >
          </Samplesheet>
          <v-alert class="py-0 my-0"
          type="info" v-else
          ><hr>No Run selected. Please create one with the "+" button first<hr></v-alert>
          
          
          <div class="mx-4" 
          style="overflow-y: auto; ">
            
            <v-spacer class="py-0"></v-spacer>
            
            <v-range-slider
              v-model="depthRange"
              :max="maxDepth"
              :min="0"
              label="Depth Range"
              :step="1"
              hide-details
              class="align-center"
            >
              <template v-slot:prepend>
                <v-text-field
                  v-model="depthRange[0]"
                  hide-details
                  single-line
                  type="number"
                  variant="outlined"
                  density="compact"
                  style="width: 70px"
                ></v-text-field>
              </template>
              <template v-slot:append>
                <v-text-field
                  v-model="depthRange[1]"
                  hide-details
                  single-line
                  type="number"
                  variant="outlined"
                  style="width: 70px"
                  density="compact"
                ></v-text-field>
              </template>
            </v-range-slider>
            <v-spacer class="py-4"></v-spacer>
            <v-text-field
              hint="Min Abu in Sample"
              v-model="minPercent"
              persistent-hint 
              single-line
              type="number"
              step="0.005"
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
              menu-props="auto"
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
      <v-main class="pb-0">
        <v-alert
          type="error" v-if="connectedStatus != 'Connected'"
        >{{  connectedStatus }}</v-alert>
        <v-row class="ml-4 pb-0">
          
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
                  <v-container class="my-0">
                      <component
                          :is="tabItem.component"
                          :bundleconfig="bundleconfig"
                          :sampleData="selectedsamples"
                          :namesData="uniquenametypes"
                          :fullsize="fullsize"
                          :selectedsamples="Object.keys(selectedData)"
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
import AddRun from "@/components/AddRun"
import _ from 'lodash'
import { io } from "socket.io-client";
 

export default {
    name: 'App',
    components: {
      Plates, 
      Samplesheet,
      AddRun,
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
      selectedsamples(){
        let data = {}
        
        this.selectedsamplesAll.filter((obj)=>{
          return !obj.hidden
        }).map((f)=>{
          data[f.sample] = f.data
        })
        return data 
      },
      icon () {
        if (this.selectedAllSamples) return 'mdi-checkbox-marked'
        if (this.selectedSomeSamples) return 'mdi-minus-box'
        return 'mdi-checkbox-blank-outline'
      },
      
      filteredItems() {
        if (!this.search) {
          return this.selectedsamplesAll;
        }
        const searchTerm = this.search.toLowerCase();
        return this.selectedsamplesAll.filter(item => {
          // Assuming 'item' has a property to filter on. Replace 'name' with the relevant property
          return item.name.toLowerCase().includes(searchTerm);
        });
      },
      samplekeys(){
        return Object.keys(this.fullData)
      },
      
      
      
    },
    
    data() {
        return {
          search: '',
            queueLength: 0,
            manuals: {},
            socket: {},
            socketReport: {},
            navigation: {
                shown: true,
                width: 550,
                borderSize: 3
            },
            runs: [], 
            selectedRun: null,
            anyRunning: false,
            pausedServer: false,
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
            sampleStatus: {},
            databases: [],
            database: {},
            pathOptions: [],
            pathOptions1: [],
            pathOptions2: [],
            pathOptionsDb: [],
            db_options: [
              "file",
              "path"
            ],
            search: '',
            paused: false,
            dialog: false,
            connectedStatus: 'Not connected!',
            message: 'No message yet!',
            inputdata: null,
            samples: [],
            selectedsample: null,
            fullData: [],
            type: "single",
            watchdir:null,
            playbackdata: null,
            bundleconfig: null,
            runBundle: true,
            interval: null,
            nodeCountMax: 0,
            selectAll: false,
            
            defaults: ['K','R', 'R1', "U", 'P', "G", 'D', 'D1', 'O','C','S','F', 'F1', 'F2', 'S1','S2','S3', 'S4'],
            defaultsList: ['U','K', 'P', 'D','D1','G', 'O','C','S','F', "F2", "F1", 'S1','S2','S3', 'S4'],
            depthRange: [0,100],
            maxDepth: 100,
            samplesheetdata: [],
            samplesheet: null,
            reportSavePath: null,
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
            statussent: null, 
            queueList: {},
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
          this.sendMessage({
                type: "gpu", 
                gpu:  val,
            }
          );
        } catch (err){
          console.error(err)
        }
      },
      selectedRun(val){
        if (val){
          this.selectedsamplesAll = []
          this.sendMessage({
            run: val,
            type: "getRunInformation", 
          })
        }
      },
      // selectedsamples:{
      //   deep: true, 
      //   handler(val){
      //     let data = {}
      //     let unique_names = []
      //     val.filter((obj)=>{
      //       return !obj.hidden
      //     }).map((obj)=>{
      //       let sample = obj.sample
      //       unique_names.push(sample)
      //       let d = obj.data
      //       if (d){
      //         data[sample] = d
      //       }
      //     })
      //     return data 
      //   }
      // },
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
      depthRange(){
        this.filter()
      },
      paused(newValue){
        this.sendMessage({type: "pause", pause: newValue  });
      },
      
      // defaults(){
      //   this.minPercent=0
      //   this.filter()     
      // },
      minPercent(){
        this.filter()
      },
      
    },
    
    async mounted() {
        // Calculate the URL for the websocket. If you have a fixed URL, then you can remove all this and simply put in
        // ws://your-url-here.com or wss:// for secure websockets.
        this.setBorderWidth();
        this.setEvents();
        
        this.connect()

      

    },
    methods: {
      generateUserId() {
        return `user_${Math.random().toString(36)}`;
      },
      updateSampleStatus(sample, status){
        // iterate through queueList and find sample. Set success if all are success, set historical if all historical, set running if any running etc also do logs and error. Update selectedsamplesAll with new status
        let index = this.selectedsamplesAll.findIndex(x => x.sample === sample );
        
        if (index > -1){
          if (!status){

            let status = this.selectedsamplesAll[index].status
            let queue = this.queueList[sample]
            
            let error = queue.map((f)=>{return f.status.error})
            let running = queue.some((f)=>{return f.status.running})  
            let paused = queue.some((f)=>{return f.status.paused})
            let success = queue.every((f)=>{return f.status.success})
            let historical = queue.every((f)=>{return f.status.historical})
            let waiting = queue.some((f)=>{return f.status.waiting})
            let logs = queue.map((f)=>{return f.status.logs})

            status = {
              running: running,
              paused: paused,
              success: success,
              historical: historical,
              waiting: waiting,
              error: error,
              logs: logs
            }

            this.$set(this.selectedsamplesAll[index], 'status', status)
          } else {
            this.$set(this.selectedsamplesAll[index], 'status', status)
          }
          
        }  
      },
      canceldownload(){
        this.sendMessage({
            type: "canceldownload", 
            database: this.database.key,
            "message" : `Cancel Database Download ${this.database} `
        });
      },
      downloaddb(){
        this.sendMessage({
            type: "downloaddb", 
            database: this.database.key,
            "message" : `Download Database ${this.database} `
        });
      },
      updateEntry(n, sample){
        try{
          this.sendMessage({
                type: "updateEntry", 
                sample: n['sample'],
                info: n,
                run: this.selectedRun,
                "message" : `Update Entry ${sample} `
            }
          ); 

        } catch (err){
          console.error(err)
        } 
       
      },
      deleteEntry(sample){
        try{
          this.sendMessage({
                type: "deleteEntry", 
                sample: sample,
                run: this.selectedRun,
                "message" : `Delete Entry ${sample} `
            }
          );
        } catch (err){
          console.error(err)
        } 
        // finally {
        //   this.deletesample(sample)
        // }
      },
      saveRun(){
        this.sendMessage({
              type: "saveRun", 
              "message" : `Save Run ${this.runName} `
          }
        );
      },
      deletesample(sample){
        this.$delete(this.selectedData, sample)
        let index = this.selectedsamplesAll.findIndex(x => x.sample === sample );
        if (index > -1){
          this.$delete(this.selectedsamplesAll, index)
          
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
        addSamplesheetEntry(){
          let samplesheet = this.samplesheetdata
          if (samplesheet && Array.isArray(samplesheet)){
            samplesheet.map((entry)=>{
              let index = this.samplesheetdata.findIndex(x => x.sample === entry.sample)
              if (index > -1){
                this.$set(this.samplesheetdata, index, entry)
              } else {
                this.$set(this.samplesheetdata, this.samplesheetdata.length, entry)
              }
            })
          }
            
        },
        async connectReport(){
          const socketProtocol = (window.location.protocol === 'https:' ? 'wss:' : 'ws:')
          const port = ':7688';
          // this.ext = process.env.VUE_APP_ext
          // this.compressed = process.env.VUE_APP_compressed
          const echoSocketUrl = socketProtocol + '//' + window.location.hostname + port + '/ws'
          // this.defaults = this.defaultsList
          // Define socket and attach it to our data object
          
          const $this  = this
          // this.socketReport = await new WebSocket(echoSocketUrl);
          this.socketReport.onopen = (basepath) => {
              console.log('Websocket connected for reports.');
          }
          this.socketReport.onclose = function(e) {
            // console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
            setTimeout(function() {
              $this.connectReport();
            }, 2000);
          };

          this.sockeReport.onerror = function(err) {
            // console.error('Socket encountered error: ', err.message, 'Closing socket');
            $this.connectedStatus = 'Disconnected Server, reattempting every 1 second. Check Logs and Network Settings'
            $this.socketReport.close();
          };
          this.socketReport.onmessage = (event) => {
          }
        },
        async resetRun(){
          this.topLevelSampleNames = {}
          this.samplesheetdata = []
          this.selectedsamplesAll = []
          this.selectedData = {}
        },
        async connect(){
          const socketProtocol = (window.location.protocol === 'https:' ? 'https:' : 'http:')
          const port = process.env.NODE_ENV == 'development' ? ':7689' : ':7689';
          // this.ext = process.env.VUE_APP_ext
          // this.compressed = process.env.VUE_APP_compressed
          const echoSocketUrl = socketProtocol + '//' + window.location.hostname + port
          // this.defaults = this.defaultsList
          // Define socket and attach it to our data object
          // set user id for local storage
          const userId = localStorage.getItem('userId') || this.generateUserId();
          console.log(`userId: ${userId}`)
          localStorage.setItem('userId', userId);


          this.socket = io(echoSocketUrl, {
            query: { userId }
          });
          const $this  = this
          // this.initiate()
        
        
        this.sendMessage({
          type: "getReportPath"          
        })
        
        this.sendMessage({
          type: "getRuns"          
        }) 
        this.sendMessage({
          type: "getDbs"          
        }) 
          this.socket.on("alert", (e)=>{
            // user swal alert for error
            this.$swal({
              text: e.message,
              button: "OK",
            });
          })
          this.socket.on("databaseStatus", (e)=>{
            // match the e.status.key with this.database.key and if match then set this.database.size to e.status.size
            let index = this.databases.findIndex(x => x.key === e.status.key)
            if (index > -1){
              
              this.$set(this.databases, index, e.status)
              // if this.database.key == e.status.key then set this.database.size to e.status.size
              if (this.database.key == e.status.key){
                this.$set(this.database, 'size', e.status.size)
                this.$set(this.database, 'downloading', e.status.downloading)
                this.$set(this.database, 'error', e.status.error)
              } 
            }

          })
          this.socket.on("databases", (e)=>{
            this.$set(this, 'databases', Object.values(e))
            if (this.databases.length > 0 && this.database.key == null){
              this.database = this.databases[0]
            }
            // find index where this.database.key  == key of this.databases and set this.database.size to size of that index
            let index = this.databases.findIndex(x => x.key === this.database.key)
            if (index > -1){
              this.$set(this.database, 'size', this.databases[index].size)
              this.$set(this.database, 'downloading', this.databases[index].downloading)
              this.$set(this.database, 'error', this.databases[index].error)
            }
          })
          this.socket.on('disconnect', function(e) {
            console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
          });
          this.socket.on('userSettings', function(e) {
            $this.gpu = e.gpu
          });


          this.socket.on('error', function(err) {
            console.error('Socket encountered error: ', err.message, 'Closing socket');
            $this.connectedStatus = 'Disconnected Server, reattempting every 1 second. Check Logs and Network Settings'
            $this.socket.close();
          });
          this.socket.on("connect_error", (err) => {
            console.error('Socket encountered error: ', err, 'Closing socket');
          });
          this.socket.on("connect_timeout", (err) => {
            console.error('Socket encountered error: ', err, 'Closing socket');
          });
          this.socket.on("sendQueueStatus", (e)=>{
            this.paused = e.isPaused
            // this.queueLength = e.length
          })
          $this.socket.on('connect', () => {
              console.log('Websocket connected.');
              $this.connectedStatus = 'Connected';
              
              if ($this.selectedRun){
                $this.sendMessage({
                  run: $this.selectedRun,
                  type: "getRunInformation", 
                })
              } 
              $this.sendMessage({
                type: "getStatus"       
              })
              
              $this.socket.on("runs", (e)=>{
                $this.runs = e;
                // get index of this.selectedRun and if in runs then set to that index otherwise set to first run
                if (!this.selectedRun){
                  this.selectedRun = e[0]
                } else if (e.indexOf(this.selectedRun) < 0 && e.length > 0){
                  this.selectedRun = e[0]
                } else if (e.length == 0){
                  this.selectedRun = null
                }
              })
              $this.socket.on("reportSavePath", (e)=>{
                this.reportSavePath = e.data
                // this.$refs.addRun.resetSavePath();
                
              })
              $this.socket.on("deletedSample", (e)=>{
                try{
                  console.log("Deleted Sample", e.samplename)
                  $this.deletesample(e.samplename)
                } catch (err){
                  console.error(err, sample, "Error in deleting sample")
                }
              })
              $this.socket.on("message", (e)=>{
              })
              $this.socket.on("queueDrop", (e)=>{
                // assume this is the entire set of sample queue records
                this.queueList = e.data
              }) 
              $this.socket.on("status", (e)=>{
                // assume this is the entire set of sample queue records
                // find queuelist sample and index and update status
                let sample = e.sample
                let index = e.index > 0 ? e.index : 0
                let status = e.status
                let config = e.config 
                if (!this.queueList[sample]){
                  this.$set(this.queueList, sample, [])
                }
                if (!this.queueList[sample][index]){
                  this.$set(this.queueList[sample], index, {})
                }
                this.$set($this.queueList[sample][index], 'status',  status)
                for (let key in config){
                  this.$set($this.queueList[sample][index], key, config[key])
                }
                $this.updateSampleStatus(sample)
              })
              
              $this.socket.on("sendPaths", (e)=>{
                this.pathOptions = e.data 
              })
              $this.socket.on("sendPaths1", (e)=>{
                this.pathOptions1 = e.data
              })
              $this.socket.on("sendPathsDb", (e)=>{
                this.pathOptionsDb = e.data
              })
              $this.socket.on("sendPaths2", (e)=>{
                this.pathOptions2 = e.data
              })
              $this.socket.on("queueJob", (e)=>{
                // assume this is the entire set of sample queue records
                // this.queueList[e.samplename] = e.queue
              })
              $this.socket.on("sampledata", async (e)=>{
                try{
                    // $this.queueList[e.samplename] = e.queue
                    await this.importData(e.data, e.samplename)
                } catch (err){
                  console.error(err)
                }
              }) 
              $this.socket.on("samplesheet", (e)=>{
                $this.samplesheet = e.samplesheet
              })
             
              $this.socket.on('runInformation', async (e)=>{
                $this.samplesheet = []
                if (e.reportdata && e.data != ''){
                  // $this.resetRun()
                  // $this.samplesheet = e.samplesheet
                  $this.$set($this, 'samplesheet', e.samplesheet)
                  // get the queuelist for all samples
                 
                  
                }
              })
             

              
             
              $this.socket.on("basepathserver",(e)=>{
                this.basepathserver = e.data;
              })
              $this.socket.on("paused",(e)=>{
                this.pausedServer=e.message
              })
              $this.socket.on("getbundleconfig",(e)=>{
                this.bundleconfig = e.data;
              })
              $this.socket.on("anyRunning", (e)=>{
                this.anyRunning = e.status
              })
              $this.socket.on('queueLength', (e)=>{
                this.queueLength = e.data
              }) 
              $this.socket.on('logs', (e)=>{
                this.logs.push(e.data)
                const lasts = this.logs.slice(-100);
                this.logs = lasts  
              } )
              $this.socket.on("data", (e)=>{
                if (e.run == $this.selectedRun ){
                  ( async ()=>{   
                    await $this.importData(e.data, e.samplename) 
                  }
                  )();
                }
              })
              $this.socket.emit("gpu", {type: "gpu", gpu: $this.gpu })
             
          })

         
          
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
          this.sendMessage({
                type: "runbundle", 
                config: this.runBundle,
                  "message" : `Run Bundle config updates ${this.runBundle} `
              }
          );
        },
        updateConfig(data, val){
          if (val =='kraken2'){
            this.sendMessage({
                  type: "updateConfig", 
                  config: data,
                  run: this.selectedRun,
                  "message" : `Config Updated for data, select restart run  next please `
                }
            );
          } 

        },
        filter(){
          let dataFull = {}
          const $this = this;
          this.selectedsamplesAll = this.selectedsamplesAll.map((obj)=>{
            let sample = obj.sample
            let data = $this.filterData(_.cloneDeep(obj.fullData))
            data = $this.parseData(data)
            obj.data = data 
            return obj
          })
        },
        async barcode(sample){
          this.sendMessage({
                type: "barcode", 
                sample: sample.sample,
                kits: sample.kits,
                dirpath: sample.path_1
            }
          );
        },
        async rerun(index, sample, run){
          this.sendMessage({
                type: "rerun", 
                run: run,
                overwrite: true,
                sample: sample,
                index: index,
                full: index > -1 ? false : true,
                "message" : `Begin rerun of ${sample}, job # ${index}`
            }
          );
        },
        async sendNewWatch(params){
          let restart = params.overwrite
          let sample = params.sample
          if (sample){ 
            this.sendMessage({
                  type: "restart", 
                  run: this.runName,
                  overwrite: restart,
                  sample: sample,
                  "message" : `Begin restart directory ${this.watchdir}, classify with ${this.database} `
              }
            );
          } else {
            this.sendMessage({
                  type: "start", 
                    samplesheet: this.samplesheetdata,
                    run: this.runName, 
                    overwrite: restart,
                    "message" : `Begin watching directory ${this.watchdir}, classify with ${this.database} `
                }
            );
          }
          
        },
        updateData(data){
          this.samplesheetdata = data
          this.sendMessage({
                  type: "start", 
                  samplesheet: this.samplesheetdata,
                  overwrite: false,
                  run: this.runName, 
                  "message" : `Begin watching directory ${this.watchdir}, classify with ${this.database} `
              }
          );
        },
        addDropFiles(e) {
          this.value = Array.from(e.dataTransfer.files);
          this.database_file = this.value[0].path
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
            let socket = this.socket 
            return new Promise((resolve, reject) => {
                const maxNumberOfAttempts = 10
                const intervalTime = 200 

                let currentAttempt = 0
                const interval = setInterval(() => {
                    if (currentAttempt > maxNumberOfAttempts - 1) {
                        clearInterval(interval)
                        reject(new Error('Maximum number of attempts exceeded.'));
                    } else if (socket.readyState === socket.OPEN) {
                        clearInterval(interval)
                        resolve()
                    }
                    currentAttempt++
                }, intervalTime)
            })
        },
        sendMessage: async function( message) {
            // We use a custom send message function, so that we can maintain reliable connection with the
            // websocket server.
            
            if (this.socket.readyState !== this.socket.OPEN) {
                try {
                    
                    await this.waitForOpenConnection()
                    this.socket.emit(message.type, message)
                } catch (err) { console.error(err) }
            } else {
              this.socket.emit(message.type, message)
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
            let v = ( f.taxid == -1 || this.defaults.indexOf(f.rank_code) > -1 && f.depth <= this.depthRange[1] && f.depth >= this.depthRange[0] && this.minPercent <= f.value/100 )
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
        addSample(sample, config){
          // check if object with sample attribute equals the sample , get index
          let indx = this.selectedsamplesAll.findIndex(x => x.sample === sample );
          // check if thisqueueList has sample if not then add it 
          
          this.sendMessage({
            type: "getStatus", 
            sample: sample,
            run: this.selectedRun,
            "message" : `Get Queue and Status/Info for ${sample} `
          });
          if (indx == -1){
            let s = {
              sample: sample,
              hidden: false,
              data: null, 
              status: {},
            }
            this.selectedsamplesAll.push(s)
            indx = this.selectedsamplesAll.length-1
          } 
          this.selectedsamplesAll[indx].config = config ? config : {}
          return 

        },
        async importData(information, sample){
          this.addSample( sample )
          let text = information
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

          let data = data != "" ? d3.tsvParseRows(text, (d)=>{
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
          }) : null
          if (data && data.length > 0){
            // this.fullsize[sample] = fullsize
            data.unshift(base)
            // this.fullData[sample] = data
            data = this.filterData(data)
            data = this.parseData(data)
            Object.keys(uniques).forEach((f)=>{
              if (this.defaultsList.indexOf(f)==-1){
                this.defaultsList.push(f)
              }
            })
            this.defaults = this.defaultsList
            let index = this.selectedsamplesAll.findIndex(x => x.sample === sample );
            if (index > -1){
              this.$set(this.selectedsamplesAll[index], 'fullData', data)
              this.$set(this.selectedsamplesAll[index], 'data', data)
            }
            return data 
          }
          
          
          
          
          
          
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
.v-main{
  padding-bottom: 0px !important;
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