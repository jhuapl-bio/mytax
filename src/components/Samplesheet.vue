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
    <div class="mtx-ss" id="file" @drop.prevent="addDropFileData" @dragover.prevent>
        <div>
                <!-- ===== toolbar: primary actions + overflow menu ===== -->
                <div class="mtx-ss-toolbar">
                    <v-btn v-if="!offlineMode" small depressed color="primary" @click="openAddDialog">
                        <v-icon small left>mdi-plus</v-icon>Add samples
                    </v-btn>
                    <v-btn small outlined color="primary" :disabled="!hasSamples" @click="openRunSummary()"
                        title="Reads, % classified, files and sizes for every sample in this run">
                        <v-icon small left>mdi-chart-box-outline</v-icon>Run overview
                    </v-btn>
                    <v-spacer></v-spacer>
                    <v-menu offset-y left>
                        <template v-slot:activator="{ on, attrs }">
                            <v-btn icon small v-bind="attrs" v-on="on" title="More actions">
                                <v-icon>mdi-dots-vertical</v-icon>
                            </v-btn>
                        </template>
                        <v-list dense class="mtx-ss-menu">
                            <v-list-item @click="pickUpload">
                                <v-list-item-icon><v-icon small>mdi-tray-arrow-up</v-icon></v-list-item-icon>
                                <v-list-item-title>Upload a Kraken2 report…</v-list-item-title>
                            </v-list-item>
                            <template v-if="!offlineMode">
                                <v-list-item @click="sheet = true">
                                    <v-list-item-icon><v-icon small>mdi-text-box-outline</v-icon></v-list-item-icon>
                                    <v-list-item-title>Server logs</v-list-item-title>
                                </v-list-item>
                                <v-list-item @click="dialogAdvanced = true">
                                    <v-list-item-icon><v-icon small>mdi-tune</v-icon></v-list-item-icon>
                                    <v-list-item-title>Kraken2 advanced settings</v-list-item-title>
                                </v-list-item>
                                <v-divider class="my-1"></v-divider>
                                <v-list-item @click="forceRestart()">
                                    <v-list-item-icon><v-icon small color="blue darken-1">mdi-restart</v-icon></v-list-item-icon>
                                    <v-list-item-title>Re-run all jobs in this run</v-list-item-title>
                                </v-list-item>
                                <v-list-item @click="flush()">
                                    <v-list-item-icon><v-icon small color="red darken-1">mdi-stop-circle-outline</v-icon></v-list-item-icon>
                                    <v-list-item-title>Stop all jobs</v-list-item-title>
                                </v-list-item>
                            </template>
                        </v-list>
                    </v-menu>
                </div>

                <!-- ===== search (regex) + "only matches" isolation ===== -->
                <div class="mtx-ss-search">
                    <v-text-field
                        v-model="search" clearable dense outlined hide-details
                        prepend-inner-icon="mdi-magnify"
                        placeholder="Filter samples — e.g. barcode0[1-3] or bc01|S2"
                        :error="!!searchMatcher.error"
                        class="mtx-ss-searchfield"
                    ></v-text-field>
                    <v-tooltip bottom>
                        <template v-slot:activator="{ on }">
                            <v-btn icon small v-on="on" @click="toggleSamples" class="ml-1">
                                <v-icon small>{{ selectedAllSamples ? 'mdi-eye-outline' : 'mdi-eye-off-outline' }}</v-icon>
                            </v-btn>
                        </template>
                        {{ selectedAllSamples ? 'Hide every sample from the plots' : 'Show every sample in the plots' }}
                    </v-tooltip>
                </div>
                <div class="mtx-ss-searchmeta">
                    <v-switch
                        v-model="searchIsolate" dense hide-details inset
                        class="mtx-ss-isolate ma-0 pa-0"
                        :disabled="!hasSamples"
                    >
                        <template v-slot:label>
                            <span class="mtx-ss-isolate-label">Show only matches in plots</span>
                        </template>
                    </v-switch>
                    <v-tooltip bottom max-width="320">
                        <template v-slot:activator="{ on }">
                            <v-icon v-on="on" x-small class="ml-1 mtx-ss-info">mdi-information-outline</v-icon>
                        </template>
                        <div>
                            <b>Show only matches in plots</b><br>
                            When on, every sample that does NOT match the search is hidden from the
                            charts (nothing is deleted). Turn it off to restore what was visible before.<br><br>
                            The search is a case-insensitive regular expression: separate alternatives
                            with <code>|</code> (e.g. <code>Sample5|S2|specimenA</code>); empty
                            alternatives are ignored. Invalid patterns fall back to plain text.
                        </div>
                    </v-tooltip>
                    <v-spacer></v-spacer>
                    <span v-if="!searchMatcher.empty" class="mtx-ss-matchcount" :class="{ 'mtx-ss-matchcount--warn': searchMatcher.error }">
                        {{ matchCount }} / {{ selectedsamplesAll.length }} match<template v-if="searchMatcher.error"> · plain-text</template>
                    </span>
                </div>

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
                                        <!-- basecall / demultiplex pipeline feeding this group -->
                                        <span v-if="!offlineMode && preprocessFor(grp.group)" class="mtx-st-pre"
                                            :class="'mtx-st-pre--' + preState(grp.group)" @click.stop>
                                            <v-tooltip bottom max-width="360">
                                                <template v-slot:activator="{ on }">
                                                    <span v-on="on" class="mtx-st-pre-main">
                                                        <v-progress-circular v-if="preState(grp.group) === 'running'" indeterminate size="10" width="2" class="mr-1"></v-progress-circular>
                                                        <v-icon v-else x-small class="mr-1">{{ ({ error: 'mdi-alert-circle', stopped: 'mdi-stop-circle-outline', idle: 'mdi-radar', done: 'mdi-check-circle' })[preState(grp.group)] }}</v-icon>
                                                        {{ preLabel(grp.group) }}
                                                    </span>
                                                </template>
                                                <div class="mtx-pre-tip">
                                                    <b>{{ preprocessFor(grp.group).mode === 'basecall' ? 'Basecalling' : 'Demultiplexing' }}</b>
                                                    with {{ preprocessFor(grp.group).tool }}
                                                    <template v-if="preprocessFor(grp.group).kit"> · kit {{ preprocessFor(grp.group).kit }}</template>
                                                    <template v-if="preprocessFor(grp.group).model"> · model {{ preprocessFor(grp.group).model }}</template>
                                                    <template v-if="preprocessFor(grp.group).device"> · {{ preprocessFor(grp.group).device }}</template><br>
                                                    Files: {{ preprocessFor(grp.group).files.done }} done, {{ preprocessFor(grp.group).files.running }} running,
                                                    {{ preprocessFor(grp.group).files.queued }} queued<template v-if="preprocessFor(grp.group).files.failed">, {{ preprocessFor(grp.group).files.failed }} failed</template><br>
                                                    Barcodes: {{ preprocessFor(grp.group).barcodes.join(', ') || 'none yet' }}<br>
                                                    {{ preprocessFor(grp.group).watching ? 'Watching ' : 'Input: ' }}<code>{{ preprocessFor(grp.group).input }}</code>
                                                    <div v-if="preprocessFor(grp.group).lastError" class="mtx-pre-tip-err">{{ preprocessFor(grp.group).lastError }}</div>
                                                </div>
                                            </v-tooltip>
                                            <v-btn v-if="preprocessFor(grp.group).files.failed" icon x-small title="Retry failed files" @click.stop="retryPreprocess(grp.group)">
                                                <v-icon x-small>mdi-refresh</v-icon>
                                            </v-btn>
                                            <v-btn v-if="!preprocessFor(grp.group).stopped" icon x-small title="Stop basecalling / demultiplexing for this run" @click.stop="stopPreprocess(grp.group)">
                                                <v-icon x-small>mdi-stop</v-icon>
                                            </v-btn>
                                        </span>
                                        <v-tooltip bottom v-if="!offlineMode && isGroupWatched(grp)">
                                            <template v-slot:activator="{ on }">
                                                <span v-on="on" class="mtx-st-listening" @click.stop>
                                                    <v-icon x-small class="mr-1">mdi-radar</v-icon>listening
                                                    <v-btn icon x-small class="mtx-st-stopwatch" title="Stop watching this directory for new pairs"
                                                        @click.stop="stopWatchingGroup(grp)">
                                                        <v-icon x-small>mdi-close</v-icon>
                                                    </v-btn>
                                                </span>
                                            </template>
                                            Watching this directory for new R1/R2 pairs — click ✕ to stop
                                        </v-tooltip>
                                        <span class="mtx-st-gstats" v-if="!offlineMode">
                                            <span v-if="groupStats(grp).running" class="mtx-gpill running">{{ groupStats(grp).running }} running</span>
                                            <span v-if="groupStats(grp).queued" class="mtx-gpill queued">{{ groupStats(grp).queued }} queued</span>
                                            <span v-if="groupStats(grp).error" class="mtx-gpill error">{{ groupStats(grp).error }} err</span>
                                            <span v-if="groupStats(grp).done" class="mtx-gpill done">{{ groupStats(grp).done }} done</span>
                                        </span>
                                        <span class="mtx-st-gactions" @click.stop>
                                            <v-btn icon x-small title="Overview of this group (reads, % classified, files)" @click="openGroupSummary(grp)">
                                                <v-icon small>mdi-information-outline</v-icon>
                                            </v-btn>
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
                                                <v-tooltip bottom>
                                                    <template v-slot:activator="{ on }">
                                                        <v-icon v-on="on" x-small class="mtx-st-clf" :color="classifierInfo(item).color">{{ classifierInfo(item).icon }}</v-icon>
                                                    </template>
                                                    <span>{{ classifierInfo(item).tip }}</span>
                                                </v-tooltip>
                                                <v-tooltip bottom v-if="!offlineMode && isStale(item.sample)">
                                                    <template v-slot:activator="{ on }">
                                                        <v-icon v-on="on" small color="amber darken-3" class="mtx-st-stale-ico"
                                                            @click="start(-1, item.sample)">mdi-alert-circle</v-icon>
                                                    </template>
                                                    <span>Settings changed since the last run — this report is out of date. Click to re-run with the new settings.</span>
                                                </v-tooltip>
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
                                                        :class="['mtx-qbadge--' + sampleBadge(item).color, { 'mtx-qbadge--running': isSampleActive(item) }]"
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
                                                        <tr><td>Still to run</td><td>{{ sampleQueue(item.sample).pending }}</td></tr>
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
                                                <v-btn icon x-small title="Sample overview: reads, % classified, files, size"
                                                    @click="openSampleSummary(item.sample)">
                                                    <v-icon small color="blue darken-2">mdi-information-outline</v-icon>
                                                </v-btn>
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
                <div
                    class="mtx-upbox"
                    :class="{ 'mtx-upbox--over': uploadDragOver, 'mtx-upbox--compact': hasSamples }"
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
        <div class="mtx-ss-dialogs">
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
                            <v-btn value="preprocess" small>
                                <v-icon left small>mdi-dna</v-icon> Basecall / demux
                            </v-btn>
                        </v-btn-toggle>
                        <div class="mtx-hint mb-3">
                            {{ inputMode === 'barcoded'
                                ? 'Point at a run directory; each matching sub-directory becomes its own sample.'
                                : inputMode === 'paired'
                                    ? 'Point at a directory of R1/R2 FASTQ files; every matching pair becomes its own paired-end sample.'
                                    : inputMode === 'preprocess'
                                        ? 'Point at multiplexed FASTQ (to demultiplex) or POD5/FAST5 signal (to basecall) with dorado or guppy. Each barcode found becomes its own sample, classified as its reads are produced.'
                                        : 'Add one sample from a single file or directory of reads.' }}
                        </div>

                        <!-- ===== 2. Name + inputs ===== -->
                        <div class="mtx-sec-label">2 · {{ inputMode === 'barcoded' || inputMode === 'preprocess' ? 'Run' : inputMode === 'paired' ? 'Paired-read' : 'Sample' }} details</div>
                        <v-row dense>
                            <v-col cols="12" :md="inputMode === 'barcoded' ? 6 : 12">
                                <v-text-field
                                    v-model="editedItem.sample"
                                    :label="inputMode === 'barcoded' || inputMode === 'preprocess' ? 'Run name' : inputMode === 'paired' ? 'Group name (optional)' : 'Sample name'"
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
                                    :hint="editedItem.path_1 ? `Input: ${editedItem.path_1}` : 'Type a path or browse (file or folder); matches are suggested as you go'"
                                    persistent-hint
                                    :error-messages="pathErrors1"
                                    :label="inputMode === 'barcoded' ? 'Run directory' : inputMode === 'paired' ? 'Directory of R1/R2 FASTQ files' : inputMode === 'preprocess' ? (pre.mode === 'basecall' ? 'POD5 / FAST5 — file or directory' : 'Multiplexed FASTQ — file or directory') : 'Reads — R1 (file or directory)'"
                                    prepend-inner-icon="mdi-folder-search-outline"
                                    dense outlined
                                    @keyup="handleInputPath1"
                                >
                                    <template v-slot:append-outer>
                                        <v-tooltip bottom>
                                            <template v-slot:activator="{ on }">
                                                <v-icon v-on="on" :disabled="offlineMode" @click="openBrowse('path_1', 'file')">mdi-file-outline</v-icon>
                                            </template>
                                            <span>Browse for a file</span>
                                        </v-tooltip>
                                        <v-tooltip bottom>
                                            <template v-slot:activator="{ on }">
                                                <v-icon v-on="on" :disabled="offlineMode" class="ml-1" @click="openBrowse('path_1', 'directory')">mdi-folder-outline</v-icon>
                                            </template>
                                            <span>Browse for a folder</span>
                                        </v-tooltip>
                                    </template>
                                </v-combobox>
                            </v-col>
                            <v-col cols="12" md="6" v-if="inputMode === 'single'">
                                <v-combobox
                                    v-model="editedItem.path_2"
                                    :items="pathOptions2"
                                    :hint="editedItem.path_2 ? `Paired reads R2: ${editedItem.path_2}` : 'Optional — paired-end R2 file'"
                                    persistent-hint
                                    label="Reads — R2 (paired-end, optional)"
                                    prepend-inner-icon="mdi-file-multiple-outline"
                                    append-outer-icon="mdi-folder-open-outline"
                                    @click:append-outer="openBrowse('path_2', 'file')"
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
                                    With <strong>watch</strong> on (below), new R1/R2 pairs dropped into this directory are added and classified automatically.
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

                        <!-- ===== Basecall / demultiplex options (preprocess mode) ===== -->
                        <template v-if="inputMode === 'preprocess'">
                            <div class="mtx-sec-label">Basecalling / demultiplexing</div>
                            <v-btn-toggle v-model="pre.mode" mandatory dense class="mb-3 mtx-mode-toggle">
                                <v-btn value="demux" small><v-icon left small>mdi-call-split</v-icon> Demultiplex FASTQ</v-btn>
                                <v-btn value="basecall" small><v-icon left small>mdi-waveform</v-icon> Basecall POD5 / FAST5</v-btn>
                            </v-btn-toggle>
                            <v-row dense>
                                <v-col cols="12" md="6">
                                    <v-select v-model="pre.tool" :items="preToolOptions" item-text="text" item-value="value" item-disabled="disabled"
                                        label="Tool" prepend-inner-icon="mdi-tools" dense outlined hide-details></v-select>
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-combobox v-model="pre.kit" :items="kitOptions"
                                        :label="pre.mode === 'demux' ? 'Barcode kit' : 'Barcode kit (optional)'"
                                        :hint="pre.mode === 'basecall' ? 'Set a kit to split basecalled reads by barcode' : ''" persistent-hint
                                        prepend-inner-icon="mdi-barcode" dense outlined hide-details="auto"
                                        :error-messages="kitErrors"></v-combobox>
                                </v-col>
                                <v-col cols="12" md="6" v-if="pre.mode === 'basecall'">
                                    <v-select v-model="pre.model" :items="modelOptions" item-text="text" item-value="value"
                                        label="Basecalling model" prepend-inner-icon="mdi-speedometer" dense outlined hide-details></v-select>
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-select v-model="pre.device" :items="deviceOptions" item-text="text" item-value="value"
                                        label="Device" prepend-inner-icon="mdi-expansion-card" dense outlined hide-details></v-select>
                                </v-col>
                            </v-row>
                            <v-checkbox v-model="pre.keepUnclassified" dense hide-details class="mt-1"
                                label="Also classify reads with no barcode (as an 'unclassified' sample)"></v-checkbox>
                            <div class="mtx-pre-tool" :class="preToolState.ok ? 'mtx-pre-tool--ok' : 'mtx-pre-tool--missing'">
                                <v-icon small class="mr-2" :color="preToolState.ok ? 'green darken-1' : 'orange darken-2'">
                                    {{ preToolState.ok ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
                                </v-icon>
                                <span class="flex-grow-1">{{ preToolState.text }}</span>
                                <v-btn v-if="!preToolState.ok && preToolState.downloadable" x-small depressed color="primary" class="ml-2"
                                    :disabled="offlineMode || preToolState.downloading" @click="$emit('sendMessage', { type: 'downloadTool', tool: pre.tool })">
                                    <v-icon x-small left>mdi-download</v-icon>{{ preToolState.downloading ? 'Downloading…' : 'Download dorado' }}
                                </v-btn>
                                <v-btn x-small text class="ml-1" @click="$emit('openTools')">Tools &amp; GPU…</v-btn>
                            </div>
                            <div class="mtx-hint mt-1 mb-2">
                                Each barcode becomes a sample named <code>{{ (editedItem.sample || 'RunName') }}__barcodeNN</code>
                                and is classified with the settings below as soon as its reads are written.
                            </div>
                        </template>

                        <!-- ===== 3. Classifier ===== -->
                        <div class="mtx-sec-label">3 · Classifier</div>
                        <v-select
                            v-model="editedItem.classifier"
                            :items="classifierOptions" item-text="text" item-value="value"
                            label="Classification engine"
                            prepend-inner-icon="mdi-dna"
                            dense outlined hide-details class="mb-2"
                        ></v-select>
                        <div class="mtx-hint mb-2" v-if="editedItem.classifier === 'bracken'">
                            Runs Kraken2 then Bracken to re-estimate abundances. Needs a Bracken-built
                            database (kmer_distrib files); if absent, the Kraken2 report is used.
                        </div>
                        <div class="mtx-hint mb-2" v-else-if="editedItem.classifier === 'minimap2'">
                            Aligns reads to a FASTA/MMI reference. Drop a <code>seqid2taxid.map</code>
                            next to the reference for true NCBI taxids (otherwise per-reference tallies).
                        </div>
                        <!-- fastp low-quality read filtering (default off) -->
                        <div class="d-flex align-center mt-1 mb-1">
                            <v-icon :color="editedItem.fastp ? 'green darken-1' : 'grey'" class="mr-3">
                                {{ editedItem.fastp ? 'mdi-filter-check-outline' : 'mdi-filter-outline' }}
                            </v-icon>
                            <div class="flex-grow-1">
                                <div style="font-weight:600;font-size:13px;">Pre-filter reads with fastp</div>
                                <div class="mtx-hint">
                                    Remove low-quality reads before classification. Default off.
                                </div>
                            </div>
                            <v-switch v-model="editedItem.fastp" inset hide-details class="ma-0 pa-0"></v-switch>
                        </div>

                        <!-- ===== 4. Reference database ===== -->
                        <div class="mtx-sec-label mt-3">4 · Reference {{ editedItem.classifier === 'minimap2' ? 'reference (FASTA/MMI)' : 'database' }}</div>

                        <!-- Kraken2 / Bracken: kraken2 index directory -->
                        <template v-if="editedItem.classifier !== 'minimap2'">
                            <v-switch
                                v-model="toggleDatabases"
                                dense hide-details class="mt-0 mb-2"
                                :label="toggleDatabases ? 'Use a standard (downloaded) database' : 'Use a custom database path'"
                            ></v-switch>
                            <v-select v-if="toggleDatabases"
                                v-model="editedItem.database" class="truncate-text"
                                :items="kraken2Databases" :error-messages="dbErrors"
                                label="Database" item-text="key" item-value="fullpath"
                                dense outlined hide-details="auto"
                                :menu-props="{ maxHeight: 420 }"
                            >
                                <template v-slot:selection="{ item }">
                                    <v-icon small :color="dbStatus(item).color" class="mr-2">{{ dbStatus(item).icon }}</v-icon>
                                    <span class="mtx-dbsel-name">{{ item.label || item.key }}</span>
                                    <span class="mtx-dbsel-state">{{ dbStatus(item).label }}</span>
                                </template>
                                <template v-slot:item="{ item, on, attrs }">
                                    <v-list-item v-bind="attrs" v-on="on" class="mtx-dbopt">
                                        <v-list-item-icon class="mr-3 my-auto">
                                            <v-tooltip left max-width="320">
                                                <template v-slot:activator="{ on: tip }">
                                                    <v-icon v-on="tip" :color="dbStatus(item).color">{{ dbStatus(item).icon }}</v-icon>
                                                </template>
                                                {{ dbStatus(item).tip }}
                                            </v-tooltip>
                                        </v-list-item-icon>
                                        <v-list-item-content>
                                            <v-list-item-title class="mtx-dbopt-title">{{ item.label || item.key }}</v-list-item-title>
                                            <v-list-item-subtitle class="mtx-dbopt-sub">
                                                <b :class="'mtx-dbopt-state mtx-dbopt-state--' + dbStatus(item).state">{{ dbStatus(item).label }}</b>
                                                · {{ item.description || item.final }}
                                            </v-list-item-subtitle>
                                        </v-list-item-content>
                                    </v-list-item>
                                </template>
                            </v-select>
                            <DatabaseCard
                                v-if="toggleDatabases && selectedDbEntry"
                                class="mt-2"
                                :db="selectedDbEntry"
                                :online="!offlineMode"
                                :deletable="false"
                                :show-description="false"
                                @download="downloadDb"
                                @cancel="cancelDbDownload"
                                @open="openDbFolder"
                            />
                            <div v-if="toggleDatabases && selectedDbEntry && dbStatus(selectedDbEntry).state !== 'ready'" class="mtx-db-warn">
                                <v-icon small color="orange darken-2" class="mr-1">mdi-information-outline</v-icon>
                                <span v-if="dbStatus(selectedDbEntry).state === 'missing' || dbStatus(selectedDbEntry).state === 'error'">
                                    This database isn't on disk yet. You can add the sample now, but its files will fail to classify until the
                                    download finishes — download first, or re-run the sample afterwards.
                                </span>
                                <span v-else>Download in progress — you can close this dialog; progress is also shown in the left panel.</span>
                            </div>
                            <v-combobox v-else
                                v-model="editedItem.database"
                                :items="pathOptionsDb"
                                :hint="editedItem.database ? `Database path: ${editedItem.database}` : 'Type or browse to a Kraken2 database directory'"
                                persistent-hint
                                label="Kraken2 database path"
                                prepend-inner-icon="mdi-database-search-outline"
                                append-outer-icon="mdi-folder-open-outline"
                                @click:append-outer="openBrowse('database', 'directory')"
                                :error-messages="dbErrors"
                                dense outlined
                                @keyup="handleInputPathDb"
                            ></v-combobox>
                        </template>

                        <!-- minimap2: FASTA/MMI reference file (downloaded or local) -->
                        <template v-else>
                            <v-switch
                                v-model="toggleMinimapDb"
                                dense hide-details class="mt-0 mb-2"
                                :label="toggleMinimapDb ? 'Use a standard (downloaded) reference' : 'Use a custom FASTA/MMI path'"
                            ></v-switch>
                            <v-select v-if="toggleMinimapDb"
                                v-model="editedItem.minimapDatabase" class="truncate-text"
                                :items="minimap2Databases" :error-messages="dbErrors"
                                label="minimap2 reference" item-text="key" item-value="fullpath"
                                dense outlined hide-details="auto"
                                no-data-text="No minimap2 references in the catalogue — use a custom path"
                            >
                                <template v-slot:selection="{ item }">
                                    <v-icon small :color="dbStatus(item).color" class="mr-2">{{ dbStatus(item).icon }}</v-icon>
                                    <span class="mtx-dbsel-name">{{ item.label || item.key }}</span>
                                    <span class="mtx-dbsel-state">{{ dbStatus(item).label }}</span>
                                </template>
                                <template v-slot:item="{ item, on, attrs }">
                                    <v-list-item v-bind="attrs" v-on="on" class="mtx-dbopt">
                                        <v-list-item-icon class="mr-3 my-auto">
                                            <v-tooltip left max-width="320">
                                                <template v-slot:activator="{ on: tip }">
                                                    <v-icon v-on="tip" :color="dbStatus(item).color">{{ dbStatus(item).icon }}</v-icon>
                                                </template>
                                                {{ dbStatus(item).tip }}
                                            </v-tooltip>
                                        </v-list-item-icon>
                                        <v-list-item-content>
                                            <v-list-item-title class="mtx-dbopt-title">{{ item.label || item.key }}</v-list-item-title>
                                            <v-list-item-subtitle class="mtx-dbopt-sub">
                                                <b :class="'mtx-dbopt-state mtx-dbopt-state--' + dbStatus(item).state">{{ dbStatus(item).label }}</b>
                                                · {{ item.description || item.final }}
                                            </v-list-item-subtitle>
                                        </v-list-item-content>
                                    </v-list-item>
                                </template>
                            </v-select>
                            <DatabaseCard
                                v-if="toggleMinimapDb && selectedRefEntry"
                                class="mt-2"
                                :db="selectedRefEntry"
                                :online="!offlineMode"
                                :deletable="false"
                                :show-description="false"
                                @download="downloadDb"
                                @cancel="cancelDbDownload"
                                @open="openDbFolder"
                            />
                            <v-combobox v-else
                                v-model="editedItem.minimapDatabase"
                                :items="pathOptionsRef"
                                :hint="editedItem.minimapDatabase ? `Reference: ${editedItem.minimapDatabase}` : 'Type or browse to a FASTA/MMI reference (e.g. references.fasta or references.mmi)'"
                                persistent-hint
                                label="minimap2 reference path (FASTA/MMI)"
                                prepend-inner-icon="mdi-file-document-outline"
                                append-outer-icon="mdi-folder-open-outline"
                                @click:append-outer="openBrowse('minimapDatabase', 'file')"
                                :error-messages="dbErrors"
                                dense outlined
                                @keyup="handleInputPathRef"
                            ></v-combobox>
                        </template>

                        <!-- ===== 5. Location ===== -->
                        <div class="mtx-sec-label mt-4">5 · Location <span class="mtx-opt">optional</span></div>
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
        </div>
        <v-spacer></v-spacer>
        <v-dialog
            v-model="sheet"
            max-width="1000"
            scrollable
        >
            <LogViewer
                title="Server Logs"
                :lines="logs"
                :reverse="true"
                max-height="78vh"
                closable
                @close="sheet = false"
            />
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
            v-model="dialogQueue" v-if="selectedQueueJob"
            max-width="1000" scrollable
        >
            <LogViewer
                :title="selectedQueueJob.name || 'Job'"
                :subtitle="selectedQueueJob.filepath"
                :state="selectedJobState"
                :command="selectedJobCommand"
                :lines="selectedJobLines"
                max-height="68vh"
                closable
                @close="dialogQueue = false"
            />
        </v-dialog>
        
        <!-- ===== sample / run overview dialogs ===== -->
        <v-dialog v-model="dialogSampleSummary" max-width="760" scrollable>
            <SampleSummary
                v-if="dialogSampleSummary && summaryItem"
                :sample="summaryItem.sample"
                :label="summaryItem.label"
                :group="summaryItem.group"
                :row="summaryItem.row"
                :queue="summaryItem.queue"
                :sheet="summaryItem.sheet"
                :online="!offlineMode"
                @close="dialogSampleSummary = false"
                @open-jobs="(s) => { dialogSampleSummary = false; selectedQueueSample = s; dialogJobs = true }"
                @rerun="(s) => start(-1, s)"
            />
        </v-dialog>
        <v-dialog v-model="dialogRunSummary" max-width="920" scrollable>
            <RunSummary
                v-if="dialogRunSummary"
                :title="runSummaryScope || selectedRun || ''"
                :kicker="runSummaryScope ? `Group overview · ${selectedRun || ''}` : 'Run overview'"
                :scope="runSummaryScope ? 'group' : 'run'"
                :icon="runSummaryScope ? 'mdi-folder-multiple-outline' : 'mdi-flask-outline'"
                :samples="runSummarySamples"
                @close="dialogRunSummary = false"
                @open-sample="(s) => openSampleSummary(s)"
            />
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

                <!-- summary + filters -->
                <div class="mtx-jp-strip">
                    <span class="mtx-jp-total">{{ panelJobs.length }} file{{ panelJobs.length === 1 ? '' : 's' }}</span>
                    <span class="mtx-jp-pct" v-if="panelJobs.length">{{ panelStats.percent }}% complete</span>
                    <v-spacer></v-spacer>
                    <v-text-field
                        v-model="jobsPanelSearch" dense outlined hide-details clearable
                        prepend-inner-icon="mdi-magnify" placeholder="Filter by file or sample (regex ok)"
                        class="mtx-jp-searchfield"
                    ></v-text-field>
                </div>
                <div class="mtx-jp-filters">
                    <v-chip-group v-model="panelStateFilter" mandatory active-class="mtx-jp-chip--on">
                        <v-chip v-for="f in panelFilterChips" :key="f.value" :value="f.value" small outlined
                            :class="'mtx-jp-chip mtx-jp-chip--' + f.value" :disabled="f.value !== 'all' && !f.count">
                            <v-icon small left>{{ f.icon }}</v-icon>{{ f.text }}<b class="ml-1">{{ f.count }}</b>
                        </v-chip>
                    </v-chip-group>
                </div>

                <v-card-text class="pa-0 mtx-jp-body">
                    <v-data-table
                        v-if="dialogJobs"
                        :headers="panelHeaders"
                        :items="panelJobsFiltered"
                        :items-per-page.sync="panelPerPage"
                        :footer-props="{ 'items-per-page-options': [25, 50, 100, 250, -1], showFirstLastPage: true }"
                        item-key="_key"
                        fixed-header
                        height="calc(64vh - 120px)"
                        class="mtx-jp-dtable"
                        no-data-text="No files queued yet."
                        no-results-text="No files match your filter."
                    >
                        <template v-slot:[`item.index`]="{ item }">
                            <span class="mtx-jp-idx">{{ item.index }}</span>
                        </template>
                        <template v-slot:[`item._state`]="{ item }">
                            <span class="mtx-jp-state" :class="item._state">
                                <v-progress-circular v-if="item._state === 'running'" indeterminate size="16" width="2" color="blue" class="mr-2"></v-progress-circular>
                                <v-icon v-else small :color="stateColor(item._state)" class="mr-1">{{ stateIcon(item._state) }}</v-icon>
                                {{ stateLabel(item._state) }}
                            </span>
                        </template>
                        <template v-slot:[`item._sample`]="{ item }">
                            {{ sampleHierarchy(item._sample).label }}
                        </template>
                        <template v-slot:[`item.filepath`]="{ item }">
                            <span class="mtx-jp-file" :title="item.filepath">{{ shortFile(item.filepath) }}</span>
                        </template>
                        <template v-slot:[`item.actions`]="{ item }">
                            <div class="mtx-jp-acts">
                                <v-btn icon small :disabled="!item.status || !item.status.running"
                                    title="Cancel this job" @click="cancelJob(item.index, item._sample)">
                                    <v-icon>mdi-cancel</v-icon>
                                </v-btn>
                                <v-btn icon small :disabled="item.status && item.status.running"
                                    title="Re-run this file" @click="start(item.index, item._sample)">
                                    <v-icon>mdi-play-circle-outline</v-icon>
                                </v-btn>
                                <v-btn icon small title="View command & logs" @click="reviewJob(item)">
                                    <v-icon>mdi-text-box-search-outline</v-icon>
                                </v-btn>
                            </div>
                        </template>
                    </v-data-table>
                </v-card-text>
            </v-card>
        </v-dialog>
        <!-- ===== consolidated full-width job queue ===== -->
        <!-- Full-screen live queue board (round-robin visualisation + reorder) -->
        <!-- v-if: Vuetify keeps dialog content mounted after the first open, so a
             board with one dot per fastq kept re-rendering on every frame even
             while closed. Mount it only while it is actually open. -->
        <v-dialog v-model="dialogQueueBoard" fullscreen transition="dialog-bottom-transition">
            <QueueBoard
                v-if="dialogQueueBoard"
                :queueList="queueList"
                :board="queueBoard"
                :boardAll="queueBoardAll"
                :selectedRun="selectedRun"
                :jobLogs="jobLogs"
                @fetch-logs="fetchJobLogs"
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
                        v-if="dialogAllJobs"
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
  import LogViewer from '@/components/LogViewer'
  import DatabaseCard from '@/components/DatabaseCard'
  import SampleSummary from '@/components/SampleSummary'
  import RunSummary from '@/components/RunSummary'
  import { makeMatcher } from '@/utils/format'
  import { dbStatus, findDbByPath } from '@/utils/databases'

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
        "autodetectR2Result",
        "pathOptionsRef",
        "browsePathResult",
        "sampleMeta",
        "pairWatches",
        "tools",
        "preprocess"
    ],
    components: {
        VueJsonToCsv,
        QueueBoard,
        LogViewer,
        DatabaseCard,
        SampleSummary,
        RunSummary,
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
      // Reload the per-run "needs rerun" flags whenever the selected run changes.
      selectedRun (){
        this.loadStale()
      },
      // In single-sample mode, derive the sample name from the chosen input
      // file/directory when the name hasn't been set yet — so distinct inputs get
      // distinct sample names instead of every add sharing one leftover name.
      'editedItem.path_1'(val){
        if (this.inputMode !== 'single') return
        if (this.editedIndex > -1) return                       // don't rename an existing sample
        const cur = this.editedItem.sample
        if (cur && String(cur).trim() !== '') return            // respect a name the user typed
        const derived = this.deriveSampleFromPath(val)
        if (derived) this.$set(this.editedItem, 'sample', derived)
      },
      // Result of a native file/folder picker: drop the chosen path into the
      // field that requested it (val.target is an editedItem key). Cancels are
      // ignored so the field keeps its current value.
      browsePathResult(val){
        if (!val || !val.target) return
        if (val.error){
          // e.g. no native picker available on the host (osascript/zenity missing)
          console.warn(`File browser unavailable: ${val.error}`)
          return
        }
        if (val.cancelled || !val.path) return
        let p = String(val.path).replace(/\/+$/, '')   // trim trailing slash from folder picks
        this.$set(this.editedItem, val.target, p)
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
      // A download can move a database's resolved path (nested kraken2 index
      // folders). Keep the dialog's selection pointing at the real location.
      databases(){
        if (!this.dialog || !this.editedItem) return
        const db = this.selectedDbEntry
        if (this.toggleDatabases && db && db.fullpath && this.editedItem.database !== db.fullpath){
            this.$set(this.editedItem, 'database', db.fullpath)
        }
        const ref = this.selectedRefEntry
        if (this.toggleMinimapDb && ref && ref.fullpath && this.editedItem.minimapDatabase !== ref.fullpath){
            this.$set(this.editedItem, 'minimapDatabase', ref.fullpath)
        }
      },
      'pre.mode'(m){
        if (m === 'basecall' && this.pre.tool === 'guppy') this.pre.tool = 'dorado'
      },
      isolationKey(){
        this.applySearchIsolation()
      },
      searchIsolate(on){
        if (on){
            this.snapshotVisibility()
            this.applySearchIsolation()
        } else if (this._preIsolate){
            const prev = this._preIsolate
            this._preIsolate = null
            ;(this.selectedsamplesAll || []).forEach((s) => {
                const want = Object.prototype.hasOwnProperty.call(prev, s.sample) ? prev[s.sample] : false
                if (!!s.hidden !== want) this.$set(s, 'hidden', want)
            })
        }
      },
      dialogJobs(val){
        if (val) this.panelStateFilter = 'all'
        if (!val){
          this.selectedQueueSample = null
          this.selectedQueueGroup = null
          this.jobsPanelSearch = ''
        }
      },
      // NOTE: there were deep watchers on `selectedsamplesAll` and `queueList`
      // here with EMPTY handlers. They did nothing except make Vue walk the
      // entire sample list and the entire job queue -- which on a large run is
      // tens of thousands of objects -- on every single mutation. Removing them
      // is pure profit: the panel is driven by ordinary reactive props and
      // re-renders on its own.
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
        // Split the DB list by engine: kraken2/bracken use kraken2 index dirs,
        // minimap2 uses FASTA/MMI reference files (type: 'minimap2'). Entries with
        // no `type` are treated as kraken2 for backwards compatibility.
        kraken2Databases() {
            // kraken2/bracken use kraken2 index dirs; exclude minimap2 references
            // and the taxdump support resource (entries with no type are kraken2).
            return (this.databases || []).filter((d) => d && (!d.type || d.type === 'kraken2'));
        },
        minimap2Databases() {
            return (this.databases || []).filter((d) => d && d.type === 'minimap2');
        },
        kitOptions() {
            return (this.tools && this.tools.kits && this.tools.kits.length) ? this.tools.kits
                : ['SQK-NBD114-24', 'SQK-NBD114-96', 'SQK-RBK114-24', 'SQK-RBK114-96', 'SQK-16S114-24']
        },
        kitErrors() {
            if (this.inputMode !== 'preprocess') return []
            if (this.pre.mode === 'demux' && !(this.pre.kit && String(this.pre.kit).trim())) return ['A barcode kit is required to demultiplex']
            return []
        },
        preToolOptions() {
            const t = (this.tools && this.tools.tools) || {}
            const tag = (k) => (t[k] && t[k].present) ? `found${t[k].version ? ' · ' + t[k].version : ''}` : 'not installed'
            return [
                { value: 'dorado', text: `dorado (${tag('dorado')})` },
                { value: 'guppy', text: `guppy_barcoder — demux only (${tag('guppy')})`, disabled: this.pre.mode === 'basecall' },
            ]
        },
        // Status line under the options: is the chosen tool usable, and on what.
        preToolState() {
            const all = (this.tools && this.tools.tools) || {}
            const t = all[this.pre.tool] || {}
            const gpu = (this.tools && this.tools.gpu) || {}
            const dev = this.pre.device === 'cpu' ? 'CPU'
                : gpu.cuda ? `CUDA × ${gpu.devices.length}` : gpu.metal ? 'Apple GPU (Metal)' : 'CPU (no GPU detected)'
            const downloading = !!(t.download && t.download.downloading)
            if (!this.tools || !this.tools.tools) return { ok: false, text: 'Checking tools on the server…' }
            if (downloading) return { ok: false, downloading, downloadable: true, text: `Downloading dorado… ${t.download.progress != null ? t.download.progress + '%' : ''}` }
            if (!t.present) {
                return {
                    ok: false, downloadable: !!t.downloadable,
                    text: this.pre.tool === 'guppy'
                        ? 'guppy_barcoder was not found on the server. Set its path under Tools & GPU, or use dorado.'
                        : 'dorado was not found on the server. Download it here, or point at an existing install under Tools & GPU.'
                }
            }
            const warn = this.pre.mode === 'basecall' && dev.startsWith('CPU') ? ' — basecalling on CPU is very slow' : ''
            return { ok: true, text: `${t.label} ${t.version || ''} (${({ custom: 'custom path', managed: 'downloaded in-app', path: 'from $PATH' })[t.source] || ''}) · runs on ${dev}${warn}` }
        },
        // Catalogue entries behind the database / reference picked in the dialog.
        selectedDbEntry() {
            return findDbByPath(this.kraken2Databases, this.editedItem && this.editedItem.database)
        },
        selectedRefEntry() {
            return findDbByPath(this.minimap2Databases, this.editedItem && this.editedItem.minimapDatabase)
        },
        dbErrors() {
            if (this.editedItem.classifier === 'minimap2') {
                if (!this.editedItem.minimapDatabase || this.editedItem.minimapDatabase === '') {
                    return 'A minimap2 reference (FASTA/MMI) is required';
                }
                return [];
            }
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
            if (this.inputMode === 'preprocess') return !!(this.editedItem.sample && this.editedItem.path_1 && !this.kitErrors.length);
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
        // Derived state for the currently-reviewed job (falls back to a fresh
        // computation if the object wasn't tagged with _state).
        selectedJobState(){
            const j = this.selectedQueueJob
            if (!j) return ''
            return j._state || this.jobState(j)
        },
        // Command line for the open job. Not streamed with job frames any more;
        // it comes back with the on-demand getJobLogs reply.
        selectedJobCommand(){
            const j = this.selectedQueueJob
            if (!j) return ''
            if (j.command) return j.command
            const p = this.jobLogs || {}
            const matches = (p.samplename === (j._sample || j.sample)) && p.index === j.index
            return (matches && p.command) || ''
        },
        // Combined log body for the per-job LogViewer: captured log lines plus any
        // stderr the backend stored on status.error (kraken2 streams progress there).
        selectedJobLines(){
            const j = this.selectedQueueJob
            if (!j || !j.status) return []
            // Logs arrive on demand now (jobLogs), not inside the status frame.
            // Only use the fetched payload if it matches the open job.
            const p = this.jobLogs || {}
            const matches = (p.samplename === (j._sample || j.sample)) && p.index === j.index
            const raw = matches && Array.isArray(p.logs) ? p.logs : null
            let lines
            if (raw && raw.length) lines = raw.map(l => (typeof l === 'string' ? l : JSON.stringify(l)))
            else if (j.status.lastLog) lines = [j.status.lastLog]
            else lines = []
            const err = (matches && p.error) || j.status.error
            if (err) lines = lines.concat([err])
            return lines
        },
        // Counts per state for the summary chips / filters.
        //
        // Walks queueList directly. It used to go through allJobs, which copies
        // every job into a new object -- and since this summary is always on
        // screen, that meant allocating one object per job in the run (10k+ on
        // a big run) on every single job-status frame.
        jobStats(){
            const c = { running: 0, queued: 0, error: 0, done: 0, historical: 0, paused: 0, preload: 0, total: 0 }
            const ql = this.queueList || {}
            for (const sample in ql){
                const list = ql[sample]
                if (!Array.isArray(list)) continue
                for (let i = 0; i < list.length; i++){
                    const j = list[i]
                    if (!j) continue
                    const st = this.jobState(j)
                    c[st] = (c[st] || 0) + 1
                    c.total += 1
                }
            }
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
        // sample name -> samplesheet entry, so per-row lookups are O(1) rather
        // than a linear scan of the sheet for every row on every render.
        sheetBySample(){
            const map = {}
            ;(this.samplesheet || []).forEach((d) => {
                const name = d && (d.sample || d.samplename)
                if (name) map[name] = d
            })
            return map
        },
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
            ;(this.selectedsamplesAll || []).forEach((item) => {
                const sample = item && item.sample
                if (!sample) return
                const current = map[sample]
                const s = item.status || {}
                const total = Number(s.total || 0)
                if (total <= 0) return
                if (current && current.total >= total) return
                const running = Number(s.runningCount || (s.running ? 1 : 0) || 0)
                const error = Number(s.errorCount || 0)
                const success = s.success === true || s.success === 0
                const done = Number(s.done || (success ? total : 0) || 0)
                const queued = Math.max(0, total - done - running - error)
                map[sample] = {
                    total,
                    done,
                    running,
                    queued,
                    error,
                    pending: running + queued,
                    percent: total ? Math.round((done / total) * 100) : 0
                }
            })
            const reportBacked = new Set(this.seen || [])
            ;(this.selectedsamplesAll || []).forEach((item) => {
                const sample = item && item.sample
                if (!sample || !reportBacked.has(sample)) return
                if ((item.origin || 'server') === 'server') return
                const current = map[sample]
                if (current && current.total > 0) return
                map[sample] = {
                    total: 1,
                    done: 1,
                    running: 0,
                    queued: 0,
                    error: 0,
                    pending: 0,
                    percent: 100
                }
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
        // Regex-aware matcher for the sample search box (see utils/format).
        searchMatcher(){
            return makeMatcher(this.search)
        },
        matchCount(){
            if (this.searchMatcher.empty) return (this.selectedsamplesAll || []).length
            return (this.selectedsamplesAll || []).filter((it) => this.sampleMatches(it.sample)).length
        },
        // Re-apply "only matches" whenever the query, the toggle or the sample
        // list changes (new barcodes appear mid-run).
        isolationKey(){
            if (!this.searchIsolate) return 'off'
            return `${this.search || ''}|${(this.selectedsamplesAll || []).map((s) => s.sample).join(',')}`
        },
        summaryItem(){
            const name = this.summarySample
            if (!name) return null
            const row = (this.selectedsamplesAll || []).find((s) => s.sample === name) || { sample: name }
            const h = this.sampleHierarchy(name)
            return { sample: name, row, label: h.label || name, group: h.group || '', queue: this.sampleQueue(name), sheet: this.sheetBySample[name] || {} }
        },
        runSummarySamples(){
            if (!this.dialogRunSummary) return []
            const scope = this.runSummaryScope
            return (this.selectedsamplesAll || [])
                .filter((s) => !scope || this.sampleHierarchy(s.sample).group === scope)
                .map((s) => {
                    const h = this.sampleHierarchy(s.sample)
                    return { sample: s.sample, label: scope ? h.label : (h.group ? `${h.group} / ${h.label}` : h.label), row: s, queue: this.sampleQueue(s.sample) }
                })
        },
        groupedSamples(){
            const m = this.searchMatcher
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
                if (!m.empty && !this.sampleMatches(item.sample)) return
                const key = h.group || '__individual__'
                if (!map.has(key)){
                    const g = { key, group: h.group || null, samples: [] }
                    map.set(key, g); order.push(g)
                }
                map.get(key).samples.push(Object.assign({}, item, { _label: h.label, _group: h.group }))
            })
            // A basecall/demux pipeline that hasn't produced a barcode yet still
            // gets its group row (with its progress chip).
            ;(this.preprocess || []).forEach((p) => {
                if (!p || !p.group || map.has(p.group)) return
                if (m && !m.empty && !m.test(p.group)) return
                const g = { key: p.group, group: p.group, samples: [] }
                map.set(p.group, g); order.push(g)
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
                    if (job) jobs.push(Object.assign({}, job, { _sample: sample, _state: this.jobState(job), _key: `${sample}::${job.index}` }))
                })
            }
            if (this.selectedQueueGroup){
                Object.keys(ql).forEach((sample) => {
                    if (this.sampleHierarchy(sample).group === this.selectedQueueGroup) push(sample)
                })
            } else if (this.selectedQueueSample){
                push(this.selectedQueueSample)
            }
            const m = makeMatcher(this.jobsPanelSearch)
            if (!m.empty){
                jobs = jobs.filter(j => m.test(j.filepath || '') || m.test(j._sample))
            }
            return jobs
        },
        // A group panel can hold every file of every barcode in a run; each row
        // carries three Vuetify buttons, so rendering thousands at once froze the
        // dialog. Rows are revealed in pages instead (stats still count all).
        panelJobsFiltered(){
            const f = this.panelStateFilter
            if (!f || f === 'all') return this.panelJobs
            if (f === 'done') return this.panelJobs.filter((j) => j._state === 'done' || j._state === 'historical')
            if (f === 'queued') return this.panelJobs.filter((j) => j._state === 'queued' || j._state === 'paused' || j._state === 'preload')
            return this.panelJobs.filter((j) => j._state === f)
        },
        panelHeaders(){
            const h = [
                { text: '#', value: 'index', width: 64 },
                { text: 'State', value: '_state', width: 150 },
            ]
            if (this.selectedQueueGroup) h.push({ text: 'Sample', value: '_sample', width: 140 })
            h.push({ text: 'File', value: 'filepath' })
            h.push({ text: 'Actions', value: 'actions', sortable: false, align: 'end', width: 140 })
            return h
        },
        panelFilterChips(){
            const c = this.panelStats
            return [
                { value: 'all', text: 'All', icon: 'mdi-format-list-bulleted', count: c.total },
                { value: 'running', text: 'Running', icon: 'mdi-progress-clock', count: c.running },
                { value: 'queued', text: 'Queued', icon: 'mdi-tray-full', count: c.queued },
                { value: 'error', text: 'Failed', icon: 'mdi-alert-circle-outline', count: c.error },
                { value: 'done', text: 'Done', icon: 'mdi-check-circle-outline', count: c.done },
            ]
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

        // Set of group names (and a flag for the ungrouped bucket) that currently
        // have a live paired-directory watch, so the group header can show a
        // "listening" chip + a stop control.
        watchedGroups(){
            const set = new Set()
            let individual = false
            ;(this.pairWatches || []).forEach((w) => {
                if (w && w.group) set.add(w.group)
                else if (w) individual = true
            })
            return { set, individual }
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
          // Samples whose classification-relevant settings changed since their last
          // run (needs-rerun). Keyed by sample name; persisted per-run in localStorage.
          staleSamples: {},
          toggleDatabases: true,
          toggleMinimapDb: true,
          classifierOptions: [
            { text: 'Kraken2 (default)', value: 'kraken2' },
            { text: 'Bracken (Kraken2 → Bracken)', value: 'bracken' },
            { text: 'minimap2 (reference alignment)', value: 'minimap2' },
          ],
          selectedQueueJob: null,
          // On-demand log tail for a single job, keyed implicitly by the
          // run/samplename/index echoed back in the payload. Job logs are no
          // longer pushed with every status frame, so we request them only for
          // the job the user actually opened.
          jobLogs: {},
          // basecall / demultiplex options (inputMode === 'preprocess')
          pre: { mode: 'demux', tool: 'dorado', kit: '', model: 'hac', device: 'auto', keepUnclassified: false },
          modelOptions: [
            { text: 'fast — quickest, lowest accuracy', value: 'fast' },
            { text: 'hac — high accuracy (recommended)', value: 'hac' },
            { text: 'sup — super accuracy, slowest (GPU strongly advised)', value: 'sup' },
          ],
          deviceOptions: [
            { text: 'Auto — use a GPU when one is found', value: 'auto' },
            { text: 'GPU (CUDA / Metal)', value: 'gpu' },
            { text: 'CPU only', value: 'cpu' },
          ],
          // per-sample/group files popup: state filter + page size
          panelStateFilter: 'all',
          panelPerPage: 50,
          // search: hide non-matching samples from plots (see applySearchIsolation)
          searchIsolate: false,
          // sample / run overview dialogs
          dialogSampleSummary: false,
          summarySample: null,
          dialogRunSummary: false,
          runSummaryScope: null,
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
            classifier: 'kraken2',
            fastp: false,
            minimapDatabase: null,
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
            classifier: 'kraken2',
            fastp: false,
            minimapDatabase: null,
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
        this.loadStale()
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
        // Single listener for on-demand job logs (see fetchJobLogs).
        if (this.socket && !this._jobLogsBound){
            this._jobLogsBound = true
            this.socket.on('jobLogs', (e) => { this.jobLogs = e || {} })
        }
    },
 
    methods: {
        updateConfig(type){
            // extract all values from config and send to server as key: value
            let config = {}
            Object.keys(this.config).forEach((key)=>{
                config[key] = this.config[key].value
            })
            this.$emit("updateConfig", (type == 'bundle' ? this.stagedBundleConfig : config ), type)
            // A run-level config change affects every sample's classification but
            // doesn't re-run them, so flag them all as needing a rerun.
            ;(this.selectedsamplesAll || []).forEach((s) => { if (s && s.sample) this.markStale(s.sample) })
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
        handleInputPathRef(event) {
            let value = event.target.value
            this.$emit("sendMessage", { type: "searchPathRef", value: value })
        },
        // --- "needs rerun" (stale) tracking -------------------------------------
        // A sample is stale when its classification-relevant settings (engine,
        // fastp, database/reference, advanced kraken2 config, …) were changed but
        // the report hasn't been re-run with them yet. lat/long and other metadata
        // are deliberately excluded — they don't affect the classification output.
        classificationSignature(item){
            if (!item) return ''
            const norm = (v) => (v === undefined || v === '' ? null : v)
            const relevant = {
                classifier: norm(item.classifier) || 'kraken2',
                fastp: item.fastp === true || item.fastp === 'true',
                fastpConfig: item.fastpConfig || null,
                database: norm(item.database),
                minimapDatabase: norm(item.minimapDatabase),
                brackenConfig: item.brackenConfig || null
            }
            try { return JSON.stringify(relevant) } catch (e){ return '' }
        },
        isStale(sample){
            return !!this.staleSamples[sample]
        },
        markStale(sample){
            if (!sample) return
            this.$set(this.staleSamples, sample, true)
            this.persistStale()
        },
        clearStale(sample){
            if (sample == null){ this.staleSamples = {}; this.persistStale(); return }
            if (this.staleSamples[sample] !== undefined){
                this.$delete(this.staleSamples, sample)
                this.persistStale()
            }
        },
        staleKey(){
            return `mytax_stale_${this.selectedRun || 'default'}`
        },
        loadStale(){
            try {
                const raw = localStorage.getItem(this.staleKey())
                this.staleSamples = raw ? JSON.parse(raw) : {}
            } catch (err){ this.staleSamples = {} }
        },
        persistStale(){
            try { localStorage.setItem(this.staleKey(), JSON.stringify(this.staleSamples)) } catch (err){ /* ignore */ }
        },
        // Ask the backend to pop a native OS file/folder picker for `target`
        // (an editedItem key). The result comes back via the browsePathResult prop.
        openBrowse(target, kind) {
            if (this.offlineMode) return
            this.$emit("sendMessage", { type: "browsePath", target: target, kind: kind || 'file' })
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
        dbStatus,
        preprocessFor(group){
            if (!group) return null
            return (this.preprocess || []).find((p) => p && p.group === group) || null
        },
        preState(group){
            const p = this.preprocessFor(group)
            if (!p) return 'idle'
            if (p.stopped) return 'stopped'
            if (p.files.running || p.files.queued) return 'running'
            if (p.files.failed || (p.lastError && !p.files.done)) return 'error'
            if (p.watching) return 'idle'
            return 'done'
        },
        preLabel(group){
            const p = this.preprocessFor(group)
            if (!p) return ''
            const verb = p.mode === 'basecall' ? 'Basecall' : 'Demux'
            const f = p.files
            const bc = p.barcodes.length ? ` · ${p.barcodes.length} bc` : ''
            if (p.stopped) return `${verb} stopped`
            if (!f.total) return p.lastError ? `${verb}: needs attention` : `${verb}: waiting for reads`
            return `${verb} ${f.done}/${f.total}${bc}${f.failed ? ` · ${f.failed} failed` : ''}`
        },
        stopPreprocess(group){
            this.$emit('sendMessage', { type: 'stopPreprocess', run: this.selectedRun, group, forget: false })
        },
        retryPreprocess(group){
            this.$emit('sendMessage', { type: 'retryPreprocess', run: this.selectedRun, group })
        },
        downloadDb(db){
            if (!db || this.offlineMode) return
            this.$emit('sendMessage', { type: 'downloaddb', database: db.key, message: `Download database ${db.key}` })
        },
        cancelDbDownload(db){
            if (!db || this.offlineMode) return
            this.$emit('sendMessage', { type: 'canceldownload', database: db.key, message: `Cancel download ${db.key}` })
        },
        openDbFolder(db){
            if (!db || this.offlineMode) return
            this.$emit('sendMessage', { type: 'openPath', path: db.fullpath || null, database: db.key })
        },
        sampleMatches(sample){
            const m = this.searchMatcher
            if (m.empty) return true
            const h = this.sampleHierarchy(sample)
            return m.test(sample) || m.test(h.label) || (!!h.group && m.test(h.group))
        },
        // "Show only matches in plots": hide every sample the search doesn't
        // match, show every one it does. Empty query = show everything.
        // Remember what was visible before isolation so turning it off restores
        // exactly that. Taken once, before the first sample is hidden (watchers
        // for the toggle and the query can fire in either order).
        snapshotVisibility(){
            if (this._preIsolate) return
            this._preIsolate = {}
            ;(this.selectedsamplesAll || []).forEach((s) => { this._preIsolate[s.sample] = !!s.hidden })
        },
        applySearchIsolation(){
            if (!this.searchIsolate) return
            this.snapshotVisibility()
            const empty = this.searchMatcher.empty
            ;(this.selectedsamplesAll || []).forEach((s) => {
                const hide = !empty && !this.sampleMatches(s.sample)
                if (!!s.hidden !== hide) this.$set(s, 'hidden', hide)
            })
        },
        openSampleSummary(sample){
            this.summarySample = sample
            this.dialogSampleSummary = true
        },
        openGroupSummary(grp){
            this.runSummaryScope = grp && grp.group ? grp.group : null
            if (!this.runSummaryScope && grp && grp.samples && grp.samples.length === 1){
                this.openSampleSummary(grp.samples[0].sample)
                return
            }
            this.dialogRunSummary = true
        },
        openRunSummary(){
            this.runSummaryScope = null
            this.dialogRunSummary = true
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
            // rerunning applies the current settings -> no longer stale
            this.clearStale(sample)
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
        //
        // The badge reads "x / n": x = files still to process (queued + running),
        // n = total files known for this sample. A bare count couldn't tell you
        // whether 40 meant "40 left" or "40 of 40 done", which is ambiguous the
        // moment a sample has hundreds of fastqs.
        /**
         * Should this sample's badge pulse?
         *
         * This used to be bound to `item.status.running` alone, which is a
         * TRANSIENT flag: it is true only between a job spawning and that same
         * job exiting. Job updates are coalesced per (sample, index) with
         * latest-wins semantics, so a job that starts and finishes inside one
         * flush window has its running state overwritten before the frame is
         * ever sent — the client goes straight from "queued" to "done" and the
         * badge never animates at all. Longer jobs did animate, which is why
         * this looked intermittent rather than broken.
         *
         * "Has outstanding work" is the stable condition underneath, it is what
         * a user actually means by "is this sample working", and it cannot be
         * coalesced away because it stays true until the queue drains.
         */
        isSampleActive(item){
            if (!item) return false
            if (item.status && item.status.running) return true
            const q = this.sampleQueue(item.sample)
            return (q.pending || 0) > 0
        },
        /**
         * The status badge: **done / to-do / total**.
         *
         * It used to read `left / total`, which had two problems. A sample with
         * no files showed a bare "0 / 0" that told you nothing and, being red,
         * read as an error. And for a sample with work in progress, "3 / 10"
         * was ambiguous — three done, or three left? Spelling out all three
         * numbers removes the guesswork:
         *
         *     done  — classified successfully (includes historical results)
         *     to-do — running right now plus still queued
         *     total — files this sample knows about
         *
         * A sample with no files at all shows an em dash rather than "0 / 0 / 0":
         * zeros imply a measurement, and there is nothing to measure yet.
         */
        sampleBadge(item){
            const q = this.sampleQueue(item.sample)
            const watching = this.isWatching(item)
            const done = q.done || 0
            const todo = q.pending || 0        // sampleQueueMap: running + queued
            const total = q.total || 0
            const num = `${done} / ${todo} / ${total}`
            const counts = { done, todo, left: todo, total, num }
            const files = (n) => `${n} ${n === 1 ? 'file' : 'files'}`

            if (q.error > 0){
                return { ...counts, color: 'red',
                    label: `${q.error} ${q.error === 1 ? 'job' : 'jobs'} failed — check logs` +
                        ` · ${done} done, ${todo} to go of ${total}` }
            }
            if (todo > 0){
                const running = q.running || 0
                return { ...counts, color: 'yellow',
                    label: running > 0
                        ? `Analyzing — ${running} running, ${todo - running} queued, ${done} of ${files(total)} done`
                        : `${todo} of ${files(total)} queued, ${done} done` }
            }
            if (total > 0){
                return { ...counts, color: 'green',
                    label: watching
                        ? `All ${files(total)} done — listening for new reads`
                        : `All ${files(total)} done` }
            }
            // No files yet. Three genuinely different situations, which used to
            // collapse into one red "Not able to establish watching" badge — so a
            // sample simply waiting for its first read looked identical to one
            // that was misconfigured.
            const idle = { ...counts, num: '—' }
            if (watching){
                return { ...idle, color: 'green', label: 'Listening for new reads — nothing analyzed yet' }
            }
            if ((item.origin || 'server') === 'server' && item.status && item.status.watching === false){
                // The backend positively reports no watcher: this one IS wrong.
                return { ...idle, color: 'red',
                    label: 'Not watching — no new reads will be picked up' }
            }
            // Watch state unconfirmed. Normal for a sample whose input directory
            // has not produced a fastq, and for locally loaded reports.
            return { ...idle, color: 'grey', label: 'No files analyzed yet' }
        },
        // Which classifier a sample ran (or is configured to run) with. Prefers the
        // live job config (what it actually ran), then the persisted samplesheet
        // entry, defaulting to kraken2.
        sampleClassifier(item){
            let c = null
            if (item){
                if (item.config && item.config.classifier) c = item.config.classifier
                else if (item.classifier) c = item.classifier
            }
            if (!c && Array.isArray(this.samplesheet) && item){
                const entry = this.samplesheet.find(e => e && e.sample === item.sample)
                if (entry && entry.classifier) c = entry.classifier
            }
            return String(c || 'kraken2').toLowerCase()
        },
        // Icon + colour + tooltip describing a sample's classifier, for the badge
        // shown next to its name in the table.
        classifierInfo(item){
            const c = this.sampleClassifier(item)
            if (c === 'minimap2'){
                return { icon: 'mdi-map-marker-path', color: 'deep-purple', label: 'minimap2',
                    tip: 'Classified with minimap2 (reference alignment → BAM)' }
            }
            if (c === 'bracken'){
                return { icon: 'mdi-sprout-outline', color: 'green darken-2', label: 'Bracken',
                    tip: 'Classified with Bracken (Kraken2 → Bracken abundance re-estimation)' }
            }
            return { icon: 'mdi-jellyfish-outline', color: 'blue darken-1', label: 'Kraken2',
                tip: 'Classified with Kraken2' }
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
        // Is this grouped/individual bucket backed by a live paired-dir watch?
        isGroupWatched(grp){
            if (!grp) return false
            return grp.group ? this.watchedGroups.set.has(grp.group) : this.watchedGroups.individual
        },
        // Tell the server to stop listening on this group's paired directory.
        stopWatchingGroup(grp){
            if (this.offlineMode) return
            this.$emit('stopPairWatch', { group: grp && grp.group ? grp.group : null })
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
            if (!samples.length && !this.preprocessFor(grp.group)) return
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
                if (this.preprocessFor(grp.group)){
                    this.$emit('sendMessage', { type: 'stopPreprocess', run: this.selectedRun, group: grp.group, forget: true })
                }
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
        // Sheet entry for a sample, by name. The samplesheet is the run's
        // configuration; it knows a sample's watch intent even when the sample
        // has never produced a report and therefore has no live status.
        sheetEntry(sample){
            return this.sheetBySample[sample] || null
        },
        isWatching(item){
            if (!item) return false
            const st = item.status || {}
            // Live truth first: the backend attached (or did not attach) a watcher.
            if (st.watching === true) return true
            if (st.watching === false) return false
            // No live status yet — fall back to configured intent.
            const sheet = this.sheetEntry(item.sample)
            const cfgWatch = (item.config && item.config.watch) ||
                (sheet && sheet.watch)
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
            if (s.success === true || s.success === 0) return s.historical ? 'historical' : 'done'
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
        // Request one job's log tail from the server. Replaces the old behaviour
        // where every job's full log rode along inside every status frame.
        fetchJobLogs(p){
            if (!this.socket || !p) return
            const run = p.run !== undefined && p.run !== null ? p.run : this.selectedRun
            const sample = p.sample || p.samplename
            if (!sample || p.index === undefined || p.index === null) return
            try {
                this.socket.emit('getJobLogs', { run, samplename: sample, index: p.index })
            } catch (err) {
                console.error(err)
            }
        },
        reviewJob(job){
            this.selectedQueueJob = job
            this.dialogQueue = true
            // pull this job's logs on open rather than streaming them constantly
            this.fetchJobLogs({ run: job.run || this.selectedRun, sample: job._sample || job.sample, index: job.index })
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
            // rerunning everything clears all "needs rerun" flags for this run
            this.clearStale(null)
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
        // Turn an input path into a sensible sample name: take the basename, drop
        // fastq/fasta extensions (incl. .gz) and any trailing _R1/_R2 read marker.
        // Falls back to a directory's own name. e.g.
        //   /data/x_miseq/sample7_spike1000_R1.fastq.gz -> sample7_spike1000
        //   /data/ebola/                                -> ebola
        deriveSampleFromPath(p){
            if (!p) return ''
            let s = String(p).replace(/^file:\/\//, '').replace(/\\/g, '/').replace(/\/+$/, '')
            let base = s.split('/').pop() || ''
            base = base.replace(/\.(fastq|fq|fasta|fa|fna)(\.gz)?$/i, '')   // strip fastq/fasta ext
            base = base.replace(/[._-][Rr][12]$/, '')                         // strip _R1 / .R2 style marker
            return base.trim()
        },
        // Open the dialog for a NEW sample: reset the form (the Add button used to
        // just flip `dialog` on, leaving the previously-edited sample's values and
        // editedIndex behind, which also confused the coord/needs-rerun tracking).
        openAddDialog(){
            this.editedItem = Object.assign({}, this.defaultItem)
            this.editedIndex = -1
            this._coordOriginal = { lat: null, lon: null }
            this._editSignatureOriginal = null
            this.dialog = true
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
            // New multi-classifier / fastp fields — default them for legacy samples
            // that predate these options so the selects/switches render sensibly.
            if (!this.editedItem.classifier) this.$set(this.editedItem, 'classifier', 'kraken2')
            this.$set(this.editedItem, 'fastp', this.editedItem.fastp === true || this.editedItem.fastp === 'true')
            if (this.editedItem.minimapDatabase === undefined) this.$set(this.editedItem, 'minimapDatabase', null)
            // Prefill lat/long from the sample's metadata (the Map's source of truth)
            // so editing shows existing coordinates instead of a blank field — and a
            // save doesn't silently wipe them.
            const meta = (this.sampleMeta && this.sampleMeta[item]) || {}
            const curLat = this.editedItem.lat
            const curLon = this.editedItem.lon
            if ((curLat === undefined || curLat === null || curLat === '') && meta.lat != null) this.$set(this.editedItem, 'lat', meta.lat)
            if ((curLon === undefined || curLon === null || curLon === '') && meta.lon != null) this.$set(this.editedItem, 'lon', meta.lon)
            // remember the coords the dialog opened with, to detect real changes on save
            this._coordOriginal = {
                lat: this.editedItem.lat == null || this.editedItem.lat === '' ? null : Number(this.editedItem.lat),
                lon: this.editedItem.lon == null || this.editedItem.lon === '' ? null : Number(this.editedItem.lon)
            }
            // remember the classification-relevant settings, to flag "needs rerun"
            // if any of them change on save (see saveItem)
            this._editSignatureOriginal = this.classificationSignature(this.editedItem)
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
            // basecall / demux: the entry becomes a Preprocessor on the server;
            // every barcode it produces is added as its own sample.
            if (this.inputMode === 'preprocess'){
                this.$set(this.editedItem, 'preprocess', { ...this.pre, kit: this.pre.kit ? String(this.pre.kit).trim() : '' })
                this.editedItem.path_2 = null
            } else if (this.editedItem.preprocess){
                this.$set(this.editedItem, 'preprocess', null)
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
            // same for a minimap2 reference dragged in as a file:// URL
            if (this.editedItem.minimapDatabase && this.editedItem.minimapDatabase.startsWith('file://')){
                this.editedItem.minimapDatabase = this.editedItem.minimapDatabase.replace('file://', '')
            }
            if (this.editedItem.path_2 && this.editedItem.path_2.startsWith('file://')){
                this.editedItem.path_2 = this.editedItem.path_2.replace('file://', '')
            }
            this.$emit("updateEntry", this.editedItem)
            // Keep the sample's map coordinates in sync with the dialog. lat/long
            // live in the metadata store (the same channel the Metadata tab uses),
            // NOT the classifier config, so they take effect immediately and never
            // require a rerun. Emit whenever the dialog has coordinates or they were
            // changed/cleared vs what it opened with, so adding, editing and
            // clearing all work reliably.
            if (this.editedItem.sample){
                const parse = (v) => (v === '' || v === undefined || v === null) ? null : parseFloat(v)
                const lat = parse(this.editedItem.lat)
                const lon = parse(this.editedItem.lon)
                const orig = this._coordOriginal || { lat: null, lon: null }
                const changed = lat !== orig.lat || lon !== orig.lon
                if (lat !== null || lon !== null || changed){
                    this.$emit("updateMeta", { sample: this.editedItem.sample, lat, lon })
                }
            }
            // Flag the sample as "needs rerun" if any classification-relevant setting
            // changed on an existing single sample. New samples run fresh, and
            // barcoded/paired expansions re-scan on save, so neither is flagged.
            if (this.editedIndex > -1 && this.inputMode === 'single' && this.editedItem.sample){
                const newSig = this.classificationSignature(this.editedItem)
                if (this._editSignatureOriginal != null && newSig !== this._editSignatureOriginal){
                    this.markStale(this.editedItem.sample)
                }
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

/* ===== paired-dir "listening" chip on group headers ===== */
.mtx-st-listening {
    display: inline-flex;
    align-items: center;
    font-size: 10.5px;
    font-weight: 600;
    color: #15803d;
    background: #dcfce7;
    border-radius: 999px;
    padding: 1px 4px 1px 8px;
    margin-left: 8px;
    line-height: 1.6;
    cursor: default;
}
.mtx-st-stopwatch { margin-left: 2px; }
.mtx-st-stale-ico { cursor: pointer; margin-left: 4px; }
.mtx-st-clf { margin-left: 4px; }

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
.mtx-jp-title { font-size: 16px; font-weight: 600; }
.mtx-jp-strip {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
    padding: 8px 14px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;
}
.mtx-jp-total { font-size: 14px; font-weight: 700; color: #334155; }
.mtx-jp-pill {
    font-size: 10.5px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
    background: #e2e8f0; color: #475569;
}
.mtx-jp-pill.running { background: #dbeafe; color: #1d4ed8; }
.mtx-jp-pill.queued  { background: #e2e8f0; color: #475569; }
.mtx-jp-pill.error   { background: #ffedd5; color: #c2410c; }
.mtx-jp-pill.done    { background: #dcfce7; color: #15803d; }
.mtx-jp-pct { font-size: 13px; color: #64748b; margin-left: 8px; }
.mtx-jp-search {
    font-size: 12px; padding: 4px 10px; border: 1px solid #cbd5e1;
    border-radius: 8px; background: #fff; outline: none; min-width: 160px;
}
.mtx-jp-search:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.15); }
.mtx-jp-body { overflow: hidden; }
.mtx-jp-body > .v-data-table { flex: 1 1 auto; }
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
/* wider than it was: the badge now carries three numbers, not two */
.mtx-stable td.mtx-st-status { text-align: center; width: 92px; }
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

/* composite per-sample status badge: coloured pill reading "<left> / <total>".
   Was a fixed 30px circle, which clipped as soon as a sample had 3-digit file
   counts (e.g. "127 / 433"), so it now sizes to its content. */
.mtx-qbadge {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 30px;
	height: 24px;
	/* tighter horizontal padding and a slightly smaller face: the badge carries
	   three numbers now and has to stay inside a narrow table column */
	padding: 0 7px;
	border-radius: 12px;
	white-space: nowrap;
	cursor: pointer;
	font-weight: 700;
	font-size: 0.72rem;
	font-variant-numeric: tabular-nums;
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
/* Idle: known sample, nothing analysed yet. Deliberately quiet — this is a
   normal resting state, not a problem to draw the eye to. */
.mtx-qbadge--grey   { border-color: #cbd5e1; background: #f1f5f9; color: #64748b; }
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

/* ===== drawer layout: toolbar / search / upload (cleanup) ===== */
.mtx-ss { padding: 2px 0 4px; }
.mtx-ss-toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.mtx-ss-menu .v-list-item__icon { margin-right: 10px !important; }
.mtx-ss-search { display: flex; align-items: center; }
.mtx-ss-searchfield { font-size: 13px; }
.mtx-ss-searchmeta { display: flex; align-items: center; margin: 6px 2px 8px; min-height: 24px; }
.mtx-ss-isolate-label { font-size: 12px; color: #334155; }
.mtx-ss-info { cursor: help; color: #7d97ad !important; }
.mtx-ss-matchcount { font-size: 11px; font-weight: 600; color: #1e6b97; background: #eaf3fa; border-radius: 9px; padding: 1px 8px; }
.mtx-ss-matchcount--warn { color: #a16207; background: #fef3c7; }
.mtx-upbox--compact { padding: 6px 12px; gap: 10px; border-width: 1px; border-radius: 10px; margin-top: 8px; }
.mtx-upbox--compact .mtx-upbox-icon { width: 30px; height: 30px; border-radius: 8px; box-shadow: none; }
.mtx-upbox--compact .mtx-upbox-icon .v-icon { font-size: 18px !important; }
.mtx-upbox--compact .mtx-upbox-text { flex-direction: row; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.mtx-upbox--compact .mtx-upbox-text strong { font-size: 12.5px; }
.mtx-upbox--compact .mtx-upbox-text span { font-size: 11.5px; }
.mtx-upbox--compact .mtx-upbox-text small { display: none; }

/* ===== database pickers in the add/edit dialog ===== */
.mtx-dbsel-name { font-weight: 600; margin-right: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mtx-dbsel-state { font-size: 11px; color: #64748b; white-space: nowrap; }
.mtx-dbopt { min-height: 52px; }
.mtx-dbopt-title { font-size: 13.5px; font-weight: 600; }
.mtx-dbopt-sub { font-size: 11.5px !important; white-space: normal !important; line-height: 1.35 !important; }
.mtx-dbopt-state--ready { color: #15803d; }
.mtx-dbopt-state--missing { color: #b45309; }
.mtx-dbopt-state--downloading { color: #1d4ed8; }
.mtx-dbopt-state--extracting { color: #6d28d9; }
.mtx-dbopt-state--error { color: #b91c1c; }
.mtx-db-warn { text-align: left; display: flex; align-items: flex-start; font-size: 12px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 10px; margin-top: 8px; }

/* ===== per-sample / group files popup (data table) ===== */
.mtx-jp-searchfield { max-width: 340px; font-size: 14px; }
.mtx-jp-filters { padding: 0 14px 4px; border-bottom: 1px solid #eef2f6; }
.mtx-jp-chip { font-size: 13px !important; }
.mtx-jp-chip--on.mtx-jp-chip--all { background: #e0e7ff !important; color: #3730a3 !important; }
.mtx-jp-chip--on.mtx-jp-chip--running { background: #dbeafe !important; color: #1d4ed8 !important; }
.mtx-jp-chip--on.mtx-jp-chip--queued { background: #e2e8f0 !important; color: #334155 !important; }
.mtx-jp-chip--on.mtx-jp-chip--error { background: #ffedd5 !important; color: #c2410c !important; }
.mtx-jp-chip--on.mtx-jp-chip--done { background: #dcfce7 !important; color: #15803d !important; }
.mtx-jp-dtable ::v-deep td { font-size: 14px !important; height: 44px !important; }
.mtx-jp-dtable ::v-deep th { font-size: 12.5px !important; }
.mtx-jp-idx { color: #64748b; font-variant-numeric: tabular-nums; }
.mtx-jp-file { display: inline-block; max-width: 460px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.mtx-jp-acts { display: flex; justify-content: flex-end; gap: 2px; }
.mtx-jp-dtable .mtx-jp-state { font-size: 13.5px; }

/* ===== basecall / demux ===== */
.mtx-pre-tool { display: flex; align-items: center; font-size: 12px; border-radius: 8px; padding: 6px 10px; margin-top: 8px; text-align: left; }
.mtx-pre-tool--ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #14532d; }
.mtx-pre-tool--missing { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.mtx-st-pre { display: inline-flex; align-items: center; margin-left: 6px; font-size: 10.5px; font-weight: 600; border-radius: 9px; padding: 0 4px 0 7px; background: #e0e7ff; color: #3730a3; }
.mtx-st-pre-main { display: inline-flex; align-items: center; white-space: nowrap; cursor: help; }
.mtx-st-pre .v-icon { color: inherit !important; }
.mtx-st-pre--running { background: #dbeafe; color: #1d4ed8; }
.mtx-st-pre--error { background: #fee2e2; color: #b91c1c; }
.mtx-st-pre--stopped { background: #f1f5f9; color: #475569; }
.mtx-st-pre--done { background: #dcfce7; color: #15803d; }
.mtx-pre-tip { font-size: 12px; line-height: 1.5; text-align: left; }
.mtx-pre-tip code { font-size: 11px; background: rgba(255,255,255,.15); padding: 0 3px; border-radius: 3px; word-break: break-all; }
.mtx-pre-tip-err { margin-top: 4px; color: #fecaca; }
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