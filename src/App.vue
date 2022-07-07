<template>
  <v-app  >
      <v-app-bar
        app
        color="light"
        class="elevation-26 mx-0 px-0" 

        dark
        dense
        prominent
      >
        <v-app-bar-nav-icon @click="drawer = true"></v-app-bar-nav-icon>
        <v-toolbar-title>Real Time Nanopore Report Analysis</v-toolbar-title>
      </v-app-bar> 
        <v-spacer></v-spacer>
        <v-navigation-drawer
          v-model="drawer"
          absolute
          temporary
        >
          <v-list
            nav
            dense
          >
            <v-list-item-group
              v-model="tab"
              active-class="deep-purple--text text--accent-4"
            >
              <v-list-item  v-for="(tabItem, key) in tabs"  :key="`${key}-tab`">
                <v-icon class="mr-2">
                  mdi-{{tabItem.icon}}
                </v-icon>
                {{tabItem.name}}
              </v-list-item>
            </v-list-item-group>
          </v-list>
          <h2>Welcome to Websockets</h2>
          <p>You are: {{ connectedStatus }}</p>
          <p>Your message is: {{ message }}</p>
        </v-navigation-drawer>
      <v-main class=" ">
        <v-container class="mx-2  px-2 " style="margin-right: 0px">
            <v-row>
              <v-col sm="12">
                <Samplesheet
                  :samplesheet="samplesheetdata"
                  :seen="samplekeys"
                  :current="current"
                  @sendNewWatch="sendNewWatch"
                  @updateData="updateData"
                  :samplesheetName="samplesheet"
                >
                </Samplesheet>
              </v-col>
              <v-col   sm="3">
                <v-sheet class="fill-width scroll " style="max-height:80vh; overflow: auto;">
                  
                  <v-spacer class="py-4"></v-spacer>
                  <v-select
                    :items="samplekeys"
                    v-model="selectedsample"
                    label="Selected Sample"
                  >
                  </v-select>
                  <v-spacer class="py-4"></v-spacer>
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
                  <v-spacer class="py-4"></v-spacer>
                  <v-select
                    label="Tax Rank Codes"
                    v-model="defaults" multiple
                    :items="defaultsList"
                    item-text="value"
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
                  <v-spacer class="py-4">
                  </v-spacer>
                  
                  <v-spacer>
                  </v-spacer>
                </v-sheet>
              </v-col>
              <v-col
                  sm="9"
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
                              :inputdata="inputdata"
                              :sampledata="sampledata[selectedsample]"
                              :selectedsample="selectedsample"
                              :jsondata="jsondata"
                              :socket="socket"
                              :playbackdata="playbackdata"
                          >
                          </component>

                      </v-container>
                  </v-tab-item>


                  </v-tabs-items>
                  <v-alert v-if="logs[logs.length-1]"  border="left" text color="info" style="height: 100px; overflow:auto; ">
                    <v-row align="center">
                      <v-col class="grow">
                          <div>{{logs[logs.length-1].message}}</div>
                      </v-col>
                      <v-col align="top" class="shrink">
                        <v-btn @click="sheet = true">Show Full</v-btn>
                      </v-col>
                    </v-row>
                  </v-alert>  
                  <v-bottom-sheet
                    v-model="sheet"
                    inset
                  >
                    <v-sheet
                      class="text-left logDiv mx-0"
                      max-height="700px"
                      min-height="180px"
                      style="overflow:auto"
                    >
                      <div class="py-10 pl-4 mx-0">
                        <span v-for="(row,index) in logs" :key="'sheet'+index">
                          <v-icon
                            dark v-if="row.level == 'error'"
                            left color="red"
                          >
                            mdi-alert-circle-outline
                          </v-icon>
                          <v-icon
                            dark v-else
                            left color="blue"
                          >
                            mdi-information
                          </v-icon>
                            {{row.message}}
                          <br>
                        </span>
                      </div>
                      
                    </v-sheet>
                    <v-btn
                        color="red" dark v-if="scroll"
                        icon-and-text @click="scroll = false"
                      >
                        Pause Autoscroll
                        <v-icon>
                          mid-cancel
                        </v-icon>
                      </v-btn>
                      <v-btn v-else
                        color="blue" dark
                        icon-and-text @click="scroll = true"
                      >
                        Autoscroll
                        <v-icon>
                          mid-play
                        </v-icon>
                      </v-btn>
                  </v-bottom-sheet>
                    <!-- <code v-for="row in logs" :key="row">{{row.message}}<br></code> -->
                    
                  
              </v-col>
            </v-row>
        </v-container>
      </v-main>
      
      
  </v-app>
</template>

<script>
import Plates from "@/components/Plates"
import * as d3 from 'd3'
import Samplesheet from "@/components/Samplesheet"
import RunStats from "@/components/RunStats"
import SampleStats from "@/components/SampleStats"
import Data from "@/components/Data"
import Map from "@/components/Map"
import _ from 'lodash'

export default {
    name: 'App',
    components: {
      Plates, 
      Samplesheet,
      RunStats,
      SampleStats,
      Data,
      Map,
    },
    computed: {
     
      icon () {
        if (this.selectedAllRanks) return 'mdi-close-box'
        if (this.selectedSomeRanks) return 'mdi-minus-box'
        return 'mdi-checkbox-blank-outline'
      },
      selectedAllRanks () {
        return this.defaultsList.length === this.defaults.length
      },
      selectedSomeRanks () {
        return this.defaults.length > 0 && !this.selectedAllRanks
      },
    },
    updated: function(){
      const $this = this;
      this.$nextTick(()=>{
        if ($this.$el.querySelector && $this.$el.querySelector('.logDiv')){
          this.scroll ? this.$el.querySelector('.logDiv').scrollTop = this.$el.querySelector('.logDiv').scrollHeight : ''
        }
      })
    },
    data() {
        return {
            socket: {},
            scroll:true,
            config: {},
            current: {},
            seen: [],
            samplekeys: [],
            database_file: null,
            db_option: "file",
            db_options: [
              "file",
              "path"
            ],
            stagedData: {},
            paused: false,
            dialog: false,
            drawer: false,
            sheet:false,
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
            
            nodeCountMax: 0,
            defaults: ['K','R', 'R1', "U", 'P', "G", 'D', 'O','C','S','F','S1','S2','S3', 'S4'],
            defaultsList: ['U','K', 'P', 'D','G', 'O','C','S','F','S2','S1','S2','S3', 'S4'],
            maxDepth: 20,
            samplesheetdata: [],
            samplesheet: null,
            minDepth: 0,
            minPercent: 0.08, 
            jsondata: null, 
            matchPaired: ".*_[1-2].fastq.gz",
            logs: [], 
            matchSingle: ".*fastq",
            ext: ".fastq", 
            compressed: false,
            filepath: "sample_metagenome.second.report",
            tab: 0, 
            tabs: [
                {
                name: 'Run Stats',
                icon: "square",
                component: "RunStats"
                },
                {
                name: 'History Mode',
                icon: "dna",
                component: "SampleStats"
                },
                {
                name: 'Data Output',
                icon: "pencil",
                component: "Data"
                },
                
                {
                name: 'Map',
                icon: "map",
                component: "Map"
                },
            ]
        }
    },
    watch: {
      maxDepth(){
        let data = this.filterData(this.fullData[this.selectedsample])
        data = this.parseData(data)
        this.sampledata[this.selectedsample] = data
      },
      paused(newValue){
        if (!newValue){
          let keys = Object.keys(this.stagedData)
          if (!this.selectedsample && keys.length > 0){
            this.selectedsample = keys[0]
          }
          this.sampledata[this.selectedsample] = this.stagedData[this.selectedsample]
        }
      },
      minDepth(){
        let data = this.filterData(this.fullData[this.selectedsample])
        data = this.parseData(data)
        this.sampledata[this.selectedsample] = data
      },
      defaults(){
        let data = this.filterData(this.fullData[this.selectedsample])
        data = this.parseData(data)
        this.inputdata=data        
      },
      minPercent(){
        let data = this.filterData(this.fullData[this.selectedsample])
        data = this.parseData(data)
        this.sampledata[this.selectedsample] = data
      },
      
    },
    async mounted() {
        // Calculate the URL for the websocket. If you have a fixed URL, then you can remove all this and simply put in
        // ws://your-url-here.com or wss:// for secure websockets.
        const socketProtocol = (window.location.protocol === 'https:' ? 'wss:' : 'ws:')
        const port = ':3000';
        let samplesheet = `${process.env.BASE_URL}/data/Samplesheet.csv`.replace("//",'/')
        let data = await d3.csv(`${samplesheet}`)
        this.samplesheet = samplesheet
        this.samplesheetdata = data
        
        
        // this.matchPaired = process.env.VUE_APP_paired_string
        // this.matchSingle = process.env.VUE_APP_single_string
        
        // this.ext = process.env.VUE_APP_ext
        // this.compressed = process.env.VUE_APP_compressed
        const echoSocketUrl = socketProtocol + '//' + window.location.hostname + port + '/ws'
        // this.defaults = this.defaultsList
        // Define socket and attach it to our data object
        this.socket = await new WebSocket(echoSocketUrl); 
        // When it opens, console log that it has opened. and send a message to the server to let it know we exist
        this.socket.onopen = () => {
            console.log('Websocket connected.');
            this.connectedStatus = 'Connected';

            

            this.sendMessage(JSON.stringify({type: "message", "message" : "Hello, server."}));
            // this.sendNewWatch()
            this.sendMessage(JSON.stringify({type: "start", samplesheet: this.samplesheetdata, overwrite: false }));
            // this.sendMessage(JSON.stringify({type: "playback", target: "/Users/merribb1/Documents/Projects/real-time-reporting/data/playback", "message" : "Begin watching"}));
        }
        // When we receive a message from the server, we can capture it here in the onmessage event.
        this.socket.onmessage = (event) => {
            // We can parse the data we know to be JSON, and then check it for data attributes
            let parsedMessage = JSON.parse(event.data);
            // If those data attributes exist, we can then console log or show data to the user on their web page.
            if (parsedMessage.type == 'data'){
              // this.jsondata = JSON.parse(parsedMessage.data)
              ( async ()=>{
                if (!this.selectedsample){
                  this.selectedsample = parsedMessage.samplename
                }
                let data  = await this.importData(parsedMessage.data)
                if (!this.selectedsample){
                  this.selectedsample = parsedMessage.samplename
                }
                if (!this.paused){
                  this.stagedData[parsedMessage.samplename] = data
                  this.sampledata[parsedMessage.samplename] = data
                } else {
                  this.stagedData[parsedMessage.samplename] = data
                }
                this.samplekeys = Object.keys(this.sampledata)
                
              })().catch((Err)=>{
                console.error(Err)
              })
                
            } else if (parsedMessage.type == 'playback'){
              this.playbackdata = parsedMessage.message;
            } else if (parsedMessage.type == 'logs'){
              this.logs.push(parsedMessage.data)
            } else if (parsedMessage.type == 'config'){
              this.config = parsedMessage.message
            } else if (parsedMessage.type == 'reads'){
              this.reads = parsedMessage.message
            } else if (parsedMessage.type == 'current'){
              this.$set(this.current, parsedMessage.current, parsedMessage.running)
            }
            else{
              this.message = parsedMessage.message;
            }
           
        }

    },
    methods: {
        async sendNewWatch(params){
          let restart = params.overwrite
          let sample = params.sample
          this.sampledata = {}
          this.stagedData = {}
          this.samplekeys = []
          if (sample){
            this.sendMessage(JSON.stringify({
                  type: "restart", 
                  overwrite: restart,
                  sample: sample,
                  "message" : `Begin watching directory ${this.watchdir}, classify with ${this.database} `
              }
            ));
          } else {
            console.log("else")
            this.sendMessage(JSON.stringify({
                  type: "start", 
                    samplesheet: this.samplesheetdata,
                    overwrite: restart,
                    "message" : `Begin watching directory ${this.watchdir}, classify with ${this.database} `
                }
            ));
          }
          
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
          console.log("e", e, this.value[0])
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
            let v = ( f.taxid == -1 || this.defaults.indexOf(f.rank_code) > -1 && f.depth <= this.maxDepth && f.depth >= this.minDepth && this.minPercent <= f.value )
            
            
            return  v
          })
          return data
        },
        async importData(information, type){
          let text;
          
          if (type == 'file'){
            text = await d3.text(information)
          } else {
            text = information
          }
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
            let found = d[5].search(/\S/);
            found = found / 2
            d[5] = d[5].trim()
            
            let size = 0
            let data = {
              value: parseFloat(d[0]),
              num_fragments_clade: parseInt(d[1]),
              num_fragments_assigned: parseInt(d[2]),
              rank_code: d[3],
              taxid: d[4],
              size: size ,
              target: ( d[5] ? `${d[5]}` : "root" ),
              source: null,
              depth: found
            }
            if ( found == 0  ){
              base.value += parseFloat(data.value)
              base.num_fragments_clade+= parseInt(data.num_fragments_clade)
            }
            
            uniques[d[3]] = 1
            
            return data
          })
       
          
          data.unshift(base)
          this.fullData[this.selectedsample] = data
          data = this.filterData(data)
          data = this.parseData(data)

          this.defaultsList = Object.keys(uniques)
          return data 
          
          
          
          
          
      },
    }
}
</script>

<style>
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
</style>