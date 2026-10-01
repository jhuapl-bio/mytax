<template>
  <v-app  style="padding-bottom: 0px;">
      <v-app-bar
        app
        dark absolute
        dense flat
        class="mtx-appbar"
      >
        
        <v-tooltip bottom>
          <template v-slot:activator="{ on }">
            <v-btn icon v-on="on" @click="toggleDrawer" class="mr-2">
              <v-icon>{{ navigation.collapsed ? 'mdi-menu' : 'mdi-backburger' }}</v-icon>
            </v-btn>
          </template>
          {{ navigation.collapsed ? 'Expand samples panel' : 'Collapse samples panel' }}
        </v-tooltip>
        <!-- ===== brand ===== -->
        <div class="mtx-brand">
          <div class="mtx-brand-name">Mytax<span class="mtx-brand-ver">2</span></div>
          <div class="mtx-brand-sub">Real-time nanopore taxonomic reporting</div>
        </div>

        <!-- ===== current run context ===== -->
        <div class="mtx-bar-context" v-if="isOnline || selectedsamplesAll.length">
          <template v-if="selectedRun">
            <v-icon x-small class="mr-1">mdi-flask-outline</v-icon>
            <span class="mtx-bar-run" :title="selectedRun">{{ selectedRun }}</span>
            <span class="mtx-bar-sep">·</span>
            <span>{{ selectedsamplesAll.length }} sample{{ selectedsamplesAll.length === 1 ? '' : 's' }}</span>
            <template v-if="queueLength > 0">
              <span class="mtx-bar-sep">·</span>
              <span class="mtx-bar-busy"><span class="mtx-bar-pulse"></span>{{ queueLength }} in queue</span>
            </template>
          </template>
          <span v-else-if="!selectedsamplesAll.length" class="mtx-bar-muted">No data loaded</span>
        </div>
        <v-spacer></v-spacer>

        <!-- ===== compute device (basecalling / demultiplexing) =====
             Replaces the old "Enable GPU" checkbox, which only stored a
             preference nothing read. This shows what dorado/guppy will actually
             use and opens the tools panel to change it. -->
        <v-tooltip bottom max-width="320" v-if="isOnline">
          <template v-slot:activator="{ on }">
            <button class="mtx-bar-chip" :class="deviceChip.cls" v-on="on" @click="openTools">
              <v-icon x-small class="mr-1">{{ deviceChip.icon }}</v-icon>{{ deviceChip.text }}
            </button>
          </template>
          <span>{{ deviceChip.tip }}</span>
        </v-tooltip>

        <!-- ===== Backend dependency lights ===== -->
        <!-- A compact cluster of pulsing lights, one per backend tool. Green =
             present, red (pulsing) = required-but-missing, amber (pulsing) =
             installing. Hover any light for its status / why it isn't present.
             The whole cluster opens the Backend dependencies manager. -->
        <div class="mtx-health-cluster" @click="openHealth" title="Backend dependencies">
          <v-tooltip bottom v-for="dep in healthLights" :key="dep.key">
            <template v-slot:activator="{ on }">
              <span
                class="mtx-health-light"
                :class="dep.cls"
                v-on="on"
              ></span>
            </template>
            <div class="mtx-health-tip">
              <strong>{{ dep.label }}</strong>
              <span class="mtx-health-tip-state" :class="dep.cls">{{ dep.stateText }}</span>
              <div class="mtx-health-tip-reason">{{ dep.reason }}</div>
            </div>
          </v-tooltip>
          <v-tooltip bottom>
            <template v-slot:activator="{ on }">
              <v-btn icon small v-on="on" class="mtx-health-btn" @click.stop="openHealth">
                <v-icon small :color="healthIconColor">{{ healthIcon }}</v-icon>
              </v-btn>
            </template>
            <span>{{ healthSummary }}</span>
          </v-tooltip>
        </div>

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

        <!-- ===== JHU/APL credit ===== -->
        <a class="mtx-apl" href="https://www.jhuapl.edu" target="_blank" rel="noopener"
          title="Developed at the Johns Hopkins University Applied Physics Laboratory">
          <span class="mtx-apl-clip"><img :src="require('@/assets/img/apl_horizontal_white-web.png')" alt="Johns Hopkins Applied Physics Laboratory" /></span>
        </a>

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
              <div v-if="databases && databases.length" class="mtx-set-dblist">
                <DatabaseCard
                  v-for="db in databases" :key="db.key"
                  dense :db="db" :online="isOnline" :show-description="false"
                  @download="downloaddb"
                  @cancel="canceldownload"
                  @open="openDatabasePath"
                  @delete="confirmDeleteDatabase"
                />
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

      <!-- Confirm before deleting a reference database. Kept as a sibling of the
           settings dialog (not nested inside it) so the overlay stacks cleanly. -->
      <v-dialog v-model="dbDeleteDialog" max-width="460" persistent>
        <v-card>
          <v-card-title class="text-subtitle-1">
            <v-icon color="red darken-1" class="mr-2">mdi-alert-outline</v-icon>
            Delete database?
          </v-card-title>
          <v-card-text>
            <p class="mb-2">
              This permanently removes
              <strong>{{ dbPendingDelete ? dbPendingDelete.key : '' }}</strong>
              from disk. You'll have to re-download it before you can classify with it again.
            </p>
            <code class="mtx-set-db-path">{{ dbPendingDelete ? dbLocalPath(dbPendingDelete) : '' }}</code>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text small @click="cancelDeleteDatabase()">Cancel</v-btn>
            <v-btn color="red darken-1" dark small @click="deleteDatabase()">Delete</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- ===== Backend dependencies manager ===== -->
      <v-dialog v-model="healthDialog" max-width="760" scrollable>
        <v-card class="mtx-health-card">
          <v-card-title class="mtx-health-titlebar">
            <v-icon class="mr-2" :color="healthIconColor">mdi-server-network</v-icon>
            Backend dependencies
            <span class="mtx-health-overall" :class="health.ok ? 'ok' : 'bad'">
              {{ health.ok ? 'All set' : 'Action needed' }}
            </span>
            <v-spacer></v-spacer>
            <v-btn icon @click="requestHealth" title="Re-check"><v-icon>mdi-refresh</v-icon></v-btn>
            <v-btn icon @click="healthDialog = false"><v-icon>mdi-close</v-icon></v-btn>
          </v-card-title>

          <v-divider></v-divider>

          <v-card-text class="mtx-health-body" ref="healthBody">

            <!-- Basecalling & demultiplexing tools + compute device -->
            <div class="mtx-tools-sec" ref="toolsSection">
              <div class="mtx-tools-head">
                <v-icon small class="mr-1">mdi-dna</v-icon>Basecalling &amp; demultiplexing
              </div>
              <ToolsPanel :status="toolsStatus" :online="isOnline" @send="sendMessage" />
            </div>
            <div class="mtx-tools-head mt-4">
              <v-icon small class="mr-1">mdi-package-variant-closed</v-icon>Classification tools
            </div>

            <!-- Offline note -->
            <div v-if="!isOnline" class="mtx-health-offline">
              <v-icon small class="mr-1" color="#b45309">mdi-cloud-off-outline</v-icon>
              Not connected to the backend — dependency status and installs need a live server connection.
            </div>

            <!-- Environment row: OS + conda -->
            <div class="mtx-health-env">
              <div class="mtx-env-chip">
                <v-icon x-small class="mr-1">mdi-laptop</v-icon>
                <span class="mtx-env-label">OS</span>
                <span class="mtx-env-val">{{ osLabel }}</span>
              </div>
              <div class="mtx-env-chip" :class="health.conda && health.conda.present ? 'good' : 'warn'">
                <v-icon x-small class="mr-1">{{ health.conda && health.conda.present ? 'mdi-check-decagram' : 'mdi-alert-decagram-outline' }}</v-icon>
                <span class="mtx-env-label">{{ (health.conda && health.conda.mamba) ? 'mamba' : 'conda' }}</span>
                <span class="mtx-env-val" v-if="health.conda && health.conda.present">
                  {{ health.conda.version || 'available' }}
                </span>
                <span class="mtx-env-val" v-else>not found</span>
              </div>
              <div class="mtx-env-chip" v-if="health.conda && health.conda.env">
                <v-icon x-small class="mr-1">mdi-cube-outline</v-icon>
                <span class="mtx-env-label">env</span>
                <span class="mtx-env-val">{{ shortEnv(health.conda.env) }}</span>
              </div>
            </div>
            <div class="mtx-health-conda-note" v-if="health.conda && !health.conda.present">
              <v-icon x-small class="mr-1" color="#b45309">mdi-information-outline</v-icon>
              conda/mamba isn't on the server's PATH, so one-click installs are disabled.
              Install <a href="https://docs.conda.io/en/latest/miniconda.html" target="_blank" rel="noopener">Miniconda</a>,
              restart the server, then re-check.
            </div>

            <!-- Dependency cards -->
            <div class="mtx-dep-list">
              <div
                v-for="dep in health.dependencies"
                :key="dep.key"
                class="mtx-dep-card"
                :class="depCardClass(dep)"
              >
                <div class="mtx-dep-main">
                  <span class="mtx-dep-light" :class="depLightClass(dep)"></span>
                  <div class="mtx-dep-text">
                    <div class="mtx-dep-name">
                      {{ dep.label }}
                      <span class="mtx-dep-tag" v-if="dep.required">required</span>
                      <span class="mtx-dep-tag optional" v-else>optional</span>
                    </div>
                    <div class="mtx-dep-desc">{{ dep.description }}</div>
                    <div class="mtx-dep-meta" v-if="dep.present">
                      <v-icon x-small class="mr-1" color="#15803d">mdi-check</v-icon>
                      <span v-if="dep.version">{{ dep.version }}</span>
                      <span v-else>installed</span>
                      <code class="mtx-dep-path" v-if="dep.path">{{ dep.path }}</code>
                    </div>
                    <div class="mtx-dep-meta missing" v-else>
                      <v-icon x-small class="mr-1" color="#b91c1c">mdi-close</v-icon>
                      Not detected on the server's PATH
                    </div>
                  </div>
                  <div class="mtx-dep-actions">
                    <v-btn
                      v-if="!dep.present && dep.installable"
                      small depressed
                      class="mtx-dep-install"
                      :loading="installing === dep.key"
                      :disabled="!isOnline || !!installing || !(health.conda && health.conda.present)"
                      @click="installTool(dep.key)"
                    >
                      <v-icon x-small left>mdi-download</v-icon>
                      Install
                    </v-btn>
                    <v-chip v-else-if="dep.present" x-small color="#dcfce7" text-color="#15803d" class="mtx-dep-ok">
                      ready
                    </v-chip>
                    <v-tooltip bottom v-if="!dep.installable && !dep.present">
                      <template v-slot:activator="{ on }">
                        <v-btn icon small v-on="on" :href="dep.docs" target="_blank" rel="noopener">
                          <v-icon small>mdi-open-in-new</v-icon>
                        </v-btn>
                      </template>
                      Manual install instructions
                    </v-tooltip>
                  </div>
                </div>

                <!-- Manual command / docs (always available as a fallback) -->
                <div class="mtx-dep-manual" v-if="!dep.present">
                  <div class="mtx-dep-manual-head">
                    <v-icon x-small class="mr-1">mdi-console</v-icon>
                    Install manually
                    <a class="mtx-dep-docs" :href="dep.docs" target="_blank" rel="noopener">docs ↗</a>
                  </div>
                  <div class="mtx-dep-manual-cmd">
                    <code>{{ dep.manual }}</code>
                    <v-btn icon x-small @click="copyText(dep.manual)" title="Copy">
                      <v-icon x-small>mdi-content-copy</v-icon>
                    </v-btn>
                  </div>
                </div>

                <!-- Live install log for this dependency -->
                <div class="mtx-dep-log" v-if="installLogs[dep.key]">
                  <div class="mtx-dep-log-head">
                    <v-icon x-small class="mr-1">mdi-text-box-outline</v-icon>
                    Install log
                    <v-spacer></v-spacer>
                    <v-progress-circular
                      v-if="installing === dep.key"
                      indeterminate size="12" width="2" color="#38bdf8" class="mr-1"
                    ></v-progress-circular>
                    <span v-if="installing === dep.key" class="mtx-dep-log-running">running…</span>
                    <v-btn icon x-small @click="clearLog(dep.key)" title="Clear"><v-icon x-small>mdi-close</v-icon></v-btn>
                  </div>
                  <pre class="mtx-dep-console" :ref="'log_' + dep.key">{{ installLogs[dep.key] }}</pre>
                </div>
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

            <!-- ===== Run ===== -->
            <section class="mtx-sec" :class="{ 'mtx-sec--closed': !secOpen.run }">
              <button class="mtx-sec-head" @click="toggleSec('run')" :aria-expanded="secOpen.run ? 'true' : 'false'">
                <v-icon x-small class="mr-1">mdi-flask-outline</v-icon>
                <span>Run</span>
                <span class="mtx-sec-peek" v-if="!secOpen.run && selectedRun">{{ selectedRun }}</span>
                <v-spacer></v-spacer>
                <v-icon small class="mtx-sec-caret">{{ secOpen.run ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
              </button>
              <div class="mtx-sec-body" v-show="secOpen.run">
                <!-- Run selector with a per-run status wheel.
                     Classification is global across runs (one round-robin
                     scheduler), so work can be in flight on a run you aren't
                     looking at. Each row carries its own wheel: spinning =
                     jobs running for THAT run, determinate ring = share of
                     that run's jobs finished, and the collapsed selection
                     shows the wheel for the currently selected run. -->
                <v-select
                  v-if="isOnline && runs && runs.length > 0"
                  :items="runs"
                  v-model="selectedRun"
                  label="Run"
                  :hint="runSelectHint"
                  dense outlined
                  persistent-hint
                  class="flex mtx-run-select"
                >
                  <template v-slot:selection="{ item }">
                    <span class="mtx-run-sel">
                      <RunStatusWheel :status="runStatus(item)" :size="18" />
                      <span class="mtx-run-sel-name">{{ item }}</span>
                    </span>
                  </template>
                  <template v-slot:item="{ item, on, attrs }">
                    <v-list-item v-bind="attrs" v-on="on" class="mtx-run-option">
                      <v-list-item-content>
                        <v-list-item-title class="mtx-run-option-title">
                          <RunStatusWheel :status="runStatus(item)" :size="16" />
                          <span class="mtx-run-option-name">{{ item }}</span>
                          <span
                            v-if="runStatus(item).running > 0"
                            class="mtx-run-pill mtx-run-pill-run"
                          >{{ runStatus(item).running }} running</span>
                          <span
                            v-else-if="runStatus(item).pending > 0"
                            class="mtx-run-pill mtx-run-pill-queued"
                          >{{ runStatus(item).pending }} queued</span>
                        </v-list-item-title>
                        <v-list-item-subtitle class="mtx-run-option-sub">
                          {{ runStatusLabel(item) }}
                        </v-list-item-subtitle>
                      </v-list-item-content>
                    </v-list-item>
                  </template>
                </v-select>
                <div v-else-if="isOnline" class="mtx-empty-note">
                  <v-icon small class="mr-1">mdi-information-outline</v-icon>
                  No runs yet — create one to start adding samples.
                </div>
                <div class="mtx-run-actions" v-if="isOnline">
                  <AddRun
                    ref="addRun"
                    @sendMessage="sendMessage"
                    @runAdded="onRunAdded"
                    :selectedRun="selectedRun"
                    :samples="selectedsamplesAll"
                    :pathOptions="pathOptions"
                    :reportSavePath="reportSavePath"
                  />
                  <v-spacer></v-spacer>
                  <v-btn x-small icon @click="sendMessage({type: 'openPath' })"
                    title="Open the data folder (databases, reports) on the server">
                    <v-icon small>mdi-folder-home-outline</v-icon>
                  </v-btn>
                </div>
              </div>
            </section>

            <!-- ===== Samples ===== -->
            <section class="mtx-sec" :class="{ 'mtx-sec--closed': !secOpen.samples }">
              <button class="mtx-sec-head" @click="toggleSec('samples')" :aria-expanded="secOpen.samples ? 'true' : 'false'">
                <v-icon x-small class="mr-1">mdi-test-tube</v-icon>
                <span>Samples</span>
                <span class="mtx-sec-count" v-if="selectedsamplesAll.length">{{ selectedsamplesAll.length }}</span>
                <v-spacer></v-spacer>
                <!-- Source tally: live server-watched vs local uploads -->
                <span class="mtx-src-mini" v-if="sampleSourceCounts.upload || sampleSourceCounts.demo" @click.stop>
                  <span class="mtx-src-chip mtx-src-server" title="Samples watched/classified by the server">
                    <v-icon x-small class="mr-1">mdi-server-network</v-icon>{{ sampleSourceCounts.server }}
                  </span>
                  <span class="mtx-src-chip mtx-src-upload" v-if="sampleSourceCounts.upload" title="Kraken2 reports you uploaded">
                    <v-icon x-small class="mr-1">mdi-tray-arrow-up</v-icon>{{ sampleSourceCounts.upload }}
                  </span>
                  <span class="mtx-src-chip mtx-src-demo" v-if="sampleSourceCounts.demo" title="Demo samples">
                    <v-icon x-small class="mr-1">mdi-flask-outline</v-icon>{{ sampleSourceCounts.demo }}
                  </span>
                  <button class="mtx-src-clear" v-if="hasUploads" @click="clearUploadedData"
                    title="Remove uploaded & demo reports (keeps live server samples)">
                    <v-icon x-small>mdi-broom</v-icon>
                  </button>
                </span>
                <v-icon small class="mtx-sec-caret">{{ secOpen.samples ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
              </button>
              <div class="mtx-sec-body" v-show="secOpen.samples">
                <v-alert class="py-1 my-0 mb-2 mtx-norun" dense text type="info" v-if="isOnline && !selectedRun">
                  No run selected. Create one in the Run section first.
                </v-alert>
          <Samplesheet
        ref="samplesheet"
        :samplesheet="samplesheet"
        :queueLength="queueLength"
        :queueList="queueList"
        :queueBoard="queueBoard"
        :queueBoardAll="queueBoardAll"
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
        :pathOptionsRef="pathOptionsRef"
        :browsePathResult="browsePathResult"
        :sampleMeta="sampleMeta"
        :autodetectR2Result="autodetectR2Result"
        :pairWatches="pairWatches"
        :tools="toolsStatus"
        :preprocess="preprocess"
        @openTools="openTools"
        @stopPairWatch="stopPairWatch"
        @updateSampleStatus="updateSampleStatus"
        @sendMessage="sendMessage"
        @updateData="updateData"
        @updateEntry="updateEntry"
        @updateMeta="setSampleMeta"
        @deleteEntry="deleteEntry"
        @deleteEntries="deleteEntries"
        @barcode="barcode"
        @sampleStatus="sampleStatus"
        @rerun="rerun"
        @selectRun="(run) => { selectedRun = run }"
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
              </div>
            </section>

            <!-- ===== Databases ===== -->
            <section class="mtx-sec" :class="{ 'mtx-sec--closed': !secOpen.databases }">
              <button class="mtx-sec-head" @click="toggleSec('databases')" :aria-expanded="secOpen.databases ? 'true' : 'false'">
                <v-icon x-small class="mr-1">mdi-database</v-icon>
                <span>Reference databases</span>
                <span class="mtx-sec-peek mtx-sec-peek--dl" v-if="activeDownloads.length">
                  <v-progress-circular indeterminate size="10" width="2" color="blue darken-1" class="mr-1"></v-progress-circular>
                  {{ activeDownloads.length }} downloading
                </span>
                <v-spacer></v-spacer>
                <v-icon small class="mtx-sec-caret">{{ secOpen.databases ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
              </button>
              <div class="mtx-sec-body" v-show="secOpen.databases">
                <div v-if="!isOnline" class="mtx-db-offline-note">
                  <v-icon x-small class="mr-1" color="#b45309">mdi-cloud-off-outline</v-icon>
                  Offline — databases require a backend connection
                </div>
                <template v-else>
                  <!-- Options are grouped by the engine that consumes them
                       (kraken2 index dirs vs minimap2 FASTA refs vs support
                       resources). Every status icon explains itself on hover. -->
                  <v-select
                    v-model="database"
                    :items="groupedDatabases"
                    label="Database"
                    item-key="url"
                    item-value="key"
                    return-object
                    item-text="key"
                    dense outlined hide-details
                    :menu-props="{ maxHeight: 460 }"
                    class="mtx-db-select"
                  >
                    <template v-slot:selection="{ item }">
                      <v-icon small :color="dbStatus(item).color" class="mr-2">{{ dbStatus(item).icon }}</v-icon>
                      <span class="mtx-db-selname">{{ item.label || item.key }}</span>
                    </template>
                    <template v-slot:item="{ item, on, attrs }">
                      <v-list-item v-bind="attrs" v-on="on" class="mtx-db-option">
                        <v-list-item-icon class="mr-3 my-auto">
                          <v-tooltip left max-width="320">
                            <template v-slot:activator="{ on: tip }">
                              <v-icon v-on="tip" :color="dbStatus(item).color">{{ dbStatus(item).icon }}</v-icon>
                            </template>
                            {{ dbStatus(item).tip }}
                          </v-tooltip>
                        </v-list-item-icon>
                        <v-list-item-content>
                          <v-list-item-title class="mtx-db-option-title">{{ item.label || item.key }}</v-list-item-title>
                          <v-list-item-subtitle class="mtx-db-option-desc">
                            <b :class="'mtx-db-state mtx-db-state--' + dbStatus(item).state">{{ dbStatus(item).label }}</b>
                            · {{ item.description || item.final || item.url }}
                          </v-list-item-subtitle>
                        </v-list-item-content>
                      </v-list-item>
                    </template>
                  </v-select>

                  <DatabaseCard
                    v-if="database && database.key"
                    class="mt-2"
                    :db="database"
                    :online="isOnline"
                    @download="downloaddb"
                    @cancel="canceldownload"
                    @open="openDatabasePath"
                    @delete="confirmDeleteDatabase"
                  />

                  <!-- other databases downloading in the background -->
                  <div v-if="otherDownloads.length" class="mtx-dl-others">
                    <div class="mtx-dl-others-head">Also downloading</div>
                    <DatabaseCard
                      v-for="db in otherDownloads" :key="db.key"
                      class="mt-1" dense
                      :db="db" :online="isOnline" :show-description="false" :show-engine="false"
                      @cancel="canceldownload"
                    />
                  </div>
                  <div class="mtx-db-foot">
                    <span>{{ dbReadyCount }} of {{ dbCatalogCount }} downloaded</span>
                    <v-spacer></v-spacer>
                    <v-btn x-small text color="primary" @click="settingsDialog = true">
                      <v-icon x-small left>mdi-database-cog-outline</v-icon>Manage all
                    </v-btn>
                  </div>
                </template>
              </div>
            </section>

            <!-- ===== Display filters ===== -->
            <section class="mtx-sec" :class="{ 'mtx-sec--closed': !secOpen.filters }">
              <button class="mtx-sec-head" @click="toggleSec('filters')" :aria-expanded="secOpen.filters ? 'true' : 'false'">
                <v-icon x-small class="mr-1">mdi-tune-variant</v-icon>
                <span>Display filters</span>
                <v-spacer></v-spacer>
                <v-icon small class="mtx-sec-caret">{{ secOpen.filters ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
              </button>
              <div class="mtx-sec-body mtx-filters" v-show="secOpen.filters">

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


            <!-- Taxonomic ranks: presets + one chip per rank (was a long
                 multi-select that rendered as a wall of comma-separated text). -->
            <div class="mtx-filter-block mtx-rank-block">
              <div class="mtx-filter-row">
                <span class="mtx-filter-label">Taxonomic ranks</span>
                <span class="mtx-filter-chip">{{ ranksSelectedCount }} / {{ rankItems.length }}</span>
              </div>
              <div class="mtx-rank-presets">
                <button v-for="p in rankPresets" :key="p.key"
                  class="mtx-rank-preset" :class="{ active: rankPresetActive === p.key }"
                  :title="p.tip" @click="applyRankPreset(p)">{{ p.text }}</button>
              </div>
              <div class="mtx-rank-chips">
                <button v-for="r in rankItems" :key="r.value"
                  class="mtx-rank-chip" :class="{ on: defaults.includes(r.value) }"
                  :title="r.text + (defaults.includes(r.value) ? ' — shown (click to hide)' : ' — hidden (click to show)')"
                  @click="toggleRank(r.value)">
                  <v-icon x-small class="mr-1">{{ defaults.includes(r.value) ? 'mdi-check' : 'mdi-plus' }}</v-icon>{{ rankShort(r.value) }}
                </button>
              </div>
            </div>
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

              <!--
                LAZY TABS.

                This was a <v-tabs-items> with a <v-tab-item> per tab. Vuetify's
                window keeps every tab it has ever shown mounted, so after a user
                clicked through the app once, Explore, Heatmap, CrossSample, Map,
                Plates and the data table were ALL alive at the same time — each
                holding its own derived copy of the dataset, each with a deep
                watcher on it, and each re-rendering whenever any sample updated.

                Rendering only the active tab means exactly one chart component
                exists at a time. Switching tabs destroys the previous one and
                releases its canvases and derived state. The `key` forces a clean
                remount rather than Vue patching one chart component into another.
              -->
              <div class="mtx-tab-scroll">
                  <v-container class="my-0" v-if="activeTab">
                      <component
                          :is="activeTab.component"
                          :key="`tab-${tab}`"
                          :bundleconfig="bundleconfig"
                          :samples="selectedsamples"
                          :taxaQuery="taxaQuery"
                          :storeTick="storeTick"
                          :namesData="uniquenametypes"
                          :fullsize="fullsize"
                          :selectedsamples="selectedsamples"
                          :sampleMeta="sampleMeta"
                          :run="selectedRun"
                          :socket="socket"
                          @updateMeta="setSampleMeta"
                          @updateRunMeta="setRunMeta"
                          @visibleSamples="setVisibleSamples"
                          @focusSample="setFocusSample"
                      >
                      </component>

                  </v-container>
              </div>
              
              
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
// Imported as MapView, NOT `Map`: a binding named `Map` shadows the global
// Map constructor for this whole module, so `new Map()` (queue aggregates)
// threw "is not a constructor" and every job frame failed to apply.
import MapView from "@/components/Map"
import CrossSample from "@/components/CrossSample"
import DataTableTab from "@/components/DataTableTab"
import Metadata from "@/components/Metadata"
import AddRun from "@/components/AddRun"
import RunStatusWheel from "@/components/RunStatusWheel"
import demoSamples from "@/assets/demoData"
// The columnar taxon store and the frame protocol client. Between them they
// replace `selectedsamplesAll[i].fullData` / `.data` (two arrays of ~30k row
// objects per sample) and roughly forty independent socket.on handlers.
import taxaStore, { sortRankCodes as sortRanks } from "@/store/taxa"
import FrameClient from "@/services/frames"
import DatabaseCard from "@/components/DatabaseCard"
import ToolsPanel from "@/components/ToolsPanel"
import { dbStatus, dbOnDisk } from "@/utils/databases"
// NOTE: lodash's cloneDeep used to be used here to copy parsed report rows.
// Those copies were the bulk of this tab's memory footprint and are gone; the
// import is kept out deliberately so it doesn't creep back in.
import { io } from "socket.io-client";

const SEC_KEY = 'mtx_drawer_sections'
function loadSecOpen(){
  const def = { run: true, samples: true, databases: true, filters: true }
  try {
    const raw = localStorage.getItem(SEC_KEY)
    return raw ? { ...def, ...JSON.parse(raw) } : def
  } catch (e) { return def }
}

// Taxonomic rank presets for the Display filters.
const RANK_PRESETS = [
  { key: 'all', text: 'All', tip: 'Show every rank', codes: null },
  { key: 'major', text: 'Major ranks', tip: 'Domain, kingdom, phylum, class, order, family, genus, species (+ unclassified)', codes: ['U', 'D', 'K', 'P', 'C', 'O', 'F', 'G', 'S'] },
  { key: 'gs', text: 'Genus + species', tip: 'Only genus and species rows', codes: ['G', 'S'] },
  { key: 'species', text: 'Species', tip: 'Species and sub-species rows', codes: ['S', 'S1', 'S2', 'S3', 'S4', 'S5'] },
  { key: 'none', text: 'None', tip: 'Clear the selection', codes: [] },
]
const RANK_SHORT = {
  U: 'Unclassified', R: 'Root', R1: 'Root 1', D: 'Domain', D1: 'Subdomain', K: 'Kingdom',
  P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', F1: 'Subfamily', F2: 'Tribe',
  G: 'Genus', G1: 'Subgenus', S: 'Species'
}

// Charts redraw at most this often while taxa are streaming in (see storeTick).
const STORE_TICK_MIN_MS = 500

// Shallow equality for arrays of strings; used to keep computed arrays
// referentially stable when their contents did not change.
function sameStrings(a, b){
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
// Return the previously returned array for (vm, slot) if `next` has the same
// contents, else remember and return `next`. Kept outside the component so the
// computed properties that use it stay free of instance side effects.
const _stableMemo = new WeakMap()
function stableStrings(vm, slot, next){
  let m = _stableMemo.get(vm)
  if (!m) { m = {}; _stableMemo.set(vm, m) }
  if (sameStrings(m[slot], next)) return m[slot]
  m[slot] = next
  return next
}

export default {
    name: 'App',
    components: {
      Plates,
      Samplesheet,
      AddRun,
      Heatmap,
      Explore,
      Map: MapView,   // registered as "Map" -- the tab list refers to it by that name
      CrossSample,
      DataTableTab,
      Metadata,
      RunStatusWheel,
      DatabaseCard,
      ToolsPanel,
    },
    beforeDestroy(){ 
      if (this._tickTimer){ clearTimeout(this._tickTimer); this._tickTimer = null }
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
      // ---- per-run scheduler activity (drives the run dropdown wheel) -------
      // The classification queue is GLOBAL: one round-robin scheduler serves
      // every run. queueBoardAll is the counts-only summary broadcast to every
      // client (unlike queueBoard, which is scoped to the run you're viewing),
      // so this is the only place the UI can learn that, say, Run B is busy
      // while you're looking at Run A.
      runActivityMap() {
        const map = {}
        const rows = (this.queueBoardAll && this.queueBoardAll.runs) || []
        rows.forEach((r) => {
          if (!r || !r.run) return
          map[r.run] = {
            running: r.active || 0,
            pending: r.pending || 0,
            done: r.done || 0,
            failed: r.failed || 0,
            total: r.total || 0,
            percent: r.percent || 0
          }
        })
        return map
      },
      // Runs OTHER than the selected one that currently have work in flight or
      // waiting — surfaced in the select's hint so activity elsewhere is
      // noticeable without opening the menu.
      busyOtherRuns() {
        const map = this.runActivityMap
        return Object.keys(map).filter((run) => {
          if (run === this.selectedRun) return false
          const s = map[run]
          return (s.running > 0 || s.pending > 0)
        })
      },
      runSelectHint() {
        const mine = this.runStatus(this.selectedRun)
        const parts = []
        if (mine.running > 0) parts.push(`${mine.running} classifying here`)
        else if (mine.pending > 0) parts.push(`${mine.pending} queued here`)
        const others = this.busyOtherRuns
        if (others.length === 1) parts.push(`also running: ${others[0]}`)
        else if (others.length > 1) parts.push(`also running in ${others.length} other runs`)
        return parts.length ? parts.join(' · ') : 'Select a run / set of samples'
      },
      // Reference databases split by the engine that consumes them, flattened
      // into the { header } / { divider } / item shape v-select renders as
      // grouped options. Entries with no `type` are kraken2 (legacy default).
      groupedDatabases() {
        const groups = [
          {
            label: 'Kraken2 / Bracken',
            match: (d) => !d.type || d.type === 'kraken2'
          },
          {
            label: 'minimap2 (alignment references)',
            match: (d) => d.type === 'minimap2'
          },
          {
            label: 'Support resources (not classifiers)',
            match: (d) => d.type === 'taxdump'
          }
        ]
        const all = this.databases || []
        const claimed = new Set()
        const items = []
        groups.forEach((g) => {
          const members = all.filter((d) => d && g.match(d))
          if (!members.length) return
          members.forEach((m) => claimed.add(m.key))
          if (items.length) items.push({ divider: true })
          items.push({ header: g.label })
          members.forEach((m) => items.push(m))
        })
        // Anything with an unrecognised `type` still needs to be selectable.
        const rest = all.filter((d) => d && !claimed.has(d.key))
        if (rest.length) {
          if (items.length) items.push({ divider: true })
          items.push({ header: 'Other' })
          rest.forEach((d) => items.push(d))
        }
        return items
      },
      // Rank selector items with explicit subspecies depth labels (S1, S2, ...).
      // App-bar chip: what dorado/guppy will run on.
      deviceChip() {
        const t = this.toolsStatus || {}
        const gpu = t.gpu || {}
        const pref = t.device || 'auto'
        const hasGpu = !!(gpu.cuda || gpu.metal)
        const doradoOk = !!(t.tools && t.tools.dorado && t.tools.dorado.present)
        const tail = doradoOk ? '' : ' dorado is not installed yet — click to set it up.'
        if (!t.gpu) return { text: 'Device…', icon: 'mdi-expansion-card', cls: '', tip: 'Checking for GPUs…' }
        if (pref === 'cpu') return { text: 'CPU', icon: 'mdi-cpu-64-bit', cls: 'mtx-bar-chip--muted', tip: 'Basecalling / demultiplexing forced to CPU. Click to change.' + tail }
        if (gpu.cuda) {
          const names = Array.from(new Set(gpu.devices.map((d) => d.name))).join(', ')
          return { text: `CUDA × ${gpu.devices.length}`, icon: 'mdi-expansion-card', cls: 'mtx-bar-chip--ok', tip: `${names} — dorado and guppy run on the GPU (${pref}).` + tail }
        }
        if (gpu.metal) return { text: 'Metal GPU', icon: 'mdi-expansion-card', cls: 'mtx-bar-chip--ok', tip: 'Apple silicon GPU — dorado runs on Metal.' + tail }
        return { text: hasGpu ? 'GPU' : 'CPU only', icon: 'mdi-cpu-64-bit', cls: 'mtx-bar-chip--warn', tip: (gpu.note || 'No GPU detected.') + ' Demultiplexing works on CPU; basecalling will be slow.' + tail }
      },
      activeDownloads() {
        return (this.databases || []).filter((d) => d && d.downloading)
      },
      // Downloads for databases OTHER than the one shown in the panel's card.
      otherDownloads() {
        const cur = this.database && this.database.key
        return this.activeDownloads.filter((d) => d.key !== cur)
      },
      dbCatalogCount() {
        return (this.databases || []).length
      },
      dbReadyCount() {
        return (this.databases || []).filter((d) => dbOnDisk(d)).length
      },
      ranksSelectedCount() {
        const set = new Set(this.defaults || [])
        return this.rankItems.filter((r) => set.has(r.value)).length
      },
      rankPresets() {
        return RANK_PRESETS
      },
      // Which preset (if any) exactly describes the current selection.
      rankPresetActive() {
        const avail = this.rankItems.map((r) => r.value)
        const cur = new Set((this.defaults || []).filter((c) => avail.includes(c)))
        for (const p of RANK_PRESETS) {
          const want = new Set((p.codes || avail).filter((c) => avail.includes(c)))
          if (want.size === cur.size && [...want].every((c) => cur.has(c))) return p.key
        }
        return null
      },
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
      // One light descriptor per backend dependency for the app-bar cluster.
      healthLights() {
        const deps = (this.health && this.health.dependencies) || []
        return deps.map((d) => {
          let cls, stateText, reason
          if (this.installing === d.key) {
            cls = 'installing'
            stateText = 'Installing…'
            reason = 'Installing now — see the dependencies panel for live logs.'
          } else if (d.present) {
            cls = 'ok'
            stateText = 'Available'
            reason = d.version ? d.version : 'Detected on the server PATH.'
          } else if (d.required) {
            cls = 'missing'
            stateText = 'Missing (required)'
            reason = d.installable
              ? 'Not installed. Click to open the installer and add it via conda.'
              : 'Not installed. Click for manual install instructions.'
          } else {
            cls = 'optional-missing'
            stateText = 'Not installed (optional)'
            reason = 'Optional tool — only needed for specific workflows.'
          }
          return { key: d.key, label: d.label, cls, stateText, reason }
        })
      },
      healthIcon() {
        if (this.installing) return 'mdi-progress-download'
        return this.health && this.health.ok ? 'mdi-heart-pulse' : 'mdi-alert'
      },
      healthIconColor() {
        if (this.installing) return '#38bdf8'
        return this.health && this.health.ok ? '#34d399' : '#f87171'
      },
      healthSummary() {
        if (!this.isOnline) return 'Backend offline — dependency status unavailable'
        if (this.installing) return `Installing ${this.installing}…`
        const miss = (this.health && this.health.requiredMissing) || []
        if (miss.length) return `Missing required: ${miss.join(', ')} — click to fix`
        return 'All backend tools available — click for details'
      },
      osLabel() {
        const o = (this.health && this.health.os) || {}
        const names = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }
        const base = names[o.platform] || o.platform || 'Unknown OS'
        return o.arch ? `${base} (${o.arch})` : base
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
      // Names of the samples currently shown. Deliberately a list of STRINGS.
      // This used to be an object mapping every sample name to its full array of
      // row objects, rebuilt whenever any sample changed and handed as a prop to
      // every tab — so one arriving report re-rendered every chart in the app.
      //
      // Memoised by content: this is recomputed whenever ANY sample row changes
      // (status/config updates arrive constantly during a run), and returning a
      // fresh-but-identical array each time made every tab component see a
      // "new" `samples` prop and redraw its charts.
      selectedsamples(){
        const next = this.selectedsamplesAll.filter((obj) => !obj.hidden).map((f) => f.sample)
        return stableStrings(this, 'selectedsamples', next)
      },
      // The display-filter state, bundled for the store's query API. Chart
      // components take this as one prop and pass it straight through.
      taxaQuery(){
        return {
          ranks: this.defaults,
          depthRange: this.depthRange,
          minPercent: this.minPercent,
          version: this.filterVersion
        }
      },
      // "Something in the taxon store changed" — the ONLY reactive dependency
      // chart components need on the bulk data.
      //
      // Throttled (see the rawStoreTick watcher). The raw store tick bumps on
      // every applied frame; while dozens of barcodes are updating that is
      // several times a second, and every bump redraws every mounted d3 chart
      // (sunburst, sankey, heatmap...). Charts now redraw at most every
      // STORE_TICK_MIN_MS; the data underneath is always current.
      storeTick(){
        return this.displayTick
      },
      rawStoreTick(){
        return taxaStore.state.tick
      },
      // The one tab that is actually mounted.
      activeTab(){
        return this.tabs[this.tab] || this.tabs[0] || null
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
        // eslint-disable-next-line no-unused-expressions
        this.storeTick
        // Same memo trick as selectedsamples: passed to Samplesheet as `seen`,
        // so a new-but-equal array re-rendered the whole sample table per tick.
        const next = taxaStore.sampleNames()
        return stableStrings(this, 'samplekeys', next)
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
          // Backend dependency health (kraken2, KrakenTools, conda, dorado, guppy)
          healthDialog: false,
          health: { ok: true, dependencies: [], conda: {}, os: {}, requiredMissing: [] },
          installing: null,        // dependency key currently installing, or null
          installLogs: {},         // key -> accumulated install log text
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
            // NOTE: the FrameClient itself is deliberately NOT declared here.
            // It is assigned as a plain instance property (`this.frames = ...`)
            // in the connect handler, because anything in data() gets walked and
            // observed by Vue — and the client holds a queue of undecoded frames
            // and the socket. Observing those would put the exact hot-path data
            // we just moved out of Vue straight back into it.
            //
            // `frameStats` is a handful of integers and is fine to observe.
            frameStats: { framesReceived: 0, framesApplied: 0, backlog: 0, lastApplyMs: 0, maxApplyMs: 0 },
            visibleSamples: [],
            focusSample: null,
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
            // Reference-database delete confirmation
            dbDeleteDialog: false,
            dbPendingDelete: null,
            pathOptions: [],
            pathOptions1: [],
            pathOptions2: [],
            pathOptionsDb: [],
            pathOptionsRef: [],
            browsePathResult: null,
            // Just-deleted samples (name -> timestamp). Deleting is async on the
            // backend (cancel + report removal), and the cancel broadcasts in-flight
            // job/status frames that would otherwise re-add the row (with a "0"
            // badge) right after the optimistic removal. We ignore re-adds for a
            // short window so a single trash click actually sticks.
            recentlyDeleted: {},
            autodetectR2Result: null,
            pairWatches: [],
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
            // Bumped whenever a display filter changes, so chart components can
            // depend on it without deep-watching the filter objects themselves.
            filterVersion: 0,
            // Taxa cap the server applies to samples that are on screen but not
            // focused. 500 is far more than any chart draws; the focused sample
            // is sent in full.
            topNTaxa: 500,
            matchSingle: ".*fastq",
            ext: ".fastq", 
            compressed: false,
            filepath: "sample_metagenome.second.report",
            tab: 0, 
            gpu: false,
            statussent: null,
            queueList: {},
            // Throttled copy of taxaStore.state.tick; see storeTick.
            displayTick: 0,
            // dorado / guppy / GPU status from the server (see server/tools.mjs)
            toolsStatus: {},
            // live basecall/demux pipelines for the selected run (preprocess.mjs)
            preprocess: [],
            // Left-panel sections open/closed (remembered per browser).
            secOpen: loadSecOpen(),
            queueBoard: {},
            // Counts-only queue summary across EVERY run (see queueBoardAll socket
            // handler); unlike queueBoard/queueList this is never dropped just
            // because a different run is selected.
            queueBoardAll: { runs: [], total: 0, active: 0 },
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
      rawStoreTick(){
        const now = Date.now()
        const since = now - (this._tickAt || 0)
        if (this._tickTimer) return
        if (since >= STORE_TICK_MIN_MS){
          this._tickAt = now
          this.displayTick = taxaStore.state.tick
          return
        }
        this._tickTimer = setTimeout(() => {
          this._tickTimer = null
          this._tickAt = Date.now()
          this.displayTick = taxaStore.state.tick
        }, STORE_TICK_MIN_MS - since)
      },
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
          // Drop the previous run entirely on both sides of the wire. The frame
          // client clears the columnar store and forgets its delta cursors; the
          // server does the same on the getRunInformation below. Without that
          // symmetry a delta could be applied against rows the store no longer
          // has, which is the classic way a delta protocol silently desyncs.
          this.selectedsamplesAll = []
          this.queueList = {}
          this.queueStatusAgg = Object.create(null)
          this.queueBoard = {}
          this.preprocess = []
          // The viewport describes the PREVIOUS run's samples. Carrying it over
          // would tell the server about samples that no longer exist and, worse,
          // omit every sample in the run we are switching to.
          this.visibleSamples = []
          this.focusSample = null
          if (this.frames) this.frames.selectRun(val)
          else taxaStore.reset(val)
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
            this.publishQueueStatus(sample)
          } else {
            const agg = this.ensureQueueAggregate(sample)
            if (agg && agg.total > 0 && (!status.total || status.total < agg.total)) {
              this.publishQueueStatus(sample, status)
              return
            }
            this.$set(this.selectedsamplesAll[index], 'status', status)
          }
          
        }  
      },
      // Both accept the database entry to act on (the panel card, the settings
      // list and "also downloading" rows all pass their own); default is the
      // database selected in the panel.
      canceldownload(db){
        const key = (db && db.key) || (this.database && this.database.key)
        if (!key) return
        this.sendMessage({
            type: "canceldownload", 
            database: key,
            "message" : `Cancel Database Download ${key} `
        });
      },
      downloaddb(db){
        const key = (db && db.key) || (this.database && this.database.key)
        if (!key) return
        this.sendMessage({
            type: "downloaddb", 
            database: key,
            "message" : `Download Database ${key} `
        });
      },
      dbStatus,
      toggleSec(key){
        this.$set(this.secOpen, key, !this.secOpen[key])
        try { localStorage.setItem(SEC_KEY, JSON.stringify(this.secOpen)) } catch (e) { /* private mode */ }
      },
      openRunOverview(){
        if (!this.secOpen.samples) this.toggleSec('samples')
        this.$nextTick(() => {
          const ss = this.$refs.samplesheet
          if (ss && typeof ss.openRunSummary === 'function') ss.openRunSummary()
        })
      },
      rankShort(code){
        if (/^S\d+$/.test(String(code || ''))) return code
        return RANK_SHORT[code] || code
      },
      applyRankPreset(p){
        const avail = this.rankItems.map((r) => r.value)
        const codes = p.codes === null ? avail : p.codes.filter((c) => avail.includes(c))
        // keep any codes not offered as chips (e.g. R/R1) as they were
        const hidden = (this.defaults || []).filter((c) => !avail.includes(c))
        this.defaults = [...hidden, ...codes]
        this.filter()
      },
      toggleRank(code){
        const cur = this.defaults || []
        this.defaults = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]
        this.filter()
      },
      stopPairWatch(payload){
        // payload: { group } or { dir }
        this.sendMessage({
          type: "stopPairWatch",
          run: this.selectedRun,
          group: payload && payload.group,
          dir: payload && payload.dir,
          message: `Stop watching paired directory ${payload && (payload.group || payload.dir) || ''}`
        })
      },
      updateEntry(n, sample){
        // an explicit add/edit of this sample clears any delete tombstone so the
        // row can legitimately come back
        if (n && n.sample && this.recentlyDeleted[n.sample]) delete this.recentlyDeleted[n.sample]
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
        // Optimistic UI: drop the row locally *immediately* so the user can keep
        // clicking without waiting on the backend round-trip (deleteReports +
        // run-file write took 3-5s per click). The server still echoes
        // "deletedSample", which is now a harmless no-op (row already gone).
        this.deletesample(sample)
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
      },
      // Batch-delete every sample in a run/group in ONE round-trip. Removes the
      // rows locally up front, then asks the backend to delete + persist once
      // (instead of N separate messages each rewriting the run file).
      deleteEntries(samples){
        if (!Array.isArray(samples) || !samples.length) return
        samples.forEach((s) => this.deletesample(s))
        try{
          this.sendMessage({
                type: "deleteEntries",
                samples: samples,
                run: this.selectedRun,
                "message" : `Delete ${samples.length} entries`
            }
          );
        } catch (err){
          console.error(err)
        }
      },
      saveRun(){
        this.sendMessage({
              type: "saveRun", 
              "message" : `Save Run ${this.runName} `
          }
        );
      },
      deletesample(sample){
        // tombstone this sample so late queue/status frames from the backend's
        // async delete don't re-add the row (see recentlyDeleted / addSample)
        this.recentlyDeleted[sample] = Date.now()
        this.$delete(this.selectedData, sample)
        if (this.queueStatusAgg && this.queueStatusAgg[sample]) delete this.queueStatusAgg[sample]
        // Drop the sample's queued jobs too, otherwise the QueueBoard (whose rows
        // are derived from queueList keys) keeps showing the deleted sample.
        if (this.queueList && Object.prototype.hasOwnProperty.call(this.queueList, sample)){
          this.$delete(this.queueList, sample)
        }
        let index = this.selectedsamplesAll.findIndex(x => x.sample === sample );
        if (index > -1){
          this.$delete(this.selectedsamplesAll, index)
        }
        // Free the sample's columnar table (a few hundred KB) and evict its
        // cached query results.
        taxaStore.dropSample(sample)
        this.publishView()
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
          this.queueStatusAgg = Object.create(null)
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
        // --- reference database folder / delete ----------------------------
        // Best on-disk location for a database entry. `fullpath` is only set by
        // the server once the DB has actually been found on disk, so fall back
        // to the canonical `final` folder name for entries not downloaded yet.
        dbLocalPath(db) {
          if (!db) return null
          return db.fullpath || db.final || null
        },
        // Only offer delete for databases the server has actually found on disk.
        dbIsOnDisk(db) {
          if (!db) return false
          return !!(db.exists || (db.size && db.size !== 0))
        },
        // Human-readable engine name for a database entry.
        classifierLabel(db) {
          if (!db) return ''
          if (db.type === 'minimap2') return 'minimap2'
          if (db.type === 'taxdump') return 'support resource'
          return 'kraken2 / bracken'
        },
        // Ask the server to reveal the database folder in the OS file browser.
        // Sending the key (not a client-built path) lets the server resolve
        // aliases and nested kraken2 index dirs itself.
        openDatabasePath(db) {
          if (!db) return
          this.sendMessage({ type: 'openPath', path: db.fullpath || null, database: db.key })
        },
        confirmDeleteDatabase(db) {
          if (!db) return
          this.dbPendingDelete = db
          this.dbDeleteDialog = true
        },
        cancelDeleteDatabase() {
          this.dbDeleteDialog = false
          this.dbPendingDelete = null
        },
        deleteDatabase() {
          const db = this.dbPendingDelete
          this.dbDeleteDialog = false
          this.dbPendingDelete = null
          if (!db) return
          this.sendMessage({ type: 'deleteDatabase', database: db.key })
        },
        // --- backend dependency manager ------------------------------------
        openHealth() {
          this.healthDialog = true
          this.requestHealth()
        },
        // Open the dependencies dialog scrolled to basecalling tools / device.
        openTools() {
          this.openHealth()
          this.sendMessage({ type: 'getTools' })
          this.$nextTick(() => setTimeout(() => {
            const el = this.$refs.toolsSection
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' })
          }, 150))
        },
        requestHealth() {
          this.sendMessage({ type: 'getHealth' })
        },
        installTool(key) {
          if (!this.isOnline || this.installing) return
          this.installing = key
          this.$set(this.installLogs, key, '')
          this.sendMessage({ type: 'installTool', key })
        },
        clearLog(key) {
          this.$delete(this.installLogs, key)
        },
        shortEnv(env) {
          if (!env) return ''
          const parts = String(env).split('/')
          return parts[parts.length - 1] || env
        },
        depCardClass(dep) {
          if (this.installing === dep.key) return 'installing'
          if (dep.present) return 'present'
          return dep.required ? 'missing' : 'optional'
        },
        depLightClass(dep) {
          if (this.installing === dep.key) return 'installing'
          if (dep.present) return 'ok'
          return dep.required ? 'missing' : 'optional-missing'
        },
        copyText(text) {
          try {
            if (navigator && navigator.clipboard) {
              navigator.clipboard.writeText(text)
              this.$swal({ toast: true, position: 'top-end', timer: 1400, showConfirmButton: false, icon: 'success', title: 'Copied' })
            }
          } catch (err) {
            console.error(err)
          }
        },
        scrollLog(key) {
          try {
            const refs = this.$refs['log_' + key]
            const el = Array.isArray(refs) ? refs[0] : refs
            if (el) el.scrollTop = el.scrollHeight
          } catch (err) {
            console.error(err)
          }
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
          // --- backend dependency health ------------------------------------
          // Bound here (alongside 'databases') rather than inside the guarded
          // 'connect' block so the initial health snapshot the server emits on
          // connection isn't missed.
          this.socket.on('toolsStatus', (e) => {
            if (!e) return
            // kits arrive only with the per-connection snapshot; keep them
            const kits = e.kits || (this.toolsStatus && this.toolsStatus.kits) || []
            this.toolsStatus = { ...e, kits }
          })
          this.socket.on('health', (e) => {
            if (!e) return
            $this.health = e
            // Clear the local "installing" flag once the server confirms it's
            // no longer installing (covers reconnects mid-install too).
            if (!e.installing && $this.installing) {
              // installStatus handles success/fail toasts; just clear the spinner.
              $this.installing = null
            }
          })
          this.socket.on('installLog', (e) => {
            if (!e || !e.key) return
            const prev = $this.installLogs[e.key] || ''
            $this.$set($this.installLogs, e.key, prev + (e.line || ''))
            $this.$nextTick(() => $this.scrollLog(e.key))
          })
          this.socket.on('installStatus', (e) => {
            if (!e || !e.key) return
            if (e.running) {
              $this.installing = e.key
              return
            }
            // terminal state
            if ($this.installing === e.key) $this.installing = null
            const dep = ($this.health.dependencies || []).find(d => d.key === e.key) || { label: e.key }
            if (e.ok) {
              $this.$swal({ icon: 'success', title: `${dep.label} installed`, text: 'The tool is now available to the backend.', timer: 3000, showConfirmButton: false })
            } else if (e.error) {
              $this.$swal({ icon: 'error', title: `${dep.label} install failed`, text: e.error })
            }
            $this.requestHealth()
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

              // RECONNECT: the server side of this socket is a brand-new
              // Connection (delta cursors at 0) and, if the backend restarted
              // (nodemon, crash, laptop sleep), a brand-new taxon dictionary
              // whose indices no longer match ours. Applying fresh frames on
              // top of the old store mixes the two numbering schemes, so a
              // rerun after a reconnect could draw old names or never appear.
              // Start both ends from nothing: drop the store, redo the
              // handshake and force the viewport to be re-sent.
              if ($this._listenersBound && $this.frames){
                try {
                  $this.frames.selectRun($this.selectedRun || null)
                  $this.socket.emit('mtx:hello', { v: 1 })
                } catch (err) { console.error('frame client reset on reconnect failed', err) }
              }

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
              // Refresh backend dependency health on every (re)connect.
              $this.sendMessage({ type: "getHealth" })
              // Resync GPU preference on every (re)connect, like the emits above.
              $this.socket.emit("gpu", {type: "gpu", gpu: $this.gpu })
              // Refresh the all-runs queue summary on every (re)connect too.
              $this.sendMessage({ type: "getQueueBoardAll" })

              // IMPORTANT: only bind the message listeners ONCE. Previously every
              // 'connect' (including every reconnect after a blip) re-ran all the
              // socket.on(...) registrations below, stacking duplicate handlers.
              // After a few reconnects each 'sampledata'/'status' frame was being
              // processed 2x, 3x... which compounded the lag and triggered further
              // ping-timeout drops -- a feedback loop. The emits above still run on
              // every (re)connect to refresh state; the handlers bind a single time.
              if ($this._listenersBound) { return }
              $this._listenersBound = true

              // ---- data plane ------------------------------------------------
              // One client for one event. Everything that used to be its own
              // socket handler (report bodies, job status, queue counters, the
              // scheduler board) arrives here already coalesced by the server and
              // is applied off the critical path.
              $this.frames = new FrameClient({
                socket: $this.socket,
                onJobs: (jobs) => $this.applyJobFrames(jobs),
                onSamples: (samples) => $this.applySampleFrames(samples),
                onQueue: (q) => $this.applyQueueFrame(q),
                onMeta: (meta) => $this.applyMetaFrame(meta),
                onApplied: (stats) => {
                  $this.frameStats = { ...stats }
                  $this.scheduleConsistencyCheck()
                }
              })
              $this.frames.attach()
              if ($this.selectedRun) $this.frames.selectRun($this.selectedRun)

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
                  // `sample` was never in scope here -- the error handler itself
                  // threw a ReferenceError, so delete failures were invisible.
                  console.error(err, e && e.samplename, "Error in deleting sample")
                }
              })
              $this.socket.on("message", (e)=>{
              })
              $this.socket.on("queueDrop", (e)=>{
                // assume this is the entire set of sample queue records
                this.queueList = e.data
                this.queueStatusAgg = Object.create(null)
              })
              // NOTE: the per-job "status", "queueJob", "sampledata", "data",
              // "runUpdate", "queueLength" and "queueBoard" handlers are gone.
              // Every one of them fired once (or twice) per classified fastq and
              // mutated reactive state synchronously on arrival -- 800 files
              // meant tens of thousands of independent Vue update cycles. All of
              // that traffic now arrives coalesced on a single `mtx:frame`
              // channel and is applied through FrameClient inside a time-budgeted
              // animation-frame loop. See applyJobFrames / applySampleFrames.
              
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
              $this.socket.on("sendPathsRef", (e)=>{
                this.pathOptionsRef = e.data
              })
              $this.socket.on("browsePathResult", (e)=>{
                // new object each time so the Samplesheet watcher always fires,
                // even if the same path is chosen twice in a row
                this.browsePathResult = Object.assign({ _ts: Date.now() }, e)
              })
              $this.socket.on("autodetectR2Result", (e)=>{
                this.autodetectR2Result = e
              })
              $this.socket.on("pairWatches", (e)=>{
                // only apply updates meant for the run we're viewing
                if (!e || (e.run && e.run !== this.selectedRun)) return
                this.pairWatches = Array.isArray(e.watches) ? e.watches : []
              })
              $this.socket.on("samplesheet", (e)=>{
                $this.samplesheet = e.samplesheet
                // The backend broadcasts this whenever the run gains a sample --
                // a new barcode directory appearing mid-run, or a sample added
                // from the sheet editor. Register those rows immediately instead
                // of waiting for the sample's first job or report to arrive.
                $this.adoptSamplesheet(e.samplesheet)
              })
             
              // Run bootstrap. This carries ONLY the structural half of a run:
              // the samplesheet, each sample's queue list and its rollup status.
              // The taxon tables that used to travel with it (every sample's
              // full report text, tens of MB on a large run, parsed synchronously
              // on arrival) now stream in as delta frames sized to whatever this
              // client's viewport actually needs.
              $this.socket.on('runBootstrap', (e)=>{
                if (!e || e.run !== $this.selectedRun) return
                $this.$set($this, 'samplesheet', e.samplesheet || [])
                $this.$set($this, 'pairWatches', Array.isArray(e.pairWatches) ? e.pairWatches : [])
                $this.preprocess = Array.isArray(e.preprocess) ? e.preprocess : []
                // Samples declared in the sheet but not yet classified still get
                // a row, so a freshly created run shows its barcodes right away.
                $this.adoptSamplesheet(e.samplesheet)
                const list = Array.isArray(e.samples) ? e.samples : []
                for (const entry of list){
                  const sample = entry && entry.samplename
                  if (!sample) continue
                  // Frozen for the same reason as in applyJobFrames: never
                  // mutated, so no need for Vue to observe every job's fields.
                  const queue = Array.isArray(entry.queue) ? entry.queue.map((job) => (job ? Object.freeze(job) : job)) : []
                  $this.$set($this.queueList, sample, queue)
                  // The queue is installed wholesale here, not job-by-job, so the
                  // incremental aggregate that applyJobFrames maintains knows
                  // nothing about it. Drop the cached aggregate so it is rebuilt
                  // from what we just installed -- otherwise the badge keeps
                  // reporting the counts it had before the run was (re)loaded.
                  if ($this.queueStatusAgg) delete $this.queueStatusAgg[sample]
                  const lastJob = queue.length ? queue[queue.length - 1] : {}
                  $this.addSample(sample, lastJob, 'server', true)
                  $this.updateSampleStatus(sample, entry.status)
                }
                // Now that we know which samples exist, tell the server what is
                // actually on screen so it only encodes those.
                $this.publishView()
                // The bootstrap is a snapshot; if it was taken while a sample was
                // still initialising its queue, reconcile shortly after.
                $this.scheduleConsistencyCheck()
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
              // ALL-runs queue summary (counts only, every run, not just the one
              // currently selected) so the queue board can show the full picture.
              $this.socket.on('queueBoardAll', (e)=>{
                this.queueBoardAll = e
              })
              $this.socket.on('logs', (e)=>{
                // The server now batches log lines and ships an ARRAY per frame
                // (see messenger.startLogFlusher). Accept either shape so an
                // older/newer backend both work.
                if (!e) return
                const incoming = Array.isArray(e.data) ? e.data : [e.data]
                if (!incoming.length) return
                // Rebuild the array once instead of push-per-line so Vue only
                // re-renders the log viewer a single time per batch.
                const next = this.logs.concat(incoming.filter((l) => l != null))
                this.logs = next.length > 100 ? next.slice(-100) : next
              } )

          })

         
          
        },
        // Parse the "name (attr), name2 (attr2)" alias syntax some references
        // carry. Returns null rather than an empty object when there are no
        // aliases (the overwhelmingly common case for plain kraken2 reports) so
        // we don't allocate one throwaway object per taxon row -- every consumer
        // already guards with `d.objfull && ...`.
        extractValue(value){
          let mappings = null
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
                      if (!mappings) mappings = {}
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
      
        
        // Activity for one run name, always returning a full shape so the
        // wheel component never has to null-check.
        runStatus(run){
          const empty = { running: 0, pending: 0, done: 0, failed: 0, total: 0, percent: 0 }
          if (!run) return empty
          return this.runActivityMap[run] || empty
        },
        // One-line description under each run in the dropdown.
        runStatusLabel(run){
          const s = this.runStatus(run)
          if (s.running > 0){
            return `Classifying — ${s.running} job${s.running === 1 ? '' : 's'} running` +
              (s.pending ? `, ${s.pending} queued` : '')
          }
          if (s.pending > 0) return `${s.pending} queued · ${s.percent}% complete`
          if (s.failed > 0) return `${s.failed} failed · ${s.done} completed`
          if (s.total > 0) return `Idle · ${s.done} of ${s.total} completed`
          return 'Idle'
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
        // Display filters (rank set, depth range, minimum percent) changed.
        //
        // This used to re-derive, and retain, a fresh filtered array of row
        // objects for EVERY loaded sample on every slider tick — two full passes
        // over a 30k-row report per sample, per pixel of slider travel. Filters
        // are now just part of the query the chart layer runs against the
        // columnar store, so all this has to do is bump a counter and let the
        // visible panels re-query. Off-screen samples do no work at all.
        filter(){
          this.filterVersion += 1
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
        // parseData(), rollupSubspecies() and filterData() lived here.
        //
        // parseData walked the report re-deriving each row's parent from
        // indentation and cloned every surviving row to attach it; filterData
        // rebuilt the visible subset. Both ran per sample on every import and
        // every filter change, and both produced arrays that were then retained.
        //
        // Parent/lineage resolution now happens ONCE per taxon, on the server,
        // in the run-level dictionary (server/taxonstore.mjs). Filtering is a
        // predicate over typed arrays inside taxaStore.query(), which hydrates
        // only the rows a chart is about to draw. See src/store/taxa.js.
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
          // Ignore re-adds for a sample that was just deleted: the backend's async
          // delete emits a few trailing job/status frames that would otherwise
          // resurrect the row with a "0" badge until the delete fully lands.
          const deletedAt = this.recentlyDeleted[sample]
          if (deletedAt){
            if (Date.now() - deletedAt < 8000){
              return
            }
            // window elapsed — allow future (genuine) re-adds
            delete this.recentlyDeleted[sample]
          }
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
          // Only replace config when we were actually given one. Sample-level
          // status frames call this with `{}` purely to ensure the row exists;
          // treating that as "set config to empty" wiped the job metadata that
          // the job frames had just populated, and the table lost the paths and
          // database it displays. `$set` because `config` is not present on the
          // object at creation time and so would not otherwise be reactive.
          if (config && Object.keys(config).length){
            this.$set(this.selectedsamplesAll[indx], 'config', config)
          } else if (!this.selectedsamplesAll[indx].config){
            this.$set(this.selectedsamplesAll[indx], 'config', {})
          }
          return

        },
        queueContribution(job){
          if (!job) return null
          const s = (job && job.status) || {}
          const ok = s.success === true || s.success === 0
          return {
            total: 1,
            running: s.running ? 1 : 0,
            waiting: s.waiting ? 1 : 0,
            paused: s.paused ? 1 : 0,
            success: ok ? 1 : 0,
            historical: s.historical ? 1 : 0,
            error: (s.success === false || (s.code != null && s.code !== 0)) ? 1 : 0,
            logCount: s.logCount || 0,
            errorText: (s.success === false || (s.code != null && s.code !== 0)) ? (s.error || 'Job failed') : null
          }
        },
        applyQueueContribution(agg, idx, c, dir){
          if (!agg || !c) return
          agg.total += dir * c.total
          agg.running += dir * c.running
          agg.waiting += dir * c.waiting
          agg.paused += dir * c.paused
          agg.success += dir * c.success
          agg.historical += dir * c.historical
          agg.error += dir * c.error
          agg.logCount += dir * c.logCount
          if (c.errorText) {
            if (dir > 0) agg.errorsByIndex.set(idx, c.errorText)
            else agg.errorsByIndex.delete(idx)
          }
        },
        ensureQueueAggregate(sample){
          if (!this.queueStatusAgg) this.queueStatusAgg = Object.create(null)
          if (this.queueStatusAgg[sample]) return this.queueStatusAgg[sample]
          const agg = {
            total: 0,
            running: 0,
            waiting: 0,
            paused: 0,
            success: 0,
            historical: 0,
            error: 0,
            logCount: 0,
            errorsByIndex: new Map()
          }
          const queue = this.queueList[sample] || []
          queue.forEach((job, idx) => this.applyQueueContribution(agg, idx, this.queueContribution(job), 1))
          this.queueStatusAgg[sample] = agg
          return agg
        },
        updateQueueAggregate(sample, idx, before, after){
          const agg = this.ensureQueueAggregate(sample)
          this.applyQueueContribution(agg, idx, this.queueContribution(before), -1)
          this.applyQueueContribution(agg, idx, this.queueContribution(after), 1)
        },
        publishQueueStatus(sample, statusPatch){
          const index = this.selectedsamplesAll.findIndex(x => x.sample === sample)
          if (index < 0) return
          const agg = this.ensureQueueAggregate(sample)
          const prev = { ...(this.selectedsamplesAll[index].status || {}), ...(statusPatch || {}) }
          const total = Math.max(agg.total, Number(prev.total || 0))
          const done = Math.max(agg.success, Number(prev.done || 0))
          const errorCount = Math.max(agg.error, Number(prev.errorCount || 0))
          // Once we hold live job states for this sample they are authoritative;
          // only fall back to the last server rollup when we have none. (The old
          // `agg.waiting || prev.waiting` kept a stale waiting flag after the job
          // had started, so a running sample also read as queued.)
          const live = agg.total > 0
          const runningCount = live ? agg.running : Number(prev.runningCount || 0)
          const waitingCount = live ? agg.waiting : Number(prev.waiting || 0)
          this.$set(this.selectedsamplesAll[index], 'status', {
            running: runningCount > 0,
            paused: agg.paused > 0,
            success: total > 0 && done === total && errorCount === 0,
            historical: agg.total > 0 && agg.historical === agg.total,
            waiting: waitingCount > 0,
            total,
            runningCount,
            done,
            errorCount,
            logCount: agg.logCount,
            error: Array.from(agg.errorsByIndex.values()).slice(0, 5),
            watching: prev && prev.watching,
            // summary figures from the server rollup (sample/run overview)
            files: prev.files,
            inputBytes: prev.inputBytes,
            yieldReads: prev.yieldReads,
            yieldMbp: prev.yieldMbp,
            yieldFiles: prev.yieldFiles,
            classifier: prev.classifier,
            database: prev.database
          })
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
        // ---------------------------------------------------------------
        // Frame handlers.
        //
        // These receive the light, structural sections of an `mtx:frame`. The
        // heavy half (taxon counts) never reaches this component at all — the
        // FrameClient writes it straight into the columnar store, and the chart
        // components read it back out on demand.
        // ---------------------------------------------------------------

        // Per-job queue/status changes, already coalesced per (sample,index) by
        // the server. One frame typically carries the last window's worth of
        // transitions for the whole run.
        //
        // Perf notes (a 24-barcode x 400-file run means frames carrying
        // thousands of jobs):
        //   * job objects are frozen. They are always replaced wholesale, never
        //     mutated, so there is nothing for Vue to track inside them; freezing
        //     stops it installing a getter/setter + Dep on every field of every
        //     job (tens of thousands of objects on a big run).
        //   * updates are grouped per sample. A sample receiving many jobs in one
        //     frame gets its array swapped once instead of one splice + notify
        //     per job.
        //   * the sample row (addSample -> config) and its rollup status are
        //     touched once per sample per frame, not once per job.
        applyJobFrames(jobs){
          const bySample = new Map()
          for (const j of jobs){
            const sample = j.sample || j.samplename
            if (!sample) continue
            let list = bySample.get(sample)
            if (!list) { list = []; bySample.set(sample, list) }
            list.push(j)
          }
          for (const [sample, list] of bySample){
            if (!this.queueList[sample]) this.$set(this.queueList, sample, [])
            const current = this.queueList[sample]
            const bulk = list.length > 32
            const target = bulk ? current.slice() : current
            let last = null
            for (const j of list){
              const idx = (j.index != null) ? j.index : target.length
              const before = target[idx]
              const merged = {
                ...(before || {}),
                ...(j.job || {})
              }
              if (j.status) merged.status = j.status
              if (j.config){ for (const k in j.config) merged[k] = j.config[k] }
              if (!merged.status) merged.status = { waiting: true }
              Object.freeze(merged)
              this.updateQueueAggregate(sample, idx, before, merged)
              if (bulk) target[idx] = merged
              else this.$set(target, idx, merged)
              last = merged
            }
            if (bulk) this.$set(this.queueList, sample, target)
            this.addSample(sample, last, 'server', true)
            this.publishQueueStatus(sample)
          }
          if (bySample.size) this.scheduleConsistencyCheck()
        },

        // Sample-level rollup status. Report text is conspicuously absent: it
        // has already been diffed into the store by the time we get here.
        applySampleFrames(samples){
          let touched = false
          for (const s of samples){
            const sample = s.sample || s.samplename
            if (!sample) continue
            this.addSample(sample, {}, 'server', true)
            if (s.status) this.updateSampleStatus(sample, s.status)
            touched = true
          }
          if (touched) this.scheduleConsistencyCheck()
        },

        // Scheduler counters + the round-robin board, folded into the frame so
        // they can never disagree with the job states they describe.
        applyQueueFrame(q){
          if (!q) return
          if (q.total != null) this.queueLength = q.total
          if (q.board) this.queueBoard = q.board
        },

        // -------------------------------------------------------------------
        // Consistency check.
        //
        // A sample with taxon data but an empty job queue is impossible in a
        // steady state: the data had to come from a job. When we see it, the job
        // frames that described that queue were emitted at a moment this
        // connection could not receive them — typically before the run was
        // selected, or before the sample had finished initialising and had a
        // queue to report. The run bootstrap normally covers that, but it is a
        // snapshot and can be taken a moment too early.
        //
        // Instead of trying to make the timing airtight everywhere, we detect
        // the contradiction and ask for the authoritative state. Rate-limited
        // server-side per sample, so a sample that really has no jobs settles
        // rather than looping.
        checkQueueConsistency(){
          if (!this.frames) return
          const stale = []
          for (const row of this.selectedsamplesAll){
            const name = row && row.sample
            if (!name || (row.origin || 'server') !== 'server') continue
            if (!taxaStore.count(name)) continue                  // no data: nothing to reconcile
            const queued = (this.queueList[name] || []).length
            const reported = Number((row.status && row.status.total) || 0)
            if ((reported > 0 && queued < reported) || (queued === 0 && reported === 0)) stale.push(name)
          }
          if (stale.length) this.frames.requestResync(stale)
        },

        applyMetaFrame(meta){
          if (!meta) return
          if (meta.samplesheet) this.$set(this, 'samplesheet', meta.samplesheet)
          if (Array.isArray(meta.pairWatches)) this.$set(this, 'pairWatches', meta.pairWatches)
          if (Array.isArray(meta.preprocess)) this.preprocess = meta.preprocess
        },

        // ---------------------------------------------------------------
        // Viewport reporting.
        //
        // This is the single biggest lever on wire volume for a large run: the
        // server only encodes taxa for samples this client says are on screen,
        // and only encodes them in full for the one sample being examined. A
        // 24-barcode run with two panels visible costs about what a 2-barcode
        // run used to.
        // ---------------------------------------------------------------
        // Register every sample named in the samplesheet. Idempotent -- addSample
        // no-ops for samples already known -- so it is safe to call on every
        // samplesheet broadcast.
        adoptSamplesheet(sheet){
          if (!Array.isArray(sheet)) return
          let added = false
          for (const entry of sheet){
            const name = entry && (entry.sample || entry.samplename)
            if (!name) continue
            if (this.selectedsamplesAll.findIndex((x) => x.sample === name) > -1) continue
            this.addSample(name, null, 'server', true)
            added = true
          }
          if (added) this.publishView()
        },

        // Debounced so a burst of frames triggers one check, not one per frame.
        scheduleConsistencyCheck(){
          if (this._consistencyTimer) return
          this._consistencyTimer = setTimeout(() => {
            this._consistencyTimer = null
            try { this.checkQueueConsistency() } catch (err) { console.error(err) }
          }, 1200)
        },

        publishView(){
          if (!this.frames) return
          const onScreen = (this.visibleSamples && this.visibleSamples.length)
            ? this.visibleSamples.slice()
            : this.selectedsamplesAll.filter((s) => !s.hidden).map((s) => s.sample)
          // Always name samples we know about but hold no data for yet.
          //
          // The server has its own guarantee that a sample without a baseline is
          // never starved, but relying on that alone makes a new sample's first
          // payload depend on server-side bookkeeping staying correct. Saying it
          // from the side that actually knows what it is missing is cheap --
          // these samples have no data, so there is nothing extra to encode --
          // and it means the two mechanisms have to fail together to strand a
          // sample.
          const named = new Set(onScreen)
          for (const s of this.selectedsamplesAll){
            if (s.hidden) continue
            if (!taxaStore.count(s.sample)) named.add(s.sample)
          }
          this.frames.setView(Array.from(named), this.focusSample, this.topNTaxa)
        },

        // Called by the chart layer as panels scroll in and out of view.
        setVisibleSamples(names){
          this.visibleSamples = Array.isArray(names) ? names : []
          this.publishView()
        },
        setFocusSample(name){
          this.focusSample = name || null
          this.publishView()
        },

        // ---------------------------------------------------------------
        // Local report ingestion (drag-and-drop, file picker, demo data).
        //
        // Uploads take the same path as live samples: parse straight into the
        // columnar store. There is no longer a second, object-based
        // representation for locally-loaded reports — that divergence is what
        // made the memory behaviour depend on how the data arrived.
        // ---------------------------------------------------------------
        async importData(information, sample, origin){
          if (!information || typeof information !== 'string') {
            console.warn('importData: no text provided');
            return;
          }
          origin = origin || 'upload'
          this.addSample(sample, null, origin, true);
          taxaStore.ingestReport(sample, information)
          this.refreshRankChoices()
          return true
      },

        // Rank codes offered in the sidebar are derived from what is actually
        // loaded. Recomputed on ingest rather than accumulated per row.
        refreshRankChoices(){
          const present = taxaStore.ranksPresent()
          if (!present.length) return
          const merged = sortRanks(this.defaultsList.concat(present))
          if (merged.length !== this.defaultsList.length){
            this.defaultsList = merged
            this.defaults = merged.slice()
          }
        },
    }
}
</script>

<style>
/* ---- app bar (JHU/APL blue, matched to the shield: #092c74) ---- */
.mtx-appbar.v-app-bar.v-toolbar {
  background: linear-gradient(90deg, #092c74 0%, #0e3f6a 58%, #1e6b97 100%) !important;
  box-shadow: 0 2px 10px rgba(9, 44, 116, .25) !important;
}
.mtx-appbar .v-toolbar__content { gap: 6px; }
.mtx-brand { display: flex; flex-direction: column; align-items: flex-start; text-align: left; line-height: 1.1; margin-right: 14px; white-space: nowrap; flex: 0 0 auto; }
.mtx-brand-name { font-size: 19px; font-weight: 800; letter-spacing: .01em; color: #fff; }
.mtx-brand-ver { font-size: 12px; font-weight: 700; color: #7cc4ea; margin-left: 1px; vertical-align: super; }
.mtx-brand-sub { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #b9d3ea; }
.mtx-bar-context {
  display: flex; align-items: center; gap: 5px; min-width: 120px; flex: 0 1 auto; overflow: hidden; white-space: nowrap; font-size: 12.5px; color: #e3eef8;
  background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 3px 12px;
}
.mtx-bar-run { font-weight: 700; max-width: 240px; min-width: 30px; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mtx-bar-sep { opacity: .5; }
.mtx-bar-muted { opacity: .75; }
.mtx-bar-busy { display: inline-flex; align-items: center; }
.mtx-bar-pulse { width: 7px; height: 7px; border-radius: 50%; background: #7dd3fc; margin-right: 5px; animation: mtx-bar-p 1.2s ease-in-out infinite; }
@keyframes mtx-bar-p { 50% { opacity: .3; } }
.mtx-bar-chip {
  display: inline-flex; align-items: center; flex: 0 0 auto; white-space: nowrap; font-size: 12px; font-weight: 600; color: #fff; cursor: pointer;
  background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 3px 11px; margin-right: 10px;
}
.mtx-bar-chip:hover { background: rgba(255,255,255,.2); }
.mtx-bar-chip .v-icon { color: inherit !important; }
.mtx-bar-chip--ok { border-color: rgba(134, 239, 172, .55); }
.mtx-bar-chip--ok .v-icon { color: #86efac !important; }
.mtx-bar-chip--warn .v-icon { color: #fcd34d !important; }
.mtx-bar-chip--muted { opacity: .85; }
.mtx-apl { display: flex; align-items: center; flex: 0 0 auto; margin-left: 8px; padding-left: 12px; border-left: 1px solid rgba(255,255,255,.25); height: 34px; }
/* The PNG's artwork spans x 42–350, y 39–96 of its 360×130 canvas. Show exactly
   that at 30px tall: scale 30/57 and crop via the clipping box. */
.mtx-apl-clip { position: relative; width: 162px; height: 30px; overflow: hidden; }
.mtx-apl img { position: absolute; height: 68.4px; width: auto; left: -22.1px; top: -20.5px; max-width: none; opacity: .95; }
.mtx-apl:hover img { opacity: 1; }
/* Respond to the BAR's width (it narrows when the samples panel is open), not the viewport. */
.mtx-appbar { container-type: inline-size; container-name: appbar; }
@container appbar (max-width: 1150px) {
  .mtx-apl-clip { width: 27px; }            /* shield only */
  .mtx-brand-sub { font-size: 9.5px; }
}
@container appbar (max-width: 900px) {
  .mtx-brand-sub, .mtx-bar-context { display: none; }
}

/* tools section inside the dependencies dialog */
.mtx-tools-head { display: flex; align-items: center; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #0e3f6a; margin-bottom: 8px; }
.mtx-tools-sec { padding-bottom: 6px; }

/* Database pickers render in detached menus, outside the scoped styles. */
.mtx-db-option, .mtx-dbopt { text-align: left; }

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
/* ---- run picker activity markers ---- */
.mtx-runopt {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 6px;
  font-size: 13px;
}
.mtx-run-ico { flex: 0 0 auto; }
.mtx-runopt-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mtx-runbadge {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 9px;
  letter-spacing: .2px;
}
.mtx-runbadge--running {
  background: #e3f5e8;
  color: #1b6b32;
  border: 1px solid #b6e0c2;
}
.mtx-runbadge--queued {
  background: #fdf3dc;
  color: #8a5b00;
  border: 1px solid #f0d9a3;
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
  width: 100%;
  background: none;
  border: 0;
  padding: 2px 0;
  cursor: pointer;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: #5b6573;
  margin-bottom: 6px;
  gap: 4px;
}
.mtx-sec-head:focus-visible { outline: 2px solid #1e6b97; outline-offset: 2px; border-radius: 6px; }
.mtx-sec--closed { padding-bottom: 6px; }
.mtx-sec--closed .mtx-sec-head { margin-bottom: 0; }
.mtx-sec-caret { color: #94a3b8 !important; }
.mtx-sec-peek {
  margin-left: 6px; font-weight: 600; text-transform: none; letter-spacing: 0;
  color: #1e6b97; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;
}
.mtx-sec-peek--dl { display: inline-flex; align-items: center; }
.mtx-sec-count {
  margin-left: 4px; font-size: 10.5px; font-weight: 700; color: #1e6b97; background: #eaf3fa;
  border-radius: 9px; padding: 0 7px; letter-spacing: 0;
}
.mtx-src-mini { display: inline-flex; align-items: center; gap: 4px; margin-right: 4px; text-transform: none; letter-spacing: 0; cursor: default; }
.mtx-src-mini .mtx-src-chip { padding: 0 6px; font-size: 10.5px; }
.mtx-src-mini .mtx-src-clear { padding: 0 4px; }
.mtx-sec-body { padding-top: 2px; }
.mtx-empty-note { display: flex; align-items: center; font-size: 12px; color: #5b6573; background: #f4f8fb; border-radius: 8px; padding: 6px 10px; }
.mtx-run-actions { display: flex; align-items: center; gap: 2px; margin: 6px 0 4px; }
.mtx-norun { font-size: 12px; }

/* ---- databases section ---- */
.mtx-db-selname { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mtx-db-option { min-height: 52px; }
.mtx-db-option-title { font-size: 13px; font-weight: 600; }
.mtx-db-option-desc { font-size: 11.5px !important; white-space: normal !important; line-height: 1.35 !important; }
.mtx-db-state--ready { color: #15803d; }
.mtx-db-state--missing { color: #b45309; }
.mtx-db-state--downloading { color: #1d4ed8; }
.mtx-db-state--extracting { color: #6d28d9; }
.mtx-db-state--error { color: #b91c1c; }
.mtx-dl-others { margin-top: 10px; text-align: left; }
.mtx-dl-others-head { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #5b6573; }
.mtx-db-foot { display: flex; align-items: center; margin: 6px 0 2px; font-size: 11px; color: #6b7f92; }
.mtx-set-dblist { display: flex; flex-direction: column; gap: 6px; }

/* ---- rank filter ---- */
.mtx-rank-block { padding-bottom: 10px; }
.mtx-rank-presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
.mtx-rank-preset {
  font-size: 11.5px; font-weight: 600; color: #1e6b97; background: #fff;
  border: 1px solid #c9dbea; border-radius: 999px; padding: 2px 10px; cursor: pointer;
}
.mtx-rank-preset:hover { background: #f0f7fd; }
.mtx-rank-preset.active { background: #1e6b97; border-color: #1e6b97; color: #fff; }
.mtx-rank-chips { display: flex; flex-wrap: wrap; gap: 6px 6px; }
.mtx-rank-chip {
  display: inline-flex; align-items: center;
  font-size: 12px; line-height: 1; color: #64748b;
  background: #fff; border: 1px dashed #cbd5e1; border-radius: 8px;
  padding: 5px 9px; cursor: pointer; transition: background .12s, border-color .12s, color .12s;
}
.mtx-rank-chip .v-icon { color: inherit !important; }
.mtx-rank-chip:hover { border-color: #1e6b97; color: #1e6b97; }
.mtx-rank-chip.on { background: #e3f0fa; border: 1px solid #9cc3e0; color: #0e3f6a; font-weight: 600; }

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
/* ---- run selector with per-run status wheel ---- */
.mtx-run-sel {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
.mtx-run-sel-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mtx-run-option-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
}
.mtx-run-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mtx-run-option-sub {
  font-size: 0.72rem !important;
  opacity: 0.75;
}
.mtx-run-pill {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 0.66rem;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 9px;
  font-weight: 600;
  white-space: nowrap;
}
.mtx-run-pill-run {
  background: #e1f5fe;
  color: #0277bd;
}
.mtx-run-pill-queued {
  background: #fff8e1;
  color: #b45309;
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
@keyframes mtx-pulse-amber {
  0%   { box-shadow: 0 0 0 0 rgba(56,189,248,.6); }
  60%  { box-shadow: 0 0 0 7px rgba(56,189,248,0); }
  100% { box-shadow: 0 0 0 0 rgba(56,189,248,0); }
}

/* --- Backend dependency lights (app-bar cluster) --- */
.mtx-health-cluster {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  margin: 0 4px;
  border-radius: 999px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  cursor: pointer;
  transition: background .2s, border-color .2s;
}
.mtx-health-cluster:hover {
  background: rgba(255,255,255,.16);
  border-color: rgba(255,255,255,.28);
}
.mtx-health-light {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #6b7280;
  transition: background .3s;
}
.mtx-health-light.ok { background: #22c55e; animation: mtx-pulse-green 2.4s ease infinite; }
.mtx-health-light.missing { background: #ef4444; animation: mtx-pulse-red 1.6s ease infinite; }
.mtx-health-light.installing { background: #38bdf8; animation: mtx-pulse-amber 1s ease infinite; }
.mtx-health-light.optional-missing { background: #9ca3af; opacity: .65; }
.mtx-health-btn { margin-left: 2px !important; }
.mtx-health-tip { font-size: 12px; line-height: 1.35; max-width: 240px; }
.mtx-health-tip-state {
  display: inline-block;
  margin-left: 6px;
  font-weight: 600;
  font-size: 11px;
}
.mtx-health-tip-state.ok { color: #4ade80; }
.mtx-health-tip-state.missing { color: #f87171; }
.mtx-health-tip-state.installing { color: #38bdf8; }
.mtx-health-tip-state.optional-missing { color: #d1d5db; }
.mtx-health-tip-reason { color: #e5e7eb; margin-top: 2px; opacity: .85; }

/* --- Backend dependencies dialog --- */
.mtx-health-card { font-family: Inter, system-ui, sans-serif; }
.mtx-health-titlebar {
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #1f2937;
  padding: 12px 16px !important;
  display: flex;
  align-items: center;
}
.mtx-health-overall {
  margin-left: 10px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 999px;
  letter-spacing: .02em;
}
.mtx-health-overall.ok { background: #dcfce7; color: #15803d; }
.mtx-health-overall.bad { background: #fee2e2; color: #b91c1c; }
.mtx-health-body { padding: 16px !important; }
.mtx-health-offline {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12.5px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}
.mtx-health-env {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}
.mtx-env-chip {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  color: #334155;
}
.mtx-env-chip.good { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
.mtx-env-chip.warn { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
.mtx-env-label { font-weight: 700; margin-right: 6px; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; opacity: .8; }
.mtx-env-val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.mtx-health-conda-note {
  font-size: 12px;
  color: #92400e;
  background: #fffbeb;
  border: 1px dashed #fcd34d;
  border-radius: 8px;
  padding: 7px 10px;
  margin: 6px 0 12px;
}
.mtx-health-conda-note a { color: #b45309; font-weight: 600; }
.mtx-dep-list { display: flex; flex-direction: column; gap: 10px; }
.mtx-dep-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  background: #ffffff;
  transition: border-color .2s, box-shadow .2s;
}
.mtx-dep-card.present { border-color: #bbf7d0; background: #fbfffc; }
.mtx-dep-card.missing { border-color: #fecaca; background: #fffafa; }
.mtx-dep-card.optional { border-color: #e5e7eb; }
.mtx-dep-card.installing { border-color: #bae6fd; box-shadow: 0 0 0 3px rgba(56,189,248,.12); }
.mtx-dep-main { display: flex; align-items: flex-start; gap: 10px; }
.mtx-dep-light {
  width: 11px; height: 11px; border-radius: 50%;
  margin-top: 4px; flex-shrink: 0; background: #9ca3af;
}
.mtx-dep-light.ok { background: #22c55e; animation: mtx-pulse-green 2.4s ease infinite; }
.mtx-dep-light.missing { background: #ef4444; animation: mtx-pulse-red 1.6s ease infinite; }
.mtx-dep-light.installing { background: #38bdf8; animation: mtx-pulse-amber 1s ease infinite; }
.mtx-dep-light.optional-missing { background: #9ca3af; opacity: .6; }
.mtx-dep-text { flex: 1; min-width: 0; }
.mtx-dep-name { font-weight: 700; font-size: 13.5px; color: #1f2937; display: flex; align-items: center; gap: 8px; }
.mtx-dep-tag {
  font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  padding: 1px 6px; border-radius: 999px; background: #e0e7ff; color: #3730a3;
}
.mtx-dep-tag.optional { background: #f3f4f6; color: #6b7280; }
.mtx-dep-desc { font-size: 12px; color: #6b7280; margin-top: 2px; }
.mtx-dep-meta { font-size: 11.5px; color: #15803d; margin-top: 5px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.mtx-dep-meta.missing { color: #b91c1c; }
.mtx-dep-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px; color: #64748b; background: #f1f5f9;
  padding: 1px 6px; border-radius: 5px; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mtx-dep-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.mtx-dep-install {
  background: linear-gradient(180deg, #2563eb, #1d4ed8) !important;
  color: #fff !important;
  text-transform: none !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  border-radius: 8px !important;
}
.mtx-dep-ok { font-weight: 700 !important; }
.mtx-dep-manual {
  margin-top: 10px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 8px;
}
.mtx-dep-manual-head { font-size: 11px; font-weight: 600; color: #475569; display: flex; align-items: center; }
.mtx-dep-docs { margin-left: 8px; color: #2563eb; font-weight: 600; text-decoration: none; }
.mtx-dep-manual-cmd {
  display: flex; align-items: center; justify-content: space-between;
  background: #0f172a; border-radius: 8px; padding: 6px 10px; margin-top: 5px;
}
.mtx-dep-manual-cmd code {
  color: #e2e8f0; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-x: auto; white-space: nowrap;
}
.mtx-dep-manual-cmd .v-btn { color: #94a3b8 !important; }
.mtx-dep-log { margin-top: 10px; }
.mtx-dep-log-head { font-size: 11px; font-weight: 600; color: #475569; display: flex; align-items: center; }
.mtx-dep-log-running { font-size: 11px; color: #0284c7; margin-right: 4px; }
.mtx-dep-console {
  margin-top: 5px;
  background: #0b1220;
  color: #cbd5e1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  border-radius: 8px;
  padding: 10px 12px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
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
.mtx-set-db-btn { flex: 0 0 auto; }

/* ---- Reference database selector (sidebar) ---- */
.mtx-db-option-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
}
/* v-list-item__subtitle truncates to one line by default — let the
   description wrap and the option row grow to fit it. */
.mtx-db-option-desc {
  font-size: 11px !important;
  line-height: 1.35;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  color: #64748b !important;
  margin-top: 2px;
}
.mtx-db-option {
  max-width: 440px;
  height: auto;
  min-height: 52px;
  padding-top: 6px;
  padding-bottom: 6px;
}
.mtx-db-meta { margin-top: 6px; }
.mtx-db-desc {
  font-size: 11px;
  line-height: 1.4;
  color: #64748b;
  margin-bottom: 4px;
}
.mtx-db-actions { display: flex; align-items: center; gap: 2px; }
.mtx-db-engine {
  font-size: 10px !important;
  letter-spacing: .03em;
  color: #475569 !important;
}
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