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
    <div class="mx-4 my-6"  id="file"   @drop.prevent="addDropFileData" @dragover.prevent 
        style="overflow-y: auto; ">
        <div class="" style=" box-shadow: 2px 2px 20px rgba(0,0,0,0.2);">
                <v-text-field
                    v-model="search" clearable
                    label="Search"
                    class="mb-3"
                >
                    <template v-slot:append>
                    <v-list-item
                        ripple
                        @mousedown.prevent
                        @click="toggleSamples"
                    >
                        <v-list-item-action>
                        <v-icon :color="nonhiddensamples.length > 0 ? 'indigo darken-4' : ''">
                        {{ icon  }}
                        </v-icon>
                    </v-list-item-action>
                    <v-list-item-content>
                        <v-list-item-title v-if="!selectedAllSamples">
                        Show All
                        </v-list-item-title>
                        <v-list-item-title v-else>
                        Hide All
                        </v-list-item-title>
                    </v-list-item-content>
                    </v-list-item>
                    </template>
                </v-text-field>
                <div >
                    <v-data-table
                        :headers="headers"
                        :items="selectedsamplesAll"
                        :search="search"  
                        :sort-by="sortBy.toLowerCase()"
                        :items-per-page="10"
                        class="elevation-1 mx-4"
                        :dense="true"
                    >
                    
                        <template v-slot:item.status="{ item }">
                        <v-icon v-if=" item.status.preload">
                            mdi-file
                        </v-icon>
                        <v-icon  color="success" v-else-if="item.status.success">
                            mdi-check-circle
                        </v-icon>
                        <v-progress-circular
                            indeterminate v-else-if="item.status.running"
                            color="blue" small size="15"
                        ></v-progress-circular>
                        <v-tooltip bottom v-else>
                            <template v-slot:activator="{ on }">
                                <v-icon v-on="on" color="warning"  @click="selectedQueueSample = item.sample; dialogJobs = true">
                                    mdi-exclamation
                                </v-icon>
                            </template>
                            {{ item.status.error && item.status.error.length >=1 ? pasteLine(item.status.error) : 'Error in Completing Job' }}
                        </v-tooltip>
                            
                        </template>
                        <template v-slot:item.delete="{ item }">
                        <v-btn icon @click="deleteRow(item.sample)">
                            <v-icon>mdi-delete</v-icon>
                        </v-btn>
                        </template>
                        <template v-slot:item.edit="{ item }">
                        <v-btn icon @click="editItem(item.sample)">
                            <v-icon>mdi-cog</v-icon>
                        </v-btn>
                        </template>
                        <template v-slot:item.jobs="{ item }">
                        <v-btn icon @click="selectedQueueSample = item.sample; dialogJobs = true">
                            <v-icon>mdi-call-made</v-icon>
                        </v-btn>
                        </template>
                        <template v-slot:item.sample="{ item }">
                            
                            <v-tooltip 
                                dark left  :key="`${item.sample}-rerunbutton`"
                            >
                                <template v-slot:activator="{ on, attrs }">
                                    <div style="display:flex; margin:auto">
                                        <v-btn  @click="start(-1, item.sample)"
                                            color="blue lighten-1" class="px-0 mx-0"
                                            icon v-on="on" v-bind="attrs"
                                            dark x-small
                                        >
                                            <v-icon small>mdi-play-circle</v-icon>
                                        </v-btn>
                                        <span>{{ item.sample }}</span>
                                        <v-btn  v-if="item.status.running" @click="cancelJob(-1, item.sample)"
                                            color="orange darken-1" class="px-0 mx-0"
                                            icon v-on="on" v-bind="attrs"
                                            dark x-small
                                        >
                                            <v-icon small>mdi-cancel</v-icon>
                                        </v-btn>
                                    </div>
                                </template>
                                Re start the run
                            </v-tooltip> 
                        </template>
                        <template v-slot:item.action="{ item }">
                        <v-tooltip bottom>
                            <template v-slot:activator="{ on }">
                                <v-btn icon   v-if="!item.hidden" v-on="on" @click="hideSample(item.sample)">
                                    <v-icon>mdi-eye</v-icon>
                                </v-btn>
                                <v-btn icon v-on="on" v-else @click="selectSample(item.sample)">
                                    <v-icon color="secondary" >mdi-cancel</v-icon>
                                </v-btn>
                            </template>
                            {{ !item.hidden ? 'Hide' : 'Show' }}
                        </v-tooltip>
                        </template>
                    </v-data-table> 
                </div>
                <span>Jobs in Queue: {{ queueLength }}</span>
                <v-file-input
                    :hint="'Add or Drag/Drop Another Kraken2 Report File'"
                    persistent-hint @input="addData" v-model="recentDataFileadded"
                    prepend-icon=""
                >
                </v-file-input>
            </div>
        <v-toolbar extended>
            <v-tooltip  bottom >
                <template v-slot:activator="{ on }">
                <v-btn
                    color="black lighten-2"
                    dark  fab x-small
                    class="mx-2"  v-on="on"
                    @click="sheet = true"
                >
                    <v-icon class="" x-small >mdi-comment</v-icon>
                    
                </v-btn>
                </template>
                View Logging
            </v-tooltip>
            
            <v-tooltip  bottom >
                <template v-slot:activator="{ on }">
                    <v-btn  v-on="on" fab class="mx-2" color="info"  x-small @click="forceRestart()">
                        <v-icon>mdi-restart</v-icon>
                    </v-btn>
                </template>
                Restart All Jobs
            </v-tooltip>
            <v-tooltip bottom  >
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
            <v-tooltip   bottom v-if="!paused" :key="`${paused}-pausedbutton`">
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
                        <v-tooltip bottom >
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
                            <v-switch
                                v-model="toggleDemuxRun"
                                :label="toggleDemuxRun ? 'Search for Barcodes' : 'Individual Sample Path'"
                            >
                            </v-switch>
                            <v-textarea
                            v-model="editedItem.sample"
                            :label=" toggleDemuxRun ? 'Run Name' : 'Sample Name'"
                            :error-messages="sampleErrors"

                            >
                            </v-textarea>
                        </v-col>
                       
                        <v-col
                            cols="12" v-if="editedItem.demux"
                            sm="6"
                            md="4"
                        >
                            <v-textarea
                            v-model="editedItem.kits"
                            label="Barcode Kit Name"
                            ></v-textarea>
                        </v-col>
                        <v-col
                            cols="12"
                            sm="6"
                            md="4"
                        >
                            <v-combobox  
                                v-model="editedItem.path_1"
                                :items="pathOptions1"
                                :hint="editedItem.path_1 ? `Sequencing file/directory: ${editedItem.path_1}` : '' "
                                persistent-hint
                                :error-messages="pathErrors1"
                                label="Sequencing File(s)"
                                @keyup="handleInputPath1"
                            ></v-combobox>
                        </v-col>
                        <v-col
                            cols="12"
                            sm="6"
                            md="4"
                        >
                            <v-combobox  
                                v-model="editedItem.path_2"
                                :items="pathOptions2"
                                :hint="editedItem.path_2 ? `Paired End Path: ${editedItem.path_2}` : '' "
                                persistent-hint
                                label="Paired Reads"
                                @keyup="handleInputPath2"
                            ></v-combobox>
                        </v-col>
                        <v-col sm="12">
                            <v-switch
                                v-model="toggleDatabases"
                                :label="toggleDatabases ? 'Use Standard Databases' : 'Use Custom Database. Provide PATH'"
                            >
                            </v-switch>
                            <!-- Set input field for searchPatternBC -->
                            <v-text-field
                                v-if="toggleDatabases"
                                v-model="searchPatternBC"
                                :label="`Search Pattern for Barcode Files`"
                            ></v-text-field>
                        </v-col>
                        <v-col
                            cols="12"
                            sm="6"
                            md="4"
                        >
                            
                            <!-- add a toggle that switches betwee a textarea OR a dropdown -->
                            <v-select v-if="toggleDatabases" chips
                                v-model="editedItem.database" class="truncate-text"
                                :items="databases" :error-messages="dbErrors"
                                label="Database" item-text="key" item-value="fullpath" 
                                    persistent-hint  
                            >
                                <template v-slot:selection="{ item }">
                                    <v-tooltip bottom>
                                    <template v-slot:activator="{ on, attrs }">
                                        <span v-bind="attrs" v-on="on" class="tooltip-content">
                                        <span v-if="item.downloading">
                                            <v-progress-circular :indeterminate="true" class="mr-2" size="14" color="blue lighten-2"></v-progress-circular>
                                            {{ item.key }}
                                        </span>
                                        <span v-else-if="item.size == 0">
                                            <v-chip>
                                            <v-icon color="orange lighten-1" class="mr-2">mdi-alert-circle-outline</v-icon>
                                            {{ item.key }}; Size is empty
                                            </v-chip>
                                        </span>
                                        <span v-else>
                                            <v-chip>
                                            <v-icon color="green lighten-1">mdi-check-circle-outline</v-icon>
                                            {{ item.key }}
                                            </v-chip>
                                        </span>
                                        </span>
                                    </template>
                                    <span>{{ item.key }}</span>
                                    </v-tooltip>
                                </template>
                            </v-select>
                            <v-combobox   v-else
                                v-model="editedItem.database"
                                :items="pathOptionsDb"
                                :hint="editedItem.database ? `Paired End Path: ${editedItem.database}` : '' "
                                persistent-hint
                                label="K2 Db path"
                                :error-messages="dbErrors"
                                @keyup="handleInputPathDb"
                            ></v-combobox>
                           
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
                        <v-btn color="blue darken-1" :disabled="!isFormValid" text @click="saveItem">Add</v-btn>
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
                <v-tabs-items  width="100%"
                    v-model="tab" 
                >
                    <v-tab-item :key="`two`">
                        <v-card>
                            <v-card-title class="text-h5 grey lighten-2">
                                Kraken2 Advanced commands 
                            </v-card-title>
                            <v-btn small class="info"  x-small @click="updateConfig('kraken2')">
                                Update Config
                            </v-btn>
                            <v-list>
                            <v-list-item
                                v-for="[key,value] of Object.entries(config)" :key="`${key}-advancedkraken2`"

                            >
                                <v-checkbox 
                                    v-if="config[key]['type'] == 'boolean'"
                                    v-model="config[key]['value']" :label="`--${key}?`"
                                >
                                </v-checkbox>
                                <v-text-field type="number" v-model.number="config[key]['value']" v-else-if="config[key]['type'] == 'number'" :label="`--${key}`"  >
                                </v-text-field>
                                <v-text-field v-model="config[key]['value']" v-else :label="`--${key}`">
                                </v-text-field>
                            </v-list-item>

                            </v-list>
                            
                        </v-card>
                    </v-tab-item>
                
                </v-tabs-items>
                
            </v-dialog>
        </v-toolbar>
        <v-spacer></v-spacer>
        <v-dialog
            v-model="sheet"
            inset
        >
            <v-card
                class="text-left logDiv "
                style="overflow:auto"
            >
                <v-toolbar  dark>
                    <v-toolbar-title>Server Logs</v-toolbar-title>

                    <v-spacer></v-spacer>

                    <v-btn icon @click="sheet = false" x-large fab>
                        <v-icon large >mdi-close-circle</v-icon>
                    </v-btn>
                </v-toolbar>
                <v-card-text class="my-0 mb-2" style="max-height: 80vh; overflow-y:auto">
                    
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
        <v-navigation-drawer
            v-model="drawerSample"
            absolute app
            temporary style="min-width: 500px"
        >
        
            <v-list-item 
                :style="{
                    'text-align':'left',
                    'overflow-wrap': 'break-word'
                }" class="mx-10"
                v-for="key4 in Object.keys(selectedSampleObj).filter((f)=>{
                    return f != 'sample' && f != 'active'
                })"
                :key="`${key4}-${selectedSampleObj.sample}`"
            >
                <v-list-item-content 
                    :style="{
                        'text-align':'left',
                        'overflow-wrap': 'break-word'
                    }" class="mx-0">
                    <v-list-item-title class="font-weight-bold">{{ key4 }}</v-list-item-title>
                    <v-list-item-subtitle class=""  v-if="selectedSampleObj[key4] == '' || !selectedSampleObj[key4]">(Empty)</v-list-item-subtitle>
                    <v-switch v-if="adjustable[key4]['type'] == 'boolean'" v-model="selectedSampleObj[key4]"> </v-switch>
                    <v-select v-else-if="adjustable[key4]['type'] == 'list'"
                        v-model="selectedSampleObj[key4]" solo
                        :items="adjustable[key4].values"
                        label="Select"
                        single-line
                    ></v-select>
                    <v-edit-dialog v-else-if="adjustable[key4].type == 'string'"
                        :return-value.sync="selectedSampleObj[key4]"
                        large
                        :rules="[containsPlatform]"
                        persistent
                        @save="save"
                        @cancel="cancel"
                        @open="open"
                        @close="close"
                    >
                    
                    <div style="display: flex;  ">
                        <code class="overflow-auto" style="">{{ selectedSampleObj[key4] }}</code>
                        <v-spacer class="mx-10"></v-spacer>
                        
                    </div>
                    <template v-slot:input>
                        <div class="mt-4 text-h6">
                        Update Value
                        </div>
                        <v-text-field
                            v-model="selectedSampleObj[key4]"
                            label="Edit"
                            single-line
                            counter
                            autofocus
                        ></v-text-field>
                    </template>
                    </v-edit-dialog>
                </v-list-item-content>
            </v-list-item>
        </v-navigation-drawer>
        <v-dialog
            style="overflow-x:auto; width:100%" absolute v-model="dialogQueue" v-if="selectedQueueJob"
        >
       
        <v-card class="mx-auto"
            outlined style="overflow-y:auto; width: 100%"
        >
            <v-list-item dense three-line>
                <v-list-item-content dense>
                    <div class="">
                           
                        <v-progress-circular
                            indeterminate v-if="selectedQueueJob.status.running "
                            color="primary"  size="15"
                        ></v-progress-circular>
                        <v-tooltip  v-else-if="selectedQueueJob.status.success && selectedQueueJob.status.historical "
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
                        <v-tooltip  v-else-if="selectedQueueJob.status.success"
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
                        <v-tooltip  v-else-if="!selectedQueueJob.status.success "
                            dark left
                        >
                            <template v-slot:activator="{ on }">
                                <v-icon 
                                    class="" large
                                    :color="'orange'"
                                    dark v-on="on"
                                >
                                    mdi-alert-box
                                </v-icon>
                            </template>
                            Error in Completing Job, Check Logs
                        </v-tooltip>    
                                      
                    </div>
                    <v-list-item-title class="text-h5 mb-1">
                        {{ selectedQueueJob.name }} 
                    </v-list-item-title>
                    <v-list-item-subtitle>
                        {{ selectedQueueJob.filepath  }}
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
                <code class="text-sm-left " style="white-space: pre-wrap;">{{ selectedQueueJob.command }}</code>
                <v-divider class="my-20"></v-divider>
                
                
                <code v-for="(log, index) in selectedQueueJob.status.logs"
                    :key="`${index}-logQueue`" style="white-space: pre-wrap;">
                    {{ log }}
                    <v-divider></v-divider>
                </code>
            </v-card-text>
            <v-divider></v-divider>
        </v-card>
        </v-dialog> 
        
        <v-dialog v-model="dialogJobs">
            
            <v-data-iterator  class="grey lighten-3"
                :items="queueSample"
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
                            <v-tooltip  :key="`queueinfo-${que.status.historical}-${que.index}`" v-else-if=" que.status.success &&  que.status.historical "
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
                            <v-tooltip  v-else-if=" que.status.success "
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
                                Completed Job Successfully 
                            </v-tooltip>
                            <v-tooltip :key="`queuerror-${que.status.error}-${que.index}`" v-else-if="que.status.error || que.status.code != 0"
                                :color="'orange lighten-1'"
                                dark left
                            >
                                <template v-slot:activator="{ on, attrs }">
                                        <v-icon
                                            large color="orange lighten-2"
                                            v-bind="attrs"
                                            v-on="on" @click="selectedQueueJob = que; dialogQueue = true"
                                        >
                                            mdi-alert-box
                                        </v-icon>
                                </template>
                                Error in Completing Job, Click to check logs
                            </v-tooltip>
                            {{ `${que.sample && que.sample.sample ? que.sample.sample : ''} ` }}
                            <v-spacer></v-spacer>
                            <v-tooltip  
                                dark left
                            >
                                    <template v-slot:activator="{ on }">
                                        <v-btn
                                            color="secondary" class="px-0 mx-0"
                                            fab v-on="on" @click="selectedQueueJob = que; dialogQueue = true"
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
                                        <v-btn  :disabled="!que.status.running  " v-on="on" @click="cancelJob(que.index, selectedQueueSample)"  fab x-small  color="orange lighten-1">
                                            <v-icon >mdi-cancel</v-icon>
                                        </v-btn>
                                </template>
                                Cancel
                            </v-tooltip>
                            <v-tooltip 
                                dark left  :key="`${que.index}-${que.name}-rerunbutton`"
                            >
                                <template v-slot:activator="{ on, attrs }">
                                    <v-btn :disabled="que.status.running" @click="start(que.index, que.sample)"
                                        color="blue lighten-1" class="px-0 mx-0"
                                        fab v-on="on" v-bind="attrs"
                                        dark x-small
                                    >
                                        <v-icon >mdi-play-circle</v-icon>
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
                            {{ `${que.sample} - ${que.sample && que.sample.demux ? 'Demux' : 'Classify'} ` }} . {{ que.index }}
                        </v-card-subtitle>
                        <v-divider></v-divider>
                        
                            <v-list  dense>
                                <v-list-item v-for="k in attributes" :key="`${k}-formatkey`"  two-line>
                                    
                                    
                                    <v-list-item-content   >
                                        <v-list-item-title    style="white-space: normal;" >{{ k }}</v-list-item-title>
                                        
                                    </v-list-item-content>
                                    <v-divider vertical></v-divider>
                                    <v-list-item-content   class="align-end">
                                        <v-list-item-subtitle class="mx-3" style="white-space: normal;"  >{{ que[k] }}</v-list-item-subtitle>
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
    </div>
      
      
</template>

<script>
  import VueJsonToCsv from 'vue-json-to-csv'
  import * as d3 from 'd3'
  import path from "path"
  import _ from 'lodash';

  export default { 
    name: 'Samplesheet',
    props: [
        "status",
        "databases", 
        "samplesheet", 
        "pathOptions1",
        "pathOptions2",
        "pathOptionsDb",
        "selectedsamples",
        "selectedRun", 
        "selectedsamplesAll",
        'samplesheetName', 
        'seen', 
        'current', 
        'logs', 
        'bundleconfig', 
        'queueList', 
        'anyRunning', 
        'queueLength', 
        'pausedServer'
    ],
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
      selectedsamplesAll: {
        deep: true, 
        handler(val){
            // iterate 
            
            
        }
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
      queueList: {
        deep: true, 
        handler(val){
            console.log(val,"<")
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
                f.demux = f.demux && f.demux != 'false' && f.demux != 'FALSE' && f.demux != 'False' ? true : false
                f.compressed = f.compressed && f.compressed != 'false' && f.compressed != 'FALSE' && f.compressed != 'False' ? true : false
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
        
        sampleErrors() {
            if (!this.editedItem.sample || this.editedItem.sample === '') {
                return `${this.toggleDemuxRun ? 'Run Name' : 'Sample Name'} is required`
            }
            return [];
        },
        dbErrors() {
            if (!this.editedItem.database || this.editedItem.database === '') {
                return 'Database Name/Path is required';
            }
            return [];
        },
        pathErrors1() {
            if (!this.editedItem.path_1 || this.editedItem.path_1 === '') {
                return `${this.toggleDemuxRun ? 'Run Location of Barcodes' : 'Directory/Files'} required`
            }
            return [];
        },
        isFormValid() {
            return this.editedItem.sample  && this.editedItem.path_1 ;
        },
        numberOfPages () {
                return Math.ceil(this.selectedSample.length / this.itemsPerPage)
        },
        queueSample(){
            return this.queueList[this.selectedQueueSample]
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
            return this.nonhiddensamples.length === this.selectedsamplesAll.length
        },
        
        selectedSomeSamples () {
            return this.selectedsamplesAll.length > 0 && !this.selectedAllSamples
        },
        nonhiddensamples(){
            return this.selectedsamplesAll.filter((obj)=>{
            return !obj.hidden
            }).map((d)=>{
            return d.sample
            })
        },
        samples() {
            return this.dataSamples
        },
        filteredKeys () {
            return this.keys.filter(key => key !== 'Name')
        },
        formTitle () {
            return this.editedIndex === -1 ? 'New Sample' : 'Edit Sample'
        },
      
    },
    data(){
      return {
          CSVTITLE: "Mytax2Report",
          snack: false, 
          drawerSample: false,
          name: null,
          dialogJobs: false,
          dialogJobsInfo: false,
          singleExpand: true,
          expanded: [],
          scroll:true,
          tab:0,
          page: 1,
          itemsPerPage: 9,
          sortBy: 'name',
          itemsPerPageArray: [9, 15, 20 ],
          search: '',
          searchPatternBC: 'barcode*',
          filter: {},
          sortDesc: false,
          dialogAdvanced: false,
          dialogQueue: false,
          dialogLogs: false,
          attributes: [
            'run',
            'database', 
            'sample', 
            'filepath', 
            "fullreport",
            "sampleReport"
          ],
          adjustable: {
            format: {
                type: 'list', 
                values: ['file', 'directory']
            }, 
            path_1: {
                type: 'string',
            }, 
            path_2: {
                type: 'string'
            }, 
            demux: {
                type: 'boolean'
            },
            pattern: {
                type: 'string'
            }, 
            kits: {
                type: 'string'
            }, 
            database: {
                type: 'string'
            },
            platform: {
                type: 'list',
                values: ['oxford', 'illumina']
            }
          },
          tabs: [ 'Kraken2 Advanced Config'],
          advanced:true,
          sheet:false,
          headers: [
            { text: 'Sample Name', value: 'sample' },
            { text: 'Status', value: 'status' },
            { text: 'Actions', value: 'action', sortable: false },
            { text: 'Jobs', value: 'jobs', sortable: false },
            { text: 'Edit', value: 'edit', sortable: false },
            { text: 'Delete', value: 'delete', sortable: false },
          ],
          stagedData: [],
          toggleDatabases: true,
          toggleDemuxRun: false, 
          selectedQueueJob: null,
          selectedQueueSample: null,
          recentDataFileadded: null,
          addRunDialog: false,
          config: {},
          paused: false,
          snackColor: '',
          editedItem: {
            sample: '',
            path_1: null,
            path_2: null,
            database: null,
            kits: null,
            pattern: "",
          },
          defaultItem: {
            sample: '',
            path_1: null,
            path_2: null,
            database: null,
            kits: null,
            pattern: ""
          },
          selectedSample: null,
          selectedSampleObj: {},
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
          headersSample: [
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
                type: 'boolean',
                sortable: false,
            },
            {
                text: "Sample Name",
                value: "sample",
                type: 'string',
                sortable: true,
            },
            {
                text: "Path 1",
                value: "path_1",
                type: 'string',
                sortable: true,
            },
            {
                text: "Path 2",
                value: "path_2",
                type: 'string',
                align:"center"  ,              
                sortable: true,
            },
            {
                text: "Format",
                value: "format",
                type: 'list',
                values: ['directory', 'file'],
                sortable: true,
            },
            {
                text: "Platform",
                value: "platform",
                type: 'list',
                value: ['oxford', 'illumina'],
                align:"center"  ,              
                sortable: true,
            },
            {
                text: "Kraken2 Database",
                value: "database",
                sortable: true,
                type: 'string',
                cellClass: "text-wrap overflow-auto ",
            },
            {
                text: "Pattern to match barcodes",
                value: "pattern",
                type: 'string',
                sortable: false,
            },
            {
                text: "Barcode Kits",
                value: "kits",
                type: 'string',
                sortable: false,
            },
            
            
            
        ],
      }
    },
    async mounted() {
        this.runName = "No_Name"
        this.config['memory-mapping']={ value: true, type: 'boolean' }
        this.config['gzip-compressed'] = { value: false, type: 'boolean' }
        this.config['bzip2-compressed'] = { value: false, type: 'boolean' }
        this.config['minimum-hit-groups'] = { value: null, type: 'number' }
        this.config['report-minimizer-data'] = { value: false, type: 'boolean' }
        this.config['report-zero-counts'] = { value: false, type: 'boolean' }
        this.config['quick'] = { value: false, type: 'boolean' }
        this.config['confidence'] = { value: 0.0, type: 'number' }
        this.config['minimum-base-quality'] = { value: 0, type: 'number' }
        this.dataSamples = this.samplesheet
        
    },
 
    methods: {
        updateConfig(type){
            // extract all values from config and send to server as key: value
            let config = {}
            Object.keys(this.config).forEach((key)=>{
                config[key] = this.config[key].value
            })
            console.log(config)
            this.$emit("updateConfig", (type == 'bundle' ? this.stagedBundleConfig : config ), type)
        },
        pasteLine(arr){
            if (Array.isArray(arr) && arr.length > 0){
                return arr.filter((f)=>{
                    return f &&  f != ''  && f != "null"
                }).join('\n')
            } else {
                return arr
            }
        },
        handleInputPathDb(event) {
            // Send current input value to the server
            const value = event.target.value;
            this.$emit("sendMessage", { type: "searchPathDb", value: value  })
        },
        handleInputPath1(event) {
            // Send current input value to the server
            const value = event.target.value;
            this.$emit("sendMessage", { type: "searchPath1", value: value  })
        },
        handleInputPath2(event) {
            // Send current input value to the server
            const value = event.target.value;
            this.$emit("sendMessage", { type: "searchPath2", value: value  })
        },
        hideSample(sample){
            let index = this.selectedsamplesAll.findIndex(x => x.sample === sample)
            if (index > -1){
            this.$set(this.selectedsamplesAll[index], 'hidden' , true)
            }
        },
        selectSample( sample){
            let index = this.selectedsamplesAll.findIndex(x => x.sample === sample)
            if (index > -1){
            this.$set(this.selectedsamplesAll[index], 'hidden' , false)
            }
        },
        toggleAllSelection() {
            // Implement logic to select/deselect all items
            this.selectAll = !this.selectAll;
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
            let samplename  = path.parse(val.name).name
            async function parseFile(){
                $this.$emit("importData", reader.result, null, samplename, true)
                // await $this.$emit("updateSampleStatus", samplename, {running: false, preload: true, success: true, hidden: false, error: null })

            }
        },
        toggleSamples () {
          this.$nextTick(() => {
            
            if (this.selectedAllSamples) {
              for (let i=0; this.selectedsamplesAll.length > i ; i++){
                if (this.selectedsamplesAll[i]){
                  this.$set(this.selectedsamplesAll[i], 'hidden' , true)
                }
              }
            } else {
              for (let i=0; this.selectedsamplesAll.length > i ; i++){
                
                if (this.selectedsamplesAll[i]){
                  this.$set(this.selectedsamplesAll[i], 'hidden' , false)
                }
              }
            }
          })
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
            this.$emit("sendMessage", {
                type: "rerun", 
                run: this.selectedRun,
                overwrite: true,
                sample: sample,
                index: index,
                full: index > -1 ? false : true,
                "message" : `Begin rerun of ${sample}, job # ${index}`
            })
        },
        barcode(item){
            this.$emit("barcode", item)
        },
        flush(){
            this.$emit("sendMessage", { type: "flush" });
             
        },
        cancelJob(index, sample){
            this.$emit("sendMessage", {type: "cancel",  run: this.selectedRun,  index:index, sample: sample   });
        },
        forceRestart(){
            console.log("forcerestart")
            this.$emit("sendMessage", {
                type: "rerun", 
                run: this.selectedRun,
                overwrite: true,
                sample: null,
                index: null,
                full: true,
                "message" : `Begin rerun of all samples`
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
        deleteRow(sample){
            // this.$swal({
            //     title: 'Are you sure?',
            //     text: 'You won\'t be able to revert this!',
            //     icon: 'warning',
            //     showCancelButton: true,
            //     confirmButtonColor: '#3085d6',
            //     cancelButtonColor: '#d33',
            //     confirmButtonText: 'Yes, delete it!'
            // }).then((result) => {
            //     if (result.isConfirmed) {
                    // this.$swal(
                    //     'Deleted!',
                    //     'The sample has been deleted.',
                    //     'success'
                    // )
                    this.$emit("deleteEntry", sample);
                // }
            // });
        },
        editItem (item) {
            // get the index in selectedsamplesAll where sample == item
            let editedIndex = this.samplesheet.findIndex(x => x.sample === item)
            if (editedIndex > -1){
                this.editedItem = Object.assign({}, this.samplesheet[editedIndex])
            }
            this.toggleDemuxRun = false
            this.editedIndex = editedIndex
            this.dialog = true
        },
        closeItem () {
            this.dialog = null
            this.$nextTick(() => {
                // this.editedItem = Object.assign({}, this.defaultItem)
                // this.editedIndex = -1
            })
        },
        closeDelete () {
            this.dialogDelete = false
            this.$nextTick(() => {
            this.editedItem = Object.assign({}, this.defaultItem)
            
            this.editedIndex = -1
            })
        },
        saveItem() {
            if (this.toggleDemuxRun){
                this.editedItem.searchPatternBC = this.searchPatternBC
            } else {
                this.editedItem.searchPatternBC = null
            }
            // this.editedItem.searchPatternBC = this.searchPatternBC
            this.$emit("updateEntry", this.editedItem)
            this.dialog = null
            this.closeItem()
        },
    
    }
    
    
  };
</script>
<style scoped>
code {
    white-space: pre-wrap;
}
.truncate-text .tooltip-content {
  display: inline-block;
    width: 950px; /* Adjust the width as necessary */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.v-tooltip__content {
  max-width: 200px; /* Adjust the max-width for the tooltip content as needed */
}

/* Additional styles to customize the tooltip arrow */
.v-tooltip--bottom .v-tooltip__content::before {
  border-bottom-color: "blue"; /* Change the arrow color */
  margin-left: 0; /* Adjust arrow position */
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
	/* max-width: calc(100% - 48px); */
	/* max-height: calc(100vh - 170px); */
}
.v-data-table {
	overflow: auto;
}
.v-data-table /deep/ .v-data-table__wrapper {
	overflow: unset;
}
</style>