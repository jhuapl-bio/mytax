<template>
  <v-app  style="padding-bottom: 0px;">
      <v-app-bar
        app
        color="light"
        dark absolute class=""
        dense
      >
        
        <v-tooltip bottom>
          <template v-slot:activator="{ on }">
            <v-btn icon v-on="on" @click="toggleDrawer" class="mr-2">
              <v-icon>{{ navigation.collapsed ? 'mdi-menu' : 'mdi-backburger' }}</v-icon>
            </v-btn>
          </template>
          {{ navigation.collapsed ? 'Expand samples panel' : 'Collapse samples panel' }}
        </v-tooltip>
        <v-toolbar-title>Mytax2: Real Time Nanopore Report Analysis</v-toolbar-title>
        <v-spacer>
        </v-spacer>
        <span style="margin-right: 10px" v-if="!selectedsamples || selectedsamplesAll.length <= 0 ">No Data Loaded</span>
        <v-spacer></v-spacer>
        <v-checkbox 
            v-model="gpu" style="text-align:center"    class="mt-6" v-if="isOnline"
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

        <!-- Server status dot -->
        <v-tooltip bottom>
          <template v-slot:activator="{ on }">
            <span
              class="mtx-status-dot"
              :class="statusClass"
              v-on="on"
              @click="settingsDialog = true"
              style="cursor:pointer"
            ></span>
          </template>
          <span>{{ statusLabel }}</span>
        </v-tooltip>

        <!-- Running spinner -->
        <v-progress-circular
          v-if="anyRunning"
          :indeterminate="true"
          stream class="mr-1 ml-1" size="14"
          color="white"
        ></v-progress-circular>

        <!-- Settings button -->
        <v-tooltip bottom>
          <template v-slot:activator="{ on }">
            <v-btn icon v-on="on" @click="settingsDialog = true" class="ml-1">
              <v-icon>mdi-cog-outline</v-icon>
            </v-btn>
          </template>
          Server &amp; app settings
        </v-tooltip>

      </v-app-bar>

      <!-- ===== Settings dialog ===== -->
      <v-dialog v-model="settingsDialog" max-width="560" scrollable>
        <v-card class="mtx-settings-card">
          <v-card-title class="mtx-settings-title">
            <v-icon class="mr-2">mdi-cog</v-icon>
            Settings
            <v-spacer></v-spacer>
            <v-btn icon @click="settingsDialog = false"><v-icon>mdi-close</v-icon></v-btn>
          </v-card-title>

          <v-divider></v-divider>

          <v-card-text class="mtx-settings-body">

            <!-- Connection -->
            <div class="mtx-set-section">
              <div class="mtx-set-head">
                <v-icon x-small class="mr-1">mdi-lan-connect</v-icon>
                Backend server connection
                <span class="mtx-set-status-chip" :class="statusClass">{{ statusLabel }}</span>
              </div>
              <v-row dense>
                <v-col cols="7">
                  <v-text-field
                    v-model="settingsEditHost"
                    label="Host"
                    outlined dense hide-details
                    placeholder="localhost"
                  ></v-text-field>
                </v-col>
                <v-col cols="5">
                  <v-text-field
                    v-model="settingsEditPort"
                    label="Port"
                    outlined dense hide-details
                    type="number"
                    placeholder="7689"
                  ></v-text-field>
                </v-col>
              </v-row>
              <div class="mtx-set-url-preview">
                Connecting to: <code>{{ settingsPreviewUrl }}</code>
              </div>
              <v-btn small color="primary" class="mt-2" @click="applySettings">
                <v-icon small left>mdi-connection</v-icon>
                Reconnect with new URL
              </v-btn>
            </div>

            <v-divider class="my-3"></v-divider>

            <!-- Report save path -->
            <div class="mtx-set-section">
              <div class="mtx-set-head">
                <v-icon x-small class="mr-1">mdi-folder-outline</v-icon>
                Report save directory
              </div>
              <div class="mtx-set-path">
                <v-icon small class="mr-1" color="#5b7a90">mdi-folder</v-icon>
                <span>{{ reportSavePath || 'Not yet received from server' }}</span>
              </div>
            </div>

            <v-divider class="my-3"></v-divider>

            <!-- Databases -->
            <div class="mtx-set-section">
              <div class="mtx-set-head">
                <v-icon x-small class="mr-1">mdi-database-outline</v-icon>
                Reference databases
              </div>
              <div v-if="databases && databases.length">
                <div v-for="db in databases" :key="db.key" class="mtx-set-db-row">
                  <v-icon small :color="db.size ? 'green' : 'orange'" class="mr-1">
                    {{ db.size ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
                  </v-icon>
                  <span class="mtx-set-db-key">{{ db.key }}</span>
                  <span class="mtx-set-db-path">{{ db.final || db.url || '—' }}</span>
                </div>
              </div>
              <div v-else class="mtx-set-empty">No database info received yet</div>
            </div>

            <v-divider class="my-3"></v-divider>

            <!-- Config -->
            <div class="mtx-set-section">
              <div class="mtx-set-head">
                <v-icon x-small class="mr-1">mdi-file-cog-outline</v-icon>
                Configuration
              </div>
              <v-btn small outlined @click="reloadConfig">
                <v-icon small left>mdi-reload</v-icon>
                Reload default .config from server
              </v-btn>
              <div v-if="bundleconfig" class="mtx-set-config-preview">
                <div class="mtx-set-config-label">Loaded config keys:</div>
                <code>{{ Object.keys(bundleconfig).join(', ') }}</code>
              </div>
            </div>

          </v-card-text>
        </v-card>
      </v-dialog> 
      <div class="pt-6 "> 
        
        <v-navigation-drawer permanent class="pt-6 mtx-drawer"
          app ref="information_panel_drawer"  left :width="drawerWidth" v-model="navigation.shown"
          :mini-variant="navigation.collapsed" mini-variant-width="0"
        >
          <div class="mtx-drawer-header" v-show="!navigation.collapsed">
            <div class="mtx-drawer-heading">
              <v-icon small color="white" class="mr-2">mdi-dna</v-icon>
              <span class="mtx-drawer-title">Runs &amp; Samples</span>
            </div>
            <v-btn icon small dark @click="toggleDrawer" title="Collapse panel">
              <v-icon small>mdi-chevron-left</v-icon>
            </v-btn>
          </div>

          <div class="mtx-drawer-scroll" v-show="!navigation.collapsed">

            <!-- ===== Database section ===== -->
            <section class="mtx-sec">
              <div class="mtx-sec-head">
                <v-icon x-small class="mr-1">mdi-database</v-icon>
                <span>Reference database</span>
              </div>
              <div v-if="!isOnline" class="mtx-db-offline-note">
                <v-icon x-small class="mr-1" color="#b45309">mdi-cloud-off-outline</v-icon>
                Offline — databases require a backend connection
              </div>
              <div class="mtx-sec-body mtx-row-end" v-else>
                <v-select
                  v-model="database"
                  :items="databases"
                  label="Database"
                  item-key="url"
                  item-value="key"
                  return-object
                  item-text="final"
                  :hint="`${database.size}`"
                  dense outlined
                  persistent-hint class="flex" >
                  <template v-slot:prepend>
                    <v-tooltip bottom>
                    <template v-slot:activator="{ on }">
                      <v-btn @click="downloaddb" v-on="on" icon small>
                        <v-icon>mdi-download</v-icon>
                      </v-btn>
                    </template>
                    Download Database to home directory
                    </v-tooltip>
                  </template>
                  <template v-slot:selection="{ item }">
                    {{ item.key }} <v-spacer vertical></v-spacer>
                      <template v-if="item.downloading">
                        <v-progress-circular
                          :indeterminate="item.progress == null"
                          :value="item.progress || 0"
                          :rotate="-90"
                          class="mr-1"
                          size="18" width="2" color="blue lighten-2" >
                        </v-progress-circular>
                        <span v-if="item.progress != null" class="caption blue--text text--lighten-1 mr-2">
                          {{ item.progress }}%
                        </span>
                      </template>
                      <v-icon v-else
                        :color="item.size != 0 ? 'green' : 'orange lighten-1' "
                      >{{ item.size != 0 ? 'mdi-check' : 'mdi-alert'  }}
                      </v-icon>
                  </template>
                </v-select>
                <v-btn class="ml-1" @click="canceldownload" v-if="database.downloading" icon small>
                  <v-icon>mdi-cancel</v-icon>
                </v-btn>
              </div>
              <v-progress-linear
                v-if="isOnline && database.downloading"
                :indeterminate="database.progress == null"
                :value="database.progress || 0"
                height="6" rounded color="blue lighten-1" class="mt-1" >
              </v-progress-linear>
              <div v-if="isOnline && database.downloading" class="caption grey--text mt-1">
                Downloading {{ database.key }}
                <span v-if="database.progress != null">— {{ database.progress }}%</span>
              </div>
            </section>

            <!-- ===== Run section ===== -->
            <section class="mtx-sec">
              <div class="mtx-sec-head">
                <v-icon x-small class="mr-1">mdi-flask-outline</v-icon>
                <span>Run</span>
              </div>
              <div class="mtx-sec-body">
                <v-select
                  v-if="isOnline && runs && runs.length > 0"
                  :items="runs"
                  v-model="selectedRun"
                  label="Available runs"
                  hint="Select a run / set of samples"
                  dense outlined
                  persistent-hint
                  class="flex"
                />
                <div class="mtx-run-actions">
                  <AddRun
                    v-if="isOnline"
                    ref="addRun"
                    @sendMessage="sendMessage"
                    @runAdded="onRunAdded"
                    :selectedRun="selectedRun"
                    :samples="selectedsamplesAll"
                    :pathOptions="pathOptions"
                    :reportSavePath="reportSavePath"
                  />
                  <v-tooltip bottom>
                    <template v-slot:activator="{ on }">
                      <v-btn v-on="on" icon
                        @click="sendMessage({type: 'openPath' })">
                        <v-icon color="black">mdi-home</v-icon>
                      </v-btn>
                    </template>
                    Open Base Path to default database(s), reports, information
                  </v-tooltip>
                </div>
              </div>
            </section>

            <!-- ===== Samples section ===== -->
            <section class="mtx-sec">
              <div class="mtx-sec-head">
                <v-icon x-small class="mr-1">mdi-test-tube</v-icon>
                <span>Samples &amp; fastq sources</span>
              </div>

              <!-- Source legend: separates live server-watched samples from local uploads -->
              <div class="mtx-source-legend" v-if="selectedsamplesAll.length">
                <span class="mtx-src-chip mtx-src-server">
                  <v-icon x-small class="mr-1">mdi-server-network</v-icon>{{ sampleSourceCounts.server }} listened
                </span>
                <span class="mtx-src-chip mtx-src-upload">
                  <v-icon x-small class="mr-1">mdi-tray-arrow-up</v-icon>{{ sampleSourceCounts.upload }} uploaded
                </span>
                <span class="mtx-src-chip mtx-src-demo" v-if="sampleSourceCounts.demo">
                  <v-icon x-small class="mr-1">mdi-flask-outline</v-icon>{{ sampleSourceCounts.demo }} demo
                </span>
                <v-spacer></v-spacer>
                <button
                  class="mtx-src-clear"
                  v-if="hasUploads"
                  @click="clearUploadedData"
                  title="Remove uploaded & demo reports (keeps live server samples)"
                >
                  <v-icon x-small class="mr-1">mdi-broom</v-icon>Clear local
                </button>
              </div>

          <!-- Button click to save run information, sned to backend as a method -->
          <Samplesheet
        :samplesheet="samplesheet"
        :queueLength="queueLength"
        :queueList="queueList"
        :queueBoard="queueBoard"
        :databases="databases"
        :selectedsamples="selectedsamples"
        :bundleconfig="bundleconfig"
        :seen="samplekeys"
        :current="current"
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
        @updateMeta="setSampleMeta"
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
        :offlineMode="!isOnline"  
      >
      </Samplesheet>
      <v-alert class="py-0 my-0 mt-2" dense type="info" v-if="isOnline && !selectedRun">
        No run selected. Create one with the “+” button first.
      </v-alert>
            </section>

            <!-- ===== Filters section ===== -->
            <section class="mtx-sec">
              <div class="mtx-sec-head">
                <v-icon x-small class="mr-1">mdi-tune-variant</v-icon>
                <span>Display filters</span>
              </div>
              <div class="mtx-sec-body mtx-filters">

            <div class="mtx-filter-block">
              <div class="mtx-filter-row">
                <span class="mtx-filter-label">Depth range</span>
                <span class="mtx-filter-chip">{{ depthRange[0] }} – {{ depthRange[1] }}</span>
              </div>
              <v-range-slider
                v-model="depthRange"
                :max="maxDepth"
                :min="0"
                :step="1"
                hide-details
                track-color="#dbe6f0"
                color="#1e6b97"
                thumb-color="#0e3f6a"
                class="mtx-slider align-center"
              >
                <template v-slot:prepend>
                  <v-text-field
                    v-model="depthRange[0]"
                    hide-details single-line type="number"
                    density="compact"
                    class="mtx-filter-num"
                    style="width: 64px"
                  ></v-text-field>
                </template>
                <template v-slot:append>
                  <v-text-field
                    v-model="depthRange[1]"
                    hide-details single-line type="number"
                    density="compact"
                    class="mtx-filter-num"
                    style="width: 64px"
                  ></v-text-field>
                </template>
              </v-range-slider>
            </div>

            <div class="mtx-filter-block">
              <div class="mtx-filter-row">
                <span class="mtx-filter-label">Min abundance in sample</span>
                <span class="mtx-filter-chip">{{ minPercent }}</span>
              </div>
              <v-slider
                v-model="minPercent"
                :min="0"
                :step="0.005"
                :max="1"
                hide-details
                track-color="#dbe6f0"
                color="#1e6b97"
                thumb-color="#0e3f6a"
                class="mtx-slider"
              >
                <template v-slot:append>
                  <v-text-field
                    v-model="minPercent"
                    hide-details single-line type="number"
                    step="0.005"
                    density="compact"
                    class="mtx-filter-num"
                    style="width: 78px"
                  ></v-text-field>
                </template>
              </v-slider>
            </div>

            <v-select
              label="Tax Rank Codes"
              v-model="defaults" multiple
              :items="rankItems"
              item-text="text"
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
            </section>

          </div><!-- /mtx-drawer-scroll -->
            <div
              v-show="!navigation.collapsed"
              class="mtx-drawer-resizer"
              @mousedown.prevent="startDrawerDrag"
              title="Drag to resize"
            ></div>
          </v-navigation-drawer>
        </div>
      <v-main class="pb-0">
        <!-- Frontend-only / offline banner (e.g. GitHub Pages with no backend) -->
        <div class="mtx-offline-banner" v-if="!isOnline">
          <v-icon color="#b45309" class="mr-3">mdi-cloud-off-outline</v-icon>
          <div class="mtx-offline-text">
            <div class="mtx-offline-title">Frontend-only mode — not connected to a backend</div>
            <div class="mtx-offline-sub">
              {{ connectedStatus }} Real-time sequencing &amp; job submission are disabled here. You can still explore by
              loading demo data or dropping your own Kraken2 reports (top-right).
            </div>
          </div>
          <v-spacer></v-spacer>
          <v-btn
            small color="primary" depressed class="ml-2"
            v-if="!demoLoaded" @click="loadDemoData"
          >
            <v-icon small left>mdi-flask-outline</v-icon>Load demo data
          </v-btn>
          <v-btn
            small text class="ml-1"
            v-if="hasUploads" @click="clearUploadedData"
          >
            <v-icon small left>mdi-broom</v-icon>Clear demo/uploaded
          </v-btn>
        </div>
        <v-row class="ml-4 pb-0 mtx-main-row">

          <v-col
              sm="12"
              id=""
              class="my-0 mtx-main-col"
          >
              <v-tabs
                v-model="tab"
                background-color="transparent"
                color="indigo darken-3"
                class="mtx-tabnav"
                show-arrows
              >
                <v-tab v-for="(tabItem, key) in tabs" :key="`${key}-tab`">
                  <v-icon small left v-if="tabItem.mdi">{{ tabItem.mdi }}</v-icon>
                  {{ tabItem.name }}
                </v-tab>
              </v-tabs>

              <v-tabs-items v-model="tab" class="mtx-tab-scroll"
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
                          :sampleMeta="sampleMeta"
                          :run="selectedRun"
                          :socket="socket"
                          @updateMeta="setSampleMeta"
                          @updateRunMeta="setRunMeta"
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
import Heatmap from "@/components/Heatmap"
import Explore from "@/components/Explore"
import Map from "@/components/Map"
import CrossSample from "@/components/CrossSample"
import DataTableTab from "@/components/DataTableTab"
import Metadata from "@/components/Metadata"
import AddRun from "@/components/AddRun"
import demoSamples from "@/assets/demoData"
import _ from 'lodash'
import { io } from "socket.io-client";
 

export default {
    name: 'App',
    components: {
      Plates,
      Samplesheet,
      AddRun,
      Heatmap,
      Explore,
      Map,
      CrossSample,
      DataTableTab,
      Metadata,
    },
    beforeDestroy(){ 
      if (this.interval){
        try{
          clearInterval(this.interval)
        } catch (err){
          console.error(err)
        }
      } 
      document.removeEventListener('mousemove', this.onDrawerDrag)
      document.removeEventListener('mouseup', this.stopDrawerDrag)
    },
    computed: {
      isConnected() {
        return !!(this.socket && this.socket.connected);
      },
      // Rank selector items with explicit subspecies depth labels (S1, S2, ...).
      rankItems() {
        return this.sortRankCodes(this.defaultsList)
          .map(c => ({ text: this.rankLabel(c), value: c }))
      },
      statusClass() {
        if (this.isOnline) return 'connected'
        if (this.isConnecting) return 'connecting'
        return 'offline'
      },
      statusLabel() {
        if (this.isOnline) return 'Connected to backend'
        if (this.isConnecting) return 'Connecting to backend…'
        return this.connectedStatus || 'Backend offline'
      },
      settingsPreviewUrl() {
        const proto = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'https:' : 'http:'
        return `${proto}//${this.settingsEditHost}:${this.settingsEditPort}`
      },
      drawerWidth() {
        return this.navigation.collapsed ? 0 : this.navigation.width;
      },
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
      // Tally samples by where they came from so the left panel can clearly
      // separate live server-watched samples from locally uploaded K2 reports.
      sampleSourceCounts(){
        const counts = { server: 0, upload: 0, demo: 0 }
        this.selectedsamplesAll.forEach((s) => {
          const o = s.origin || 'server'
          if (counts[o] === undefined) counts[o] = 0
          counts[o] += 1
        })
        return counts
      },
      hasUploads(){
        return (this.sampleSourceCounts.upload + this.sampleSourceCounts.demo) > 0
      },



    },

    data() {
        const savedHost = localStorage.getItem('mtx_serverHost') || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')
        const savedPort = localStorage.getItem('mtx_serverPort') || '7689'
        return {
          settingsDialog: false,
          serverHost: savedHost,
          serverPort: savedPort,
          settingsEditHost: savedHost,
          settingsEditPort: savedPort,
          isConnecting: true,
          search: '',
            queueLength: 0,
            manuals: {},
            sampleMeta: {},
            socket: {},
            socketReport: {},
            navigation: {
                shown: true,
                collapsed: false,
                width: 550,
                borderSize: 6
            },
            runs: [],
            selectedRun: null,
            pendingRunSelect: null,
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
            isOnline: false,
            demoLoaded: false,
            connectedStatus: 'Offline mode: backend not connected yet',
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
            
            defaults: ['K','R', 'R1', "U", 'P', "G", 'D', 'D1', 'O','C','S','F', 'F1', 'F2', 'S1', 'S2', 'S3', 'S4', 'S5'],
            defaultsList: ['U','K', 'P', 'D','D1','G', 'O','C','S','F', "F2", "F1", 'S1', 'S2', 'S3', 'S4', 'S5'],
            depthRange: [0,100],
            maxDepth: 100,
            samplesheetdata: [],
            samplesheet: null,
            reportSavePath: null,
            minDepth: 0,
            minPercent: 0,
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
            queueBoard: {},
            drawerDragging: false,
            tabs: [
                {
                  name: 'Heatmap',
                  icon: "square",
                  mdi: "mdi-grid",
                  component: "Heatmap"
                },
                {
                  name: 'Explore',
                  mdi: "mdi-chart-donut",
                  component: "Explore"
                },
                {
                  name: 'Cross-Sample',
                  mdi: "mdi-compare",
                  component: "CrossSample"
                },
                {
                  name: 'Table',
                  mdi: "mdi-table",
                  component: "DataTableTab"
                },
                {
                  name: 'Metadata',
                  mdi: "mdi-information-outline",
                  component: "Metadata"
                },
                {
                  name: 'Map',
                  mdi: "mdi-map-outline",
                  component: "Map"
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
          // Drop the previous run's samples AND queue so a 1600-job run doesn't
          // linger (or keep taking incremental updates) after switching to a
          // small run. The server also re-scopes live updates to `val` on the
          // getRunInformation below, and a fresh snapshot rehydrates everything.
          this.selectedsamplesAll = []
          this.queueList = {}
          this.queueBoard = {}
          this.loadMeta()
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
        this.$nextTick(() => {
          this.setBorderWidth();
          this.setEvents();
        });

        this.connect()

      

    },
    methods: {
      onRunAdded(runName) {
        // Store the new run name so the next "runs" socket event auto-selects it.
        this.pendingRunSelect = runName
      },
      generateUserId() {
        return `user_${Math.random().toString(36)}`;
      },
      toggleDrawer(){
        this.navigation.collapsed = !this.navigation.collapsed;
        // give the layout a tick to settle, then nudge a resize so plots reflow
        this.$nextTick(() => {
          window.dispatchEvent(new Event('resize'));
        });
      },
      startDrawerDrag(){
        if (this.navigation.collapsed) return
        this.drawerDragging = true
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', this.onDrawerDrag)
        document.addEventListener('mouseup', this.stopDrawerDrag)
      },
      onDrawerDrag(e){
        if (!this.drawerDragging) return
        const MIN_W = 320
        const MAX_W = 820
        const width = Math.max(MIN_W, Math.min(MAX_W, e.clientX))
        this.navigation.width = width
      },
      stopDrawerDrag(){
        if (!this.drawerDragging) return
        this.drawerDragging = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', this.onDrawerDrag)
        document.removeEventListener('mouseup', this.stopDrawerDrag)
        this.$nextTick(() => window.dispatchEvent(new Event('resize')))
      },
      metaStorageKey(){
        return `mytax_meta_${this.selectedRun || 'default'}`
      },
      loadMeta(){
        try {
          const raw = localStorage.getItem(this.metaStorageKey())
          this.sampleMeta = raw ? JSON.parse(raw) : {}
        } catch (err) { this.sampleMeta = {} }
      },
      saveMeta(){
        try { localStorage.setItem(this.metaStorageKey(), JSON.stringify(this.sampleMeta)) } catch (err) { console.error(err) }
      },
      setSampleMeta(payload){
        // payload: { sample, ...fields } (e.g. lat, lon, notes)
        if (!payload || !payload.sample) return
        const existing = this.sampleMeta[payload.sample] || {}
        const merged = { ...existing, ...payload }
        delete merged.sample
        this.$set(this.sampleMeta, payload.sample, merged)
        this.saveMeta()
        // best-effort persist to backend run samplesheet entry
        this.sendMessage({
          type: 'updateEntry',
          sample: payload.sample,
          info: { sample: payload.sample, ...merged },
          run: this.selectedRun,
          message: `Update metadata for ${payload.sample}`
        })
      },
      setRunMeta(payload){
        // apply coordinates/fields to every loaded sample in the run
        const fields = { ...payload }
        delete fields.sample
        this.selectedsamplesAll.forEach((s) => {
          this.setSampleMeta({ sample: s.sample, ...fields })
        })
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
            // Preserve the backend-provided watching flag; the per-job queue
            // entries don't carry it, so re-deriving would otherwise wipe it.
            let watching = status && status.watching

            status = {
              running: running,
              paused: paused,
              success: success,
              historical: historical,
              waiting: waiting,
              error: error,
              logs: logs,
              watching: watching
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
          const drawer = this.$refs.information_panel_drawer;
          if (!drawer) return;
          const i = drawer.$el.querySelector(".v-navigation-drawer__border");
          if (!i) return;
          i.style.width = this.navigation.borderSize + "px";
          i.style.cursor = "ew-resize";
          // make sure the grab strip sits above the panel content
          i.style.zIndex = "5";
        },
        setEvents() {
            const drawer = this.$refs.information_panel_drawer;
            if (!drawer) return;
            const el = drawer.$el;
            const border = el.querySelector(".v-navigation-drawer__border");
            if (!border) return;
            const vm = this;
            const direction = el.classList.contains("v-navigation-drawer--right")
                ? "right"
                : "left";
            const MIN_W = 320, MAX_W = 820;

            let dragging = false, raf = null, pendingW = null;

            const apply = () => {
                raf = null;
                // drive the reactive width so Vuetify resizes the drawer AND shifts the
                // main content; setting el.style.width directly snapped back on re-render.
                if (pendingW != null) vm.navigation.width = pendingW;
            };
            const onMove = (e) => {
                if (!dragging) return;
                let f = direction === "right"
                    ? document.body.scrollWidth - e.clientX
                    : e.clientX;
                f = Math.max(MIN_W, Math.min(MAX_W, f));
                pendingW = f;
                if (raf == null) raf = requestAnimationFrame(apply);
            };
            const stop = () => {
                if (!dragging) return;
                dragging = false;
                if (raf != null) { cancelAnimationFrame(raf); raf = null; apply(); }
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                el.style.transition = "";
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", stop);
                // let plots reflow to the new width
                vm.$nextTick(() => window.dispatchEvent(new Event("resize")));
            };

            border.addEventListener("mousedown", (e) => {
                e.preventDefault();
                dragging = true;
                el.style.transition = "initial";
                document.body.style.cursor = "ew-resize";
                document.body.style.userSelect = "none";
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", stop);
            });
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
        applySettings() {
          this.serverHost = this.settingsEditHost.trim() || window.location.hostname
          this.serverPort = String(this.settingsEditPort).trim() || '7689'
          localStorage.setItem('mtx_serverHost', this.serverHost)
          localStorage.setItem('mtx_serverPort', this.serverPort)
          if (this.socket && typeof this.socket.disconnect === 'function') {
            this.socket.disconnect()
          }
          this.isOnline = false
          this.isConnecting = true
          this.connectedStatus = 'Connecting…'
          this.settingsDialog = false
          this.$nextTick(() => this.connect())
        },
        reloadConfig() {
          this.sendMessage({ type: 'getbundleconfig' })
          this.sendMessage({ type: 'getReportPath' })
          this.sendMessage({ type: 'getDbs' })
        },
        async connect(){
          const socketProtocol = (window.location.protocol === 'https:' ? 'https:' : 'http:')
          const port = ':' + (this.serverPort || '7689')
          const echoSocketUrl = socketProtocol + '//' + (this.serverHost || window.location.hostname) + port
          // this.defaults = this.defaultsList
          // Define socket and attach it to our data object
          // set user id for local storage
          const userId = localStorage.getItem('userId') || this.generateUserId();
          console.log(`userId: ${userId}`)
          localStorage.setItem('userId', userId);


          this.socket = io(echoSocketUrl, {
            query: { userId },
            // Explicit reconnection policy: keep retrying with capped backoff so a
            // transient event-loop stall on the server doesn't strand the client.
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
          });
          // This is a fresh socket object, so its message handlers must be bound
          // once below. Reset the guard (a reconnect of THIS socket keeps it true
          // and won't rebind; only a brand-new socket from connect()/applySettings
          // clears it). Prevents the duplicate-handler stacking described below.
          this._listenersBound = false
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
              // If the updated db is the currently selected one, re-point the
              // v-model object to the fresh status object so the selection slot
              // (size / spinner / progress) actually re-renders on completion.
              if (this.database.key == e.status.key){
                this.$set(this, 'database', this.databases[index])
              }
            }

            // Backend says this DB already exists -> confirm before overwriting.
            if (e.needsConfirm && e.warning){
              this.$swal({
                title: 'Database already downloaded',
                text: e.warning,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Re-download',
                cancelButtonText: 'Cancel'
              }).then((result)=>{
                if (result && result.isConfirmed){
                  this.sendMessage({
                    type: "downloaddb",
                    database: e.status.key,
                    confirm: true,
                    "message": `Re-download Database ${e.status.key}`
                  });
                }
              })
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
            $this.isOnline = false;
            $this.isConnecting = true;
            $this.connectedStatus = 'Offline mode: backend unreachable. You can still load a report.';
          });
          this.socket.on('userSettings', function(e) {
            $this.gpu = e.gpu
          });


          this.socket.on('error', function(err) {
            console.error('Socket encountered error: ', err.message, 'Closing socket');
            $this.isOnline = false;
            $this.isConnecting = false;
            $this.connectedStatus = 'Offline mode: backend error. You can still load a report and Check Logs or Network Settings';
            $this.socket.close();
          });
          this.socket.on("connect_error", (err) => {
            console.error('Socket encountered error: ', err, 'Closing socket');
            $this.isOnline = false;
            $this.isConnecting = false;
            $this.connectedStatus = 'Offline mode: cannot reach backend. Load a report file to continue.';
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
              $this.isOnline = true;
              $this.isConnecting = false;
              $this.connectedStatus = 'Connected';
              
              if ($this.selectedRun){
                $this.sendMessage({
                  run: $this.selectedRun,
                  type: "getRunInformation", 
                })
              } 
              this.sendMessage({
                type: "getRuns"          
              }); 
              $this.sendMessage({
                type: "getStatus"
              })
              // Resync GPU preference on every (re)connect, like the emits above.
              $this.socket.emit("gpu", {type: "gpu", gpu: $this.gpu })

              // IMPORTANT: only bind the message listeners ONCE. Previously every
              // 'connect' (including every reconnect after a blip) re-ran all the
              // socket.on(...) registrations below, stacking duplicate handlers.
              // After a few reconnects each 'sampledata'/'status' frame was being
              // processed 2x, 3x... which compounded the lag and triggered further
              // ping-timeout drops -- a feedback loop. The emits above still run on
              // every (re)connect to refresh state; the handlers bind a single time.
              if ($this._listenersBound) { return }
              $this._listenersBound = true

              $this.socket.on("runs", (e)=>{
                $this.runs = e;
                console.log(e, "Available Runs")
                // Auto-select a newly created run if one is pending
                if ($this.pendingRunSelect && e.indexOf($this.pendingRunSelect) > -1) {
                  $this.selectedRun = $this.pendingRunSelect
                  $this.pendingRunSelect = null
                } else if (!this.selectedRun){
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
              $this.socket.on("queueBoard", (e)=>{
                // round-robin play order snapshot for the selected run
                if (!e) return
                if (e.run && $this.selectedRun && e.run !== $this.selectedRun) return
                $this.queueBoard = e
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
                try {
                  const sample = e.samplename
                  if (!sample) return
                  let job = e.queue
                  if (Array.isArray(job)) {
                    job = job.length ? job[job.length - 1] : null
                  }
                  this.addSample(sample, job || {})
                  if (!this.queueList[sample]) {
                    this.$set(this.queueList, sample, [])
                  }
                  const idx = (job && job.index != null) ? job.index : this.queueList[sample].length
                  const merged = {
                    ...(this.queueList[sample][idx] || {}),
                    ...(job || {})
                  }
                  if (!merged.status) {
                    merged.status = {
                      running: false,
                      waiting: true,
                      success: null,
                      historical: false,
                      error: null,
                      logs: []
                    }
                  }
                  this.$set(this.queueList[sample], idx, merged)
                  this.updateSampleStatus(sample)
                } catch (err) {
                  console.error(err)
                }
              })
              $this.socket.on("sampledata", (e)=>{
                // Coalesce on the client too: importData is heavy (TSV parse +
                // deep clones + chart re-render). Queue the latest report per
                // sample and render on a trailing timer so a burst of updates
                // doesn't lock the UI thread.
                $this.scheduleServerImport(e.data, e.samplename)
              })
              $this.socket.on("samplesheet", (e)=>{
                $this.samplesheet = e.samplesheet
              })
             
              $this.socket.on('runInformation', async (e)=>{
                // Single-packet hydrate. The server sends the WHOLE run snapshot
                // in one frame: samplesheet + for every sample its report text,
                // full queue list and per-job status. We populate everything from
                // here in one pass instead of waiting on a flood of per-sample
                // sampledata / queueJob / status frames (which is what made a
                // 1600-job run take minutes to load).
                if (!e) return
                $this.$set($this, 'samplesheet', e.samplesheet || [])
                if (!Array.isArray(e.reportdata)) return

                const pendingReports = []
                for (const entry of e.reportdata){
                  const sample = entry && entry.samplename
                  if (!sample) continue
                  // queue list for this sample (default to [] so status calc is safe)
                  const queue = Array.isArray(entry.queue) ? entry.queue : []
                  $this.$set($this.queueList, sample, queue)
                  // register the sample WITHOUT a getStatus round-trip — the
                  // queue + status are already in this packet.
                  const lastJob = queue.length ? queue[queue.length - 1] : {}
                  $this.addSample(sample, lastJob, 'server', true)
                  $this.updateSampleStatus(sample)
                  if (entry.data && typeof entry.data === 'string' && entry.data !== ''){
                    pendingReports.push({ sample, data: entry.data })
                  }
                }
                // Render the reports through the existing coalesced importer,
                // flagged as a bulk hydrate so importData/addSample stay quiet.
                for (const r of pendingReports){
                  $this.scheduleServerImport(r.data, r.sample, true)
                }
              })

              $this.socket.on('runUpdate', (e)=>{
                // Batched, run-scoped incremental update. The server coalesces
                // many per-job/per-sample changes for the SELECTED run into one
                // frame on a timer, so the socket never floods and the viewer's
                // run keeps rendering. Ignore frames for any other run.
                if (!e || e.run !== $this.selectedRun) return
                const jobs = Array.isArray(e.jobs) ? e.jobs : []
                const samples = Array.isArray(e.samples) ? e.samples : []

                // 1) merge job/queue + per-job status changes into the queue list
                for (const j of jobs){
                  const sample = j.samplename
                  if (!sample) continue
                  if (!$this.queueList[sample]){
                    $this.$set($this.queueList, sample, [])
                  }
                  const idx = (j.index != null) ? j.index : $this.queueList[sample].length
                  const merged = {
                    ...($this.queueList[sample][idx] || {}),
                    ...(j.job || {})
                  }
                  if (j.status) merged.status = j.status
                  if (j.config){ for (const k in j.config) merged[k] = j.config[k] }
                  if (!merged.status){
                    merged.status = {
                      running: false, waiting: true, success: null,
                      historical: false, error: null, logs: []
                    }
                  }
                  $this.$set($this.queueList[sample], idx, merged)
                  $this.addSample(sample, merged, 'server', true)
                }

                // 2) sample-level report text + aggregate status (prioritises the
                //    visualisation: render the latest full.report per sample).
                const explicitStatus = new Set()
                for (const s of samples){
                  const sample = s.samplename
                  if (!sample) continue
                  $this.addSample(sample, {}, 'server', true)
                  if (s.status){
                    $this.updateSampleStatus(sample, s.status)
                    explicitStatus.add(sample)
                  }
                  if (s.data && typeof s.data === 'string' && s.data !== ''){
                    $this.scheduleServerImport(s.data, sample, true)
                  }
                }

                // 3) recompute rollup status for job-touched samples that didn't
                //    get an explicit sample status in this frame.
                const touched = new Set(jobs.map(j=>j.samplename).filter(Boolean))
                for (const sample of touched){
                  if (!explicitStatus.has(sample)) $this.updateSampleStatus(sample)
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
                  $this.scheduleServerImport(e.data, e.samplename)
                }
              })

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
            data = $this.rollupSubspecies(data)
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
                const intervalTime = 4000

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
            
            // if (this.socket.readyState !== this.socket.OPEN) {
            //     try {
                    
            //         await this.waitForOpenConnection()
            //     } catch (err) { console.error(err) }
            // }
            if (!this.socket || !this.socket.connected) {
                console.warn('Offline mode: ignoring message', message);
                return;
            }
            this.socket.emit(message.type, message);
        },
        rankLabel(code) {
          if (/^S\d+$/.test(String(code || ''))) return `Subspecies (${code})`
          const labels = {
            U: 'Unclassified', R: 'Root', R1: 'Root 1',
            D: 'Domain', D1: 'Subdomain', K: 'Kingdom',
            P: 'Phylum', C: 'Class', O: 'Order',
            F: 'Family', F1: 'Subfamily', F2: 'Tribe',
            G: 'Genus', G1: 'Subgenus', S: 'Species'
          }
          return labels[code] || code
        },
        sortRankCodes(codes) {
          const baseOrder = ['U', 'R', 'R1', 'D', 'D1', 'K', 'P', 'C', 'O', 'F', 'F1', 'F2', 'G', 'G1', 'S']
          const uniq = Array.from(new Set((codes || []).filter(Boolean)))
          return uniq.sort((a, b) => {
            const as = /^S\d+$/.test(a)
            const bs = /^S\d+$/.test(b)
            if (as && bs) return Number(a.slice(1)) - Number(b.slice(1))
            if (as) return 1
            if (bs) return -1
            const ia = baseOrder.indexOf(a)
            const ib = baseOrder.indexOf(b)
            if (ia > -1 && ib > -1) return ia - ib
            if (ia > -1) return -1
            if (ib > -1) return 1
            return String(a).localeCompare(String(b))
          })
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
        
        rollupSubspecies(data) {
          // Keep all subspecies depths (S1, S2, S3, ...) as distinct ranks.
          return data
        },

        filterData(d){
          let data = _.cloneDeep(d)
          data = data.filter((f)=>{
            if (f.taxid == -1) return true
            const rankOk = this.defaults.indexOf(f.rank_code) > -1
            return rankOk && f.depth <= this.depthRange[1] && f.depth >= this.depthRange[0] && this.minPercent <= f.value/100
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
        addSample(sample, config, origin, skipStatus){
          // origin: where this sample came from — 'server' (live, backend-watched
          // local directories), 'upload' (a K2 report the user dropped/selected),
          // or 'demo' (canned offline sample data).
          origin = origin || 'server'
          // check if object with sample attribute equals the sample , get index
          let indx = this.selectedsamplesAll.findIndex(x => x.sample === sample );
          // check if thisqueueList has sample if not then add it

          // skipStatus: set during bulk run hydration. The single runInformation
          // packet already carries each sample's queue + status, so we must NOT
          // round-trip a getStatus here — doing it once per sample is exactly the
          // per-job 'status' storm that made large runs take minutes to load.
          if (!skipStatus){
            this.sendMessage({
              type: "getStatus",
              sample: sample,
              run: this.selectedRun,
              "message" : `Get Queue and Status/Info for ${sample} `
            });
          }
          if (indx == -1){
            let s = {
              sample: sample,
              hidden: false,
              data: null,
              status: {},
              origin: origin,
            }
            this.selectedsamplesAll.push(s)
            indx = this.selectedsamplesAll.length-1
          } else if (origin && !this.selectedsamplesAll[indx].origin){
            this.$set(this.selectedsamplesAll[indx], 'origin', origin)
          }
          this.selectedsamplesAll[indx].config = config ? config : {}
          return

        },
        // Load the canned demo reports so the frontend-only (GitHub Pages) build
        // has something to visualize without a backend.
        async loadDemoData(){
          for (const s of demoSamples){
            try {
              await this.importData(s.report, s.sample, 'demo')
              // seed Florida-coast coordinates so the Map tab is populated
              if (s.lat != null && s.lon != null) {
                this.setSampleMeta({ sample: s.sample, lat: s.lat, lon: s.lon })
              }
            } catch (err){
              console.error('Failed to load demo sample', s.sample, err)
            }
          }
          this.demoLoaded = true
        },
        // Remove only the locally-loaded reports (demo + uploaded), leaving any
        // live server-watched samples untouched.
        clearUploadedData(){
          const keep = this.selectedsamplesAll.filter((s) => (s.origin || 'server') === 'server')
          this.selectedsamplesAll = keep
          this.demoLoaded = false
        },
        // Coalesce server-pushed report renders. Stores only the most recent
        // report per sample and flushes on a trailing timer, so a burst of
        // sampledata frames (e.g. while 400 fastqs classify) results in a bounded
        // number of heavy importData() renders rather than one per frame.
        scheduleServerImport(information, sample, skipStatus){
          if (!information || typeof information !== 'string') return
          if (!this._pendingImports) this._pendingImports = {}
          // keep the latest report per sample, plus whether this render is part
          // of a bulk run hydrate (skipStatus) so importData doesn't re-trigger
          // a getStatus round-trip per sample.
          this._pendingImports[sample] = { data: information, skipStatus: !!skipStatus }
          if (this._importFlushTimer) return
          this._importFlushTimer = setTimeout(async () => {
            this._importFlushTimer = null
            const batch = this._pendingImports || {}
            this._pendingImports = {}
            for (const s of Object.keys(batch)) {
              try {
                await this.importData(batch[s].data, s, 'server', batch[s].skipStatus)
              } catch (err) {
                console.error(err)
              }
            }
          }, 400)
        },
        async importData(information, sample, origin, skipStatus){
          if (!information || typeof information !== 'string') {
            console.warn('importData: no text provided');
            return;
          }
          // default uploads when no explicit origin is supplied (drag/drop, file picker)
          origin = origin || 'upload'
          this.addSample(sample, null, origin, skipStatus);
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

          let data = text !== "" ? d3.tsvParseRows(text, (d)=> {
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
            const fullData = _.cloneDeep(data)
            Object.keys(uniques).forEach((f)=>{
              const code = f
              if (this.defaultsList.indexOf(code)==-1){
                this.defaultsList.push(code)
              }
            })
            this.defaultsList = this.sortRankCodes(this.defaultsList)
            this.defaults = this.defaultsList.slice()
            data = this.filterData(_.cloneDeep(fullData))
            data = this.parseData(data)
            data = this.rollupSubspecies(data)
            let index = this.selectedsamplesAll.findIndex(x => x.sample === sample );
            if (index > -1){
              this.$set(this.selectedsamplesAll[index], 'fullData', fullData)
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
.mtx-tabnav {
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 14px;
  flex: 0 0 auto;
}
.mtx-tabnav .v-tab {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
  font-size: 13.5px;
}
/* ---- left panel overhaul ---- */
.mtx-drawer {
  background: #f7fafc !important;
}
.mtx-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 16px;
  margin: 4px 8px 10px;
  border-radius: 12px;
  background: linear-gradient(120deg, #274766, #325b80);
  box-shadow: 0 6px 18px -10px rgba(39,71,102,.8);
}
.mtx-drawer-heading { display: flex; align-items: center; }
.mtx-drawer-title {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: #ffffff;
}
.mtx-drawer-scroll {
  padding: 0 10px 24px;
  overflow-y: auto;
  height: calc(100vh - 120px);
}
.mtx-sec {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 10px 12px 4px;
  margin-bottom: 12px;
  box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 10px 26px -20px rgba(16,24,40,.35);
}
.mtx-sec-head {
  display: flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: #5b6573;
  margin-bottom: 6px;
}
.mtx-sec-body { padding-top: 2px; }

/* ---- modern Display-filters ---- */
.mtx-filters { display: flex; flex-direction: column; gap: 16px; padding-top: 6px; }
.mtx-filter-block {
  background: linear-gradient(180deg, #f9fcff 0%, #f1f7fc 100%);
  border: 1px solid #e1ebf4;
  border-radius: 12px;
  padding: 10px 12px 4px;
}
.mtx-filter-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.mtx-filter-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #5b7a90; }
.mtx-filter-chip {
  font-size: 11px; font-weight: 700; color: #0e3f6a; background: #dfeefb;
  border-radius: 999px; padding: 2px 10px; font-variant-numeric: tabular-nums;
}
.mtx-slider.v-input { margin-top: 2px; padding-top: 0; }
.mtx-slider .v-slider { margin: 0; }
.mtx-slider .v-slider__track-container { height: 5px; border-radius: 999px; }
.mtx-slider .v-slider__track-background,
.mtx-slider .v-slider__track-fill { border-radius: 999px; }
.mtx-slider .v-slider__thumb { width: 14px; height: 14px; box-shadow: 0 1px 4px rgba(14,63,106,.4); }
.mtx-slider .v-slider__thumb:before { opacity: 0; }
.mtx-filter-num .v-input__slot {
  min-height: 34px !important;
  border-radius: 9px !important;
  background: #fff !important;
  border: 1px solid #d3e0ec !important;
  box-shadow: 0 1px 2px rgba(20,56,84,.05) !important;
  padding: 0 8px !important;
}
.mtx-filter-num .v-input__slot:before,
.mtx-filter-num .v-input__slot:after { display: none !important; }
.mtx-filter-num input { font-size: 12px; color: #274766; text-align: center; font-variant-numeric: tabular-nums; }
.mtx-filter-num.v-input--is-focused .v-input__slot {
  border-color: #1e6b97 !important; box-shadow: 0 0 0 3px rgba(30,107,151,.15) !important;
}
.mtx-filters .v-select .v-input__slot {
  border-radius: 10px !important;
  min-height: 42px !important;
  border: 1px solid #d3e0ec !important;
  box-shadow: 0 1px 2px rgba(20,56,84,.06) !important;
}
.mtx-filters .v-select .v-input__slot:before,
.mtx-filters .v-select .v-input__slot:after { display: none !important; }
.mtx-filters .v-select.v-input--is-focused .v-input__slot {
  border-color: #1e6b97 !important; box-shadow: 0 0 0 3px rgba(30,107,151,.15) !important;
}

.mtx-row-end { display: flex; align-items: flex-start; gap: 4px; }
.mtx-run-actions { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.mtx-drawer-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 10px;
  height: 100%;
  cursor: ew-resize;
  z-index: 30;
  background: transparent;
}
.mtx-drawer-resizer::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 2px;
  transform: translateY(-50%);
  width: 2px;
  height: 34px;
  border-radius: 2px;
  background: #8aa2b8;
  opacity: .85;
}
.mtx-drawer-resizer:hover {
  background: rgba(39, 71, 102, .12);
}
.mtx-drawer .v-navigation-drawer__border {
  width: 6px !important;
  background: #cdd9e5;
  cursor: ew-resize;
  transition: background .15s ease;
}
.mtx-drawer .v-navigation-drawer__border::after {
  content: "";
  position: absolute;
  top: 50%; left: 50%;
  width: 2px; height: 28px;
  transform: translate(-50%, -50%);
  background: #8aa2b8;
  border-radius: 2px;
}
.mtx-drawer .v-navigation-drawer__border:hover {
  background: #274766;
}
.v-main{
  padding-bottom: 0px !important;
}
/* --- Server status dot --- */
.mtx-status-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin: 0 6px;
  flex-shrink: 0;
  transition: background .3s;
}
.mtx-status-dot.connected {
  background: #22c55e;
  animation: mtx-pulse-green 2.2s ease infinite;
}
.mtx-status-dot.connecting {
  background: #f59e0b;
  animation: mtx-pulse-yellow 1s ease infinite;
}
.mtx-status-dot.offline {
  background: #ef4444;
  animation: mtx-pulse-red 2.2s ease infinite;
}
@keyframes mtx-pulse-green {
  0%   { box-shadow: 0 0 0 0 rgba(34,197,94,.55); }
  70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
@keyframes mtx-pulse-yellow {
  0%   { box-shadow: 0 0 0 0 rgba(245,158,11,.6); }
  50%  { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
  100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
}
@keyframes mtx-pulse-red {
  0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.55); }
  70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
  100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}

/* --- Settings dialog --- */
.mtx-settings-card { font-family: Inter, system-ui, sans-serif; }
.mtx-settings-title {
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #1f2937;
  padding: 14px 16px !important;
}
.mtx-settings-body { padding: 16px 20px !important; }
.mtx-set-section { margin-bottom: 4px; }
.mtx-set-head {
  display: flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #5b6573;
  margin-bottom: 10px;
  gap: 4px;
}
.mtx-set-status-chip {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
}
.mtx-set-status-chip.connected  { background: #dcfce7; color: #15803d; }
.mtx-set-status-chip.connecting { background: #fef3c7; color: #b45309; }
.mtx-set-status-chip.offline    { background: #fee2e2; color: #b91c1c; }
.mtx-set-url-preview {
  font-size: 12px;
  color: #64748b;
  margin-top: 8px;
}
.mtx-set-url-preview code {
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.mtx-set-path {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  word-break: break-all;
}
.mtx-set-db-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 12.5px;
}
.mtx-set-db-key { font-weight: 700; color: #1e3a5f; min-width: 90px; }
.mtx-set-db-path { color: #64748b; word-break: break-all; font-size: 11.5px; }
.mtx-set-empty { font-size: 12px; color: #94a3b8; font-style: italic; }
.mtx-set-config-preview { margin-top: 10px; }
.mtx-set-config-label { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.mtx-set-config-preview code {
  font-size: 11px;
  color: #475569;
  background: #f8fafc;
  padding: 4px 8px;
  border-radius: 6px;
  display: block;
  word-break: break-all;
}

/* --- Frontend-only / offline banner --- */
.mtx-offline-banner {
  display: flex;
  align-items: center;
  text-align: left;
  margin: 6px 18px 10px;
  padding: 10px 16px;
  border-radius: 12px;
  background: linear-gradient(120deg, #fff8ed, #fef3c7);
  border: 1px solid #fcd9a0;
  box-shadow: 0 6px 18px -14px rgba(180, 83, 9, 0.5);
}
.mtx-offline-text { line-height: 1.35; }
.mtx-offline-title {
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
}
.mtx-offline-sub {
  font-size: 11.5px;
  color: #a16207;
  max-width: 720px;
}

/* --- Database offline note --- */
.mtx-db-offline-note {
  display: flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 600;
  color: #92400e;
  background: linear-gradient(120deg, #fff8ed, #fef3c7);
  border: 1px solid #fcd9a0;
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 4px;
}

/* --- sample source legend (left panel) --- */
.mtx-source-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 2px 8px;
}
.mtx-src-chip {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 9px;
  letter-spacing: .02em;
  font-variant-numeric: tabular-nums;
}
.mtx-src-server { background: #e0f2fe; color: #075985; }
.mtx-src-upload { background: #ede9fe; color: #5b21b6; }
.mtx-src-demo   { background: #dcfce7; color: #166534; }
.mtx-src-clear {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  font-weight: 700;
  color: #b91c1c;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 999px;
  padding: 2px 9px;
  cursor: pointer;
  transition: background .15s ease;
}
.mtx-src-clear:hover { background: #fecaca; }

/* ===== Fixed-header / per-tab scrolling ===== */
/* Prevent the whole page from scrolling; scroll happens inside the tab pane */
.v-main {
  max-height: 100vh;
  overflow: hidden;
}
.v-main__wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* The row + col that wraps tabs must fill remaining height */
.mtx-main-row {
  flex: 1 1 0 !important;
  min-height: 0 !important;
  overflow: hidden;
}
.mtx-main-col {
  display: flex !important;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
/* The tab-items pane is the only thing that scrolls */
.mtx-tab-scroll {
  flex: 1 1 0;
  overflow-y: auto;
  min-height: 0;
}
</style>