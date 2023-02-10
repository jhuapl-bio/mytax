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
    <v-row >
        <v-col sm="12" >
            
            <v-data-table
                :items="samples"
                :headers="headers"
                :calculate-widths=true
                max-height="500" 
                fixed-header
                item-key="sample"
                class="elevation-1 mx-5 px-6 "					        
            >	                
                <template v-slot:top >
                    <v-toolbar  extended 
                        extension-height="8" class="pt-2" >
                        <template v-slot:extension height="30px" class="">
                            
                            <v-progress-linear
                                :active="anyRunning "
                                :indeterminate="true" top
                                stream  
                                color="primary darken-3"
                            ></v-progress-linear>
                        </template>
                        <vue-json-to-csv  v-if="dataSamples.length > 0"
                            :csv-title="CSVTITLE"
                            :json-data="dataSamples">
                            <v-tooltip  >
                                <template v-slot:activator="{ on }">
                                    <v-btn fab dark  v-on="on" x-small>
                                        <v-icon >mdi-download</v-icon>
                                    </v-btn>
                                </template>
                                Download Samplesheet
                            </v-tooltip>
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
                        <v-file-input
                            :width="'100px'"
                            v-model="name" 
                            :hint="samplesheetName"
                            persistent-hint counter show-size overlap
                        >
                        </v-file-input>
                        <v-divider
                            class="mx-4"
                            inset
                            vertical
                        ></v-divider>
                        <v-tooltip  >
                            <template v-slot:activator="{ on }">
                                <v-btn  v-on="on" fab class="mx-2" color="info"  x-small @click="forceRestart()">
                                    <v-icon>mdi-restart</v-icon>
                                </v-btn>
                            </template>
                            Restart All Jobs
                        </v-tooltip>
                        <v-tooltip  >
                            <template v-slot:activator="{ on }">
                                <v-btn color="primary "
                                    dark  v-on="on" x-small fab
                                    class="mx-2"
                                    @click="flush()">
                                    <v-icon>mdi-close-circle-multiple-outline</v-icon>
                                </v-btn>
                            </template>
                            Stop All Jobs
                        </v-tooltip>
                        <v-tooltip   v-if="!paused" :key="`${paused}-pausedbutton`">
                            <template v-slot:activator="{ on }">
                                <v-badge 
                                    color="green lighten-2"  overlap 
                                    :content="`${queueLength > 0 ? queueLength : ''}`" 
                                >
                                    <v-btn color="orange "
                                            dark  fab x-small
                                            v-on="on"  
                                            class="mx-2 "
                                            @click="paused = true">
                                        <v-icon>mdi-pause-circle</v-icon>
                                    </v-btn>
                                </v-badge>
                            </template>
                            Pause Queued Jobs
                        </v-tooltip>
                        <v-tooltip v-if="paused" >
                            <template v-slot:activator="{ on }">
                                <v-btn color="secondary "
                                    dark  fab x-small
                                    v-on="on"
                                    class="mx-2"
                                    @click="paused = false">
                                    <v-icon>mdi-play-box</v-icon>
                                </v-btn>
                            </template>
                            Resume Jobs Waiting
                        </v-tooltip>
                        <v-spacer></v-spacer>
                        <v-dialog
                            v-model="dialog"
                            max-width="500px"
                            >
                            <template v-slot:activator="{ on, attrs }">
                        
                                <v-btn fab
                                    color="primary"
                                    dark  x-small
                                    class="mx-2" v-on="on"
                                    v-bind="attrs"
                                    
                                    >
                                    <v-tooltip  >
                                        <template v-slot:activator="{ on }">
                                            <v-icon  v-on="on">mdi-plus</v-icon>
                                        </template>
                                        Add Entry To Samplesheet
                                    </v-tooltip>
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
                        <v-dialog
                            v-model="dialogAdvanced"
                        >
                            <template v-slot:activator="{ on, attrs }">
                                <v-btn
                                    color="red lighten-2"
                                    dark fab x-small
                                    class="mx-4"
                                    v-bind="attrs"
                                    v-on="on"
                                >
                                    <v-tooltip  left>
                                        <template v-slot:activator="{ on }">
                                            <v-icon v-on="on">mdi-cog</v-icon>
                                        </template>
                                        Advanced Configurations
                                    </v-tooltip>
                                </v-btn>
                            </template>
                            <v-toolbar extended
                                dark
                            >
                                <template v-slot:extension>
                                    
                                    <v-tabs v-model="tab" align-with-title
                                        color="basil" 
                                    >
                                        <v-tabs-slider color="purple"></v-tabs-slider>          
                                        <v-tab  v-for="(tabItem, key) in tabs"  :key="`${key}-tab`">
                                            {{tabItem}}
                                        </v-tab>
                                    </v-tabs>
                                </template>
                            </v-toolbar>
                            <v-tabs-items height="100%" width="100%"
                                v-model="tab" 
                            >
                                <v-tab-item :key="`one`" >
                                    <v-card v-if="stagedBundleConfig">
                                        <v-card-title class="text-h5 grey lighten-2">
                                            Names Mapping Config
                                        </v-card-title>
                                        <v-list>
                                        <v-list-item 
                                            v-for="[key,value] of Object.entries(stagedBundleConfig)" :key="`${key}-advancedbundled`"

                                        > 
                                            <v-sheet  v-if="(!value || typeof value =='object')" width="100%">
                                                <v-checkbox 
                                                    v-if="typeof value.value == 'boolean'"
                                                    v-model="stagedBundleConfig[key].value" :label="`${key}: -${stagedBundleConfig[key].arg}`"
                                                >
                                                </v-checkbox>
                                                <v-text-field v-model="stagedBundleConfig[key].value" type="number" :label="`${key}: -${stagedBundleConfig[key].arg}`" v-else-if="typeof value.value == 'number'" >
                                                </v-text-field>
                                                <v-text-field v-model="stagedBundleConfig[key].value" v-else :label="`${key}: -${stagedBundleConfig[key].arg}`">
                                                </v-text-field>
                                            </v-sheet>
                                        </v-list-item>

                                        </v-list>
                                        <v-card-actions>
                                            <v-btn small type="info"  x-small @click="updateConfig('bundle')" >
                                                Update Config
                                            </v-btn>
                                        </v-card-actions>
                                    </v-card>
                                </v-tab-item>
                                <v-tab-item :key="`two`">
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
                                        <v-btn small type="info"  x-small @click="updateConfig('kraken2')">
                                            Update Config
                                        </v-btn>
                                        </v-card-actions>
                                    </v-card>
                                </v-tab-item>
                            
                            </v-tabs-items>
                            
                        </v-dialog>
                        <v-spacer></v-spacer>
                        <v-btn
                            color="black lighten-2"
                            dark  

                            @click="sheet = true"
                        >
                            Logs
                            <v-tooltip >
                                <template v-slot:activator="{ on }">
                                    <v-icon class="ml-2" small v-on="on">mdi-comment</v-icon>
                                </template>
                                View Logging
                            </v-tooltip>
                            
                        </v-btn>
                </v-toolbar>
            
                <v-dialog
                    v-model="sheet"
                    inset
                >
                    
                    <v-card
                        class="text-left logDiv mx-0"
                        style="overflow:auto"
                    >
                        <v-toolbar  dark>
                            <v-toolbar-title>Server Logs</v-toolbar-title>

                            <v-spacer></v-spacer>

                            <v-btn icon @click="sheet = false" x-large fab>
                                <v-icon large >mdi-close-circle</v-icon>
                            </v-btn>
                        </v-toolbar>
                        <v-card-text class="my-3 mb-2" style="max-height: 80vh; overflow-y:auto">
                            
                            <span v-for="(row,index) in logs.slice().reverse()" :key="'sheet'+index">
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
                            <code>{{row.message}}</code>
                            <br>
                            </span>
                        </v-card-text>
                    
                    </v-card>
                </v-dialog>

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
                    
                    <div style="display: block; width:10">
                        <code class="overflow-auto" style="">{{ item.path_1 }}</code>
                    </div>
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
                    <code class="overflow-x-auto " style="">{{ item.database }}</code>
                </template>
                <template v-slot:[`item.jobs`]="{ item }">
                    <v-btn fab x-small @click="selectedSample = queueList[item.sample]; dialogJobs = true"  
                        >
                        <v-icon>mdi-comment</v-icon>
                    </v-btn>
                    
                </template>
                <template v-slot:[`item.pattern`]="{ item }">
                    <v-edit-dialog
                    :return-value.sync="item.pattern"
                    large
                    persistent
                    @save="save"
                    @cancel="cancel"
                    @open="open"
                    @close="close"
                    >
                        <div style="display: block">
                            <code class="overflow-auto">{{ item.pattern }}</code>
                        </div>
                        <template v-slot:input>
                            <div class="mt-4 text-h6">
                                Update BC Pattern for Demux
                            </div>
                            <v-text-field
                                v-model="item.pattern"
                                label="Edit"
                                single-line
                                counter
                                autofocus
                            ></v-text-field>
                        </template>
                    </v-edit-dialog>
                </template>
                <template v-slot:[`item.kits`]="{ item }">
                    <v-edit-dialog
                    :return-value.sync="item.kits"
                    large
                    persistent
                    @save="save"
                    @cancel="cancel"
                    @open="open"
                    @close="close"
                    >
                        <div style="display: block">
                            <code class="overflow-auto">{{ item.kits }}</code>
                        </div>
                        <template v-slot:input>
                            <div class="mt-4 text-h6">
                                Update Kit for Demux
                            </div>
                            <v-text-field
                                v-model="item.kits"
                                label="Edit"
                                single-line
                                counter
                                autofocus
                            ></v-text-field>
                        </template>
                    </v-edit-dialog>
                </template>
                <template v-slot:[`item.format`]="{ item }">
                    <v-select
                        v-model="item.format" solo
                        :items="['file', 'directory']"
                        label="Select"
                        single-line
                    ></v-select>
                </template>
                <template v-slot:[`item.compressed`]="{ item }">
                    <v-switch v-model="item.compressed"> </v-switch>
                </template>
                <template v-slot:[`item.platform`]="{ item }" >
                    <v-select
                        v-model="item.platform"
                        :items="['oxford', 'illumina']"
                        label="Select" solo
                        single-line
                    ></v-select>
                </template>
                <template v-slot:[`item.actions`]="{ item }">
                    <v-icon
                        medium
                        class="mr-2" color=""
                        @click="editItem(item)" 
                    >
                        mdi-pencil 
                    </v-icon>
                    <v-progress-circular
                        indeterminate v-if="current && typeof current == 'object' && current[item.sample]"
                        color="primary" medium size="22"
                    ></v-progress-circular>
                    <v-icon
                        medium  v-else-if="item.format !=='run'"  :key="`${item.sample}-runsamplemajorbutton`" :color="anyCompleted(item.sample) ? 'green' : 'orange'"
                    >
                        {{ anyCompleted(item.sample) ? 'mdi-check-circle' : 'mdi-exclamation' }}
                    </v-icon>
                    <v-tooltip  v-if="1==1|| current && typeof current == 'object'  && current[item.sample] " left>
                        <template v-slot:activator="{ on, attrs }">
                            <v-icon
                                medium color="indigo"
                                v-bind="attrs"
                                v-on="on"
                                @click="cancelJob(null, item.sample)"
                            >
                            mdi-cancel
                            </v-icon>
                        </template>
                        <span>Cancel Sample Job(s)</span>
                    </v-tooltip>
                    <v-icon
                        medium class="mr-2" color="orange"
                        @click="deleteItem(item)"
                    >
                        mdi-delete
                    </v-icon>
                    
                    <v-tooltip   left>
                        <template v-slot:activator="{ on, attrs }">
                            <v-icon
                                medium color="indigo"
                                v-bind="attrs"
                                v-on="on"
                                @click="forceRestart(item)"
                            >
                                {{ !item.demux ? `mdi-play-circle` : `mdi-view-week` }}
                            </v-icon>
                        </template>
                        <span>{{ !item.demux ? `Re-run the report` : `Barcode and Report` }} </span>
                    </v-tooltip>
                    
                </template>
                <template v-slot:[`item.report`]="{ item }">
                    <v-progress-circular
                        indeterminate v-if="current && typeof current == 'object' && current[item.sample]"
                        color="primary" medium size="10"
                    ></v-progress-circular>
                    <v-icon
                        medium  v-else-if="item.format !=='run'"
                        :color="seen && seen.indexOf(item.sample) > -1 ? 'green': 'orange'"
                    >
                        {{seen && seen.indexOf(item.sample) > -1 ? 'mdi-check-circle' : 'mdi-exclamation' }}
                    </v-icon>
                        
                </template>
                
            </v-data-table>
        </v-col>
        <v-dialog
            style="overflow-x:auto; width:100%" absolute v-model="dialogQueue" v-if="dialogQueue"
        >
       
        <v-card class="mx-auto"
            outlined style="overflow-y:auto; width: 100%"
        >
            <v-list-item dense three-line>
                <v-list-item-content dense>
                    <div class="">
                        <v-progress-circular
                            indeterminate v-if="selectedSampleIndex.status.running "
                            color="primary"  size="15"
                        ></v-progress-circular>
                        <v-tooltip  v-else-if=" selectedSampleIndex.status.success ==0 && selectedSampleIndex.status.historical "
                            dark left
                        >
                            <template v-slot:activator="{ on }">
                                <v-icon
                                    class="" large
                                    :color="'green'"
                                    dark v-on="on"
                                >
                                    mdi-history
                                </v-icon>
                            </template>
                            Already run
                        </v-tooltip>
                        <v-tooltip  v-else-if=" selectedSampleIndex.status.success ==0 "
                            dark left
                        >
                            <template v-slot:activator="{ on }">
                                <v-icon 
                                    class="" large
                                    :color="'green'"
                                    dark v-on="on"
                                >
                                    mdi-check-circle
                                </v-icon>
                            </template>
                            Completed Successfully 
                        </v-tooltip>
                        <v-tooltip  v-else-if=" selectedSampleIndex.status.success != 0 "
                            dark left
                        >
                            <template v-slot:activator="{ on }">
                                <v-icon 
                                    class="" large
                                    :color="'orange'"
                                    dark v-on="on"
                                >
                                    mdi-exclamation
                                </v-icon>
                            </template>
                            Error in Completing Job, Check Logs
                        </v-tooltip>                        
                    </div>
                    <v-list-item-title class="text-h5 mb-1">
                        {{ selectedSampleIndex.name }} 
                    </v-list-item-title>
                    <v-list-item-subtitle>
                        {{ selectedSampleIndex.filepath  }}
                    </v-list-item-subtitle>
                </v-list-item-content>

            </v-list-item>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn
                    color="primary"
                    text
                    @click="dialogQueue = false"
                >
                    Close
                </v-btn> 
            </v-card-actions>
            <v-card-text class="text-sm-left" style="white-space: pre-wrap;" >
                <code class="text-sm-left " style="white-space: pre-wrap;">{{ selectedSampleIndex.command }}</code>
                
                <code v-for="(log, index) in selectedSampleIndex.status.logs"
                    :key="`${index}-logQueue`" style="white-space: pre-wrap;">
                    {{ log }}
                    <v-divider></v-divider>
                </code>
            </v-card-text>
            <v-divider></v-divider>
        </v-card>
        </v-dialog>
        <v-dialog v-model="dialogJobs" v-if="dialogJobs">
            <v-data-iterator  class="grey lighten-3"
                :items="selectedSample"
                :items-per-page.sync="itemsPerPage"
                :page.sync="page"
                :search="search"
                :sort-by="sortBy.toLowerCase()"
                :sort-desc="sortDesc"
            >
            
            <template v-slot:header>
                
                <v-toolbar
                dark
                color="blue darken-3"
                class="mb-1"
                >
                <v-btn
                    small fab
                    color="grey" @click="dialogJobs = false"
                    
                >
                    <v-icon>mdi-close</v-icon>
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn
                    large
                    depressed v-if="selectedSample"
                    color="blue" @click="(page = page+1)"
                    :value="false" :disabled="page * itemsPerPage >= selectedSample.length"
                >
                    <v-icon>mdi-arrow-down</v-icon>
                </v-btn>
                <v-btn
                    large @click="(page > 1 ? page = page -1 : '')"
                    depressed :disabled="page <= 1"
                    color="blue"
                    :value="true"
                >
                    <v-icon>mdi-arrow-up</v-icon>
                </v-btn>
                <v-spacer></v-spacer>
                <v-text-field
                    v-model="search"
                    clearable
                    flat
                    solo-inverted
                    hide-details
                    prepend-inner-icon="mdi-magnify"
                    label="Search"
                ></v-text-field>
                <template v-if="$vuetify.breakpoint.mdAndUp">
                    <v-spacer></v-spacer>
                    <v-select
                    v-model="sortBy"
                    flat
                    solo-inverted
                    hide-details
                    :items="keys"
                    prepend-inner-icon="mdi-magnify"
                    label="Sort by"
                    ></v-select>
                    <v-spacer></v-spacer>
                    
                </template>
                </v-toolbar>
            </template>

            <template v-slot:default="props">
                
                    <v-row> 
                    <v-col
                    v-for="que in props.items"
                    :key="`${que.index}-sampleIndex-${que.status.running}`"
                    cols="12"  
                    sm="6"
                    md="4"
                    lg="4"
                >
                    <v-card    style="overflow-x:auto; width:100% " max-height="200px">
                        
                        <v-card-title class="text-header-2">
                            <v-progress-circular
                                indeterminate :key="`${que.status.running}-running${que.sample}`" v-if="que.status.running "
                                color="primary"  size="15"
                            ></v-progress-circular>
                            <v-tooltip  :key="`queueinfo-${que.status.historical}-${que.index}`" v-else-if=" que.status.success ==0 && que.status.historical "
                                dark left
                            >
                                <template v-slot:activator="{ on }">
                                    <v-icon
                                        class="" small
                                        :color="'green'"
                                        dark v-on="on"
                                    >
                                        mdi-history
                                    </v-icon>
                                </template>
                                Already run
                            </v-tooltip>
                            <v-tooltip  v-else-if=" que.status.success ==0 "
                                dark left
                            >
                                <template v-slot:activator="{ on, attrs }">
                                    <v-icon 
                                        class="" small
                                        :color="'green'"
                                        dark v-on="on" :bind="attrs"
                                    >
                                        mdi-check-circle
                                    </v-icon>
                                </template>
                                Completed Successfully 
                            </v-tooltip>
                            <v-tooltip :key="`queuerror-${que.status.error}-${que.index}`" v-else-if="que.status.error || que.status.code != 0"
                                :color="'orange lighten-1'"
                                dark left
                            >
                                <template v-slot:activator="{ on, attrs }">
                                        <v-icon
                                            large color="orange lighten-1"
                                            v-bind="attrs"
                                            v-on="on" @click="sheet = true"
                                        >
                                            mdi-exclamation
                                        </v-icon>
                                </template>
                                <span>{{ que.status.error }}</span>
                            </v-tooltip>
                            {{ `${que.sample && que.sample.sample ? que.sample.sample : ''} ` }}
                            <v-spacer></v-spacer>
                            <v-tooltip  
                                dark left
                            >
                                    <template v-slot:activator="{ on }">
                                        <v-btn
                                            color="secondary" class="px-0 mx-0"
                                            fab v-on="on" @click="selectedSampleIndex = que; dialogQueue = true"
                                            dark x-small
                                        >
                                            <v-icon
                                                dark  
                                            >
                                            mdi-tray-full
                                            </v-icon>
                                        </v-btn>
                                    </template>
                                    Information
                            </v-tooltip>
                            <v-tooltip  
                                dark left :key="`${que.index}-${que.name}-Archivecancel`"
                            >
                                <template v-slot:activator="{ on }">
                                        <v-btn  :disabled="!que.status.running  " v-on="on" @click="cancelJob(que.index, que.name)"  fab x-small  color="orange lighten-1">
                                            <v-icon >mdi-cancel</v-icon>
                                        </v-btn>
                                </template>
                                Cancel
                            </v-tooltip>
                            <v-tooltip 
                                dark left  :key="`${que.index}-${que.name}-rerunbutton`"
                            >
                                <template v-slot:activator="{ on, attrs }">
                                    <v-btn :disabled="que.status.running" @click="start(que.index, que.name)"
                                        color="blue lighten-1" class="px-0 mx-0"
                                        fab v-on="on" v-bind="attrs"
                                        dark x-small
                                    >
                                        <v-icon >mdi-play</v-icon>
                                    </v-btn>
                                </template>
                                Rerun 
                            </v-tooltip> 
                        </v-card-title>
                        
                        <v-card-subtitle class="subheading">
                            <v-tooltip  :key="`${que.index}-${que.name}-arhice`" v-if="!que.status.running && que.status.success == 0  "
                                dark left
                            >
                                <template v-slot:activator="{ on  }">
                                    <v-icon v-on="on" small color="secondary lighten-1">
                                        mdi-archive
                                    </v-icon>
                                </template>
                                {{  que.filepath }} 
                            </v-tooltip>
                            {{ `${que.sample ? que.sample.format : ''} - ${que.sample && que.sample.demux ? 'Demux' : 'Classify'} ` }} . {{ que.index }}
                            {{  que.sample ? que.sample.filepath : '' }}
                        </v-card-subtitle>
                        <v-divider></v-divider>
                        
                            <v-list  dense>
                                <v-list-item v-for="k in attributes" :key="`${k}-formatkey`"  two-line>
                                    
                                    
                                    <v-list-item-content   >
                                        <v-list-item-title    style="white-space: normal;" >{{ k }}</v-list-item-title>
                                        
                                    </v-list-item-content>
                                    <v-divider vertical></v-divider>
                                    <v-list-item-content   class="align-end">
                                        <v-list-item-subtitle class="mx-3" style="white-space: normal;"  >{{ que.sample[k] }}</v-list-item-subtitle>
                                        <v-divider ></v-divider>
                                    </v-list-item-content>
                                    
                                </v-list-item>
                                
                                
                            </v-list>
                        
                    </v-card>

                </v-col>
                </v-row>
            </template>
            </v-data-iterator> 
        </v-dialog>
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
  require("path")
  import _ from 'lodash';

  export default { 
    name: 'Samplesheet',
    props: ["samplesheet", 'samplesheetName', 'seen', 'current', 'logs', 'bundleconfig', 'queueList', 'anyRunning', 'queueLength', 'pausedServer'],
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
      pausedServer(val){
        if (val != this.paused){
            console.log("server sent paused status change")
            this.paused = val
        }
      },
    
      bundleconfig (val){
        this.stagedBundleConfig = val
      },
      paused(val){
          this.$emit("pausedChange", val)
      },
      queueList(val){
        console.log(val,"queuelist changed")
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
      nextPage () {
        if (this.page + 1 <= this.numberOfPages) this.page += 1
      },
      formerPage () {
        if (this.page - 1 >= 1) this.page -= 1
      },
      updateItemsPerPage (number) {
        this.itemsPerPage = number
      },
      
    }, 
    computed: {
      numberOfPages () {
            return Math.ceil(this.selectedSample.length / this.itemsPerPage)
      },
      samples() {
        return this.dataSamples
      },
      filteredKeys () {
        return this.keys.filter(key => key !== 'Name')
      },
      formTitle () {
        return this.editedIndex === -1 ? 'New Item' : 'Edit Item'
      },
      
    },
    data(){
      return {
          CSVTITLE: "Mytax2Report",
          snack: false, 
          name: null,
          dialogJobs: false,
          singleExpand: true,
          expanded: [],
          scroll:true,
          tab:0,
          page: 1,
          itemsPerPage: 9,
          sortBy: 'name',
          itemsPerPageArray: [9, 15, 20 ],
          search: '',
          filter: {},
          sortDesc: false,
          dialogAdvanced: false,
          dialogQueue: false,
          dialogLogs: false,
          attributes: [
            'format', 'platform', 'database', 'sample', 'demux', 'path_1', 'path_2', 'filepath'
          ],
          tabs: ['Script Config for Name mapping', 'Kraken2 Advanced Config'],
          advanced:true,
          sheet:false,
          stagedData: [],
          config: {},
          paused: false,
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
          selectedSample: null,
          selectedSampleIndex: null,
          dataSamples: [],
          editedIndex: -1,
          dialog: false,
          dialogDelete: false,
          snackText: '',
          stagedBundleConfig:  {}, 
          containsPlatform: v => (v=='oxford' || v == 'illumina' ) || 'Must be oxford or illumina! (case sensitive)',
          containsFormat: v => (v=='fil2e' || v == 'directory') || 'Must be file or directory! (case sensitive)',
          keys: [
            'sample',
            'filepath',
          ],
          headers: [
            {
                text: "Jobs",
                value: "jobs",
                sortable: false,
            },
            {
                text: "",
                value: "actions",
                sortable: false,
            },
            {
                text: "Demultiplex",
                value: 'demux',
                sortable: false,
            },
            {
                text: "Sample Name",
                value: "sample",
                sortable: true,
            },
            {
                text: "Path 1",
                value: "path_1",
                sortable: true,
            },
            {
                text: "Path 2",
                value: "path_2",
                align:"center"  ,              
                sortable: true,
            },
            {
                text: "Format",
                value: "format",
                sortable: true,
            },
            {
                text: "Platform",
                value: "platform",
                align:"center"  ,              
                sortable: true,
            },
            {
                text: "Kraken2 Database",
                value: "database",
                sortable: true,
                cellClass: "text-wrap overflow-auto ",
            },
            {
                text: "Compressed (gz)",
                value: "compressed",
                sortable: false,
            },
            {
                text: "Pattern to match barcodes",
                value: "pattern",
                sortable: false,
            },
            {
                text: "Barcode Kits",
                value: "kits",
                sortable: false,
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
        updateConfig(type){
            this.$emit("updateConfig", (type == 'bundle' ? this.stagedBundleConfig : this.config ), type)
        },
        anyCompleted(sample){
            try{ 
                if (this.queueList[sample]){
                    let any = this.queueList[sample].some((f)=>{
                        return f.status.success == 0
                    })
                    return  any
                
                } else {
                    return null
                }
            } catch (err){
                console.error(err)
                return null
            }
        },
        
        start(index, sample ){
            this.$emit("rerun", index, sample)
        },
        barcode(item){
            this.$emit("barcode", item)
        },
        flush(){
            this.$emit("sendMessage", JSON.stringify({type: "flush" }));
             
        },
        cancelJob(index, sample){
            this.$emit("cancel",  {type: "cancelJob", index:index, sample: sample } );
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
            console.log(this.editedIndex,"<<<<<<")
            this.editedItem = Object.assign({}, item)
            this.dialogDelete = true 
        },
        deleteItemConfirm () {
            // this.dataSamples.splice(this.editedIndex, 1)
            this.dataSamples.splice(this.editedIndex,1)
            this.closeDelete()
        },
        editItem (item) {
            this.editedIndex = _.cloneDeep(this.dataSamples.indexOf(item))
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
                this.$set(this.dataSamples, this.editedIndex, this.editedItem)
            } else {
                this.dataSamples.push(this.editedItem)
            }
            this.closeItem()
        },
    
    }
    
    
  };
</script>
<style>
code {
    white-space: pre-wrap;
}
.v-card {
  display: flex !important;
  flex-direction: column;
}

.v-card__text {
  flex-grow: 1;
  overflow: auto;
}
.table{
	max-width: calc(100% - 48px);
	max-height: calc(100vh - 170px);
}
.v-data-table {
	overflow: auto;
}
.v-data-table /deep/ .v-data-table__wrapper {
	overflow: unset;
}
</style>