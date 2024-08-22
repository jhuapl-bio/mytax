<template>
  <div class="mr-4">
    <v-tooltip  bottom >
      <template v-slot:activator="{ on }">
        <v-btn fab
            color="primary"
            dark  x-small @click="dialog = true"
            class="mx-2"  v-on="on"
            >
            <v-icon  >mdi-plus</v-icon>
            
        </v-btn>
      </template>
      Create and define a new run
    </v-tooltip>
    <v-tooltip  bottom v-if="selectedRun">
      <template v-slot:activator="{ on }">
        <v-btn fab 
            dark  x-small @click="deleteRun  "
            class="mx-2 warning"  v-on="on"
            >
            <v-icon  >mdi-recycle</v-icon>
            
        </v-btn>
      </template>
      Delete CURRENTLY selected run
    </v-tooltip>
    <v-dialog v-model="dialog"  max-width="600px">
      <v-card>
        <v-card-title>
          <span class="headline">Run Creation Submission</span>
        </v-card-title>

        <v-card-text>
            <v-row>
              <v-col cols="12" sm="6">
                <v-text-field
                  label="Run Name"
                  required
                  v-model="formData.runName"
                  :error-messages="runNameErrors"
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="6">
                <v-combobox  
                  v-model="formData.selectedPath"
                  :items="pathOptions"
                  :hint="formData.selectedPath ? `Save Path: ${finalReportPath}` : '' "
                  persistent-hint
                  label="Report Path"
                  @keyup="handleInput"
                  :error-messages="pathErrors"
                ></v-combobox>
              </v-col>
              <v-btn color="blue lighten-1" text @click="getReportPath()">Reset</v-btn>
            </v-row>
        </v-card-text>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="blue darken-1" text @click="closeDialog">Cancel</v-btn>
          <v-btn color="blue darken-1" :disabled="!isFormValid" text @click="addRun">Add</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
  
</template>

<script>

export default {
  name: 'AddRun',
  data() {
    return {
      dialog: false,
      formData: {
        runName: 'TestRun',
        selectedPath: '', // default value for Report Path
      },
      fullsamples: [],
    };
  },
  props: ["samples", "pathOptions", "reportSavePath", "selectedRun"],
  watch: {
    reportSavePath: {
      deep:true, 
      handler(val){
        this.formData.selectedPath = val
      }
    },
    samples: {
      deep: true, 
      handler(val){
        // check that sample.sample is in fullsamples, if not then push to fullsamples
        let fullsamples = []
        val.forEach((sample)=>{
          if(!fullsamples.includes(sample.sample)){
            fullsamples.push(sample)
          }
        })
      }
    }
  },
  computed: {
    finalReportPath(){
      return `${this.formData.selectedPath}/${this.formData.runName}`
    },
    runNameErrors() {
      if (!this.formData.runName || this.formData.runName === '') {
        return 'Run Name is required';
      }
      return [];
    },
    pathErrors() {
      if (!this.formData.selectedPath || this.formData.selectedPath === '') {
        return 'Report Path is required';
      }
      return [];
    },
    isFormValid() {
      return this.formData.runName !== '' && this.formData.selectedPath !== '';
    },
  },
  mounted() {
    
  },
  methods: {
    getReportPath(){
      this.$emit("sendMessage", { type: "getReportPath" })
    },
    resetSavePath(){
      this.formData.selectedPath = this.reportSavePath
    },
    handleInput(event) {
      // Send current input value to the server
      const value = event.target.value;
      this.$emit("sendMessage", { type: "searchPath", value: value  })
    },
    closeDialog() {
      this.dialog = false;
    },
    addRun(){
      let $this = this
      this.$emit("sendMessage", {
        type: "addRun", 
        samplesheet: [], 
        run: $this.formData.runName,
        report: $this.finalReportPath, 
        "message" : `Add Run ${$this.formData.runName} `
      });
      this.closeDialog()
    },
    deleteRun(){
      this.$emit("sendMessage", {
          type: "deleteRun", 
          run: this.selectedRun, 
          "message" : `Delete Run ${this.selectedRun} `
      });
    },
  }
};
</script>
<style scoped>

.v-select__selections {
  overflow: auto;
  white-space: nowrap;
  width: auto;
  min-width: 100%;
}

</style>