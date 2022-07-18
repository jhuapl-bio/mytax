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
  <v-container  >
    
    
    <v-row>
      
      <v-col sm="12" :ref="'boxContainer'" >
        <v-toolbar extended
          dark
        >
          <v-toolbar-title>Sample Reports</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon-and-text small v-if="tab == 1" class="mb-1 mr-7" type="info" @click="selectedTaxid = -1">
              Reset
              <v-icon>mdi-recycle
              </v-icon>
          </v-btn>
          <v-spacer>
          </v-spacer>
          <v-select
            v-model="selectedAttribute"
            :items="ranks"    
            @input="full = true"
            color="white" style="padding-top: 50px"
            width="5px"
            :key="selectedAttribute"
            item-text="name"
            item-value="name"
            return-object
            label="Update Legend rank"
          >
          </v-select>
          <v-select
            v-model="legendPlacement"
            v-if="tab == 1 || tab == 2"
            :items="legendPlacements"    
            color="white" style="padding-top: 50px"
            width="5px"
            :key="legendPlacement"
            label="Legend Placement Position"
          >
            

          </v-select>
          
          <template v-slot:extension>
            
            <v-tabs v-model="tab" align-with-title
              color="basil" >
            <v-tabs-slider color="purple"></v-tabs-slider>          
            <v-tab  v-for="(tabItem, key) in tabs"  :key="`${key}-tab`">
              <v-icon class="mr-2">
                mdi-{{tabItem.icon}}
              </v-icon>
              {{tabItem.name}}
            </v-tab>
          </v-tabs>
          <v-switch
            :label="(full ? 'Show all at rank' : 'Show under taxid')" class="text-caption; "
            hint="Show all taxa at this rank or only those under selected taxid"
            v-model="full" hide-details persistent-hint v-if="tab == 1"
          >
          </v-switch>
          
          </template>
        </v-toolbar>
        <v-tabs-items v-model="tab">
          <v-tab-item v-for="(tabItem, key) in tabs"  :key="`${key}-tabItem`">
            <v-row v-if="tabItem.component !== 'Plates'">
              <v-col  :sm="determineSize"  v-for="[ key, sample ] of Object.entries(sampleData)" :key="`${key}-sample`" >
                <component 
                  :is="tabItem.component" 
                  :samplename="key"
                  v-if="sample"
                  @jumpTo="jumpTo"
                  :selectedAttribute="selectedAttribute"
                  @changeAttribute="changeAttribute"
                  :full="full"
                  :taxa="taxa"
                  :selectedTaxid="selectedTaxid"
                  :dimensions="dimensions"
                  :legendPlacement="legendPlacement"
                  :inputdata="sample" :socket="socket"
                >
                </component>
              </v-col>
            </v-row>
            <v-row v-else>
              <Plates
                  @jumpTo="jumpTo"
                  :selectedAttribute="selectedAttribute"
                  :selectedTaxid="selectedTaxid"
                  :samplenames="selectedsamples"
                  :dimensions="dimensions"
                  :legendPlacement="legendPlacement"
                  :inputdata="sampleData" 
                  :socket="socket"
              >
              </Plates>
            </v-row>
          </v-tab-item>

        </v-tabs-items>
                    
          

      
    </v-col>
    </v-row>
    
      
      
  </v-container>
</template>

<script>
  import Sankey from "@/components/Sankey.vue"
  import Datatable from "@/components/Datatable.vue"
  import Plates from "@/components/Plates.vue"
  import Sunburst from "@/components/Sunburst.vue"
  export default {
    name: 'RunStats',
    components: {
      Sankey,
      Sunburst,
      Plates,
      Datatable
    },
    computed: {
      determineSize(){
        if (this.tab == 1){
          if (this.selectedsamples.length %3==0){
            return 6
          } else if (this.selectedsamples.length == 1){
            return 12
          } else if (this.selectedsamples.length %3 == 2) {
            return 6
          } else {
            return 6
          }
        } else {
          if (this.selectedsamples.length %2==0 || this.selectedsamples.length == 1){
            return 12
          } else {
            return 6
          }
        }
          
      }
    },
    props: ["socket", "selectedsamples", "sampleData"],
    watch: {
      sampleData: {
        deep:true, 
        handler(val){
          let unique_ranks = []
          for(let values of Object.values(val)){
            if (values){
              unique_ranks.push([... new Set(values.map((f)=>{return f.rank_code}))])
            }
            
          }
          unique_ranks = [ ... new Set(unique_ranks.flat() ) ]
          this.ranks = unique_ranks
          this.getUniqueLabels()
        }
      },
      selectedAttribute: {
        deep:true,
        handler(){
          this.getUniqueLabels()
        }
      }
    },
    data() {
      return {
        selectedTaxid: 0,
        full: false,
        taxa: [],
        selectedAttribute: "S",
        legendPlacement: 'side',
        legendPlacements: ['bottom', 'side'],
        dimensions: {
          windowHeight:0,
          windowWidth: 0,
          height: 0,
          width: 0,
        },
        tab: 1, 
        ranks: [],
        selectedSample: null,
        tabs: [
          {
            name: "Top",
            component: "Plates",
            type: "json"
          },
          {
            name: "Sunburst",
            component: "Sunburst",
            type: "json"
          },
          {
            name: "Sankey",
            component: "Sankey",
            type: "report"
          },
          {
            name: "Table",
            component: "Datatable",
            type: "report"
          }
        ],
        

      }
    },
    methods: {
      getUniqueLabels(){
        let unique_taxa  = []
        let val = this.sampleData
        for(let values of Object.values(val)){
          if (values){
            let sample_taxa = 
              values.filter((f)=>{
                return f.rank_code == this.selectedAttribute
              }).map((f)=>{
                return f.target
              })
            let unique_taxa3 = unique_taxa.concat(sample_taxa)
            unique_taxa = unique_taxa3
          }
          
        }
        unique_taxa = [ ... new Set(unique_taxa) ]
        this.$set(this, 'taxa', unique_taxa)
      },
      jumpTo(event){
        this.selectedTaxid = event
        // 
      },
      changeAttribute(rank){
        this.selectedAttribute = (rank ? rank  : 'base' )
        this.getUniqueLabels()
      }
      

      
    },
    async mounted() {
      this.dimensions.windowHeight = window.innerHeight
      this.dimensions.windowWidth = window.innerWidth
      this.dimensions.height = this.$refs.boxContainer.clientHeight*2
      this.dimensions.width = this.$refs.boxContainer.clientWidth*0.6
    },
  };
</script>
<style>
  .slice {
    cursor: pointer;
  }

  .SunburstTable {
    width: 100%;
  }

  .slice .main-arc {
    stroke: #fff;
    stroke-width: 1px;
  }

  .slice .hidden-arc {
    fill: none;
  }

  .slice text {
    pointer-events: none;
    text-anchor: middle;
  }

  #sunburstDiv {
    vertical-align: middle;
    text-align: center;
    margin: auto;
  }
</style>