<!--
  - # **********************************************************************
  - # Copyright (C) 2020 Johns Hopkins University Applied Physics Laboratory
  - #
  - # All Rights Reserved.
  - # For any other permission, please contact the Legal Office at JHU/APL.
  -
  - # Licensed under the Apache License, Version 2.0 (the "License");
  - # you may not use this file except in compliance with the License.
  - # You may obtain a copy of the License at
  -
  - #    http://www.apache.org/licenses/LICENSE-2.0
  -
  - # Unless required by applicable law or agreed to in writing, software
  - # distributed under the License is distributed on an "AS IS" BASIS,
  - # WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  - # See the License for the specific language governing permissions and
  - # limitations under the License.
  - # **********************************************************************
  -->


<template>
    <v-row>
      
      <v-data-table
            small v-if="dataSamples"
            :items="dataSamples"
            :headers="headers"
            height="400"
            group-by="run"
            show-group-by
            :width="1000"
            :items-per-page="10" 
            class="elevation-1 mx-5 px-6"					        
        >	
            <template v-slot:footer>
                <v-row>
                    <v-col sm="3" id="fileinput"   @drop.prevent="addDropFile" @dragover.prevent >
                        <v-file-input
                            :width="'100px'"
                            v-model="name" 
                            :hint="samplesheetName"
                            persistent-hint counter show-size overlap
                        >
                        </v-file-input>
                        <v-subheader>
                        </v-subheader>
                    </v-col>
                    <v-col sm="9">
                        <v-alert v-if="logs[logs.length-1]"  border="left" text color="info" style="height: 100px; padding-right: 10px; overflow:auto; ">
                            <v-row align="center">
                            <v-col class="grow">
                                <span class="text-sm-body-2">{{logs[logs.length-1].message}}</span>
                            </v-col>
                            <v-col align="top" class="shrink">
                                <v-btn  x-small @click="sheet = true">Show Full</v-btn>
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
                    </v-col>
                </v-row>
            </template>
            <template v-slot:top>
                <v-toolbar
                    flat class="my-10"
                >
                    
                    <vue-json-to-csv  v-if="dataSamples.length > 0"
                    :csv-title="CSVTITLE"
                    :json-data="dataSamples">
                        <v-btn  x-small>
                        Download CSV
                        </v-btn>
                    </vue-json-to-csv>
                    <v-alert type="warning"
                        v-else
                    > Your Datasheet is Empty, please add rows manually or upload your own Samplesheet.csv file
                    </v-alert>
                    <v-divider
                        class="mx-4"
                        inset
                        vertical
                    ></v-divider>
                    
                    <v-spacer></v-spacer>
                    <v-dialog
                    v-model="dialog"
                    max-width="500px"
                    >
                    <template v-slot:activator="{ on, attrs }">
                        <v-dialog
                            v-model="dialogAdvanced"
                        >
                            <template v-slot:activator="{ on, attrs }">
                                <v-btn
                                    color="red lighten-2"
                                    dark  x-small
                                    class="mb-2"
                                    v-bind="attrs"
                                    v-on="on"
                                >
                                    Advanced
                                </v-btn>
                            </template>

                            <v-card>
                                <v-card-title class="text-h5 grey lighten-2">
                                Kraken2 Advanced commands
                                </v-card-title>
                                <v-list>
                                <v-list-item
                                    v-for="[key,value] of Object.entries(config)" :key="`${key}-advancedkraken2`"

                                >
                                    <v-checkbox 
                                    v-if="typeof value == 'boolean'"
                                    v-model="config[key]" :label="`--${key}?`"
                                    >
                                    </v-checkbox>
                                    <v-text-field v-model="config[key]" type="number" :label="`--${key}`" v-else-if="typeof value == 'number'" >
                                    </v-text-field>
                                    <v-text-field v-model="config[key]" v-else :label="`--${key}`">
                                    </v-text-field>
                                </v-list-item>

                                </v-list>
                                <v-card-actions>
                                <v-btn small type="info"  x-small @click="updateConfig()">
                                    Update Config
                                </v-btn>
                                </v-card-actions>
                            </v-card>
                        </v-dialog>
                        <v-btn
                            color="primary"
                            dark  x-small
                            class="mb-2"
                            v-bind="attrs"
                            v-on="on"
                            >
                            New Item
                        </v-btn>
                        <v-spacer>
                        </v-spacer>
                        <v-btn  class="mb-2" color="info"  x-small @click="forceRestart()">
                            Restart Report Run
                        </v-btn>
                        <v-btn color="primary "
                                dark   x-small
                                class="mb-2"
                                @click="flush()">
                            Flush
                        </v-btn>
                        <v-btn color="orange "
                                dark   x-small
                                v-if="!paused" 
                                class="mb-2"
                                @click="paused = true">
                            Pause Updates
                        </v-btn>
                        <v-btn color="secondary"  x-small
                                dark v-else   class="mb-2" @click="paused = false">
                            Resume Updates
                        </v-btn>
                    </template>
                    <v-card>
                        <v-card-title>
                        <span class="text-h5">{{ formTitle }}</span>
                        </v-card-title>

                        <v-card-text>
                        <v-container>
                            <v-row>
                            <v-col
                                cols="12"
                                sm="6"
                                md="4"
                            >
                                <v-text-field
                                v-model="editedItem.sample"
                                label="Sample Name"
                                ></v-text-field>
                            </v-col>
                            <v-col
                                cols="12"
                                sm="6"
                                md="4"
                            >
                                <v-text-field
                                v-model="editedItem.path_1"
                                label="Path 1"
                                ></v-text-field>
                            </v-col>
                            <v-col
                                cols="12"
                                sm="6"
                                md="4"
                            >
                                <v-text-field
                                v-model="editedItem.path_2"
                                label="Path 2"
                                ></v-text-field>
                            </v-col>
                            <v-col
                                cols="12"
                                sm="6"
                                md="4"
                            >
                                <v-text-field
                                v-model="editedItem.database"
                                label="Database"
                                ></v-text-field>
                            </v-col>
                            <v-col
                                cols="12"
                                sm="6"
                                md="4"
                            >
                                <v-select
                                    v-model="editedItem.format"
                                    :items="['file', 'directory']"
                                    label="Type/Format"
                                ></v-select>
                            </v-col>
                            <v-col
                                cols="12"
                                sm="6"
                                md="4"
                            >
                                <v-select
                                    v-model="editedItem.compressed"
                                    :items="['TRUE', 'FALSE']"
                                    label="Compressed"
                                ></v-select>
                            </v-col>
                            <v-col
                                cols="12"
                                sm="6"
                                md="4"
                            >
                                <v-select
                                    v-model="editedItem.platform"
                                    :items="['oxford', 'illumina']"
                                    label="Platform"
                                ></v-select>
                            </v-col>
                            </v-row>
                        </v-container>
                        </v-card-text>

                        <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn
                            color="blue darken-1"
                            text  x-small
                            @click="closeItem"
                        >
                            Cancel
                        </v-btn>
                        <v-btn
                            color="blue darken-1"  x-small
                            text
                            @click="saveItem"
                        >
                            Save
                        </v-btn>
                        </v-card-actions>
                    </v-card>
                    </v-dialog>
                    <v-dialog v-model="dialogDelete" max-width="500px">
                    <v-card>
                        <v-card-title class="text-h5">Are you sure you want to delete this item?</v-card-title>
                        <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn  x-small color="blue darken-1" text @click="closeDelete">Cancel</v-btn>
                        <v-btn  x-small color="blue darken-1" text @click="deleteItemConfirm">OK</v-btn>
                        <v-spacer></v-spacer>
                        </v-card-actions>
                    </v-card>
                    </v-dialog>
                </v-toolbar>
                </template>

            <template v-slot:[`item.sample`]="{ item }">
                <v-edit-dialog
                :return-value.sync="item.sample"
                @save="save"
                @cancel="cancel"
                @open="open"
                @close="close"
                >
                {{ item.sample }}
                <template v-slot:input>
                    <v-text-field
                    v-model="item.sample"
                    
                    label="Edit"
                    single-line
                    counter
                    ></v-text-field>
                </template>
                </v-edit-dialog>
            </template>
            <template v-slot:[`item.path_2`]="{ item }">
                <v-edit-dialog
                :return-value.sync="item.path_2"
                large
                persistent
                @save="save"
                @cancel="cancel"
                @open="open"
                @close="close"
                >
                <div>{{ item.path_2 }}</div>
                <template v-slot:input>
                    <div class="mt-4 text-h6">
                    Update Path 2
                    </div>
                    <v-text-field
                    v-model="item.path_2"
                    label="Edit"
                    single-line
                    counter
                    autofocus
                    ></v-text-field>
                </template>
                </v-edit-dialog>
            </template>
            <template v-slot:[`item.path_1`]="{ item }">
                <v-edit-dialog
                :return-value.sync="item.path_1"
                large
                :rules="[containsPlatform]"
                persistent
                @save="save"
                @cancel="cancel"
                @open="open"
                @close="close"
                >
                <div>{{ item.path_1 }}</div>
                <template v-slot:input>
                    <div class="mt-4 text-h6">
                    Update Path 1
                    </div>
                    <v-text-field
                    v-model="item.path_1"
                    label="Edit"
                    single-line
                    counter
                    autofocus
                    ></v-text-field>
                </template>
                </v-edit-dialog>
            </template>
            <template v-slot:[`item.demux`]="{ item }">
                <v-switch v-model="item.demux"> </v-switch>
            </template>
            <template v-slot:[`item.database`]="{ item }">
                <v-edit-dialog
                :return-value.sync="item.database"
                large
                persistent
                @save="save"
                @cancel="cancel"
                @open="open"
                @close="close"
                >
                    <div>{{ item.database }}</div>
                    <template v-slot:input>
                        <div class="mt-4 text-h6">
                        Update Database Path for Kraken2
                        </div>
                        <v-text-field
                        v-model="item.database"
                        label="Edit"
                        single-line
                        counter
                        autofocus
                        ></v-text-field>
                    </template>
                </v-edit-dialog>
            </template>
            <template v-slot:[`item.format`]="{ item }">
                <v-edit-dialog
                :return-value.sync="item.format"
                large
                persistent
                :rules="[containsFormat]"
                @save="save"
                @cancel="cancel"
                @open="open"
                @close="close"
                >
                    <div>{{ item.format }}</div>
                    <template v-slot:input>
                        <div class="mt-4 text-h6">
                        Update Format
                        </div>
                        <v-select
                            v-model="item.format"
                            :items="['file', 'directory']"
                            label="Edit"
                            single-line
                            counter
                            autofocus
                        ></v-select>
                    </template>
                </v-edit-dialog>
            </template>
            <template v-slot:[`item.compressed`]="{ item }">
                <v-edit-dialog
                :return-value.sync="item.compressed"
                large
                persistent
                @save="save"
                @cancel="cancel"
                @open="open"
                @close="close"
                >
                    <div>{{ item.compressed }}</div>
                    <template v-slot:input>
                        <div class="mt-4 text-h6">
                        Update Compressed Status
                        </div>
                        <v-select
                            v-model="item.compressed"
                            :items="['TRUE', 'FALSE']"
                            label="Edit"
                            single-line
                            counter
                            autofocus
                        ></v-select>
                    </template>
                </v-edit-dialog>
            </template>
            <template v-slot:[`item.platform`]="{ item }">
                <v-edit-dialog
                :return-value.sync="item.platform"
                large
                persistent
                :rules="[containsPlatform]"
                @save="save"
                @cancel="cancel"
                @open="open"
                @close="close"
                >
                    <div>{{ item.platform }}</div>
                    <template v-slot:input>
                        <div class="mt-4 text-h6">
                        Update Platform type
                        </div>
                        <v-select
                            v-model="item.platform"
                            :items="['oxford', 'illumina']"
                            label="Edit"
                            single-line
                            counter
                            autofocus
                        ></v-select>
                    </template>
                </v-edit-dialog>
            </template>
            <template v-slot:[`item.actions`]="{ item }">
                <v-icon
                    small
                    class="mr-2" color=""
                    @click="editItem(item)" 
                >
                    mdi-pencil 
                </v-icon>
                <v-icon
                    small class="mr-2" color="orange"
                    @click="deleteItem(item)"
                >
                    mdi-delete
                </v-icon>
                
                <v-tooltip   left>
                    <template v-slot:activator="{ on, attrs }">
                        <v-icon
                            small color="indigo"
                            v-bind="attrs"
                            v-on="on"
                            @click="forceRestart(item)"
                        >
                            {{ !item.demux ? `mdi-play-circle` : `mdi-view-week` }}
                        </v-icon>
                    </template>
                    <span>{{ !item.demux ? `Re-run the report` : `Barcode and Report` }} </span>
                </v-tooltip>
                <!-- <v-tooltip v-if="item.demux" left>
                    <template v-slot:activator="{ on, attrs }">
                        <v-icon
                            small color="indigo"
                            v-bind="attrs"
                            v-on="on" 
                            @click="barcode(item)"
                        >
                            mdi-view-week
                        </v-icon>
                    </template>
                    <span>Barcode</span>
                </v-tooltip> -->
            </template>
            <template v-slot:[`item.report`]="{ item }">
                <v-progress-circular
                    indeterminate v-if="current && typeof current == 'object' && current[item.sample]"
                    color="primary" small size="30"
                ></v-progress-circular>
                <v-icon
                    small  v-else-if="item.format !=='run'"
                    :color="seen && seen.indexOf(item.sample) > -1 ? 'green': 'orange'"
                >
                    {{seen && seen.indexOf(item.sample) > -1 ? 'mdi-check-circle' : 'mdi-exclamation' }}
                </v-icon>
                <v-subheader v-else>
                    Barcodes
                </v-subheader>
                
                    
            </template>
        </v-data-table>
        <v-snackbar
            v-model="snack"
            :timeout="3000"
            :color="snackColor"
        >
        {{ snackText }}

        <template v-slot:action="{ attrs }">
            <v-btn
            v-bind="attrs" x-small
            text
            @click="snack = false"
            >
            Close
            </v-btn>
        </template>
        
        </v-snackbar>
    </v-row>
      
      
</template>

<script>
  import VueJsonToCsv from 'vue-json-to-csv'
  import * as d3 from 'd3'

  export default {
    name: 'Samplesheet',
    props: ["samplesheet", 'samplesheetName', 'seen', 'current', 'logs'],
    components: {
        VueJsonToCsv,
        
    },
    updated: function(){
      const $this = this;
      this.$nextTick(()=>{
        if ($this.$el.querySelector && $this.$el.querySelector('.logDiv')){
          this.scroll ? this.$el.querySelector('.logDiv').scrollTop = this.$el.querySelector('.logDiv').scrollHeight : ''
        }
      })
    },
    watch: {
      dialog (val) {
        val || this.closeItem()
      },
      paused(val){
          this.$emit("pausedChange", val)
      },
      current: {
          deep:true,
          handler(val){
              console.log("handler", val)
          }
      },
      stagedData (val){
          let filtered = []
          for (let [key, value] of Object.entries(val)){
              if (key !== 'columns'){
                  filtered.push(value)
              }
          }
          this.$emit("updateData", filtered)
      },
      name( val ){
          const $this = this;
          let reader = new FileReader();  
          reader.addEventListener("load", parseFile, false);
          reader.readAsText(val);
          async function parseFile(){
            $this.stagedData = await d3.csvParse(reader.result)
            $this.stagedData = $this.stagedData.filter((f)=>{
                return f.sample && f.sample != ''
            })
          }
      },
      dialogDelete (val) {
        val || this.closeDelete()
      },
      samplesheet(val){
          this.dataSamples = val
      },
      
    }, 
    computed: {
      formTitle () {
        return this.editedIndex === -1 ? 'New Item' : 'Edit Item'
      },
    },
    data(){
      return {
          CSVTITLE: "Mytax2Report",
          snack: false,
          name: null,
          scroll:true,
          sheet:false,
          stagedData: [],
          config: {},
          paused: false,
          dialogAdvanced: false,
          snackColor: '',
          editedItem: {
            sample: '',
            path_1: null,
            path_2: null,
            format: null,
            database: null,
            kits: null,
            pattern: "",
            platform: null,
          },
          defaultItem: {
            sample: '',
            path_1: null,
            path_2: null,
            format: null,
            database: null,
            platform: null,
            kits: null,
            pattern: ""
          },
          dataSamples: [],
          editedIndex: -1,
          dialog: false,
          dialogDelete: false,
          snackText: '',
          containsPlatform: v => (v=='oxford' || v == 'illumina' ) || 'Must be oxford or illumina! (case sensitive)',
          containsFormat: v => (v=='fil2e' || v == 'directory') || 'Must be file or directory! (case sensitive)',
          headers: [
            {
                text: "Report Available",
                value: "report",
                align:"center"  ,              
                sortable: false
            },
            {
                text: "Actions",
                value: "actions",
                align:"center"  ,              
                sortable: false
            },
            {
                text: "Demultiplex?",
                value: 'demux',
                sortable: false,
                align:"center"                
            },
            {
                text: "Sample Name",
                value: "sample",
                sortable: true,
                align:"center"                
            },
            {
                text: "Path 1",
                value: "path_1",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Path 2",
                value: "path_2",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Format",
                value: "format",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Platform",
                value: "platform",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Kraken2 Database",
                value: "database",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Compressed (gz)",
                value: "compressed",
                sortable: false,
                align:"center"                
            },
            {
                text: "Pattern to match barcodes",
                value: "pattern",
                sortable: false,
                align:"center"                
            },
            {
                text: "Barcode Kits",
                value: "kits",
                sortable: false,
                align:"center"                
            },
            
            
            
        ],
      }
    },
    async mounted() {
        this.config['memory-mapping']=true
        this.config['gzip-compressed'] = false
        this.config['bzip2-compressed'] = false
        this.config['minimum-hit-groups'] = false
        this.config['report-minimizer-data'] = false
        this.config['report-zero-counts'] = false
        this.config['quick'] = false
        // this.config['threads'] = 1
        this.config['confidence'] = 0
        this.config['minimum-base-quality'] = 0
        this.dataSamples = this.samplesheet
    },
 
    methods: {
        updateConfig(){
            this.$emit("updateConfig", this.config)
        },
        barcode(item){
            this.$emit("barcode", item)
        },
        flush(){
            this.$emit("sendMessage", JSON.stringify({type: "flush" }));
            
        },
        async forceRestart(sample){
          this.$emit("sendNewWatch", {
              overwrite: true,
              sample: sample
          })
        },
        
        addDropFile(e) { 
            this.name = e.dataTransfer.files[0]; 
        },
        save () {
            this.snack = true
            this.snackColor = 'success'
            this.snackText = 'Data saved'
        },
        cancel () {
            this.snack = true
            this.snackColor = 'error'
            this.snackText = 'Canceled'
        },
        open () {
            this.snack = true
            this.snackColor = 'info'
            this.snackText = 'Dialog opened'
        },
        close () {
            console.log('Dialog closed')
        },
        deleteItem (item) {
            this.editedIndex = this.dataSamples.indexOf(item)
            this.editedItem = Object.assign({}, item)
            this.dialogDelete = true
        },
        deleteItemConfirm () {
            this.dataSamples.splice(this.editedIndex, 1)
            this.closeDelete()
        },
        editItem (item) {
            this.editedIndex = this.dataSamples.indexOf(item)
            this.editedItem = Object.assign({}, item)
            this.dialog = true
        },
        closeItem () {
            this.dialog = false
            this.$nextTick(() => {
            this.editedItem = Object.assign({}, this.defaultItem)
            this.editedIndex = -1
            })
        },
        closeDelete () {
            this.dialogDelete = false
            this.$nextTick(() => {
            this.editedItem = Object.assign({}, this.defaultItem)
            this.editedIndex = -1
            })
        },
        saveItem () {
            if (this.editedIndex > -1) {
                Object.assign(this.dataSamples[this.editedIndex], this.editedItem)
            } else {
                this.dataSamples.push(this.editedItem)
            }
            this.closeItem()
        },
    
    }
    
    
  };
</script>
<style>
 
</style>