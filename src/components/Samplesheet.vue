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
            height="200"
            :width="1000"
            :items-per-page="10" 
            class="elevation-1 mx-5 px-6"					        
        >	
            <template v-slot:footer>
                <v-row>
                    <v-col sm="4" id="fileinput"   @drop.prevent="addDropFile" @dragover.prevent >
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
                  <v-col sm="2">
                    <v-btn small type="info" @click="forceRestart()">
                      Restart Report Run
                    </v-btn>
                  </v-col>
                  <v-col sm="2">
                    <v-btn color="orange "
                          dark v-if="!paused" small type="warning" @click="paused = true">
                      Pause Updates
                    </v-btn>
                    <v-btn color="info "
                          dark v-else small  @click="paused = false">
                      Resume Updates
                    </v-btn>
                  </v-col>
                  <v-col sm="2">
                    <v-dialog
                      v-model="dialogAdvanced"
                    >
                      <template v-slot:activator="{ on, attrs }">
                        <v-btn
                          color="red lighten-2"
                          dark
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
                          <v-btn small type="info" @click="forceRestart()">
                            Restart Report Run
                          </v-btn>
                        </v-card-actions>
                      </v-card>
                    </v-dialog>
                    </v-col>
                </v-row>
            </template>
            <template v-slot:top>
                <v-toolbar
                    flat
                >
                    <v-toolbar-title>Samplesheet</v-toolbar-title>
                    
                    <v-divider
                    class="mx-4"
                    inset
                    vertical
                    ></v-divider>
                    <vue-json-to-csv 
                    :csv-title="CSVTITLE"
                    :json-data="dataSamples">
                        <v-btn>
                        Download CSV
                        </v-btn>
                    </vue-json-to-csv>
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
                        <v-btn
                        color="primary"
                        dark
                        class="mb-2"
                        v-bind="attrs"
                        v-on="on"
                        >
                        New Item
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
                            text
                            @click="closeItem"
                        >
                            Cancel
                        </v-btn>
                        <v-btn
                            color="blue darken-1"
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
                        <v-btn color="blue darken-1" text @click="closeDelete">Cancel</v-btn>
                        <v-btn color="blue darken-1" text @click="deleteItemConfirm">OK</v-btn>
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
                <v-tooltip left>
                    <template v-slot:activator="{ on, attrs }">
                        <v-icon
                            small color="indigo"
                            v-bind="attrs"
                            v-on="on"
                            @click="forceRestart(item)"
                        >
                            mdi-play-circle
                        </v-icon>
                    </template>
                    <span>Re-run the report</span>
                </v-tooltip>
            </template>
            <template v-slot:[`item.report`]="{ item }">
                <v-progress-circular
                    indeterminate v-if="current && typeof current == 'object' && current[item.sample]"
                    color="primary" small size="30"
                ></v-progress-circular>
                <v-icon
                    small  v-else
                    :color="seen && seen.indexOf(item.sample) > -1 ? 'green': 'orange'"
                >
                    {{seen && seen.indexOf(item.sample) > -1 ? 'mdi-check-circle' : 'mdi-times-circle' }}
                </v-icon>
                
                    
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
            v-bind="attrs"
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
    props: ["samplesheet", 'samplesheetName', 'seen', 'current'],
    components: {
        VueJsonToCsv,
        
    },
    watch: {
      dialog (val) {
        val || this.closeItem()
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
            platform: null,
          },
          defaultItem: {
            sample: '',
            path_1: null,
            path_2: null,
            format: null,
            database: null,
            platform: null,
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
            
        ],
      }
    },
    async mounted() {
        this.config['memory-mapping']=false
        this.config['gzip-compressed'] = false
        this.config['bzip2-compressed'] = false
        this.config['minimum-hit-groups'] = false
        this.config['report-minimizer-data'] = false
        this.config['report-zero-counts'] = false
        this.config['quick'] = false
        this.config['threads'] = 1
        this.config['confidence'] = 0
        this.config['minimum-base-quality'] = 0
        this.dataSamples = this.samplesheet
    },
 
    methods: {
        
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
            this.editedIndex = this.data.indexOf(item)
            this.editedItem = Object.assign({}, item)
            this.dialogDelete = true
        },
        deleteItemConfirm () {
            this.data.splice(this.editedIndex, 1)
            this.closeDelete()
        },
        editItem (item) {
            this.editedIndex = this.data.indexOf(item)
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
                Object.assign(this.data[this.editedIndex], this.editedItem)
            } else {
                this.data.push(this.editedItem)
            }
            this.closeItem()
        },
    
    }
    
    
  };
</script>
<style>
 
</style>