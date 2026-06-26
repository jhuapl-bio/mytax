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
    <div class="mx-4 my-6"  id="file" @drop.prevent="addDropFileData" @dragover.prevent   
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
                <div>
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
                        <div class="mtx-status-cell">
                            <!-- One composite status badge per sample:
                                 yellow = files waiting in the queue (number = how many)
                                 green  = all done (listening for new reads if watching)
                                 red    = can't establish watching / a job failed
                                 The number in the middle = items still in this sample's
                                 queue; hover shows a % complete + error breakdown. The
                                 DNA helix spins while a report is being generated. -->
                            <v-tooltip bottom content-class="mtx-qbadge-tipwrap">
                                <template v-slot:activator="{ on }">
                                    <span v-on="on"
                                        class="mtx-qbadge"
                                        :class="['mtx-qbadge--' + sampleBadge(item).color, { 'mtx-qbadge--running': item.status.running }]"
                                        @click="selectedQueueSample = item.sample; dialogJobs = true">
                                        <v-icon v-if="item.status.running" x-small class="mtx-qbadge-dna mtx-dna-spin">mdi-dna</v-icon>
                                        <span class="mtx-qbadge-num">{{ sampleBadge(item).num }}</span>
                                    </span>
                                </template>
                                <div class="mtx-qbadge-tip">
                                    <div class="mtx-qbadge-tip-h">{{ item.sample }} — {{ sampleBadge(item).label }}</div>
                                    <table class="mtx-qbadge-table">
                                        <tr><td>In queue</td><td>{{ sampleQueue(item.sample).pending }}</td></tr>
                                        <tr><td>Running</td><td>{{ sampleQueue(item.sample).running }}</td></tr>
                                        <tr><td>Completed</td><td>{{ sampleQueue(item.sample).done }} / {{ sampleQueue(item.sample).total }}</td></tr>
                                        <tr v-if="sampleQueue(item.sample).error"><td>Errors</td><td class="mtx-qbadge-err">{{ sampleQueue(item.sample).error }}</td></tr>
                                        <tr><td>% complete</td><td>{{ sampleQueue(item.sample).percent }}%</td></tr>
                                        <tr><td>Listening</td><td>{{ isWatching(item) ? 'yes (real-time)' : 'no' }}</td></tr>
                                    </table>
                                </div>
                            </v-tooltip>
                        </div>
                        </template>
                        <template v-slot:item.origin="{ item }">
                            <v-tooltip bottom>
                                <template v-slot:activator="{ on }">
                                    <span v-on="on" class="mtx-src-tag" :class="'mtx-src-tag--' + (item.origin || 'server')">
                                        <v-icon x-small class="mr-1">{{ sourceIcon(item.origin) }}</v-icon>{{ sourceLabel(item.origin) }}
                                    </span>
                                </template>
                                {{ sourceTooltip(item.origin) }}
                            </v-tooltip>
                        </template>
                        <template v-slot:item.delete="{ item }">
                        <v-tooltip bottom>
                            <template v-slot:activator="{ on }">
                                <v-btn icon small v-on="on"
                                    :class="isLocal(item) ? 'mtx-del-local' : 'mtx-del-server'"
                                    @click="deleteRow(item.sample)">
                                    <v-icon small>{{ isLocal(item) ? 'mdi-close-circle' : 'mdi-delete' }}</v-icon>
                                </v-btn>
                            </template>
                            {{ isLocal(item) ? 'Remove this uploaded report (local only)' : 'Delete sample from run' }}
                        </v-tooltip>
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
                <!-- ===== compact queue summary (always visible in drawer) ===== -->
                <div class="mtx-queue-summary" v-if="!offlineMode">
                    <div class="mtx-queue-summary-head">
                        <span class="mtx-queue-title">Job queue</span>
                        <span class="mtx-queue-total">{{ jobStats.total }} job{{ jobStats.total === 1 ? '' : 's' }}</span>
                    </div>
                    <div class="mtx-queue-chips">
                        <span class="mtx-qchip running" v-if="jobStats.running">{{ jobStats.running }} running</span>
                        <span class="mtx-qchip queued" v-if="jobStats.queued">{{ jobStats.queued }} queued</span>
                        <span class="mtx-qchip error" v-if="jobStats.error">{{ jobStats.error }} error</span>
                        <span class="mtx-qchip done" v-if="jobStats.finished">{{ jobStats.finished }} done</span>
                        <span class="mtx-qchip paused" v-if="jobStats.paused">{{ jobStats.paused }} paused</span>
                        <span class="mtx-qchip empty" v-if="!jobStats.total">No jobs yet</span>
                    </div>
                    <div class="mtx-queue-actions">
                        <v-btn x-small depressed color="indigo darken-1" dark @click="dialogQueueBoard = true">
                            <v-icon x-small left>mdi-rotate-3d-variant</v-icon>Queue board
                        </v-btn>
                        <v-btn x-small depressed color="primary" @click="dialogAllJobs = true">
                            <v-icon x-small left>mdi-format-list-checks</v-icon>View all jobs
                        </v-btn>
                        <v-btn x-small depressed :color="paused ? 'success' : 'grey lighten-2'" @click="paused = !paused">
                            <v-icon x-small left>{{ paused ? 'mdi-play' : 'mdi-pause' }}</v-icon>{{ paused ? 'Resume' : 'Pause' }}
                        </v-btn>
                        <v-btn x-small depressed color="orange darken-1" dark v-if="jobStats.running" @click="cancelAllRunning">
                            <v-icon x-small left>mdi-cancel</v-icon>Cancel running
                        </v-btn>
                    </div>
                </div>
                <span v-else>Jobs in Queue: {{ queueLength }}</span>
                <h2 v-if="selectedsamples && Object.keys(selectedsamples).length == 0">No samples detected yet</h2>
                <!-- Quick-access buttons near the sample table -->
                <div class="mtx-quick-actions" v-if="!offlineMode">
                    <v-tooltip bottom>
                        <template v-slot:activator="{ on }">
                            <v-btn small depressed color="primary" v-on="on" @click="dialog = true" class="mr-2">
                                <v-icon small left>mdi-plus</v-icon>Add Entry to Samplesheet
                            </v-btn>
                        </template>
                        Add a new sample entry to the samplesheet
                    </v-tooltip>
                    <v-tooltip bottom>
                        <template v-slot:activator="{ on }">
                            <v-btn small depressed color="info" v-on="on" @click="forceRestart()">
                                <v-icon small left>mdi-restart</v-icon>Rerun All Jobs
                            </v-btn>
                        </template>
                        Restart all jobs for this run
                    </v-tooltip>
                </div>

                <div
                    class="mtx-upbox"
                    :class="{ 'mtx-upbox--over': uploadDragOver }"
                    @click="pickUpload"
                    @drop.prevent="onUploadDrop"
                    @dragover.prevent="uploadDragOver = true"
                    @dragenter.prevent="uploadDragOver = true"
                    @dragleave.prevent="uploadDragOver = false"
                >
                    <div class="mtx-upbox-icon">
                        <v-icon size="30" :color="uploadDragOver ? '#1e6b97' : '#7d97ad'">mdi-cloud-upload-outline</v-icon>
                    </div>
                    <div class="mtx-upbox-text">
                        <strong>Add a Kraken2 report</strong>
                        <span><u>Click to browse</u> or drop .report / .txt files here</span>
                        <small v-if="!hasSamples" class="mtx-upbox-blurb">
                            No samples loaded yet — start here by adding your own Kraken2 report.
                        </small>
                        <small v-else>From your own Kraken2 runs.</small>
                    </div>
                    <div v-if="uploadRecent.length" class="mtx-upbox-recent">
                        <v-icon x-small color="#15803d" class="mr-1">mdi-check-circle</v-icon>
                        Added {{ uploadRecent.length }}: {{ uploadRecent.slice(0, 3).join(', ') }}{{ uploadRecent.length > 3 ? '…' : '' }}
                    </div>
                    <input
                        ref="uploadInput"
                        type="file"
                        accept=".report,.txt,.tsv,.kreport,text/plain"
                        multiple
                        class="mtx-upbox-input"
                        @change="onUploadSelect"
                    />
                </div>
            </div>
        <v-toolbar extended>
            <v-tooltip  bottom v-if="!offlineMode" >
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
            
            <v-tooltip bottom  v-if="!offlineMode">
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
            <v-tooltip   bottom v-if="!offlineMode && !paused" :key="`${paused}-pausedbutton`">
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
            <v-tooltip v-if="paused && !offlineMode" >
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
                max-width="720px"
                scrollable
                >
                <v-card class="mtx-add-card">
                    <v-card-title class="mtx-add-title">
                        <v-icon left color="primary">mdi-flask-outline</v-icon>
                        <span class="text-h6">{{ formTitle }}</span>
                        <v-spacer></v-spacer>
                        <v-btn icon @click="closeItem"><v-icon>mdi-close</v-icon></v-btn>
                    </v-card-title>
                    <v-divider></v-divider>

                    <v-card-text class="mtx-add-body">
                        <!-- ===== 1. Input mode ===== -->
                        <div class="mtx-sec-label">1 · Input mode</div>
                        <v-btn-toggle v-model="toggleDemuxRun" mandatory dense class="mb-3 mtx-mode-toggle">
                            <v-btn :value="false" small>
                                <v-icon left small>mdi-file-outline</v-icon> Single sample
                            </v-btn>
                            <v-btn :value="true" small>
                                <v-icon left small>mdi-barcode</v-icon> Barcoded run
                            </v-btn>
                        </v-btn-toggle>
                        <div class="mtx-hint mb-3">
                            {{ toggleDemuxRun
                                ? 'Point at a run directory; each matching sub-directory becomes its own sample.'
                                : 'Add one sample from a single file or directory of reads.' }}
                        </div>

                        <!-- ===== 2. Name + inputs ===== -->
                        <div class="mtx-sec-label">2 · {{ toggleDemuxRun ? 'Run' : 'Sample' }} details</div>
                        <v-row dense>
                            <v-col cols="12" :md="toggleDemuxRun ? 6 : 12">
                                <v-text-field
                                    v-model="editedItem.sample"
                                    :label="toggleDemuxRun ? 'Run name' : 'Sample name'"
                                    :error-messages="sampleErrors"
                                    prepend-inner-icon="mdi-rename-box"
                                    dense outlined hide-details="auto"
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" md="6" v-if="toggleDemuxRun">
                                <v-text-field
                                    v-model="editedItem.kits"
                                    label="Barcode kit name (optional)"
                                    prepend-inner-icon="mdi-barcode-scan"
                                    dense outlined hide-details="auto"
                                ></v-text-field>
                            </v-col>

                            <v-col cols="12" :md="toggleDemuxRun ? 12 : 6">
                                <v-combobox
                                    v-model="editedItem.path_1"
                                    :items="pathOptions1"
                                    :hint="editedItem.path_1 ? `Input: ${editedItem.path_1}` : 'Type a path; matches are suggested as you go'"
                                    persistent-hint
                                    :error-messages="pathErrors1"
                                    :label="toggleDemuxRun ? 'Run directory' : 'Sequencing file or directory'"
                                    prepend-inner-icon="mdi-folder-search-outline"
                                    dense outlined
                                    @keyup="handleInputPath1"
                                ></v-combobox>
                            </v-col>
                            <v-col cols="12" md="6" v-if="!toggleDemuxRun">
                                <v-combobox
                                    v-model="editedItem.path_2"
                                    :items="pathOptions2"
                                    :hint="editedItem.path_2 ? `Paired reads: ${editedItem.path_2}` : 'Optional — paired-end R2'"
                                    persistent-hint
                                    label="Paired reads (optional)"
                                    prepend-inner-icon="mdi-file-multiple-outline"
                                    dense outlined
                                    @keyup="handleInputPath2"
                                ></v-combobox>
                            </v-col>

                            <!-- barcode search pattern (only meaningful in barcoded-run mode) -->
                            <v-col cols="12" md="6" v-if="toggleDemuxRun">
                                <v-text-field
                                    v-model="searchPatternBC"
                                    label="Sub-directory match pattern"
                                    hint="Glob for barcode folders, e.g. barcode*"
                                    persistent-hint
                                    prepend-inner-icon="mdi-regex"
                                    dense outlined
                                ></v-text-field>
                            </v-col>
                        </v-row>

                        <!-- ===== Watch toggle ===== -->
                        <v-sheet rounded outlined class="mtx-watch pa-3 my-3">
                            <div class="d-flex align-center">
                                <v-icon :color="editedItem.watch ? 'green darken-1' : 'grey'" class="mr-3">
                                    {{ editedItem.watch ? 'mdi-radar' : 'mdi-eye-off-outline' }}
                                </v-icon>
                                <div class="flex-grow-1">
                                    <div class="font-weight-medium">Watch for new reads (real-time)</div>
                                    <div class="mtx-hint">
                                        Keep watching the input directory and classify new FASTQ files as the
                                        sequencer writes them. Turn off for a one-time run of existing files.
                                    </div>
                                </div>
                                <v-switch v-model="editedItem.watch" inset hide-details class="ma-0 pa-0"></v-switch>
                            </div>
                        </v-sheet>

                        <!-- ===== 3. Database ===== -->
                        <div class="mtx-sec-label">3 · Reference database</div>
                        <v-switch
                            v-model="toggleDatabases"
                            dense hide-details class="mt-0 mb-2"
                            :label="toggleDatabases ? 'Use a standard (downloaded) database' : 'Use a custom database path'"
                        ></v-switch>
                        <v-select v-if="toggleDatabases" chips
                            v-model="editedItem.database" class="truncate-text"
                            :items="databases" :error-messages="dbErrors"
                            label="Database" item-text="key" item-value="fullpath"
                            dense outlined persistent-hint
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
                        <v-combobox v-else
                            v-model="editedItem.database"
                            :items="pathOptionsDb"
                            :hint="editedItem.database ? `Database path: ${editedItem.database}` : 'Path to a Kraken2 database directory'"
                            persistent-hint
                            label="Kraken2 database path"
                            prepend-inner-icon="mdi-database-search-outline"
                            :error-messages="dbErrors"
                            dense outlined
                            @keyup="handleInputPathDb"
                        ></v-combobox>

                        <!-- ===== 4. Location ===== -->
                        <div class="mtx-sec-label mt-4">4 · Location <span class="mtx-opt">optional</span></div>
                        <div class="mtx-hint mb-2">Adds this sample to the Map tab.</div>
                        <v-row dense>
                            <v-col cols="6">
                                <v-text-field
                                    v-model.number="editedItem.lat"
                                    label="Latitude" type="number" step="any" dense outlined hide-details
                                    hint="north +, e.g. 39.16"
                                    prepend-inner-icon="mdi-latitude"
                                ></v-text-field>
                            </v-col>
                            <v-col cols="6">
                                <v-text-field
                                    v-model.number="editedItem.lon"
                                    label="Longitude" type="number" step="any" dense outlined hide-details
                                    hint="east +, e.g. -76.62"
                                    prepend-inner-icon="mdi-longitude"
                                ></v-text-field>
                            </v-col>
                        </v-row>
                    </v-card-text>

                    <v-divider></v-divider>
                    <v-card-actions class="px-4 py-3">
                        <v-icon small color="grey" class="mr-1">mdi-information-outline</v-icon>
                        <span class="mtx-hint">{{ isFormValid ? 'Ready to add.' : 'Fill in name, input path and database.' }}</span>
                        <v-spacer></v-spacer>
                        <v-btn text @click="closeItem">Cancel</v-btn>
                        <v-btn color="primary" depressed :disabled="!isFormValid" @click="saveItem">
                            <v-icon left small>mdi-plus</v-icon>{{ formTitle === 'Edit Sample' ? 'Save' : 'Add' }}
                        </v-btn>
                    </v-card-actions>
                </v-card>

            </v-dialog>
            
            <v-dialog
                v-model="dialogAdvanced" max-width="500px" v-if="!offlineMode"
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
        <!-- ===== consolidated full-width job queue ===== -->
        <!-- Full-screen live queue board (round-robin visualisation + reorder) -->
        <v-dialog v-model="dialogQueueBoard" fullscreen transition="dialog-bottom-transition">
            <QueueBoard
                :queueList="queueList"
                :board="queueBoard"
                :selectedRun="selectedRun"
                @close="dialogQueueBoard = false"
                @reorder-lanes="onReorderLanes"
                @prioritize="onPrioritizeJob"
                @rerun="(p) => start(p.index, p.sample)"
                @cancel="(p) => cancelJob(p.index, p.sample)"
            />
        </v-dialog>

        <v-dialog v-model="dialogAllJobs" max-width="1100" scrollable>
            <v-card>
                <v-toolbar dark color="blue darken-3" dense flat>
                    <v-icon left>mdi-format-list-checks</v-icon>
                    <v-toolbar-title>Job queue — {{ jobStats.total }} job{{ jobStats.total === 1 ? '' : 's' }}</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-btn icon @click="dialogAllJobs = false"><v-icon>mdi-close</v-icon></v-btn>
                </v-toolbar>

                <div class="mtx-jobs-toolbar">
                    <div class="mtx-jobs-filters">
                        <span class="mtx-jobfilter" :class="{ active: jobFilter==='all' }" @click="jobFilter='all'">All <b>{{ jobStats.total }}</b></span>
                        <span class="mtx-jobfilter running" :class="{ active: jobFilter==='running' }" @click="jobFilter='running'">Running <b>{{ jobStats.running }}</b></span>
                        <span class="mtx-jobfilter queued" :class="{ active: jobFilter==='queued' }" @click="jobFilter='queued'">Queued <b>{{ jobStats.queued }}</b></span>
                        <span class="mtx-jobfilter error" :class="{ active: jobFilter==='error' }" @click="jobFilter='error'">Error <b>{{ jobStats.error }}</b></span>
                        <span class="mtx-jobfilter done" :class="{ active: jobFilter==='done' }" @click="jobFilter='done'">Done <b>{{ jobStats.finished }}</b></span>
                    </div>
                    <v-spacer></v-spacer>
                    <div class="mtx-jobs-bulk">
                        <v-btn small depressed :color="paused ? 'success' : 'grey lighten-2'" @click="paused = !paused">
                            <v-icon small left>{{ paused ? 'mdi-play' : 'mdi-pause' }}</v-icon>{{ paused ? 'Resume queue' : 'Pause queue' }}
                        </v-btn>
                        <v-btn small depressed color="orange darken-1" dark :disabled="!jobStats.running" @click="cancelAllRunning">
                            <v-icon small left>mdi-cancel</v-icon>Cancel all running
                        </v-btn>
                        <v-btn small depressed color="blue" dark :disabled="!jobStats.error" @click="rerunFailed">
                            <v-icon small left>mdi-replay</v-icon>Rerun failed
                        </v-btn>
                    </div>
                </div>

                <v-card-text class="pa-0" style="height: 70vh;">
                    <v-data-table
                        :headers="jobHeaders"
                        :items="filteredJobs"
                        :items-per-page="25"
                        :footer-props="{ 'items-per-page-options': [25, 50, 100, -1] }"
                        dense
                        class="mtx-jobs-table"
                    >
                        <template v-slot:item._sample="{ item }">
                            <span class="mtx-job-sample">{{ item._sample }}</span>
                        </template>
                        <template v-slot:item.name="{ item }">
                            {{ item.name || (item.sample && item.sample.demux ? 'Demux' : 'Classify') }}
                            <span class="mtx-job-idx">#{{ item.index }}</span>
                        </template>
                        <template v-slot:item._state="{ item }">
                            <span class="mtx-job-state" :class="item._state">
                                <v-progress-circular v-if="item._state==='running'" indeterminate size="13" width="2" color="blue" class="mr-1"></v-progress-circular>
                                <v-icon v-else x-small :color="stateColor(item._state)" class="mr-1">{{ stateIcon(item._state) }}</v-icon>
                                {{ stateLabel(item._state) }}
                            </span>
                        </template>
                        <template v-slot:item.filepath="{ item }">
                            <span class="mtx-job-file" :title="item.filepath">{{ item.filepath }}</span>
                        </template>
                        <template v-slot:item.actions="{ item }">
                            <v-btn icon x-small :disabled="!item.status.running" @click="cancelJob(item.index, item._sample)" title="Cancel job">
                                <v-icon x-small>mdi-cancel</v-icon>
                            </v-btn>
                            <v-btn icon x-small :disabled="item.status.running" @click="start(item.index, item._sample)" title="Rerun job">
                                <v-icon x-small>mdi-play-circle</v-icon>
                            </v-btn>
                            <v-btn icon x-small @click="reviewJob(item)" title="Review command & logs">
                                <v-icon x-small>mdi-text-box-search</v-icon>
                            </v-btn>
                        </template>
                        <template v-slot:no-data>
                            <div class="pa-6 grey--text">No jobs match this filter.</div>
                        </template>
                    </v-data-table>
                </v-card-text>
            </v-card>
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
  import QueueBoard from '@/components/QueueBoard'

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
        'pausedServer',
        "statussent",
        "offlineMode",
        "queueBoard"
    ],
    components: {
        VueJsonToCsv,
        QueueBoard,
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
      dialogJobs(val){
        !val ? this.selectedQueueSample = null : ''
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
        hasSamples() {
            // any sample currently watched / loaded (server, demo, or uploaded)
            if (this.selectedsamplesAll && this.selectedsamplesAll.length > 0) return true
            return !!(this.selectedsamples && Object.keys(this.selectedsamples).length > 0)
        },
        headers() {
            if (this.offlineMode) {
                return [
                    { text: 'Sample Name', value: 'sample' },
                    { text: 'Source', value: 'origin', sortable: true },
                    { text: 'Actions', value: 'action', sortable: false }, // purely local hide/show
                    { text: 'Remove', value: 'delete', sortable: false },
                ];
            }
            return [
                { text: 'Sample Name', value: 'sample' },
                { text: 'Source', value: 'origin', sortable: true },
                { text: 'Status', value: 'status' },
                { text: 'Actions', value: 'action', sortable: false },
                { text: 'Jobs', value: 'jobs', sortable: false },
                { text: 'Edit', value: 'edit', sortable: false },
                { text: 'Delete', value: 'delete', sortable: false },
            ];
        },
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
            return this.selectedQueueSample ? this.queueList[this.selectedQueueSample] : []
        },
        // Flatten every sample's job list into one array so the whole queue can be
        // seen at once, each tagged with its sample (the queueList key) and a
        // single derived state.
        allJobs(){
            const out = []
            const ql = this.queueList || {}
            Object.keys(ql).forEach((sample) => {
                (ql[sample] || []).forEach((job) => {
                    out.push(Object.assign({}, job, { _sample: sample, _state: this.jobState(job) }))
                })
            })
            return out
        },
        // Counts per state for the summary chips / filters.
        jobStats(){
            const c = { running: 0, queued: 0, error: 0, done: 0, historical: 0, paused: 0, preload: 0, total: 0 }
            this.allJobs.forEach((j) => { c[j._state] = (c[j._state] || 0) + 1; c.total += 1 })
            c.finished = c.done + c.historical
            return c
        },
        filteredJobs(){
            const f = this.jobFilter
            if (!f || f === 'all') return this.allJobs
            if (f === 'done') return this.allJobs.filter(j => j._state === 'done' || j._state === 'historical')
            return this.allJobs.filter(j => j._state === f)
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
          dialogAllJobs: false,
          dialogQueueBoard: false,
          jobFilter: 'all',
          jobHeaders: [
            { text: 'Sample', value: '_sample' },
            { text: 'Job', value: 'name' },
            { text: 'Status', value: '_state' },
            { text: 'File', value: 'filepath' },
            { text: 'Actions', value: 'actions', sortable: false },
          ],
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
        //   headers: [
        //     { text: 'Sample Name', value: 'sample' },
        //     { text: 'Status', value: 'status' },
        //     { text: 'Actions', value: 'action', sortable: false },
        //     { text: 'Jobs', value: 'jobs', sortable: false },
        //     { text: 'Edit', value: 'edit', sortable: false },
        //     { text: 'Delete', value: 'delete', sortable: false },
        //   ],
          stagedData: [],
          toggleDatabases: true,
          toggleDemuxRun: false, 
          selectedQueueJob: null,
          selectedQueueSample: null,
          recentDataFileadded: null,
          uploadDragOver: false,
          uploadRecent: [],
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
            watch: true,
            lat: null,
            lon: null,
          },
          defaultItem: {
            sample: '',
            path_1: null,
            path_2: null,
            database: null,
            kits: null,
            pattern: "",
            watch: true,
            lat: null,
            lon: null,
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
            const file = e.dataTransfer.files[0];
            if (file) {
                console.log("Dropped file:", file.name);
                this.addData(file);
            }
        },
        addDropFile(e) { 
            this.names_file_input = e.dataTransfer.files[0]; 
        },
        onFileSelected(file) {
            const $this  = this
            if (!file) return;
            let reader = new FileReader();
            reader.addEventListener("load", parseFile, false);
            reader.readAsText(file);
            let samplename  = path.parse(file.name).name

            async function parseFile(){
                $this.$emit("importData", reader.result, samplename)
            }
        },
        pickUpload() {
            this.$refs.uploadInput && this.$refs.uploadInput.click()
        },
        onUploadSelect(e) {
            this.handleUploadFiles(Array.from(e.target.files || []))
            e.target.value = '' // allow re-selecting the same file
        },
        onUploadDrop(e) {
            this.uploadDragOver = false
            const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []
            this.handleUploadFiles(files)
        },
        handleUploadFiles(files) {
            if (!files || !files.length) return
            const added = []
            files.forEach((file) => {
                added.push(path.parse(file.name).name)
                this.onFileSelected(file)
            })
            this.uploadRecent = added
        },
        addData(val){
            const $this  = this
            let reader = new FileReader();  
            reader.addEventListener("load", parseFile, false);
            reader.readAsText(val);
            let samplename  = path.parse(val.name).name
            async function parseFile(){
                $this.$emit("importData", reader.result, samplename)
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
            if (this.offlineMode) return;
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
            if (this.offlineMode) return;
            this.$emit("sendMessage", { type: "flush" });
             
        },
        cancelJob(index, sample){
            if (this.offlineMode) return;
            this.$emit("sendMessage", {type: "cancel",  run: this.selectedRun,  index:index, sample: sample   });
        },
        // count of in-flight jobs for a sample, shown in the DNA tooltip
        runningCount(item){
            try{
                const list = item && this.queueList && this.queueList[item.sample]
                if (!Array.isArray(list)) return 0
                return list.filter(j => j && j.status && j.status.running).length
            } catch (e){ return 0 }
        },
        // Per-sample queue breakdown used by the status badge + its hover table.
        sampleQueue(sample){
            const out = { total: 0, done: 0, running: 0, queued: 0, error: 0, pending: 0, percent: 0 }
            const list = this.queueList && this.queueList[sample]
            if (!Array.isArray(list)) return out
            list.forEach((j) => {
                if (!j) return
                const st = this.jobState(j)
                out.total += 1
                if (st === 'running') out.running += 1
                else if (st === 'done' || st === 'historical') out.done += 1
                else if (st === 'error') out.error += 1
                else if (st === 'cancelled') { /* not counted as pending or done */ }
                else out.queued += 1 // queued / paused / preload
            })
            out.pending = out.running + out.queued
            out.percent = out.total ? Math.round((out.done / out.total) * 100) : 0
            return out
        },
        // Map the breakdown + watch state to a single coloured badge.
        sampleBadge(item){
            const q = this.sampleQueue(item.sample)
            const watching = this.isWatching(item)
            if (q.pending > 0){
                return { color: 'yellow', num: q.pending,
                    label: `${q.pending} ${q.pending === 1 ? 'file' : 'files'} waiting to be analyzed` }
            }
            if (q.error > 0){
                return { color: 'red', num: q.error,
                    label: `${q.error} ${q.error === 1 ? 'job' : 'jobs'} failed — check logs` }
            }
            if (q.total > 0){
                return { color: 'green', num: q.done,
                    label: watching ? 'All done — listening for new reads' : 'All done' }
            }
            // nothing queued yet
            if (watching){
                return { color: 'green', num: 0, label: 'Listening for new reads' }
            }
            return { color: 'red', num: 0, label: 'Not able to establish watching / read reports' }
        },
        // QueueBoard: drag-reorder the barcode/sample rotation
        onReorderLanes(samples){
            if (this.offlineMode) return;
            this.$emit("sendMessage", { type: "setLaneOrder", run: this.selectedRun, samples });
        },
        // QueueBoard: bump a single fastq to run next
        onPrioritizeJob(p){
            if (this.offlineMode) return;
            this.$emit("sendMessage", { type: "prioritizeJob", run: this.selectedRun, sample: p.sample, index: p.index });
        },
        // A sample is "watching" when real-time watch mode is active on the
        // backend (status.watching) — falls back to the per-sample/config watch
        // flag for samples whose status hasn't been refreshed yet.
        isWatching(item){
            if (!item) return false
            const st = item.status || {}
            if (st.watching === true) return true
            if (st.watching === false) return false
            const cfgWatch = item.config && item.config.watch
            return !!(item.watch || cfgWatch) && (item.origin || 'server') === 'server'
        },
        // Derive one status string from a job's status flags.
        // NOTE: kraken2 prints its normal progress ("Loading database... done",
        // "N sequences processed") to STDERR, which we capture into status.error.
        // So a non-empty status.error does NOT mean the job failed. Only treat a
        // job as errored when it explicitly finished unsuccessfully (success ===
        // false, or a non-zero exit code).
        jobState(job){
            const s = (job && job.status) || {}
            if (s.running) return 'running'
            if (s.cancelled) return 'cancelled'
            if (s.success === true) return s.historical ? 'historical' : 'done'
            if (s.success === false || (s.code != null && s.code !== 0)) return 'error'
            if (s.paused) return 'paused'
            if (s.preload) return 'preload'
            return 'queued'
        },
        stateLabel(st){
            return ({ running: 'Running', queued: 'Queued', error: 'Error', done: 'Done',
                historical: 'Done (cached)', paused: 'Paused', preload: 'Preloaded', cancelled: 'Cancelled' })[st] || st
        },
        stateColor(st){
            return ({ running: 'blue', queued: 'grey', error: 'orange darken-1', done: 'green',
                historical: 'green', paused: 'amber darken-2', preload: 'blue-grey', cancelled: 'grey darken-1' })[st] || 'grey'
        },
        stateIcon(st){
            return ({ running: 'mdi-progress-clock', queued: 'mdi-tray-full', error: 'mdi-alert-box',
                done: 'mdi-check-circle', historical: 'mdi-history', paused: 'mdi-pause-circle',
                preload: 'mdi-file', cancelled: 'mdi-cancel' })[st] || 'mdi-help-circle'
        },
        reviewJob(job){
            this.selectedQueueJob = job
            this.dialogQueue = true
        },
        cancelAllRunning(){
            if (this.offlineMode) return;
            this.allJobs.filter(j => j._state === 'running').forEach(j => this.cancelJob(j.index, j._sample))
        },
        rerunFailed(){
            if (this.offlineMode) return;
            this.allJobs.filter(j => j._state === 'error').forEach(j => this.start(j.index, j._sample))
        },
        forceRestart(){
            if (this.offlineMode) return;
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
        isLocal(item){
            const o = item && item.origin ? item.origin : 'server'
            return o === 'upload' || o === 'demo'
        },
        sourceLabel(origin){
            const o = origin || 'server'
            if (o === 'upload') return 'Uploaded'
            if (o === 'demo') return 'Demo'
            return 'Listened'
        },
        sourceIcon(origin){
            const o = origin || 'server'
            if (o === 'upload') return 'mdi-tray-arrow-up'
            if (o === 'demo') return 'mdi-flask-outline'
            return 'mdi-server-network'
        },
        sourceTooltip(origin){
            const o = origin || 'server'
            if (o === 'upload') return 'Kraken2 report you uploaded — held locally in the browser'
            if (o === 'demo') return 'Bundled demo report — held locally in the browser'
            return 'Live sample watched from a local server directory'
        },
        deleteRow(sample){
            console.log(sample, "deleted!")
            // Uploaded/demo reports live only in the browser — always remove them
            // locally and never round-trip to the backend, even when online.
            const item = this.selectedsamplesAll.find(x => x.sample === sample)
            if (this.offlineMode || this.isLocal(item)){
                let index2 = this.selectedsamplesAll.findIndex(x => x.sample === sample)
                if (index2 > -1){
                    this.selectedsamplesAll.splice(index2, 1)
                }
                return
            };
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
                this.editedItem = Object.assign({ lat: null, lon: null }, this.samplesheet[editedIndex])
            }
            this.toggleDemuxRun = false
            this.editedIndex = editedIndex
            // this.editedItem = Object.assign({}, this.editedItem)
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
            // watch on ⇒ keep watching the directory for new reads in real time
            this.$set(this.editedItem, 'watch', this.editedItem.watch !== false)
            // this.editedItem.searchPatternBC = this.searchPatternBC
            // remove file:// from the front of the path_1 or path_2
            if (this.editedItem.path_1 && this.editedItem.path_1.startsWith('file://')){
                this.editedItem.path_1 = this.editedItem.path_1.replace('file://', '')
            } 
            if (this.editedItem.path_2 && this.editedItem.path_2.startsWith('file://')){
                this.editedItem.path_2 = this.editedItem.path_2.replace('file://', '')
            } 
            // if the db is a file, remove file:// from the front of the path
            if (this.editedItem.database && this.editedItem.database.startsWith('file://')){
                this.editedItem.database = this.editedItem.database.replace('file://', '')
            }
            if (this.editedItem.path_2 && this.editedItem.path_2.startsWith('file://')){
                this.editedItem.path_2 = this.editedItem.path_2.replace('file://', '')
            }
            this.$emit("updateEntry", this.editedItem)
            // propagate lat/long to sample metadata so it shows on Map / Metadata tabs
            if (this.editedItem.sample &&
                (this.editedItem.lat !== undefined && this.editedItem.lat !== null && this.editedItem.lat !== '' ||
                 this.editedItem.lon !== undefined && this.editedItem.lon !== null && this.editedItem.lon !== '')) {
                this.$emit("updateMeta", {
                    sample: this.editedItem.sample,
                    lat: this.editedItem.lat === '' || this.editedItem.lat === undefined ? null : parseFloat(this.editedItem.lat),
                    lon: this.editedItem.lon === '' || this.editedItem.lon === undefined ? null : parseFloat(this.editedItem.lon)
                })
            }
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
/* ===== compact queue summary (drawer) ===== */
.mtx-queue-summary {
    margin: 10px 4px 4px;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #f8fafc;
}
.mtx-queue-summary-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 6px;
}
.mtx-queue-title { font-size: 12px; font-weight: 700; letter-spacing: .03em; color: #334155; text-transform: uppercase; }
.mtx-queue-total { font-size: 11px; color: #64748b; }
.mtx-queue-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.mtx-qchip {
    font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
    background: #e2e8f0; color: #334155; line-height: 1.5;
}
.mtx-qchip.running { background: #dbeafe; color: #1d4ed8; }
.mtx-qchip.queued  { background: #e2e8f0; color: #475569; }
.mtx-qchip.error   { background: #ffedd5; color: #c2410c; }
.mtx-qchip.done    { background: #dcfce7; color: #15803d; }
.mtx-qchip.paused  { background: #fef3c7; color: #b45309; }
.mtx-qchip.empty   { background: transparent; color: #94a3b8; font-weight: 500; padding-left: 0; }
.mtx-queue-actions { display: flex; flex-wrap: wrap; gap: 6px; }

/* ===== full-width jobs dialog ===== */
.mtx-jobs-toolbar {
    display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
    padding: 10px 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
}
.mtx-jobs-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.mtx-jobfilter {
    font-size: 12px; padding: 3px 10px; border-radius: 999px; cursor: pointer;
    background: #eef2f7; color: #475569; border: 1px solid transparent; user-select: none;
}
.mtx-jobfilter b { font-weight: 700; margin-left: 3px; }
.mtx-jobfilter:hover { border-color: #cbd5e1; }
.mtx-jobfilter.active { background: #1d4ed8; color: #fff; }
.mtx-jobfilter.running.active { background: #2563eb; }
.mtx-jobfilter.error.active   { background: #ea580c; }
.mtx-jobfilter.done.active    { background: #16a34a; }
.mtx-jobs-bulk { display: flex; flex-wrap: wrap; gap: 6px; }
.mtx-job-sample { font-weight: 600; color: #1e293b; }
.mtx-job-idx { font-size: 10px; color: #94a3b8; margin-left: 4px; }
.mtx-job-state { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; }
.mtx-job-state.error { color: #c2410c; }
.mtx-job-state.running { color: #1d4ed8; }
.mtx-job-state.done, .mtx-job-state.historical { color: #15803d; }
.mtx-job-file {
    display: inline-block; max-width: 280px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; vertical-align: middle; font-size: 11.5px; color: #64748b;
}
/* ===== Kraken2 report upload drop box ===== */
.mtx-upbox {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin: 10px 0 4px;
    padding: 16px 18px;
    background: linear-gradient(180deg, #f9fcff 0%, #f1f7fc 100%);
    border: 2px dashed #bcd0e2;
    border-radius: 14px;
    cursor: pointer;
    transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.mtx-upbox:hover {
    border-color: #1e6b97;
    background: #f4faff;
}
.mtx-upbox--over {
    border-color: #1e6b97;
    background: #eaf4fc;
    box-shadow: 0 0 0 3px rgba(30, 107, 151, 0.18);
}
.mtx-upbox-icon {
    flex: none;
    width: 52px;
    height: 52px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid #dce8f2;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(20, 56, 84, .08);
}
.mtx-upbox-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
}
.mtx-upbox-text strong { font-size: 14px; color: #274766; }
.mtx-upbox-text span { font-size: 12.5px; color: #5b6573; }
.mtx-upbox-text span u { color: #1e6b97; }
.mtx-upbox-text small { font-size: 11px; color: #93a6b6; line-height: 1.3; }
.mtx-upbox-text small.mtx-upbox-blurb {
    color: #1e6b97;
    font-weight: 600;
}
.mtx-upbox-recent {
    flex-basis: 100%;
    font-size: 11px;
    color: #15803d;
    background: #ecfdf3;
    border: 1px solid #d1fadf;
    border-radius: 8px;
    padding: 4px 10px;
    display: flex;
    align-items: center;
}
.mtx-upbox-input { display: none; }
/* ===== quick-action buttons above upload box ===== */
.mtx-quick-actions {
    display: flex;
    gap: 8px;
    padding: 8px 16px 4px;
}
/* ===== sample source tags ===== */
.mtx-src-tag {
    display: inline-flex;
    align-items: center;
    font-size: 10.5px;
    font-weight: 700;
    border-radius: 999px;
    padding: 1px 8px;
    letter-spacing: .02em;
    white-space: nowrap;
}
.mtx-src-tag--server { background: #e0f2fe; color: #075985; }
.mtx-src-tag--upload { background: #ede9fe; color: #5b21b6; }
.mtx-src-tag--demo   { background: #dcfce7; color: #166534; }

/* ===== delete affordances ===== */
.mtx-del-server:hover { color: #b91c1c !important; }
.mtx-del-local {
    color: #b91c1c !important;
    transition: transform .12s ease, background .12s ease;
}
.mtx-del-local:hover {
    transform: scale(1.12);
    background: #fee2e2 !important;
    border-radius: 50%;
}
/* ===== redesigned add-sample dialog ===== */
.mtx-add-card { border-radius: 14px; }
.mtx-add-title { display: flex; align-items: center; padding: 14px 16px; }
.mtx-add-body { padding: 18px 20px 8px; }
.mtx-sec-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
    font-weight: 700; color: #5b6573; margin: 10px 0 8px;
}
.mtx-opt { font-weight: 500; text-transform: none; letter-spacing: 0; color: #9aa7b4; font-style: italic; margin-left: 4px; }
.mtx-hint { font-size: 12px; color: #8a97a4; line-height: 1.4; }
.mtx-mode-toggle { width: 100%; }
.mtx-mode-toggle .v-btn { flex: 1; text-transform: none; }
.mtx-watch { background: #f7fbf9 !important; border-color: #d7e8e1 !important; }
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

/* ===== sample status cell ===== */
.mtx-status-cell {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}
/* pulsing green light = sample is being watched for new reads in real time */
.mtx-watch-light {
	display: inline-block;
	width: 11px;
	height: 11px;
	border-radius: 50%;
	background: #22c55e;
	flex-shrink: 0;
	animation: mtx-watch-pulse 1.8s ease-in-out infinite;
}
@keyframes mtx-watch-pulse {
	0%   { box-shadow: 0 0 0 0 rgba(34,197,94,.6); }
	70%  { box-shadow: 0 0 0 7px rgba(34,197,94,0); }
	100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
/* animated DNA helix = a report is actively being generated for this sample */
.mtx-k2-active { display:inline-flex; align-items:center; }
.mtx-dna-spin {
	animation: mtx-dna-throb 1.2s ease-in-out infinite;
	transform-origin: center;
}
@keyframes mtx-dna-throb {
	0%   { transform: rotate(0deg) scale(1);    opacity: .65; }
	50%  { transform: rotate(180deg) scale(1.18); opacity: 1; }
	100% { transform: rotate(360deg) scale(1);    opacity: .65; }
}

/* composite per-sample status badge: coloured ring + count in the middle */
.mtx-qbadge {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	cursor: pointer;
	font-weight: 700;
	font-size: 0.8rem;
	color: #1f2937;
	border: 2.5px solid #cbd5e1;
	background: #f8fafc;
	transition: transform .1s ease, box-shadow .1s ease;
}
.mtx-qbadge:hover { transform: scale(1.08); }
.mtx-qbadge-num { line-height: 1; }
.mtx-qbadge-dna { position: absolute; top: -7px; right: -7px; color: #2563eb !important; }
/* yellow = work waiting in the queue */
.mtx-qbadge--yellow { border-color: #f59e0b; background: #fef3c7; color: #92400e; }
/* green = all done / listening */
.mtx-qbadge--green  { border-color: #22c55e; background: #dcfce7; color: #166534; }
/* red = can't watch / read, or a job failed */
.mtx-qbadge--red    { border-color: #ef4444; background: #fee2e2; color: #991b1b; }
/* pulse while a report is actively generating */
.mtx-qbadge--running { animation: mtx-qbadge-pulse 1.4s ease-in-out infinite; }
@keyframes mtx-qbadge-pulse {
	0%   { box-shadow: 0 0 0 0 rgba(37,99,235,.45); }
	70%  { box-shadow: 0 0 0 8px rgba(37,99,235,0); }
	100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
}
/* hover detail table */
.mtx-qbadge-tip { min-width: 210px; }
.mtx-qbadge-tip-h { font-weight: 700; margin-bottom: 6px; }
.mtx-qbadge-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.mtx-qbadge-table td { padding: 2px 6px; }
.mtx-qbadge-table td:last-child { text-align: right; font-weight: 600; }
.mtx-qbadge-err { color: #fca5a5; }
</style>