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
  <v-container   :ref="'boxContainer'" style="padding-top: 10px;  width: 97%">
    <v-row>
      <v-col sm="2">
        <v-subheader v-if="samplenameparsed">{{samplenameparsed}}
        </v-subheader>
        <v-divider></v-divider>
        <br>
        <v-select
          v-model="edgeColor"
          :items="options"    
          dense light
          item-text="name"
          return-object
          label="Color by"
        >

        </v-select> 
        <v-select
          v-model="aligned"
          :items="align_options"    
          dense light
          item-text="label"
          item-value="value"
          return-object
          label="Align Type"
        >

        </v-select> 
        <v-text-field
          hint="Expand Sankey Width"
          v-model="width"
          persistent-hint 
          single-line
          type="number"
        ></v-text-field>
        
        <v-spacer class="mt-4"></v-spacer>
        <!-- <v-subheader>Node Depth Labels to Show</v-subheader> -->
        <v-btn class="info" @click="reset()">Reset
        </v-btn>
        <!-- <v-btn icon>
          <v-icon  data-zoom="+0.5" id="zoom" class="btn btn-circle">mdi-plus</v-icon>
        </v-btn>
        <v-btn icon>
          <v-icon data-zoom="0" id="reset" class="btn btn-circle">mdi-crosshairs</v-icon>
        </v-btn>
        <v-btn icon>
          <v-icon data-zoom="-0.5" id="unzoom" class="btn btn-circle">mdi-minus</v-icon>
        </v-btn> -->
      </v-col>
      <v-col  sm="10">
          <div style="overflow-x:auto " :id="`sankeyBox-${samplenameparsed}`">
          </div>
          <v-range-slider
            hint="Range of Ranks to Show"
            v-model="rangeLabelDepth"
            :min="maxRange[0]-1" 
            :max="maxRange[1]"
            persistent-hint
            @change="hideLabels()"
          >
            <template v-slot:prepend>
                <v-text-field
                  :value="rangeLabelDepth[0]"
                  class="mt-0 pt-0"
                  hide-details
                  single-line label="Node Label Shown"
                  type="number"
                  style="width: 60px"
                  @change="$set(rangeLabelDepth, 0, $event)"
                ></v-text-field>
                
              </template>
              <template v-slot:append>
                <v-text-field
                  :value="rangeLabelDepth[1]"
                  class="mt-0 pt-0"
                  hide-details
                  single-line
                  type="number"
                  style="width: 60px"
                  @change="$set(rangeLabelDepth, 1, $event)"
                ></v-text-field>
              </template>
          
          </v-range-slider>
      </v-col>
    </v-row>
      
      
  </v-container>
</template>

<script>
  import * as d3 from 'd3'
  import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyJustify, sankeyLeft, sankeyRight, sankeyCenter } from 'd3-sankey';
  


  export default {
    name: 'RunStats',
    props: ["inputdata",  "socket", "samplename"],
    watch: {
      inputdata: {
        deep:true,
        handler(data){
          // let data = await d3.csv(this.csv)
          if (data){
            this.removeSankeychart()
            this.Sankeychart(data)
          }
        }
      },
      // dimensions: {
      //   deep:true,
      //   handler(data){
      //     // let data = await d3.csv(this.csv)
      //     this.width = data.width
      //   }
      // },
      edgeColor() {
        this.colorLinks()
      },
      aligned() {
        this.removeSankeychart()
        this.Sankeychart(this.inputdata)
      }
    },  
    data(){
      return {
        xAxis: null,
        dimensions: {
          windowHeight:0,
          windowWidth: 0,
          height: 0,
          width: 0,
        },
        yAxis: null,
        yAxisScale: null,
        color: d3.scaleOrdinal(d3.schemeCategory10),
        edgeColor: "default",
        graph:null,
        sankey: null,
        depths: {},
        filteredData: [],
        rangeLabelDepth: [0,10],
        maxRange: [0,10],
        align_options: [
          {
            label: "Left align",
            target: sankeyLeft,
            value: "left",
          },
          {
            label: "Right align",
            target: sankeyRight,
            value: "right",
          },
          {
            label: "Center align",
            target: sankeyCenter,
            value: "center",
          },
          {
            label: "Justify align",
            target: sankeyJustify,
            value: "justify",
          },

        ],
        aligned: {
          label: "Left align",
          target: sankeyLeft,
          value: "left",
        },
        width: 1000,
        options: [
          "path",
          "input",
          "default"
        ]
      }
    },
    computed:{
      samplenameparsed(){
        return this.samplename.replace(/\./g, '')
      },
      height(){
        if (this.dimensions.height){
          return this.dimensions.height
        } else {
          return 300
        }
      }
    },
    async mounted() {
      this.dimensions.windowHeight = window.innerHeight
      this.dimensions.windowWidth = window.innerWidth
      this.dimensions.height = this.$refs.boxContainer.clientHeight*0.75
      this.dimensions.width = this.$refs.boxContainer.clientWidth*0.6
      this.Sankeychart(this.inputdata)
    }, 
  
    methods: {
      reset(){
        this.removeSankeychart()
        this.Sankeychart(this.inputdata)
      },
      hideLabels(){
        let div = d3.select(`#sankeyBox-${this.samplenameparsed}`)
        this.updateSankey()
        // div.selectAll(".link").style("stroke-opacity", d => (this.rangeLabelDepth[0] <= d.target.depth && this.rangeLabelDepth[1] >= d.target.depth ? 0.7 : 0))
        // div.selectAll(".nodeText").style("opacity", d => (this.rangeLabelDepth[0] <= d.depth && this.rangeLabelDepth[1] >= d.depth ? 1 : 0))
      },
      colorLinks(){
        let div = d3.select(`#sankeyBox-${this.samplenameparsed}`)
        let link = div.selectAll(".link")
        
        link.attr("stroke", d => this.edgeColor === "none" ? "#aaa"
          : this.edgeColor === "path" ? d.uid 
          : this.edgeColor === "input" ? this.color(d.source) 
          : this.color(d.target))
        if (this.edgeColor === "path") {
          const gradient = link.append("linearGradient")
              .attr("id", (d,i) => {
                return `${i}`
              })
              .attr("class", "gradient")
              .attr("gradientUnits", "userSpaceOnUse")
              .attr("x1", d => d.source.x1)
              .attr("x2", d => d.target.x0)
          gradient.append("stop")
              .attr("offset", "0%")
              .attr("stop-color", (d) => {
                return this.color(d.source)
              } );

          gradient.append("stop")
              .attr("offset", "100%")
              .attr("stop-color",  (d) => {
                return this.color(d.target)
              } );
        } else {
          div.selectAll(".gradient").remove()
        }
        
      },
      removeSankeychart(){
        d3.select("#sankeyBox-"+this.samplenameparsed).selectAll("*").remove()
      },
      updateSankey(){
        const $this = this
        let format = function(d) { return formatNumber(d); }
        let sankey = this.sankey
        
        let data = this.inputdata.filter((f)=>{
          
          return f.parenttaxid >=0 && f.parenttaxid && 1+f.depth /2 >= $this.rangeLabelDepth[0] && 1+f.depth /2 <= $this.rangeLabelDepth[1]
        })
        var margin = {top: 50, right: 20, bottom: 30, left: 10},
            height = this.height - margin.top - margin.bottom;  
        let width = (this.width / (1/($this.rangeLabelDepth[1] - $this.rangeLabelDepth[0]))) - margin.left - margin.right
        var formatNumber = d3.format(",.0f") // zero decimal places
        let sankeydata = _.cloneDeep($this.sankeydata)
        data.forEach(function (d) {
          sankeydata.nodes.push({ "name": `${d.source}-${d.parenttaxid}`  });
          sankeydata.nodes.push({ "name": `${d.target}-${d.taxid}` });
          sankeydata.links.push({ "source": `${d.source}-${d.parenttaxid}`,
                            "target": `${d.target}-${d.taxid}`, 
                            "value": +d.value });
        });
        
        // return only the distinct / unique nodes
        sankeydata.nodes = Array.from(
            d3.group(sankeydata.nodes, (d) => { $this.depths[d.name] = d.depth; return d.name}),
          ([value]) => (value)
          );
        // loop through each link replacing the text with its index from node
        sankeydata.links.forEach(function (d, i) {
          sankeydata.links[i].source = sankeydata.nodes
            .indexOf(sankeydata.links[i].source);
          sankeydata.links[i].target = sankeydata.nodes
            .indexOf(sankeydata.links[i].target);
        });
        // now loop through each nodes to make nodes an array of objects
        // rather than an array of strings
        sankeydata.nodes.forEach(function (d, i) {
          sankeydata.nodes[i] = { "name": d };
        });
        
        let graph = sankey(sankeydata);
        let nodes = graph.nodes
        let links = graph.links
        
        
        function dragStart (event, d) {
        
        d.__x = event.x;
        d.__y = event.y;
        d.__x0 = d.x0;
        d.__y0 = d.y0;
        d.__x1 = d.x1;
        d.__y1 = d.y1;
        
      } //dragStart
      
      const nodeWidth = nodes[0].x1 - nodes[0].x0;
      function dragMove(event) {
        
        d3.select(this)
          .attr('transform', function (d) {
            const dx = event.x - d.__x;
            const dy = event.y - d.__y;
            d.x0 = d.__x0 + dx;
            d.x1 = d.__x1 + dx;
            d.y0 = d.__y0 + dy;
            // d.y0 = d.__y0 + dy;
            d.y1 = d.__y1 + dy;
            if (d.x0 < 0) {
                d.x0 = 0;
                d.x1 = nodeWidth;
            } // if

            if (d.x1 > width) {
                d.x0 = width - nodeWidth;
                d.x1 = width;
            } // if

            if (d.y0 < 0) {
                d.y0 = 0;
                d.y1 = d.__y1 - d.__y0;
                
            } // if

            if (d.y1 > height) {
                d.y0 = height - (d.__y1 - d.__y0);
                d.y1 = height;
                
            } // if
            return `translate(${d.x0}, ${d.y0})`;
        
        }); //.attr('transform', function (d) {
        
          // https://github.com/d3/d3-sankey#sankey_update
          $this.sankey.update({nodes, links});
          link.selectAll(".link").attr('d', sankeyLinkHorizontal());
        }
        this.svg.selectAll(".nodeSankey").remove()
        this.svg.selectAll(".link").remove()

        const node = this.svg.selectAll("g.nodeSankey")
                    .data(nodes, (d)=>{
                      return d
                    })
                    .join(
                      function(enter){
                        let returnable = enter.append('g').attr('class', 'nodeSankey').attr('transform', d => `translate(${d.x0}, ${d.y0})`)       
                        returnable.append("rect")
                            .attr("height", d => d.y1 - d.y0)
                            .attr("width", d => d.x1 - d.x0)
                            .attr("fill", $this.color)
                            .attr("id", (d,i) => {
                              return `${d.name}.${i}-rect`
                            })
                            .attr("stroke", "#000")
                            .append("title")
                              .text(d => `${d.name}\n${format(d.value)}`)

                        // Relative to container/ node rect
                        returnable.append("text").classed("nodeText", true)
                                .attr("font-family", "sans-serif")
                                .attr("font-size",15)
                                .attr("x", d => d.x0 < width / 2 ? 6 + (d.x1 - d.x0) : - 6) // +/- 6 pixels relative to container
                                .attr("y", (d,i) => {
                                  if (i %3 == 1){
                                    return (d.y1 - d.y0) / 1.5
                                  } else if (i %3 == 2){ 
                                      return (d.y1 - d.y0 ) / 3 
                                  } else {
                                    return (d.y1 - d.y0) / 2
                                  }
                                  
                                }) // middle of node
                                .attr("dy", "0.35em")
                                .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
                                .text(d => d.name.split("-")[0]); 
                                returnable.append("text").classed("nodeText", true)
                                .attr("font-family", "sans-serif")
                                .attr("font-size",15)
                                .attr("dy", "-0.2em")
                                .attr("text-anchor", "start")
                                .text(d => Math.round((d.value + Number.EPSILON) * 100) / 100); 
                        returnable.attr('cursor', 'move')
                          .call(d3.drag()
                            .on('start', dragStart)
                            .on('drag', dragMove)
                            );                  
                        return returnable
                      },
                      function(update){
                        update.selectAll(".nodeSankey").attr('transform', d => `translate(${d.x0}, ${d.y0})`)                
                        return update
                      },
                      function(exit){
                        return exit.remove()
                      }


                      )
        
        const link = this.svg.selectAll('.link').data(links, (d)=>{
                      return d
                    })
                    .join(
                      function(enter){
                        let returnable = enter.append('g')
                          .attr("fill", "none")
                          .attr("stroke-opacity", 0.7).style("mix-blend-mode", "multiply");
                        returnable.append("path")
                          .attr("class", "link")
                          .attr("d", sankeyLinkHorizontal())
                          .attr("stroke-width", d => Math.max(1, d.width));
                         
                        returnable.append("title")
                          .text(function(d) {
                              
                              return d.source.name + " → " + 
                                  d.target.name + "\n" + format(d.value); });
                        $this.colorLinks()
                        return returnable
                      },
                      function(update){
                        update.selectAll(".link").attr("d", sankeyLinkHorizontal())              
                        return update
                      },
                      function(exit){
                        return exit.remove()
                      }


                      )

    
      },
      async Sankeychart(data){ //https://observablehq.com/d/62d604dff1093411
        // const $this = this
        // let data = await d3.csv(filepath)
        // set the dimensions and margins of the graph
        //set up graph in same style as original example but empty
        // set the dimensions and margins of the graph
        var margin = {top: 50, right: 20, bottom: 30, left: 10},
            width = this.width - margin.left - margin.right,
            height = this.height - margin.top - margin.bottom;  
        // format variables
        
        let sankeyBox = d3.select("#sankeyBox-"+this.samplenameparsed)
        // append the svg object to the body of the page

        let zoom = d3.zoom()
				.scaleExtent([0, 5])
				// .center([width / 2, height / 2])
				.on("zoom", zoomed);

        var svg = sankeyBox.append('svg')
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .call(zoom)
          .append("g")
            .attr("transform", 
                  "translate(" + margin.left + "," + margin.top + ")");

        // Set the sankey diagram properties
        var sankey = d3Sankey()
            .nodeWidth(10)
            .nodePadding(40)
            .size([width, height])
            .nodeAlign(this.aligned.target)
            ;
        this.svg = svg
        this.sankey = sankey
        let sankeydata = {"nodes" : [], "links" : []};
        this.sankeydata = sankeydata
        
        this.maxRange = d3.extent(this.inputdata, (d)=>{
          return 1 + d.depth / 2
        })
        this.updateSankey()
  
      //   // Relative to container
      
      
    
    function zoomed(e){
      return svg.attr('transform', e.transform);
    }



      
    }
      
        
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
.d3-zoom-controls {
      position: absolute;
      left: 15px;
      top: 10px;
    }
    
    .d3-zoom-controls .btn-circle {
      width: 30px;
      height: 30px;
      align-items: center;
      padding: 0px 0;
      font-size: 18px;
      line-height: 2.00;
      display: grid;
      border-radius: 30px;
      background: rgba(255, 255, 255, 0.7);
      color: gray;
      margin-top: 10px;
    }
</style>