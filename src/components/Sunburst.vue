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
  <v-container  style="padding-top: 10px; max-height:1000px; width: 97%">
    <v-row>
      <v-col  :sm="(legendPlacement == 'bottom' ? 12 : 8)" class="mb-0; pb-0"  style="padding-top: 10px; padding-bottom: 100px; ; max-height:1000px; width: 97%">
        <div :id="`sunburstDiv-${samplename}`">
        </div>
      </v-col>
      <v-col  :sm="(legendPlacement == 'bottom' ? 12 : 4)" class="mt-0; pt-0 text-center">
        
        <div :id="`legend_text-${samplename}`" style="margin:auto;  padding-bottom: 10px">
          <h5>Legend</h5>
          <span :id="`legend_text_label-${samplename}`" style="text-align:center; "/>
          <div v-if="selectedAttribute =='Deviation'" class="alert alert-info">
            <span>Color is Relative to +/- Max Abundance at a Given Rank</span>
          </div>
        </div>
        <div :id="`legend_wrapper-${samplename}` "
              style="position:relative; background: none; padding-bottom: 100px; background-opacity: 0.5; width: 100%; height: 200px; overflow-y:auto;overflow-x:auto">
        </div>  
      </v-col>
      
    </v-row>
  </v-container> 
</template>

<script>
  import * as d3 from 'd3'


  export default {
    name: 'RunStats',
    props: ["inputdata", "dimensions", 'full', "taxa",  "socket", 'samplename', 'selectedTaxid', 'selectedAttribute', 'legendPlacement'],
    watch: {
      full(){
        if (this.madeFirst){
          this.updateColors()
          if (this.inputdata){
            this.updateLegendTax()
          }
        }
      },
      
      selectedTaxid(val){
        let ele = d3.select("#sunburstDiv-"+this.samplename).select(this.fetchArc("#sliceMain", val))
        let data = ele.data()[0]
        this.$emit("changeAttribute", data.data.data.rank_code)
        this.focusOn(data)  
        if (this.madeFirst){
          this.updateColors()     
          this.updateLegendTax()
        }
      },
      inputdata(
        newValue
      ){
        if (!this.madeFirst){
          this.makeSunburst(newValue)
        } else {
          this.mergeData(newValue)
        }
      },
      selectedAttribute: {
        deep:true,
        handler(){
          if (this.inputdata){
            this.getTaxValues()
            this.updateColors()
            this.updateLegendTax()
          }
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
        taxValues: [],
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
        childrenTaxes: [],
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
      getTaxValues(){
        let taxValues = []
        this.inputdata.map((f)=>{
          if (taxValues.indexOf(f.target) == -1 && f.rank_code == this.selectedAttribute){
            taxValues.push({label: f.target, taxid: f.taxid , rank_code: f.rank_code, abu: f.value })
          }
        })
        return taxValues
      },
      mergeData(newData){ 
        let maxDepth = d3.max(newData, (f)=>{
          return f.depth
        })
        if (maxDepth !== this.maxDepth){
          // this.maxDepth = maxDepth
          // this.makeSunburst(newData)
          let data = this.stratify(newData)
          this.root = this.partition(data)
          this.updateSunburst(this.root)

        } else {
          let data = this.stratify(newData)
          this.root = this.partition(data)
          this.updateSunburst(this.root)
        }
      },
      updateLegendTax() {
        let $this = this
        let emptyColor = d3.schemeCategory10[0];
        this.emptyColor = d3.schemeCategory10[0];
        let selectedAttribute = this.selectedAttribute
        const defaultColor = this.defaultColor
        let taxValues = this.getTaxValues()
        // const taxValues = this.taxValues 
        const piechartLegendSVG = d3.select("#legendSVG-"+this.samplename)
        
        let legend_wrapper = d3.select(`#legend_wrapper-${this.samplename}`)
        let legend_text_label = d3.select(`#legend_text_label-${this.samplename}`)
        legend_text_label.text("Rank: " + selectedAttribute)
        legend_text_label.text("Sample: " + this.samplename)
        legend_wrapper.style("overflow-y", "auto").style("overflow-x", "auto")
        piechartLegendSVG.selectAll(".legendElement").remove()
        let childrenTaxes = this.childrenTaxes
        var legendElement ;
        let full = this.full
        if ( ( !full  ) ){
          let filtered_taxa = childrenTaxes.filter((f)=>{
            return this.taxa.indexOf(f.label) > -1
          })
          if (filtered_taxa.length == 0){
            legendElement = piechartLegendSVG.selectAll('g.legendElement')
            .data(taxValues)
          } else {
            legendElement = piechartLegendSVG.selectAll('g.legendElement')
            .data(filtered_taxa)
          }

        } else {
          legendElement = piechartLegendSVG.selectAll('g.legendElement')
          .data(taxValues)
        }

        if (legendElement && legendElement._enter.length > 0) {
          legendElement.exit().remove();
        } 
        var legendEnter = legendElement.enter()
          .append('g')
        
        legendEnter.attr('class', 'legendElement').sort((a, b) => {
          return d3.descending(a.abu, b.abu)
        })
          .on('click', function (d, f) {
            $this.jumpTo(f.taxid, f.rank_code)
          })
          .attr("id", (d)=>{

            return "legendElement-"+$this.samplename+d.taxid
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
            return val + ' (' + $this.roundNumbers(abu, 3) + ' %), taxid: '+d.taxid;
          })
        piechartLegendSVG.attr("height", legendEnter.size() * 30)
      },
      updateColors(){
        let svg = this.svg
        let colorRampPieChart = d3.scaleOrdinal(this.colorScalePiechart)
          .domain(this.taxa);
        this.colorRampPieChart = colorRampPieChart;
        const colorSlice = this.colorSlice
        if (svg){
          svg.selectAll(".main-arc").style('fill', function (d) {
            return colorSlice(d)
          });
        }
        
        
      },
      clearSunburst() {
        return new Promise((resolve) => {
          d3.select('#sunburstDiv-'+this.samplename).html("")
          resolve()
        })
      },
      resetSunburst() {
        this.jumpTo(-1, "base")
        this.zoomed = null
      },
      jumpTo(ele, rank) {
        this.$emit("jumpTo", ele, rank)
      },
      fetchArc(arcName, taxid) {
        return arcName + "-" + this.samplename + "-" + taxid 
      },
      updateSunburst(root) {
        const $this = this
        const svg = this.svg
        // const taxValues = this.taxValues
        const maxRadius = this.maxRadius
        const pieHeight = this.height;
        // const focusOn = this.focusOn
        const x = this.x
        const y = this.y
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
        const g = svg.select(".globalg")
        let minAbu = 0
        let filteredData = root.descendants()
          .filter(function (d) {
            const id = $this.fetchArc("sliceMain", d.data.data.taxid)
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
          })
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
          .attrTween('d', (d) => {
            middleArcLine(d)
          });
        transition.selectAll('text')
          .attrTween('display', d => () => $this.textFits(d) ? null : 'none');
        // this.filteredData = filteredData
        const arc = this.arc
        let alreadyseen = {}
        const colorSlice = this.colorSlice
        g.selectAll("g.slice").data(filteredData, (d) => {
          if (!alreadyseen[d.data.label]){
            alreadyseen[d.data.label] = d
          } else {
            alreadyseen[d.data.label].x0 = d.x0
            alreadyseen[d.data.label].y0 = d.y0
            alreadyseen[d.data.label].x1 = d.x1 
            alreadyseen[d.data.label].y1 = d.y1 
          }
          return d.data.label 
        }).join(
            function(enter){
              let returnable = enter.append('g').attr('class', 'slice')
              .on('click', function (event, f) {
                event.stopPropagation();
                $this.$emit("jumpTo", f.data.data.taxid, f.data.data.rank_code)
              }).attr("id", (d) => {
                return $this.fetchArc("slice", d.data.data.taxid)
              });

              returnable.append("title").text(function (d) {
                return "Sample: " + $this.samplename + "\nName: " + d.data.data.target + "\nPercent: " + d.data.data.value + "%\nDepth: " + d.data.depth +  "\nTotal reads: " + $this.roundNumbers(d.data.data.num_fragments_clade, 0)  +
                  "\nAssigned reads: " + $this.roundNumbers(d.data.data.num_fragments_assigned, 0) + "\nRank: " + d.data.data.rank_code + "\nTaxid: " + d.data.data.taxid
              })
              returnable.append('path')
                .attr('class', 'hidden-arc')
                .attr('id', (_) => {
                  return `hiddenArc${_.data.data.taxid}-${$this.samplename}`
                })
                .attr('d', (d)=>{
                  return middleArcLine(d)
              } )

              returnable.append('path')
                .attr('class', 'main-arc')
                .style('fill', function (d) {
                  return colorSlice(d)
                })
                .attr('d', (d)=>{
                  return arc(d)
                })
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


                 
               
              return returnable
            },
            function(update){
              update
                .selectAll(".main-arc").each((d)=>{
                  d.x0 = alreadyseen[d.data.label].x0
                  d.x1 = alreadyseen[d.data.label].x1
                  d.y0 = alreadyseen[d.data.label].y0
                  d.y1 = alreadyseen[d.data.label].y1
                  }).style('fill', function (d) {
                    return colorSlice(d)
                  }).transition().call($this.standardTransition);
              update.selectAll(".hidden-arc").attr('d', (d)=>{
                  d.x0 = alreadyseen[d.data.label].x0
                  d.x1 = alreadyseen[d.data.label].x1
                  d.y0 = alreadyseen[d.data.label].y0
                  d.y1 = alreadyseen[d.data.label].y1
                  return middleArcLine(d)
              })              
              return update
            },
            function(exit){
              return exit.remove()
            }
        )
        svg.selectAll(".textfull").remove()
        let slices = svg.selectAll(".slice")
        let text = slices.append('text').classed("textfull",true)
              .attr('display', (d) => { return $this.textFits(d) ? null : 'none' } );
              // Add white contour
              text.append('textPath').classed("whitecontour",true)
                .attr('startOffset', '50%')
                .attr('xlink:href', (_) => `#hiddenArc${_.data.data.taxid}-${$this.samplename}`)
                .text(d => d.data.data.target)
                .style('font-size', '12px')
                .style('fill', 'none')
                .style('stroke', '#fff')
                .style('stroke-width', 4)
                .style('stroke-linejoin', 'round');

              text.append('textPath').classed("hiddentext",true)
                .attr('startOffset', '50%')
                .attr('xlink:href', (_) => `#hiddenArc${_.data.data.taxid}-${$this.samplename}`)
                .text(d => d.data.data.target)
                .style('font-size', '12px');   

        d3.zoom()
          .scaleExtent([1, 8])
          .on("zoom", zoomed);
        function zoomed() {
          const {transform} = d3.event;
          g.attr("transform", transform);
          g.attr("stroke-width", 1 / transform.k);
        }
        this.updateColors()
        this.updateLegendTax()
      },
        
      async makeSunburst(data) { //https://observablehq.com/@d3/zoomable-sunburst  && Tom Mehoke (JHUAPL) && Brian Merritt (JHUAPL) references for Sunburst Code
        let div = d3.select("#sunburstDiv-"+this.samplename)
        let legend_wrapper = d3.select(`#legend_wrapper-${this.samplename}`)
        div.select("svg").remove()
        div.select("#legendSVG-"+this.samplename).remove()
        legend_wrapper.html("")
        legend_wrapper.append('svg').attr("id", "legendSVG-"+this.samplename)
        const pieHeight = this.height;
        const maxRadius = Math.round(pieHeight / 2);
        this.maxRadius = maxRadius
        let svg = div.append('svg')
          .style('max-width', maxRadius * 2)
          .style('max-height', this.height)
          .attr('id', "sunburst-"+this.samplename);
        this.svg = svg
        svg.selectAll(".slice").remove()
        svg.selectAll(".legendElement").remove()
        div.style("width", maxRadius * 2)
        svg.append("g").attr('class', "globalg")
        const $this = this;
        setTimeout(()=>{ 
          $this.startSunburst(data);
          // this.selectedAttribute =  {name: "S1"};
          this.madeFirst = true
        }, 100)
        
        
      },
      stratify(data){
        return d3.stratify()
          .id(d => d.taxid)
          .parentId(d => d.parenttaxid)(data);
      },
      startSunburst(data){
        // const $this = this
        this.childrenSelected = 0;
        let vData = this.stratify(data)
        let taxValues = []
        this.taxValues = []
        this.taxValues  = taxValues
        const root = this.partition(vData);
        this.minAbu = this.defaultAbuThresholdMin
        this.maxAbu = this.defaultAbuThresholdMax
        

        this.ranks = []
        const x = d3.scaleLinear()
          .range([0, 2 * Math.PI])
          .clamp(true);
        this.x = x
        const maxRadius = this.maxRadius
        const y = d3.scaleSqrt()
          .range([maxRadius * .05, maxRadius]);
        this.y = y
        
        this.updateColors()
        this.updateSunburst(root)
        this.firstReady = true;
      },
      roundNumbers(value, to) {
        return parseFloat(value).toFixed(to)
      },
      colorSlice(d) {
        const colorRampPieChart = this.colorRampPieChart
        let selectedAttribute = this.selectedAttribute
        const defaultColor = this.defaultColor
        var e = d, ret = defaultColor;
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
        
        return ret
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
        let maxDepth = 0
        let taxValues = []
        let partDepths = {}
        this.taxValues = this.getTaxValues()
        root.sum(function (f) {
          let d = f.data //Fix this!
          d.taxid = parseInt(d.taxid)
          if ($this.taxes.findIndex(x => x.rank_code === d.rank_code) == -1) {
            $this.taxes.push({name: d.rank_code})
          }
          if (f.children && f.children.length > 0){
            d.size = null
            let total= 0
            f.children.forEach((y)=>{
              let g = y.data
              
              total += (y.children && y.children.length > 0 ? g.num_fragments_clade : g.num_fragments_clade )
            })
            d.size = d.num_fragments_clade - total
          } else {
            d.size = d.num_fragments_clade
          }
          
          d.totalsize = d.size
          d.originalsize = 0
          $this.seen[d.taxid] = 1
          return d.size
        })
        root.sort((a, b) => b.taxid - a.taxid);
        root.each((d => {
          d.data.depth > this.maxRanks ? this.maxRanks = d.data.depth : '';
          if (!partDepths[d.depth]) {
            partDepths[d.depth] = []
          }
          partDepths[d.depth].push(d)
          if (d.depth > maxDepth) {
            maxDepth = d.depth
          }
        }))
        let extent = d3.extent(root, (d)=>{
          return d.data.data.size
        })
        this.Extent = extent
        this.taxValues = []
        // for (let i = maxDepth; i > 0; i--) {
          // partDepths[i].forEach((d) => {
            // !taxValues ? (taxValues = [],  this.childrenSelected += 1) : '';
            // taxValues.map(function (e) {
            //   let idx  = $this.ranks.findIndex((f)=>{
            //     return f.name == d.data.data.rank_code
            //   })
            //   if (idx == -1){
            //     $this.ranks.push({name: d.data.data.rank_code})
            //   }
            //   return e.label;
            // }).indexOf(d.data.data.target) == -1 && d.data.data.totalsize > 0
            //   ? taxValues.push({
            //     label: d.data.data.target,
            //     arc: $this.fetchArc("sliceMain", d.data.data.taxid, d.data.depth, d.data.data.target)
            //   }) : '';
        //   })
        // }
        const arc = d3.arc()
          .startAngle(d => this.x(d.x0))
          .endAngle(d => this.x(d.x1))
          .innerRadius(d => Math.max(0, this.y(d.y0)))
          .outerRadius(d => Math.max(0, this.y(d.y1)));
        this.arc = arc

        this.maxDepth = maxDepth
        this.taxValues = taxValues
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
        this.setChildren(d)
      },
      setChildren(el){
        let taxes = []
        if (el.children){
          let ranks = el.children.map((f)=>{
            taxes.push({
              abu: f.data.data.value,
              rank_code: f.data.data.rank_code,
              label: f.data.data.target,
              taxid: f.data.data.taxid
            })
            return f.data.data.rank_code
          })
          this.childrenTaxes = taxes
          this.$emit("changeAttribute", ranks[0])
        } else {
          this.childrenTaxes = []
        }
        
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