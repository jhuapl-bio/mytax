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
                <!-- ===== compact, grouped sample table =====
                     Samples are grouped by their parent run/folder so two runs
                     that both contain barcode01..24 stay visually separate. Each
                     group header is collapsible; child rows show the short label
                     (e.g. "barcode01") while the unique id stays under the hood. -->
                <div class="mtx-stable-wrap">
                    <table class="mtx-stable">
                        <thead>
                            <tr>
                                <th class="mtx-st-name">Sample</th>
                                <th class="mtx-st-src">Source</th>
                                <th v-if="!offlineMode" class="mtx-st-status">Status</th>
                                <th class="mtx-st-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <template v-for="grp in groupedSamples">
                                <!-- group header row -->
                                <tr class="mtx-st-grouprow" :key="`grp-${grp.key}`" @click="toggleGroup(grp.key)">
                                    <td :colspan="offlineMode ? 3 : 4">
                                        <span class="mtx-st-caret">
                                            <v-icon x-small>{{ isGroupCollapsed(grp.key) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
                                        </span>
                                        <v-icon x-small class="mtx-st-gicon">{{ grp.group ? 'mdi-folder-multiple-outline' : 'mdi-flask-outline' }}</v-icon>
                                        <span class="mtx-st-gname">{{ grp.group || 'Individual samples' }}</span>
                                        <span class="mtx-st-gcount">{{ grp.samples.length }}</span>
                                        <span class="mtx-st-gstats" v-if="!offlineMode">
                                            <span v-if="groupStats(grp).running" class="mtx-gpill running">{{ groupStats(grp).running }} running</span>
                                            <span v-if="groupStats(grp).queued" class="mtx-gpill queued">{{ groupStats(grp).queued }} queued</span>
                                            <span v-if="groupStats(grp).error" class="mtx-gpill error">{{ groupStats(grp).error }} err</span>
                                            <span v-if="groupStats(grp).done" class="mtx-gpill done">{{ groupStats(grp).done }} done</span>
                                        </span>
                                        <span class="mtx-st-gactions" v-if="grp.group && !offlineMode" @click.stop>
                                            <v-btn icon x-small title="Run every sample in this group" @click="startGroup(grp)">
                                                <v-icon small>mdi-play-circle-outline</v-icon>
                                            </v-btn>
                                            <v-btn icon x-small title="Open all jobs for this group" @click="openGroupJobs(grp)">
                                                <v-icon small>mdi-format-list-bulleted</v-icon>
                                            </v-btn>
                                            <v-btn icon x-small class="mtx-st-gdelete"
                                                :title="`Remove all ${grp.samples.length} samples in ${grp.group}`"
                                                @click="deleteGroup(grp)">
                                                <v-icon small>mdi-delete-sweep</v-icon>
                                            </v-btn>
                                        </span>
                                    </td>
                                </tr>
                                <!-- child sample rows -->
                                <template v-if="!isGroupCollapsed(grp.key)">
                                    <tr
                                        v-for="item in grp.samples"
                                        :key="`smp-${item.sample}`"
                                        class="mtx-st-row"
                                        :class="{ 'mtx-st-row--hidden': item.hidden, 'mtx-st-row--grouped': grp.group }"
                                    >
                                        <!-- name + run/cancel -->
                                        <td class="mtx-st-name">
                                            <div class="mtx-st-namecell">
                                                <v-btn v-if="!offlineMode" icon x-small color="blue darken-1"
                                                    title="Run / re-run this sample" @click="start(-1, item.sample)">
                                                    <v-icon small>mdi-play-circle</v-icon>
                                                </v-btn>
                                                <span class="mtx-st-label" :title="item.sample">{{ item._label }}</span>
                                                <v-btn v-if="!offlineMode && item.status && item.status.running" icon x-small color="orange darken-1"
                                                    title="Cancel running" @click="cancelJob(-1, item.sample)">
                                                    <v-icon small>mdi-cancel</v-icon>
                                                </v-btn>
                                            </div>
                                        </td>
                                        <!-- source tag -->
                                        <td class="mtx-st-src">
                                            <v-tooltip bottom>
                                                <template v-slot:activator="{ on }">
                                                    <span v-on="on" class="mtx-src-tag" :class="'mtx-src-tag--' + (item.origin || 'server')">
                                                        <v-icon x-small class="mr-1">{{ sourceIcon(item.origin) }}</v-icon>{{ sourceLabel(item.origin) }}
                                                    </span>
                                                </template>
                                                {{ sourceTooltip(item.origin) }}
                                            </v-tooltip>
                                        </td>
                                        <!-- status badge -->
                                        <td v-if="!offlineMode" class="mtx-st-status">
                                            <v-tooltip bottom content-class="mtx-qbadge-tipwrap">
                                                <template v-slot:activator="{ on }">
                                                    <span v-on="on"
                                                        class="mtx-qbadge"
                                                        :class="['mtx-qbadge--' + sampleBadge(item).color, { 'mtx-qbadge--running': item.status.running }]"
                                                        @click="selectedQueueSample = item.sample; dialogJobs = true">
                                                        <span class="mtx-qbadge-num">{{ sampleBadge(item).num }}</span>
                                                    </span>
                                                </template>
                                                <div class="mtx-qbadge-tip">
                                                    <div class="mtx-qbadge-tip-h">{{ item._label }} — {{ sampleBadge(item).label }}</div>
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
                                        </td>
                                        <!-- row actions: jobs / hide / edit / delete -->
                                        <td class="mtx-st-actions">
                                            <div class="mtx-st-actionbar">
                                                <v-btn v-if="!offlineMode" icon x-small title="View jobs for this sample"
                                                    @click="selectedQueueSample = item.sample; dialogJobs = true">
                                                    <v-icon small>mdi-format-list-checks</v-icon>
                                                </v-btn>
                                                <v-btn icon x-small :title="!item.hidden ? 'Hide from plots' : 'Show in plots'"
                                                    @click="item.hidden ? selectSample(item.sample) : hideSample(item.sample)">
                                                    <v-icon small :color="item.hidden ? 'grey' : ''">{{ item.hidden ? 'mdi-eye-off' : 'mdi-eye' }}</v-icon>
                                                </v-btn>
                                                <v-btn v-if="!offlineMode" icon x-small title="Edit sample" @click="editItem(item.sample)">
                                                    <v-icon small>mdi-cog</v-icon>
                                                </v-btn>
                                                <v-btn icon x-small
                                                    :class="isLocal(item) ? 'mtx-del-local' : 'mtx-del-server'"
                                                    :title="isLocal(item) ? 'Remove uploaded report (local only)' : 'Delete sample from run'"
                                                    @click="deleteRow(item.sample)">
                                                    <v-icon small>{{ isLocal(item) ? 'mdi-close-circle' : 'mdi-delete' }}</v-icon>
                                                </v-btn>
                                            </div>
                                        </td>
                                    </tr>
                                </template>
                            </template>
                            <tr v-if="!groupedSamples.length" class="mtx-st-emptyrow">
                                <td :colspan="offlineMode ? 3 : 4" class="mtx-st-empty">
                                    {{ search ? 'No samples match your search.' : 'No samples detected yet.' }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- ===== compact queue summary (always visible in drawer) ===== -->
                <div class="mtx-queue-summary" v-if="!offlineMode">
                    <div class="mtx-queue-summary-head">
                        <span class="mtx-queue-title">Job queue</span>
                        <span class="mtx-queue-total">{{ jobStats.total }} job{{ jobStats.total === 1 ? '' : 's' }} (this run)</span>
                        <span class="mtx-queue-total-all" v-if="otherRunsPending > 0">
                            + {{ otherRunsPending }} queued in {{ otherRunsCount }} other run{{ otherRunsCount === 1 ? '' : 's' }}
                        </span>
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
                        <v-btn-toggle v-model="inputMode" mandatory dense class="mb-3 mtx-mode-toggle">
                            <v-btn value="single" small>
                                <v-icon left small>mdi-file-outline</v-icon> Single sample
                            </v-btn>
                            <v-btn value="barcoded" small>
                                <v-icon left small>mdi-barcode</v-icon> Barcoded run
                            </v-btn>
                            <v-btn value="paired" small>
                                <v-icon left small>mdi-file-multiple-outline</v-icon> Paired directory
                            </v-btn>
                        </v-btn-toggle>
                        <div class="mtx-hint mb-3">
                            {{ inputMode === 'barcoded'
                                ? 'Point at a run directory; each matching sub-directory becomes its own sample.'
                                : inputMode === 'paired'
                                    ? 'Point at a directory of R1/R2 FASTQ files; every matching pair becomes its own paired-end sample.'
                                    : 'Add one sample from a single file or directory of reads.' }}
                        </div>

                        <!-- ===== 2. Name + inputs ===== -->
                        <div class="mtx-sec-label">2 · {{ inputMode === 'barcoded' ? 'Run' : inputMode === 'paired' ? 'Paired-read' : 'Sample' }} details</div>
                        <v-row dense>
                            <v-col cols="12" :md="inputMode === 'barcoded' ? 6 : 12">
                                <v-text-field
                                    v-model="editedItem.sample"
                                    :label="inputMode === 'barcoded' ? 'Run name' : inputMode === 'paired' ? 'Group name (optional)' : 'Sample name'"
                                    :error-messages="sampleErrors"
                                    :hint="inputMode === 'paired' ? 'Leave blank to name each sample by its shared file prefix' : ''"
                                    :persistent-hint="inputMode === 'paired'"
                                    prepend-inner-icon="mdi-rename-box"
                                    dense outlined hide-details="auto"
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" md="6" v-if="inputMode === 'barcoded'">
                                <v-text-field
                                    v-model="editedItem.kits"
                                    label="Barcode kit name (optional)"
                                    prepend-inner-icon="mdi-barcode-scan"
                                    dense outlined hide-details="auto"
                                ></v-text-field>
                            </v-col>

                            <v-col cols="12" :md="inputMode === 'single' ? 6 : 12">
                                <v-combobox
                                    v-model="editedItem.path_1"
                                    :items="pathOptions1"
                                    :hint="editedItem.path_1 ? `Input: ${editedItem.path_1}` : 'Type a path; matches are suggested as you go'"
                                    persistent-hint
                                    :error-messages="pathErrors1"
                                    :label="inputMode === 'barcoded' ? 'Run directory' : inputMode === 'paired' ? 'Directory of R1/R2 FASTQ files' : 'Reads — R1 (file or directory)'"
                                    prepend-inner-icon="mdi-folder-search-outline"
                                    dense outlined
                                    @keyup="handleInputPath1"
                                ></v-combobox>
                            </v-col>
                            <v-col cols="12" md="6" v-if="inputMode === 'single'">
                                <v-combobox
                                    v-model="editedItem.path_2"
                                    :items="pathOptions2"
                                    :hint="editedItem.path_2 ? `Paired reads R2: ${editedItem.path_2}` : 'Optional — paired-end R2 file'"
                                    persistent-hint
                                    label="Reads — R2 (paired-end, optional)"
                                    prepend-inner-icon="mdi-file-multiple-outline"
                                    dense outlined
                                    @keyup="handleInputPath2"
                                ></v-combobox>
                                <!-- auto-detect the R2 mate for the chosen R1 file -->
                                <div class="d-flex align-center flex-wrap mt-1">
                                    <v-btn x-small text color="primary"
                                        :loading="autodetecting"
                                        :disabled="!editedItem.path_1 || offlineMode"
                                        @click="autodetectR2">
                                        <v-icon x-small left>mdi-auto-fix</v-icon>Auto-detect R2
                                    </v-btn>
                                    <span v-if="autodetectMsg" class="mtx-autodetect-msg" :class="autodetectOk ? 'ok' : 'warn'">
                                        <v-icon x-small class="mr-1" :color="autodetectOk ? 'green darken-1' : 'orange darken-2'">
                                            {{ autodetectOk ? 'mdi-check-circle-outline' : 'mdi-alert-outline' }}
                                        </v-icon>{{ autodetectMsg }}
                                    </span>
                                </div>
                            </v-col>

                            <!-- barcode search pattern (only meaningful in barcoded-run mode) -->
                            <v-col cols="12" md="6" v-if="inputMode === 'barcoded'">
                                <v-text-field
                                    v-model="searchPatternBC"
                                    label="Sub-directory match pattern"
                                    hint="Glob for barcode folders, e.g. barcode*"
                                    persistent-hint
                                    prepend-inner-icon="mdi-regex"
                                    dense outlined
                                ></v-text-field>
                            </v-col>

                            <!-- R1/R2 markers (paired-directory mode) -->
                            <v-col cols="6" md="3" v-if="inputMode === 'paired'">
                                <v-text-field
                                    v-model="pairR1Marker"
                                    label="R1 marker"
                                    hint="e.g. _R1"
                                    persistent-hint
                                    prepend-inner-icon="mdi-alpha-r-box-outline"
                                    dense outlined
                                ></v-text-field>
                            </v-col>
                            <v-col cols="6" md="3" v-if="inputMode === 'paired'">
                                <v-text-field
                                    v-model="pairR2Marker"
                                    label="R2 marker"
                                    hint="e.g. _R2"
                                    persistent-hint
                                    prepend-inner-icon="mdi-alpha-r-box"
                                    dense outlined
                                ></v-text-field>
                            </v-col>
                            <v-col cols="12" md="6" v-if="inputMode === 'paired'">
                                <div class="mtx-hint mt-2">
                                    Files that match apart from the marker are paired. Sample name = filename with the R1 marker removed
                                    (e.g. <code>2132132_R1.fastq.gz</code> + <code>2132132_R2.fastq.gz</code> → <code>2132132</code>).
                                </div>
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
        
        <!-- ===== per-sample / per-group jobs panel =====
             Replaces the old card-grid popup. Shows every file/job for the
             selected sample (or an entire run group) as a compact, scrollable,
             queue-board-styled table. -->
        <v-dialog v-model="dialogJobs" max-width="1100" scrollable>
            <v-card class="mtx-jp-card">
                <v-toolbar dark color="indigo darken-3" dense flat>
                    <v-icon left>mdi-format-list-checks</v-icon>
                    <v-toolbar-title class="mtx-jp-title">Jobs — {{ panelTitle }}</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-btn icon @click="dialogJobs = false"><v-icon>mdi-close</v-icon></v-btn>
                </v-toolbar>

                <!-- summary strip -->
                <div class="mtx-jp-strip">
                    <span class="mtx-jp-total">{{ panelJobs.length }} file{{ panelJobs.length === 1 ? '' : 's' }}</span>
                    <span class="mtx-jp-pill running" v-if="panelStats.running">{{ panelStats.running }} running</span>
                    <span class="mtx-jp-pill queued"  v-if="panelStats.queued">{{ panelStats.queued }} queued</span>
                    <span class="mtx-jp-pill error"   v-if="panelStats.error">{{ panelStats.error }} error</span>
                    <span class="mtx-jp-pill done"    v-if="panelStats.done">{{ panelStats.done }} done</span>
                    <span class="mtx-jp-pct" v-if="panelJobs.length">{{ panelStats.percent }}% complete</span>
                    <v-spacer></v-spacer>
                    <input v-model="jobsPanelSearch" class="mtx-jp-search" placeholder="Filter files…" />
                </div>

                <v-card-text class="pa-0 mtx-jp-body">
                    <table class="mtx-jp-table">
                        <thead>
                            <tr>
                                <th class="mtx-jp-c-idx">#</th>
                                <th class="mtx-jp-c-state">State</th>
                                <th class="mtx-jp-c-sample" v-if="selectedQueueGroup">Sample</th>
                                <th class="mtx-jp-c-file">File</th>
                                <th class="mtx-jp-c-type">Type</th>
                                <th class="mtx-jp-c-act">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="job in panelJobs"
                                :key="`${job._sample}-${job.index}`"
                                class="mtx-jp-row"
                                :class="'mtx-jp-row--' + job._state"
                            >
                                <td class="mtx-jp-c-idx">{{ job.index }}</td>
                                <td class="mtx-jp-c-state">
                                    <span class="mtx-jp-state" :class="job._state">
                                        <v-progress-circular v-if="job._state === 'running'" indeterminate size="13" width="2" color="blue" class="mr-1"></v-progress-circular>
                                        <v-icon v-else x-small :color="stateColor(job._state)" class="mr-1">{{ stateIcon(job._state) }}</v-icon>
                                        {{ stateLabel(job._state) }}
                                    </span>
                                </td>
                                <td class="mtx-jp-c-sample" v-if="selectedQueueGroup">{{ sampleHierarchy(job._sample).label }}</td>
                                <td class="mtx-jp-c-file" :title="job.filepath">{{ shortFile(job.filepath) }}</td>
                                <td class="mtx-jp-c-type">{{ job.name || (job.sample && job.sample.demux ? 'Demux' : 'Classify') }}</td>
                                <td class="mtx-jp-c-act">
                                    <v-btn icon x-small :disabled="!job.status || !job.status.running"
                                        title="Cancel this job" @click="cancelJob(job.index, job._sample)">
                                        <v-icon x-small>mdi-cancel</v-icon>
                                    </v-btn>
                                    <v-btn icon x-small :disabled="job.status && job.status.running"
                                        title="Re-run this file" @click="start(job.index, job._sample)">
                                        <v-icon x-small>mdi-play-circle</v-icon>
                                    </v-btn>
                                    <v-btn icon x-small title="View command & logs"
                                        @click="selectedQueueJob = job; dialogQueue = true">
                                        <v-icon x-small>mdi-text-box-search</v-icon>
                                    </v-btn>
                                </td>
                            </tr>
                            <tr v-if="!panelJobs.length">
                                <td :colspan="selectedQueueGroup ? 6 : 5" class="mtx-jp-empty">
                                    {{ jobsPanelSearch ? 'No files match your filter.' : 'No files queued for this ' + (selectedQueueGroup ? 'group' : 'sample') + ' yet.' }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </v-card-text>
            </v-card>
        </v-dialog>
        <!-- ===== consolidated full-width job queue ===== -->
        <!-- Full-screen live queue board (round-robin visualisation + reorder) -->
        <v-dialog v-model="dialogQueueBoard" fullscreen transition="dialog-bottom-transition">
            <QueueBoard
                :queueList="queueList"
                :board="queueBoard"
                :boardAll="queueBoardAll"
                :selectedRun="selectedRun"
                @close="dialogQueueBoard = false"
                @reorder-lanes="onReorderLanes"
                @prioritize="onPrioritizeJob"
                @rerun="(p) => start(p.index, p.sample)"
                @cancel="(p) => cancelJob(p.index, p.sample)"
                @remove-all-samples="onRemoveAllSamples"
                @select-run="(run) => $emit('selectRun', run)"
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
        "queueBoard",
        "queueBoardAll",
        "autodetectR2Result"
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
      // Result of an "Auto-detect R2" request routed back from the server.
      autodetectR2Result(val){
        this.autodetecting = false
        if (!val) return
        if (val.found && val.path_2){
          this.$set(this.editedItem, 'path_2', val.path_2)
          this.autodetectOk = true
          this.autodetectMsg = `Found R2: ${this.shortFile(val.path_2)}`
        } else {
          this.autodetectOk = false
          if (val.reason === 'no-marker'){
            this.autodetectMsg = `R1 marker “${this.pairR1Marker}” not found in the file name — please enter R2 manually.`
          } else {
            this.autodetectMsg = `No matching R2 found${val.tried ? ` (looked for ${this.shortFile(val.tried)})` : ''}. Please enter R2 manually.`
          }
        }
      },
      dialogJobs(val){
        if (!val){
          this.selectedQueueSample = null
          this.selectedQueueGroup = null
          this.jobsPanelSearch = ''
        }
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
            // Group name is optional in paired-directory mode (samples are named
            // from their shared file prefix when left blank).
            if (this.inputMode === 'paired') return [];
            if (!this.editedItem.sample || this.editedItem.sample === '') {
                return `${this.inputMode === 'barcoded' ? 'Run Name' : 'Sample Name'} is required`
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
                const label = this.inputMode === 'barcoded'
                    ? 'Run Location of Barcodes'
                    : this.inputMode === 'paired'
                        ? 'Directory of R1/R2 files'
                        : 'Directory/Files'
                return `${label} required`
            }
            return [];
        },
        isFormValid() {
            // Paired mode only needs the directory; the group name is optional.
            if (this.inputMode === 'paired') return !!this.editedItem.path_1;
            return this.editedItem.sample  && this.editedItem.path_1 ;
        },
        numberOfPages () {
                const len = (this.selectedSample && this.selectedSample.length) || 0
                return Math.ceil(len / this.itemsPerPage)
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
        // Counts pulled from the ALL-runs scheduler summary (queueBoardAll), so
        // the drawer can surface work queued in runs OTHER than the one currently
        // selected -- previously that queue was entirely invisible until you
        // switched runs.
        otherRunsBoard(){
            const all = (this.queueBoardAll && this.queueBoardAll.runs) || []
            return all.filter((r) => r.run !== this.selectedRun)
        },
        otherRunsPending(){
            return this.otherRunsBoard.reduce((sum, r) => sum + (r.pending || 0), 0)
        },
        otherRunsCount(){
            return this.otherRunsBoard.filter((r) => r.pending > 0).length
        },
        // ---- memoized lookups (perf) -------------------------------------
        // The grouped table calls sampleQueue()/sampleHierarchy() many times per
        // row per render (badges, tooltips, group pills). Computing them inline
        // re-walked the whole queue/samplesheet on every keystroke and every
        // delete, freezing the UI. These cached maps recompute only when the
        // underlying queueList / samplesheet actually changes.
        sampleQueueMap(){
            const map = {}
            const ql = this.queueList || {}
            Object.keys(ql).forEach((sample) => {
                const out = { total: 0, done: 0, running: 0, queued: 0, error: 0, pending: 0, percent: 0 }
                const list = ql[sample]
                if (Array.isArray(list)){
                    list.forEach((j) => {
                        if (!j) return
                        const st = this.jobState(j)
                        out.total += 1
                        if (st === 'running') out.running += 1
                        else if (st === 'done' || st === 'historical') out.done += 1
                        else if (st === 'error') out.error += 1
                        else if (st === 'cancelled') { /* not pending or done */ }
                        else out.queued += 1
                    })
                }
                out.pending = out.running + out.queued
                out.percent = out.total ? Math.round((out.done / out.total) * 100) : 0
                map[sample] = out
            })
            return map
        },
        // sample id -> { group, label }, built once from the samplesheet.
        hierarchyMap(){
            const map = {}
            const sheet = Array.isArray(this.samplesheet) ? this.samplesheet : []
            sheet.forEach((e) => {
                if (e && e.sample && (e.group || e.label)){
                    map[e.sample] = { group: e.group || null, label: e.label || e.sample }
                }
            })
            return map
        },
        filteredJobs(){
            const f = this.jobFilter
            if (!f || f === 'all') return this.allJobs
            if (f === 'done') return this.allJobs.filter(j => j._state === 'done' || j._state === 'historical')
            return this.allJobs.filter(j => j._state === f)
        },
        // Build the grouped, searchable view of samples. Each top-level entry is a
        // parent run/folder ("group") containing its barcode child rows. Samples
        // with no parent are collected under a single "Individual samples" bucket.
        groupedSamples(){
            const q = (this.search || '').toString().trim().toLowerCase()
            const samples = (this.selectedsamplesAll || [])
            // Collect every parent run/group name that is present so a leftover
            // run-level placeholder row (whose id === the group name) isn't also
            // listed as a loose "Individual" sample next to its own barcode rows.
            const groupNames = new Set()
            samples.forEach((item) => {
                const g = this.sampleHierarchy(item.sample).group
                if (g) groupNames.add(g)
            })
            const order = []
            const map = new Map()
            samples.forEach((item) => {
                const h = this.sampleHierarchy(item.sample)
                // skip the phantom parent-run row (the un-demuxed run entry)
                if (!h.group && groupNames.has(item.sample)) return
                const hay = `${h.label} ${h.group || ''} ${item.sample}`.toLowerCase()
                if (q && !hay.includes(q)) return
                const key = h.group || '__individual__'
                if (!map.has(key)){
                    const g = { key, group: h.group || null, samples: [] }
                    map.set(key, g); order.push(g)
                }
                map.get(key).samples.push(Object.assign({}, item, { _label: h.label, _group: h.group }))
            })
            // natural sort within each group so barcode1, barcode2 ... barcode10 order
            const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
            order.forEach(g => g.samples.sort((a, b) => coll.compare(a._label, b._label)))
            // grouped barcode runs first, the loose "Individual samples" bucket last
            order.sort((a, b) => {
                if (a.group && !b.group) return -1
                if (!a.group && b.group) return 1
                return coll.compare(a.group || '', b.group || '')
            })
            return order
        },
        // Jobs shown in the per-sample / per-group jobs panel. Flattens the queue
        // list for the selected sample (or every sample in the selected group),
        // tagging each job with its sample id + derived state.
        panelJobs(){
            const ql = this.queueList || {}
            let jobs = []
            const push = (sample) => {
                (ql[sample] || []).forEach((job) => {
                    if (job) jobs.push(Object.assign({}, job, { _sample: sample, _state: this.jobState(job) }))
                })
            }
            if (this.selectedQueueGroup){
                Object.keys(ql).forEach((sample) => {
                    if (this.sampleHierarchy(sample).group === this.selectedQueueGroup) push(sample)
                })
            } else if (this.selectedQueueSample){
                push(this.selectedQueueSample)
            }
            const q = (this.jobsPanelSearch || '').toString().trim().toLowerCase()
            if (q){
                jobs = jobs.filter(j => `${j.filepath || ''} ${j._sample}`.toLowerCase().includes(q))
            }
            return jobs
        },
        panelStats(){
            const c = { running: 0, queued: 0, error: 0, done: 0, total: 0, percent: 0 }
            this.panelJobs.forEach((j) => {
                c.total += 1
                if (j._state === 'running') c.running += 1
                else if (j._state === 'done' || j._state === 'historical') c.done += 1
                else if (j._state === 'error') c.error += 1
                else if (j._state === 'cancelled') { /* ignore */ }
                else c.queued += 1
            })
            c.percent = c.total ? Math.round((c.done / c.total) * 100) : 0
            return c
        },
        panelTitle(){
            if (this.selectedQueueGroup) return this.selectedQueueGroup
            if (this.selectedQueueSample) return this.fmtSample(this.selectedQueueSample)
            return ''
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
          // per-group collapsed state for the grouped sample table (key -> true)
          collapsedGroups: {},
          // when the jobs panel is opened for a whole group rather than one sample
          selectedQueueGroup: null,
          // free-text filter inside the jobs panel
          jobsPanelSearch: '',
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
          // input mode for the Add-Entry dialog: 'single' | 'barcoded' | 'paired'
          inputMode: 'single',
          // user-definable R1/R2 markers for paired-directory + auto-detect
          pairR1Marker: '_R1',
          pairR2Marker: '_R2',
          autodetecting: false,
          autodetectMsg: null,
          autodetectOk: false,
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
        // Ask the server to find the R2 mate for the currently-chosen R1 file in
        // the same directory. Result arrives via the autodetectR2Result prop.
        autodetectR2() {
            if (this.offlineMode) return
            let p1 = this.editedItem.path_1
            if (!p1){
                this.autodetectOk = false
                this.autodetectMsg = 'Choose an R1 file first.'
                return
            }
            if (typeof p1 === 'string' && p1.startsWith('file://')) p1 = p1.replace('file://', '')
            this.autodetecting = true
            this.autodetectMsg = null
            this.$emit("sendMessage", {
                type: "autodetectR2",
                path_1: p1,
                r1: this.pairR1Marker,
                r2: this.pairR2Marker
            })
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
            return this.sampleQueueMap[sample] ||
                { total: 0, done: 0, running: 0, queued: 0, error: 0, pending: 0, percent: 0 }
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
        // Resolve a sample id into { group, label } for the hierarchy view.
        // Prefers explicit group/label on the samplesheet entry (sent by the
        // server), then falls back to splitting on the "__" id separator, then to
        // a flat, ungrouped sample.
        sampleHierarchy(sampleId){
            const cached = this.hierarchyMap[sampleId]
            if (cached) return cached
            const i = sampleId ? sampleId.indexOf('__') : -1
            if (i > 0){
                return { group: sampleId.slice(0, i), label: sampleId.slice(i + 2) }
            }
            return { group: null, label: sampleId }
        },
        // Human-readable form of a unique sample id, used in tooltips/plots.
        fmtSample(sampleId){
            const h = this.sampleHierarchy(sampleId)
            return h.group ? `${h.group} / ${h.label}` : h.label
        },
        // Short, readable file name for the jobs panel (basename only).
        shortFile(filepath){
            if (!filepath) return '—'
            try { return filepath.split(/[\\/]/).pop() } catch (e) { return filepath }
        },
        isGroupCollapsed(key){
            return !!this.collapsedGroups[key]
        },
        toggleGroup(key){
            this.$set(this.collapsedGroups, key, !this.collapsedGroups[key])
        },
        // Aggregate queue counts across every sample in a group (for the header pills).
        groupStats(grp){
            const c = { running: 0, queued: 0, error: 0, done: 0, total: 0 }
            ;(grp.samples || []).forEach((s) => {
                const q = this.sampleQueue(s.sample)
                c.running += q.running; c.queued += q.queued; c.error += q.error
                c.done += q.done; c.total += q.total
            })
            return c
        },
        // Run every sample in a group (re-runs all of that run's barcodes).
        startGroup(grp){
            if (this.offlineMode) return
            ;(grp.samples || []).forEach(s => this.start(-1, s.sample))
        },
        // Remove every barcode/sample that belongs to a run group, in ONE batched
        // request (not N). Always confirms first.
        deleteGroup(grp){
            if (this.offlineMode) return
            const samples = (grp.samples || []).map(s => s.sample)
            if (!samples.length) return
            const run = grp.group || 'Individual samples'
            // Split into local-only (uploaded/demo) vs server samples: locals are
            // removed client-side, server ones go out in a single batch message.
            const proceed = () => {
                const serverSamples = []
                samples.forEach((sample) => {
                    const item = this.selectedsamplesAll.find(x => x.sample === sample)
                    if (this.isLocal(item)){
                        const i = this.selectedsamplesAll.findIndex(x => x.sample === sample)
                        if (i > -1) this.selectedsamplesAll.splice(i, 1)
                    } else {
                        serverSamples.push(sample)
                    }
                })
                if (serverSamples.length) this.$emit('deleteEntries', serverSamples)
            }
            // Confirm if SweetAlert is available; otherwise delete directly.
            if (this.$swal){
                this.$swal({
                    title: `Remove all ${samples.length} samples in “${run}”?`,
                    text: 'This removes every sample in this run and its reports. This cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc2626',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: `Remove ${samples.length} samples`
                }).then((result) => { if (result && result.isConfirmed) proceed() })
            } else {
                proceed()
            }
        },
        // Open the jobs panel scoped to a whole group (all of that run's barcodes).
        openGroupJobs(grp){
            this.selectedQueueSample = null
            this.selectedQueueGroup = grp.group
            this.dialogJobs = true
        },
        // QueueBoard "Remove all" for a run/group: confirm, then batch-delete.
        onRemoveAllSamples(payload){
            if (this.offlineMode) return
            const samples = (payload && payload.samples) || []
            if (!samples.length) return
            const run = (payload && payload.run) || 'Individual samples'
            const proceed = () => {
                const serverSamples = []
                samples.forEach((sample) => {
                    const item = this.selectedsamplesAll.find(x => x.sample === sample)
                    if (this.isLocal(item)){
                        const i = this.selectedsamplesAll.findIndex(x => x.sample === sample)
                        if (i > -1) this.selectedsamplesAll.splice(i, 1)
                    } else {
                        serverSamples.push(sample)
                    }
                })
                if (serverSamples.length) this.$emit('deleteEntries', serverSamples)
            }
            if (this.$swal){
                this.$swal({
                    title: `Remove all ${samples.length} samples in “${run}”?`,
                    text: 'This removes every sample in this run and its reports. This cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc2626',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: `Remove ${samples.length} samples`
                }).then((result) => { if (result && result.isConfirmed) proceed() })
            } else {
                proceed()
            }
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
            // Pull the canonical samplesheet row (path_1/path_2/database/…) AND the
            // live in-memory sample so the edit form prefills every field even when
            // one source is missing the paired-read (R2) or database value — that
            // mismatch was what left R2 blank in the edit dialog.
            const sheet = Array.isArray(this.samplesheet) ? this.samplesheet : []
            let editedIndex = sheet.findIndex(x => x && x.sample === item)
            const sheetEntry = editedIndex > -1 ? sheet[editedIndex] : {}
            const live = (this.selectedsamplesAll || []).find(x => x && x.sample === item) || {}
            const cfg = live.config || {}
            // samplesheet row wins, but fall back to the live config for anything
            // the row is missing or left blank.
            this.editedItem = Object.assign({ lat: null, lon: null }, cfg, sheetEntry)
            ;['path_1', 'path_2', 'database', 'kits', 'pattern', 'format', 'platform', 'lat', 'lon'].forEach((k) => {
                const v = this.editedItem[k]
                if ((v === undefined || v === null || v === '') &&
                    cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') {
                    this.$set(this.editedItem, k, cfg[k])
                }
            })
            this.inputMode = 'single'
            this.autodetectMsg = null
            this.autodetectOk = false
            // treat as an edit whenever the sample exists in either source
            this.editedIndex = editedIndex > -1
                ? editedIndex
                : (this.selectedsamplesAll || []).findIndex(x => x && x.sample === item)
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
            // Route the entry to the right backend expansion based on input mode:
            //  - barcoded: searchPatternBC -> checkSubdirs (one sample per barcode dir)
            //  - paired:   pairReads       -> checkReadPairs (one sample per R1/R2 pair)
            //  - single:   neither         -> a single sample
            if (this.inputMode === 'barcoded'){
                this.editedItem.searchPatternBC = this.searchPatternBC
                this.editedItem.pairReads = null
            } else if (this.inputMode === 'paired'){
                this.editedItem.searchPatternBC = null
                this.$set(this.editedItem, 'pairReads', { r1: this.pairR1Marker, r2: this.pairR2Marker })
            } else {
                this.editedItem.searchPatternBC = null
                this.editedItem.pairReads = null
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
.mtx-queue-total-all { font-size: 10.5px; color: #b45309; font-weight: 600; }
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

/* ===== auto-detect R2 inline message ===== */
.mtx-autodetect-msg {
    display: inline-flex;
    align-items: center;
    font-size: 11.5px;
    margin-left: 8px;
    line-height: 1.3;
}
.mtx-autodetect-msg.ok { color: #15803d; }
.mtx-autodetect-msg.warn { color: #b45309; }

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

/* ===== per-sample / per-group jobs panel ===== */
.mtx-jp-card { border-radius: 12px; overflow: hidden; }
.mtx-jp-title { font-size: 14px; font-weight: 600; }
.mtx-jp-strip {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
    padding: 8px 14px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;
}
.mtx-jp-total { font-size: 12px; font-weight: 700; color: #334155; }
.mtx-jp-pill {
    font-size: 10.5px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
    background: #e2e8f0; color: #475569;
}
.mtx-jp-pill.running { background: #dbeafe; color: #1d4ed8; }
.mtx-jp-pill.queued  { background: #e2e8f0; color: #475569; }
.mtx-jp-pill.error   { background: #ffedd5; color: #c2410c; }
.mtx-jp-pill.done    { background: #dcfce7; color: #15803d; }
.mtx-jp-pct { font-size: 11px; color: #64748b; margin-left: 4px; }
.mtx-jp-search {
    font-size: 12px; padding: 4px 10px; border: 1px solid #cbd5e1;
    border-radius: 8px; background: #fff; outline: none; min-width: 160px;
}
.mtx-jp-search:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.15); }
.mtx-jp-body { height: 64vh; overflow: auto; }
.mtx-jp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.mtx-jp-table thead th {
    position: sticky; top: 0; z-index: 2; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
    color: #64748b; background: #f8fafc; padding: 7px 12px; border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
}
.mtx-jp-c-idx   { width: 44px; color: #94a3b8; }
.mtx-jp-c-state { width: 130px; }
.mtx-jp-c-type  { width: 90px; }
.mtx-jp-c-act   { width: 110px; text-align: right; }
.mtx-jp-table td { padding: 4px 12px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
.mtx-jp-table tr:hover td { background: #f8fafc; }
.mtx-jp-c-act { text-align: right; }
.mtx-jp-sample, .mtx-jp-c-sample { font-weight: 600; color: #334155; }
.mtx-jp-c-file {
    max-width: 360px; overflow: hidden; text-overflow: ellipsis;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #475569;
}
.mtx-jp-state { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; }
.mtx-jp-state.running { color: #1d4ed8; }
.mtx-jp-state.error   { color: #c2410c; }
.mtx-jp-state.done, .mtx-jp-state.historical { color: #15803d; }
.mtx-jp-row--error td { background: #fff7ed; }
.mtx-jp-row--running td { background: #eff6ff; }
.mtx-jp-empty { text-align: center; color: #94a3b8; padding: 26px 12px; }
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

/* tooltip arrow colour tweak — kept for reference but has no effect in scoped styles */
.v-card {
  display: flex !important;
  flex-direction: column;
}

.v-card__text {
  flex-grow: 1;
  overflow: auto;
}
/* ===== compact, grouped sample table ===== */
.mtx-stable-wrap {
	margin: 4px 4px 0;
	border: 1px solid #e2e8f0;
	border-radius: 10px;
	overflow: auto;
	max-height: 46vh;
	background: #fff;
}
.mtx-stable {
	width: 100%;
	border-collapse: collapse;
	font-size: 12px;
	color: #1e293b;
}
.mtx-stable thead th {
	position: sticky;
	top: 0;
	z-index: 2;
	text-align: left;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: .05em;
	text-transform: uppercase;
	color: #64748b;
	background: #f1f5f9;
	padding: 6px 10px;
	border-bottom: 1px solid #e2e8f0;
	white-space: nowrap;
}
.mtx-stable thead th.mtx-st-name,
.mtx-stable td.mtx-st-name { text-align: left; }
.mtx-stable thead th.mtx-st-actions,
.mtx-stable td.mtx-st-actions { text-align: right; }
.mtx-stable thead th.mtx-st-status,
.mtx-stable td.mtx-st-status { text-align: center; width: 64px; }
.mtx-stable thead th.mtx-st-src,
.mtx-stable td.mtx-st-src { width: 92px; }

/* group header row */
.mtx-st-grouprow {
	cursor: pointer;
	background: #eef2ff;
	user-select: none;
}
.mtx-st-grouprow:hover { background: #e4e9fb; }
.mtx-st-grouprow td {
	padding: 5px 10px;
	border-bottom: 1px solid #dbe2f0;
	white-space: nowrap;
}
.mtx-st-caret { display: inline-flex; vertical-align: middle; margin-right: 2px; }
.mtx-st-gicon { color: #4f46e5 !important; margin-right: 4px; }
.mtx-st-gname { font-weight: 700; font-size: 12px; color: #312e81; }
.mtx-st-gcount {
	display: inline-block;
	min-width: 18px;
	text-align: center;
	margin-left: 6px;
	padding: 0 6px;
	font-size: 10px;
	font-weight: 700;
	line-height: 16px;
	color: #4338ca;
	background: #c7d2fe;
	border-radius: 999px;
}
.mtx-st-gstats { margin-left: 10px; }
.mtx-gpill {
	font-size: 10px;
	font-weight: 600;
	padding: 1px 7px;
	border-radius: 999px;
	margin-left: 4px;
	background: #e2e8f0;
	color: #475569;
}
.mtx-gpill.running { background: #dbeafe; color: #1d4ed8; }
.mtx-gpill.queued  { background: #e2e8f0; color: #475569; }
.mtx-gpill.error   { background: #ffedd5; color: #c2410c; }
.mtx-gpill.done    { background: #dcfce7; color: #15803d; }
.mtx-st-gactions { float: right; }
.mtx-st-gdelete:hover { color: #dc2626 !important; }

/* sample rows */
.mtx-st-row td {
	padding: 3px 10px;
	border-bottom: 1px solid #f1f5f9;
	white-space: nowrap;
}
.mtx-st-row:hover td { background: #f8fafc; }
.mtx-st-row--grouped .mtx-st-name { padding-left: 22px; }
.mtx-st-row--hidden { opacity: .5; }
.mtx-st-namecell { display: inline-flex; align-items: center; gap: 2px; }
.mtx-st-label {
	font-weight: 600;
	font-size: 12px;
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.mtx-st-actionbar { display: inline-flex; align-items: center; gap: 1px; justify-content: flex-end; }
.mtx-st-empty { text-align: center; color: #94a3b8; padding: 22px 10px; font-size: 12px; }
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

<!-- unscoped: Vuetify appends tooltip content to <body>, outside this component -->
<style>
/* queue-badge tooltip — allow enough room for the stats table */
.mtx-qbadge-tipwrap {
    max-width: 320px !important;
    white-space: normal !important;
    overflow: visible !important;
    padding: 8px 12px !important;
}
</style>