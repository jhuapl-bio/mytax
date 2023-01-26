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
    <v-row>
      <v-subheader>{{samplename}}
      </v-subheader>
      <v-data-table
            small v-if="inputdata"
            :items="inputdata"
            :height="dimensions.height"
            :headers="headers"
            :items-per-page="100" 
            :search="search"
            :custom-filter="filter"
            class="elevation-1 mx-5 px-6"
            :width="1000"  
        >	
          <template v-slot:[`item.extract`]="{ item }">
              <v-btn
                  x-small
                  class="mr-2" color="grey"
                  @click="extractTaxid(item.taxid)"
              >
                Extract Taxid
              </v-btn>
              
             
          </template>
          <template v-slot:top >
            <v-toolbar >
              <v-toolbar-title class="mr-10">Classifications</v-toolbar-title>

              <v-select
                v-model="selectedSearch"
                :items="headers"
                persistent-hint
                hint="Column to search on"

              >
              </v-select>
              <v-text-field
                v-model="search"
                label="Search "
                class="mx-4" 
                placeholder="Search Term"
              ></v-text-field>
            </v-toolbar>
            
            
          </template>
      </v-data-table>
    </v-row>
      
      
</template>

<script>

  export default {
    name: 'RunStats',
    props: ["inputdata", "dimensions","socket", "samplename"],
    watch: {
    },  
    data(){
      return {
        nodeCountMax: 0,
        edgeColor: "default",
        
        options: [
          "path",
          "input",
          "default"
        ],
        headers: [
            {
                text: "Sample",
                value: "samplename",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Percent",
                value: "value",
                sortable: true,
                align:"center"                
            },
            {
                text: "Parent",
                value: "source",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Scientific Name",
                value: "target",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Depth",
                value: "depth",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Fragments In Clade",
                value: "num_fragments_clade",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "TaxID",
                value: "taxid",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Fragments Assigned",
                value: "num_fragments_assigned",
                align:"center"  ,              
                sortable: true
            },
            {
                text: "Fullname",
                value: "full",
                align:"center"  ,              
                sortable: true
            },
            {
              text: "Rank Code",
              align:"center"  ,              
              value: "rank_code",
              sortable: true
            },
        ],
        search: null,
        selectedSearch: {
            text: "Name",
            value: "target",
            align:"center"  ,              
            sortable: true
        },
      }
    },
    async mounted() {
    },
 
    methods: {
      sendMessage: async function(message) {
          // We use a custom send message function, so that we can maintain reliable connection with the
          // websocket server.
          if (this.socket.readyState !== this.socket.OPEN) {
              try {
                  await this.waitForOpenConnection(this.socket)
                  this.socket.send(message)
              } catch (err) { console.error(err) }
          } else {
              this.socket.send(message)
          }
      },
      extractTaxid(taxid)
      {
        this.sendMessage(JSON.stringify({type: "extractTaxid", taxid: taxid}));
      },
      filter (value, search, item) {
        var replace = `.*${search}.*`;
        var re = new RegExp(replace,"ig");
        if (re.test(item[this.selectedSearch])){
          return true
        } else {
          return false
        }
      },
    }
    
    
  };
</script>
<style>
  .node rect {
  fill-opacity: .9;
  shape-rendering: crispEdges;
}

.node text {
  pointer-events: none;
  text-shadow: 0 1px 0 #fff;
}

.link {
  fill: none;
  /* stroke: #000; */
  stroke-opacity: .2;
}

.link:hover {
  stroke-opacity: .5;
}
</style>