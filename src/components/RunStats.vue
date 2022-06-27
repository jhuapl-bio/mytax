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
          <v-tabs-items v-model="tab"
                    >
            <v-tab-item v-for="(tabItem, key) in tabs"  :key="`${key}-tabItem`">
              <!-- <div  v-for="sample in samples" :key="sample"> -->
                <component 
                  :is="tabItem.component" 
                  :dimensions="dimensions"
                  class="mx-4 py-5"
                  :inputdata="(tabItem.type == 'json' ? sampledata : sampledata)" :socket="socket"
                >
                </component>
              <!-- </div> -->
            </v-tab-item>

          </v-tabs-items>

      
    </v-col>
     
      <v-divider class="my-2 py-2" ></v-divider>
      <br>
      <br>
      <br>
      <br>
      <br>
      <br>
    </v-row>
    
      
      
  </v-container>
</template>

<script>
  import Sankey from "@/components/Sankey.vue"
  import Datatable from "@/components/Datatable.vue"
   import Sunburst from "@/components/Sunburst.vue"
  export default {
    name: 'RunStats',
    components: {
      Sankey,
      Sunburst,
      Datatable
    },
    computed: {
     
    },
    props: ["jsondata", "inputdata", "socket", "selectedsample", "sampledata"],
    watch: {
      
    },
    data() {
      return {
        dimensions: {
          windowHeight:0,
          windowWidth: 0,
          height: 0,
          width: 0,
        },
        tab: 0, 
        selectedSample: null,
        tabs: [
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
      
      
      
    },
    async mounted() {
      this.dimensions.windowHeight = window.innerHeight
      this.dimensions.windowWidth = window.innerWidth
      this.dimensions.height = this.$refs.boxContainer.clientHeight*0.5
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