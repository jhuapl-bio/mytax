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
  <v-container  ref="sankeyBox" style="padding-top: 10px;  width: 97%">
    <v-row>
      <v-col sm="2">
        <v-subheader v-if="samplename">{{samplename}}
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
        <v-range-slider
          hint="Label Hide Depth"
          v-model="rangeLabelDepth"
          :min="maxRange[0]-1" vertical
          :max="maxRange[1]"
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
        <v-spacer class="mt-4"></v-spacer>
        <v-subheader>Node Depth Labels to Show</v-subheader>
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
          <div style="overflow-x:auto " :id="`sankeyBox-${samplename}`">
          </div>
         
      </v-col>
    </v-row>
      
      
  </v-container>
</template>

<script>
  import * as d3 from 'd3'
  import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyJustify, sankeyLeft, sankeyRight, sankeyCenter } from 'd3-sankey';
  


  export default {
    name: 'RunStats',
    props: ["inputdata", "dimensions", "socket", "samplename"],
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
      dimensions: {
        deep:true,
        handler(data){
          // let data = await d3.csv(this.csv)
          this.width = data.width
        }
      },
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
        yAxis: null,
        yAxisScale: null,
        color: d3.scaleOrdinal(d3.schemeCategory10),
        edgeColor: "default",
        graph:null,
        sankey: null,
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
        width: 1500,
        options: [
          "path",
          "input",
          "default"
        ]
      }
    },
    computed:{
      // width(){
      //   if (this.dimensions.width){
      //     return this.dimensions.width
      //   } else {
      //     return (window.innerWidth ? window.innerWidth : 1000)
      //   }
      // },
      height(){
        if (this.dimensions.height){
          return this.dimensions.height
        } else {
          return 500
        }
      }
    },
    async mounted() {
      this.Sankeychart(this.inputdata)
    }, 
  
    methods: {
      reset(){
        this.removeSankeychart()
        this.Sankeychart(this.inputdata)
      },
      hideLabels(){
        let div = d3.select(`#sankeyBox-${this.samplename}`)
        div.selectAll(".nodeText").style("opacity", d => (this.rangeLabelDepth[0] <= d.depth && this.rangeLabelDepth[1] >= d.depth ? 1 : 0))
      },
      colorLinks(){
        let div = d3.select(`#sankeyBox-${this.samplename}`)
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
        d3.select("#sankeyBox-"+this.samplename).selectAll("*").remove()
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
        var formatNumber = d3.format(",.0f"), // zero decimal places
            format = function(d) { return formatNumber(d); }
        let sankeyBox = d3.select("#sankeyBox-"+this.samplename)
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
        this.sankey = sankey
        let sankeydata = {"nodes" : [], "links" : []};
        data = data.filter((f)=>{
          return f.parenttaxid >=0 && f.parenttaxid
        })
        data.forEach(function (d) {
          sankeydata.nodes.push({ "name": `${d.source}-${d.parenttaxid}` });
          sankeydata.nodes.push({ "name": `${d.target}-${d.taxid}`});
          sankeydata.links.push({ "source": `${d.source}-${d.parenttaxid}`,
                            "target": `${d.target}-${d.taxid}`,
                            "value": +d.value });
        });
        this.maxRange = d3.extent(data, (d)=>{
          return 1 + d.depth / 2
        })
      // return only the distinct / unique nodes
      sankeydata.nodes = Array.from(
          d3.group(sankeydata.nodes, d => d.name),
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

      
      const nodes = graph.nodes;
      const links = graph.links;

      this.graph = {
        nodes: nodes,
        links: links
      }
      const node = svg.selectAll("g")
                    .data(nodes)
                      .join("g")
                      .attr('transform', d => `translate(${d.x0}, ${d.y0})`);  
  
        // Relative to container
        node.append("rect")
            .attr("height", d => d.y1 - d.y0)
            .attr("width", d => d.x1 - d.x0)
            .attr("fill", this.color)
            .attr("id", (d,i) => {
              return `${d.name}.${i}-rect`
            })
            .attr("stroke", "#000")
            .append("title")
              .text(d => `${d.name}\n${format(d.value)}`)
  
        // Relative to container/ node rect
        node.append("text").classed("nodeText", true)
                .attr("font-family", "sans-serif")
                .attr("font-size",9)
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
        node.append("text").classed("nodeText", true)
                .attr("font-family", "sans-serif")
                .attr("font-size",9)
                .attr("dy", "-0.2em")
                .attr("text-anchor", "start")
                .text(d => Math.round((d.value + Number.EPSILON) * 100) / 100); 
        this.hideLabels()
      const link = svg.append("g")
                .attr("fill", "none")
                .attr("stroke-opacity", 0.5)
                .selectAll("g")
                .data(links)
                .join("g")
                .style("mix-blend-mode", "multiply");
      
      link.append("path")
      .attr("class", "link")
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke-width", d => Math.max(1, d.width));
      this.colorLinks()


      // add the link titles
      link.append("title")
            .text(function(d) {
                return d.source.name + " → " + 
                    d.target.name + "\n" + format(d.value); });
      node.attr('cursor', 'move')
          .call(d3.drag()
            .on('start', dragStart)
            .on('drag', dragMove)
            ); 
      
    
    function zoomed(e){
      console.log(e)
      return svg.attr('transform', e.transform);
    }



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
            // console.log(d.x0, d.y0, height, width)
            return `translate(${d.x0}, ${d.y0})`;
        
        }); //.attr('transform', function (d) {
        
        // https://github.com/d3/d3-sankey#sankey_update
        sankey.update({nodes, links});
        link.selectAll(".link").attr('d', sankeyLinkHorizontal());
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