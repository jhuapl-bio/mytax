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
  <v-container  ref="sunburstBox" style="padding-top: 10px; height:500px; width: 97%">
    Sunburst Diagram
    <v-row>
      <v-col  sm="2">
          <v-select
            v-model="selectedAttribute"
            :items="ranks"    
            dense light
            :key="selectedAttribute.name"
            item-text="name"
            item-value="name"
            return-object
            label="Color rank"
          >
            

          </v-select>          
          <v-btn small type="info" @click="resetSunburst()">
            Reset
          </v-btn>
          
      </v-col>
      <v-col  sm="10" class="" ref="containerBox" style="padding-top: 10px; height:500px; width: 97%">
        <div id="sunburstDiv">
        </div>
      </v-col>
    </v-row>
  </v-container> 
</template>

<script>
  import * as d3 from 'd3'


  export default {
    name: 'RunStats',
    props: ["inputdata", "dimensions", "socket"],
    watch: {
      inputdata(
        newValue
      ){
        if (!this.madeFirst){
          this.makeSunburst(newValue)
        } else {
          this.mergeData(newValue)
          
          
          // this.updateSunburst()
        }
      },
      selectedAttribute: {
        deep:true,
        handler(){
          this.updateSunburst()
        }
      },
     
    },  
    computed: {
      
      width(){
        if (this.dimensions.width){
          return this.dimensions.width
        } else {
          return (window.innerWidth ? window.innerWidth : 400)
        }
      },
      height(){
        if (this.dimensions.height){
          return this.dimensions.height
        } else {
          return 900
        }
      }
    },
    data(){
      return {
        test: 0.5,
        taxData: null,
        taxValues: {},
        childrenselected: 0,
        history: {},
        recursedata: null,
        Extent: [],
        ranks: [],
        
        madeFirst: false,
        maxAbu: 100000000,
        minAbu:10e-05,
        resetUpdateChecked: true,
        abuThresholdMin: 0,
        defaultAbuThresholdMin: 10e-5,
        // abuThresholdMin: 10e-5,
        abuThresholdMax: 1,
        defaultAbuThresholdMax: 1,
        ranksizeExtents: {},
        seen: {},
        originalsizeBasis: false,
        scaleModes: [{name: 'totalsize', label: "Total size"}, {
          name: 'originalsize',
          label: "Original size"
        }],
        selected_scaleMode: {name: 'totalsize', label: "Total size"},
        selected_classifier: null,
        rankNames: [],
        fullData: [],
        calculateAbu: true,
        zoomed: null,
        radius: 0,
        maxRanks: 0,
        read_type: null,
        boundsLegendDeviation: {lower: -1, upper: 1},
        boundsDeviation: {},
        firstReady: false,
        tab: 1,

        shown:false,
        fields: [
          {key: 'name', label: 'Name', sortable: true, class: 'text-center'},
          {key: 'taxid', label: 'TaxID', sortable: true, class: 'text-center'},
          {key: 'rank', label: 'Rank', sortable: true, class: 'text-center'},
          {key: 'totalabu', label: 'Reported Abu', sortable: true}
        ],
        filterOn: [],
        sortBy: 'originalsize',


        defaultColor: '#1f77b4',
        selectedAttribute: {name: "S1"},
        colorScalePiechart: d3.schemeCategory10.slice(1),
        colorScaleDeviationPieChart: d3.interpolateRdBu,
        x: null,
        taxes: [],
        y: null,
        arc: null,
        sortDir: {col: null, direction: null},
        middleArcLine: null,
        colorRampPieChart: null,
        colorDeviationPieChart: null,
        root: null,
      }
    },
    methods: {
      mergeData(newData){ 
        this.makeSunburst(newData)
      },
      sort(col) {
        this.sortDir.col = col
        if (!this.sortDir.direction) {
          this.sortDir.direction = 'asc'
        } else {
          this.sortDir.direction = (this.sortDir.direction == "asc" ? 'desc' : 'asc')
        }
        this.sortDir.direction == "asc" ? this.rankNames.sort((a, b) => (a[col] > b[col]) ? 1 : -1) : this.rankNames.sort((a, b) => (a[col] < b[col]) ? 1 : -1)
      },
    


      updateLegendTax() {
        let $this = this
        let emptyColor = d3.schemeCategory10[0];
        this.emptyColor = d3.schemeCategory10[0];
        let selectedAttribute = this.selectedAttribute.name
        const taxValues = this.taxValues
        const defaultColor = this.defaultColor
        const piechartLegendSVG = d3.select("#sunburstSVG")
        piechartLegendSVG.select(".deviationLegend").remove()
        d3.select("#legend_text_label").text("Rank: " + selectedAttribute)
        d3.select("#legend_wrapper").style("overflow-y", "auto").style("overflow-x", "auto")
        piechartLegendSVG.selectAll("g.legendElement").remove()
        var legendElement = piechartLegendSVG.selectAll('g.legendElement')
          .data(taxValues[selectedAttribute], function (d) {
            const abu = (!d3.select("#" + d.arc).empty() ? d3.select("#" + d.arc).data()[0].data.totalsize : 0)
            d.abu = abu
          })
        if (legendElement && legendElement._enter.length > 0) {
          legendElement.exit().remove();
        } else {
          return
        }
        var legendEnter = legendElement.enter()
          .filter(function (d) {
            return d.abu >= $this.abuThresholdMin && d.abu <= $this.abuThresholdMax
          })
          .append('g')
        legendEnter.attr('class', 'legendElement').sort((a, b) => {
          return d3.descending(a.abu, b.abu)
        })
          .on('click', function (d) {
            $this.jumpTo(d.arc)
          })
          .attr("id", (d)=>{
            return "legendElement-"+d.arc
          });

        legendEnter.append('rect')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', 25)
          .attr('height', 25)
          .attr("class", "legendRect")
          .style('fill', defaultColor);

        legendEnter.append('text')
          .attr('x', 35)
          .attr('y', 18)
          .style('font-size', '14px');

        var legendUpdate = legendElement.merge(legendEnter)
          .transition().duration(0)
          .attr('transform', function (d, i) {
            return 'translate(0,' + (i * 30) + ')';
          });
        legendUpdate.selectAll('rect')
          .style('fill', function (d) {
            var ret = defaultColor;
            if (d == '') {
              ret = emptyColor;
            } else if (d) {
              ret = $this.colorRampPieChart(d.label);
            }
            return ret;
          })

        legendUpdate.selectAll('text')
          .text(function (d) {
            var val = d.label
            if (val == '') {
              val = 'No ' + selectedAttribute + ' listed';
            }
            const abu = d.abu
            return val + ' (' + $this.roundNumbers(abu, 6) + ')';
          })
        piechartLegendSVG.attr("height", legendEnter.size() * 30)
      },
      clearSunburst() {
        return new Promise((resolve) => {
          d3.select('#sunburstDiv').html("")
          resolve()
        })
      },
      resetSunburst() {
        this.jumpTo()
        this.zoomed = null
      },
      jumpTo(ele) {
        this.focusOn(d3.select("#" + ele).data()[0])
      },
      fetchArc(arcName, taxid) {
        return arcName + "-" + taxid 
      },
      updateSunburst() {
        const root = this.root
        const $this = this
        const svg = this.svg
        const taxValues = this.taxValues
        const maxRadius = this.maxRadius
        const pieHeight = this.height;
        let selectedAttribute = this.selectedAttribute.name
        const focusOn = this.focusOn
        const arc = this.arc
        const x = this.x
        const y = this.y
        this.taxValues = taxValues
        svg
          .attr('viewBox', `${-maxRadius} ${-pieHeight / 2} ${maxRadius * 2} ${pieHeight}`)

        const radius = this.width / this.maxRanks
        this.radius = radius

        const middleArcLine = d => {
          const halfPi = Math.PI / 2;
          const angles = [x(d.x0) - halfPi, x(d.x1) - halfPi];
          const r = Math.max(0, (y(d.y0) + y(d.y1)) / 2);

          const middleAngle = (angles[1] + angles[0]) / 2;
          const invertDirection = middleAngle > 0 && middleAngle < Math.PI; // On lower quadrants write text ccw
          if (invertDirection) {
            angles.reverse();
          }

          const path = d3.path();
          path.arc(0, 0, r, angles[0], angles[1], invertDirection);
          return path.toString();
        };

        this.middleArcLine = middleArcLine

        let rankNames = [];
        const g = d3.select("#globalg")
        // d3.select("#globalg").html("")
        let minAbu = 0
        
        let filteredData = root.descendants()
          .filter(function (d) {
            const id = $this.fetchArc("sliceMain", d.data.data.taxid, d.data.depth)
            let data = d.data.data
            rankNames.push({
              rank: data.rank_code,
              taxid: data.taxid,
              id: id,
              name: data.target,
              totalabu: data.num_fragments_clade,
              originalsize: data.num_fragments_clade,
              label: data.rank_code + " " + data.target + " " + data.taxid
            })
            d.data.totalabu =  data.num_fragments_clade
            d.data.label = data.rank_code + " " + data.target + " " + data.taxid
            d.data.id = $this.fetchArc("sliceMain", data.taxid, data.depth)
            if (data.totalsize > minAbu){
              minAbu = data.num_fragments_clade
            }
            return true
            // return d.data.totalsize >= $this.abuThresholdMin && d.data.totalsize <= $this.abuThresholdMax
          })
        
        
        this.filteredData = filteredData
        const slice = g.selectAll("g.slice").data(filteredData, (d) => {
          return d.data.data.taxid + "-" + d.data.data.num_fragments_clade
        })
        slice.exit().remove()
        const sliceEnter = slice.enter()
          .append('g').attr('class', 'slice')
          .on('click', function (event, f) {
            event.stopPropagation();
            focusOn(f);
          }).attr("id", (d) => {
            return $this.fetchArc("slice", d.data.data.taxid)
          });
        sliceEnter.append("title").text(function (d) {
          return "Name: " + d.data.data.target + "\nPercent: " + d.data.data.value + "%\nDepth: " + d.data.depth +  "\nTotal reads: " + $this.roundNumbers(d.data.data.num_fragments_clade, 0)  +
             "\nAssigned reads: " + $this.roundNumbers(d.data.data.num_fragments_assigned, 0) + "\nRank: " + d.data.data.rank_code + "\nTaxid: " + d.data.data.taxid
        })
        this.deviation
        sliceEnter.append('path')
          .attr('class', 'hidden-arc')
          .attr('id', (_, i) => {
            return `hiddenArc${i}`
          })
          .attr('d', (d)=>{
            return middleArcLine(d)
          } )
        sliceEnter.append('path')
          .attr('class', 'main-arc')
          
          .attr("id", (d) => {
            const id = $this.fetchArc("sliceMain", d.data.data.taxid, d.data.data.depth)
            return id
          })
          .style('fill', '#ccc')
          .on('mouseover', function (d, f) {
            var currentEl = d3.select($this.fetchArc("#sliceMain", f.data.data.taxid, f.data.data.depth));
            currentEl.style('fill-opacity', 0.5);
          })
          .on('mouseout', function (d,f) {
            var currentEl = d3.select($this.fetchArc("#sliceMain", f.data.data.taxid, f.data.data.depth));
            currentEl.style('fill-opacity', 1);
          });
        this.sort('depth')
      

        this.rankNames = rankNames;
        const minMaxAbu = d3.extent(rankNames, (d) => {
          if (d.totalabu > 0) {
            return d.totalabu
          }
        })
        let colorRampPieChart;
        this.minAbu = minMaxAbu[0]
        if (this.abuThresholdMin < this.minAbu){
          this.abuThresholdMin = this.minAbu
        }
        this.calculateAbu = false;
        if (!taxValues[selectedAttribute]){
          if (Object.keys(taxValues).length > 0){
            
            this.selectedAttribute = this.ranks[0]
            selectedAttribute = this.selectedAttribute.name
          }
          console.log("yes", this.selectedAttribute)
        }
        if (this.selectedAttribute.name != "Deviation") {
          colorRampPieChart = d3.scaleOrdinal(this.colorScalePiechart)
            .domain(taxValues[selectedAttribute].map((d) => {
              
              return d.label
            }));
          
        } else {
          colorRampPieChart = d3.scaleSequential(this.colorScaleDeviationPieChart).domain([1, -1])
        }
        const colorSlice = this.colorSlice


        this.colorRampPieChart = colorRampPieChart;
        // const colorSlice = this.colorSlice
        sliceEnter.selectAll('.main-arc')
          .attr('d', (d)=>{
            return arc(d)
          }) /* I moved this from sliceEnter to sliceUpdate in the hopes of dynamically zooming in */
        d3.selectAll(".main-arc").style('fill', function (d) {
            return colorSlice(d)
          });
        const transition = svg.transition()
          .duration(750)
          .tween('scale', () => {
            const xd = d3.interpolate(x.domain(), [0,1]),
              yd = d3.interpolate(y.domain(), [0, 1]);
            return t => {
              x.domain(xd(t));
              y.domain(yd(t));
            };
          });
        transition.selectAll('path.main-arc')
          .attrTween('d', d => () => {
            return this.arc(d)
          });
        transition.selectAll('path.hidden-arc')
          .attrTween('d', d => () => middleArcLine(d));
        transition.selectAll('text')
          .attrTween('display', d => () => this.textFits(d) ? null : 'none');

        const text = sliceEnter.append('text')
          .attr('display', d => this.textFits(d) ? null : 'none');

        // Add white contour
        text.append('textPath')
          .attr('startOffset', '50%')
          .attr('xlink:href', (_, i) => `#hiddenArc${i}`)
          .text(d => d.data.data.target)
          .style('font-size', '12px')
          .style('fill', 'none')
          .style('stroke', '#fff')
          .style('stroke-width', 4)
          .style('stroke-linejoin', 'round');

        text.append('textPath')
          .attr('startOffset', '50%')
          .attr('xlink:href', (_, i) => `#hiddenArc${i}`)
          .text(d => d.data.data.target)
          .style('font-size', '12px');
        slice.merge(sliceEnter)
          .transition().call(this.standardTransition);
        // const piechartLegendSVG = d3.select('#legend_wrapper').append('svg')
          // .style('width', '100%')
          // .attr("id", "sunburstSVG")
        selectedAttribute != "Deviation" ? this.updateLegendTax() : this.updateLegendDeviation();

        d3.zoom()
          .scaleExtent([1, 8])
          .on("zoom", zoomed);
        function zoomed() {
          const {transform} = d3.event;
          g.attr("transform", transform);
          g.attr("stroke-width", 1 / transform.k);
        }
      },
      async makeSunburst(data) { //https://observablehq.com/@d3/zoomable-sunburst  && Tom Mehoke (JHUAPL) && Brian Merritt (JHUAPL) references for Sunburst Code
        d3.select("#sunburstDiv").select("svg").remove()
        d3.select("#legend_wrapper").html("")
        const pieHeight = this.height;
        const maxRadius = Math.round(pieHeight / 2);
        this.maxRadius = maxRadius
        let svg = d3.select("#sunburstDiv").append('svg')
          .style('max-width', maxRadius * 2)
          .style('max-height', this.height)
          .attr('id', 'sunburst');
        this.svg = svg
        d3.selectAll(".slice").remove()
        d3.selectAll(".legendElement").remove()
        d3.select("#sunburstDiv").style("width", maxRadius * 2)
        svg.append("g").attr('id', "globalg")
        const $this = this;
        setTimeout(()=>{ 
          $this.startSunburst(data);
          this.selectedAttribute =  {name: "S1"};
          this.madeFirst = true
        }, 100)
        
        
      },
      startSunburst(data){
        // const $this = this
        this.childrenSelected = 0;
        let vData = d3.stratify()
          .id(d => d.taxid)
          .parentId(d => d.parenttaxid)(data);
        const taxValues = {}
        data.map((f)=>{
          if (!taxValues[f.rank_code]){
            taxValues[f.rank_code]  = []
          }
          if (taxValues[f.rank_code].indexOf(f.target) == -1){
            taxValues[f.rank_code].push({label: f.target })
          }
        })
        this.taxValues  = taxValues
        const root = this.partition(vData);
        this.root = root;
        this.minAbu = this.defaultAbuThresholdMin
        this.maxAbu = this.defaultAbuThresholdMax


        this.ranks = []
        const $this = this
        // let yt = 0
        let maxDepth = 0
        let partDepths = {}
        root.each((d => {
          // yt += d.data.size
          d.data.depth > this.maxRanks ? this.maxRanks = d.data.depth : '';
          if (!partDepths[d.data.depth]) {
            partDepths[d.data.depth] = []
          }
          partDepths[d.data.depth].push(d)
          if (d.data.depth > maxDepth) {
            maxDepth = d.data.depth
          }
        }))
        let extent = d3.extent(root, (d)=>{
          return d.data.data.size
        })
        for (let i = maxDepth; i > 0; i--) {
          partDepths[i].forEach((d) => {
            
            !taxValues[d.data.data.rank_code] ? (taxValues[d.data.data.rank_code] = [],  this.childrenSelected += 1) : '';
            taxValues[d.data.data.rank_code].map(function (e) {
              let idx  = $this.ranks.findIndex((f)=>{
                return f.name == d.data.data.rank_code
              })
              if (idx == -1){
                $this.ranks.push({name: d.data.data.rank_code})
              }
              return e.label;
            }).indexOf(d.data.data.target) == -1 && d.data.data.totalsize > 0
              ? taxValues[d.data.data.rank_code].push({
                label: d.data.data.target,
                arc: $this.fetchArc("sliceMain", d.data.data.taxid, d.data.depth, d.data.data.target)
              }) : '';
          })
        }
        const x = d3.scaleLinear()
          .range([0, 2 * Math.PI])
          .clamp(true);
        this.x = x
        const maxRadius = this.maxRadius
        const y = d3.scaleSqrt()
          .range([maxRadius * .05, maxRadius]);
        this.y = y
        const arc = d3.arc()
          .startAngle(d => x(d.x0))
          .endAngle(d => x(d.x1))
          .innerRadius(d => Math.max(0, y(d.y0)))
          .outerRadius(d => Math.max(0, y(d.y1)));
        
        
        
        
        
        this.arc = arc

        this.updateSunburst()
        this.Extent = extent
        // data = null
        this.firstReady = true;
      },
      roundNumbers(value, to) {
        return parseFloat(value).toFixed(to)
      },
      colorSlice(d) {
        const colorRampPieChart = this.colorRampPieChart
        let selectedAttribute = this.selectedAttribute.name
        const defaultColor = this.defaultColor
        var e = d, ret = defaultColor;
        if (selectedAttribute != "Deviation") {
          if (e !== null) {
            if (e.data.data.taxid > 0) {
              if (e.data.data.rank_code == selectedAttribute) {
                ret = colorRampPieChart(d.data.data.target);
              } else {
                let end = false
                let parent = d.parent
                while (parent.depth > 0 && end == false) {
                  if (parent.data.data.rank_code == selectedAttribute) {
                    ret = colorRampPieChart(parent.data.data.target);
                    end = true;
                  }
                  parent = parent.parent
                }
              }
            }
          }
        } else {
          colorRampPieChart.domain(this.boundsDeviation[e.data.rank])
          ret = colorRampPieChart(e.data.data.totalsize - e.data.data.originalsize)
        }
        return ret;
      },

      standardTransition(transition) {
        transition
          .duration(5000)
          .ease(d3.easeLinear);
      },
      partition(data) {
        const root = d3.hierarchy(data)
        const $this = this
        this.seen = {}
        root.sum(function (f) {
        //   d.taxid = parseInt(d.taxid)
          let d = f.data //Fix this!
          d.taxid = parseInt(d.taxid)
          
          if ($this.taxes.findIndex(x => x.rank_code === d.rank_code) == -1) {
            $this.taxes.push({name: d.rank_code})
          }
          if (f.children && f.children.length > 0){
            // d.size =  d.num_fragments_assigned
            d.size = null
            let total= 0
            f.children.forEach((y)=>{
              let g = y.data
              
              total += (y.children && y.children.length > 0 ? g.num_fragments_clade : g.num_fragments_clade )
            })
            // f.sum((g)=>{
            //   total += (g.children && g.children.length > 0 ? g.num_fragments_assigned : g.num_fragments_clade )
            // })
            d.size = d.num_fragments_clade - total
          } else {
            d.size = d.num_fragments_clade
          }
          
          d.totalsize = d.size
          d.originalsize = 0
          $this.seen[d.taxid] = 1
          // if (d.taxid < 2){
            
          // }
          // console.log(d.taxid, d.depth, d.size, d.num_fragments_clade)
          return d.size
        })
        root.sort((a, b) => b.taxid - a.taxid);
        

        return d3.partition()(root)
      },
      textFits(d) {
        const x = this.x;
        const y = this.y;
        const CHAR_SPACE = 8;
        const deltaAngle = x(d.x1) - x(d.x0);
        const r = Math.max(0, (y(d.y0) + y(d.y1)) / 2);
        const perimeter = r * deltaAngle;
        return d.data.data.target.length * CHAR_SPACE < perimeter;
      },
      focusOn(d = {x0: 0, x1: 1, y0: 0, y1: 1}) {
        // Reset to top-level if no data point specified
        const x = this.x
        const y = this.y
        const svg = this.svg
        const middleArcLine = this.middleArcLine
        const transition = svg.transition()
          .duration(750)
          .tween('scale', () => {
            const xd = d3.interpolate(x.domain(), [d.x0, d.x1]),
              yd = d3.interpolate(y.domain(), [d.y0, 1]);
            return t => {
              x.domain(xd(t));
              y.domain(yd(t));
            };
          });
        transition.selectAll('path.main-arc')
          .attrTween('d', d => () => {
            return this.arc(d)
          });
        transition.selectAll('path.hidden-arc')
          .attrTween('d', d => () => middleArcLine(d));
        transition.selectAll('text')
          .attrTween('display', d => () => this.textFits(d) ? null : 'none');
        this.moveStackToFront(d);
      },
      moveStackToFront(elD) {
        const moveStackToFront = this.moveStackToFront
        this.svg.selectAll('.slice').filter(d => d === elD)
          .each(function (d) {
            this.parentNode.appendChild(this);
            if (d.parent) {
              moveStackToFront(d.parent);
            }
          }) 
      }
    },
    async mounted() {
      if (this.inputdata)
      {
        this.makeSunburst(this.inputdata)

      }
    }, 
    
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