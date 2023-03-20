<template>
  <v-container :ref="'boxContainer'">
    <v-toolbar-title>
        Top Taxa Calls Per Sample
    </v-toolbar-title>
    <v-row >
        <v-col sm="12">
          <div style="display:flex">
            <v-text-field
              hint="Maximum Taxa Seen per sample"
              v-model="top_n"
              persistent-hint  outlined
              single-line dense
              type="number"
              min=1
            ></v-text-field>
            <v-spacer></v-spacer>
            <v-select  
                v-model="groupon" solo
                :items="grouponSelections"
                item-value="value"
                item-text="name"
                hint="Select Group By Value"
                single-line return-object
                persistent-hint
            ></v-select>
            <v-select  
                v-model="valueAttr" solo
                :items="valueAttrSelections"
                item-value="value"
                item-text="name"
                hint="Choose Cell Values"
                single-line return-object
                persistent-hint
            ></v-select>
          </div>
          <div :id="`platesDiv`"  class=""
            style="position:relative; background: none; padding-bottom: 0px; background-opacity: 0.5; width: 100%; overflow-y:auto;overflow-x:auto"
            >
          </div>
        </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import * as d3 from 'd3'
// 
  export default {
    name: 'Plates',
    props: ["inputdata",  "socket", 'samplenames', 'selectedTaxid', 'selectedAttribute',  'legendPlacement', 'selectedNameAttr'],
    watch: {
      groupon(newval){
        this.makePlot()
      },
      valueAttr(newval){
        this.makePlot()
      },
      selectedAttribute(val){
        if (val){
          this.makePlot()
        }
      },
      selectedNameAttr(val){
        this.makePlot()
      },
      top_n(){
        this.makePlot()
      },
      samplenames(val){
        if (val){
          this.makePlot()
        }
      },
      inputdata: {
        deep:true,
        handler(data){
          if (data){
            this.makePlot()
          }
        }
      },
    },
    data: () => ({
      width: 500,
      valueAttr: {
          value: 'num_fragments_clade_fraction',
          name: 'Percent of entire report for clade'
        },
      valueAttrSelections: [
        {
          value: 'value',
          name: 'Relative Percent at Rank'
        },
        {
          value: 'num_fragments_assigned_fraction',
          name: 'Percent of entire report for specific taxa'
        },
        {
          value: 'num_fragments_clade_fraction',
          name: 'Percent of entire report for clade'
        },
        {
          value: 'num_fragments_clade',
          name: 'Raw Framents Assigned to clade'
        },
        {
          value: 'num_fragments_assigned',
          name: 'Raw Fragments Assigned Specific Taxa'
        },
      ],
      groupon: {
          value: 'target',
          name: 'Taxonomic Name'
      }, 
      grouponSelections: [
        {
          value: 'target',
          name: 'Taxonomic Name'
        },
        {
          value: 'taxid',
          name: 'Taxid'
        },
        {
          value: 'source',
          name: "Parent Tax Name"
        }
      ],
      parseddata: {},
      fullsize: {},
      height: 500,
      top_n: 11,
      dimensions: {
        windowHeight:0,
        windowWidth: 0,
        height: 0,
        width: 0,
      },

    }),
    methods: {
      getText(d){
        const $this = this
        
        return ($this.selectedNameAttr ? ( $this.selectedNameAttr == 'default (scientific name)' ? 
          d.target : ( d.objfull && d.objfull[$this.selectedNameAttr] && d.objfull[$this.selectedNameAttr].length >0 ? 
            d.objfull[$this.selectedNameAttr][0] : d.target )   ) 
          : d.target )

      },
      makePlot(){
        let div = d3.selectAll("#platesDiv")
        d3.selectAll("#svgPlates").remove()
        d3.selectAll("#svgLegend").remove()
        let samplenames = Object.keys(this.inputdata)
        
        let tops = []
        for (let [samplename, sample] of Object.entries(this.inputdata)){
          if (sample){
            let data = sample.filter((f)=>{
              return f.rank_code == this.selectedAttribute
            })
            this.fullsize[samplename] = d3.sum(sample,(d)=>{
                return d.num_fragments_assigned
            })
            
            
            let testdata = d3.rollups(data, v => 
              d3.sum(v, (d) => { 
                d.num_fragments_assigned_fraction = (d.num_fragments_assigned / this.fullsize[samplename] )
                d.num_fragments_clade_fraction = (d.num_fragments_clade / this.fullsize[samplename] )
                return d[this.valueAttr.value]
              }), 
                (d) => {
                  
                  return this.groupon.value == 'taxid' ? `${d.target}-${d.source} (${d[this.groupon.value]})` : d[this.groupon.value]   
                }
            )
            let sorted = testdata.sort((a, b) => b[1] - a[1])
            let top_n = this.top_n
            this.parseddata[samplename] = sorted
            if (sorted.length  > 0){
              for (let i = 0; i < top_n; i++){
                if (i < sorted.length){
                  tops.push({
                    name: samplename, 
                    top: sorted[i][0],
                    abu: sorted[i][1]
                  })
                } 
              }
       
            } else {
              // tops.push({
              //   name: samplename,
              //   top: "Nothing",
              //   abu: 0
              // })
            }            
          }
        }
        const $this = this
        let attribute = 'target'
        if (this.selectedNameAttr && !this.selectedNameAttr == 'default (scientific name)'){
          attribute = this.selectedNameAttr
        }
        let seentaxids = {}
        let unique_taxids = [ ... new Set(tops.filter((f)=>{
          return f.top  !== 'Nothing'
        }).map((f)=>{
          if (f.top && f.top !== -1){
            
            seentaxids[f.top] = `${this.getText(f.top)}`
            
            return f.top
          }
        }))]
        let scalesHeatmap = {}
        for (let [samplename, sampledata] of Object.entries(this.parseddata)   ){
          if (samplename ){
            var colorScaleHeatmap = d3.scaleLinear().range(["#5ff4ff", "#c42bd4"])
            .domain(d3.extent(sampledata, (f)=>{
              return f[1]
            }));
            scalesHeatmap[samplename] = colorScaleHeatmap
          }
        }


        var element = div.node();
        this.width = element.getBoundingClientRect().width;
        // this.height = element.getBoundingClientRect().height;
        function wrap(text, width) {
          text.each(function() {
            
            var text = d3.select(this),
                words = text.text().split(/\s+/).reverse(),
                word,
                line = [],
                lineNumber = 0,
                lineHeight = 1.1, // ems
                y = text.attr("y"),
                dy = parseFloat(text.attr("dy")),
                tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em")
            
            while (word = words.pop()) {
              line.push(word)
              tspan.text(line.join(" "))
              if (tspan.node().getComputedTextLength() > width) {
                line.pop()
                tspan.text(line.join(" "))
                line = [word]
                tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", `${++lineNumber * lineHeight + dy}em`).text(word)
              }
            }
          })
        }
        this.boxHeight = ( 40 ) 
        var margin = {top: 50, right: 30, bottom: 100, left: 150}
        // this.boxHeight = ( (this.height - this.margin.bottom - this.margin.top) / samplenames.length )
        this.height = this.boxHeight*samplenames.length + margin.top + this.boxHeight *1.5
        d3.select(`#platesDiv`).style("height", `${this.height} px`)  
        
        var width = this.width - margin.left - margin.right,
              height = this.height - margin.top - margin.bottom;  
        
        this.margin = margin
              
        this.boxWidth = ( (width - this.margin.left - this.margin.right) / unique_taxids.length )
        let zoom = d3.zoom()
				.scaleExtent([1, 3])
        .translateExtent([[0-this.margin.left, 0-this.margin.top - this.boxHeight/2],[this.width, this.height]])
				.on("zoom", zoomed);
        function zoomed(e){
          return svg.attr('transform', e.transform);
        }
        
        
        var svg = div.append('svg').attr("id", "svgPlates")
              .attr("width", "100%")
              .attr("preserveAspectRatio", "xMinYMin meet")
              .attr("viewBox", `0 0 ${this.width} ${height + margin.top + margin.bottom}`)
              .classed("svg-content", true)
              .style("cursor", "pointer")
              .call(zoom)
              // .append("g")
              
              .append("g")
              .attr("transform", 
                    "translate(" + margin.left + "," + margin.top + ")");
        
        var taxidScale = d3.scaleOrdinal().domain([]).range(unique_taxids.map((_,i)=>{
          return ((i) * this.boxWidth ) + this.margin.left - this.margin.right
        }))
        var sampleScale = d3.scaleOrdinal().domain(samplenames).range(samplenames.map((_,i)=>{
          return ((i) * this.boxHeight ) + this.margin.top - this.margin.bottom
        }))
        const node = svg.selectAll("g.nodestop2")
                        .data(tops)
                        .join("g").attr("class", "nodestop2")
                        .attr('transform', (d) => {
                          return `translate(${taxidScale(d.top)}, ${sampleScale(d.name)})`
                        });  



        
        
        
        
        node.append("rect") 
          .attr("width", this.boxWidth) 
          .attr("height", this.boxHeight)
          .style("fill", (d)=>{
            return  d.abu ? scalesHeatmap[d.name](`${d.abu}`) : 'white'
          })
        node.append("text").classed("nodeText", true)
                .attr("font-family", "sans-serif")
                .attr("font-size",'0.75em')
                .attr("x", this.boxWidth/2) // +/- 6 pixels relative to container
                .attr("y", () => {
                  return this.boxHeight/2
                }) // middle of node
                .attr("dominant-baseline", "middle") 
                .attr("text-anchor", "middle")
                .text((d) => {
                  
                  return d.abu ? 
                    this.valueAttr.value != 'num_fragments_clade' && this.valueAttr.value != 'num_fragments_assigned' ? 
                      `${d.abu.toFixed(2)}%` : `${d.abu}` 
                    : ''
                })
        // Add scales to axis
        var x_axis = d3.axisBottom()
                      .scale(taxidScale)
                      .tickFormat((d,i) => { 
                        return d
                      });
                      
        //Append group and insert axis
        
        let sizes = {}
        let sizesY = {}
        let x = svg
          .append("g")
          .attr("transform", 
                    "translate(" + this.boxWidth/2 + "," + (this.height-this.margin.bottom-this.margin.top) + ")")
          .attr("class", "xAxisPlate").style("font-size", '1px')
          .call(x_axis)
        x.selectAll('text').style("font-size", 22)
          .style("overflow", "auto")
            .attr("transform", "rotate(0)")
            .style("text-anchor", "center")
            
          
        x.selectAll(".tick text")
          .call(wrap, $this.margin.top)
          
            
        x.selectAll('text')
          .style("font-size", '1px')
          .each(getSizeX)
          .attr("dy", "0")
          .style("font-size", function(d) {  return sizesY[d] + "px"; })
            
            
        
        // Add scales to axis
        var y_axis = d3.axisLeft()
                      .scale(sampleScale);
        let y = svg
          .append("g")
          .attr("transform", 
                    "translate(" + this.margin.left/2 + "," +this.boxHeight / 2 + ")")
          .attr("class", "yAxis")
          .style("font-size", '1px')
          .call(y_axis);
          
          y.selectAll('text') // select all the text elements 
          .style("font-size", '1px')
          .each(getSizeY)
          .style("font-size", function(d) {  return sizes[d] + "px"; });
          
          function getSizeY(d) {
            var bbox = this.getBBox(),
              cbbox = $this.margin.left + ($this.margin.left/2),
              scale = Math.min(cbbox/bbox.width/2, $this.boxWidth);
            sizes[d] = scale
            return d
          }
          function getSizeX(d) {
            
            var bbox = this.getBBox(),
              cbbox = $this.margin.bottom - $this.margin.top,
              scale = Math.min(cbbox/bbox.height, $this.height, $this.boxWidth/2/bbox.width);
            sizesY[d] = scale
            return d
          }
      }
    },
    mounted(){
      // this.dimensions.windowHeight = window.innerHeightf
      // this.dimensions.windowWidth = window.innerWidth
      // this.dimensions.height = this.$refs.boxContainer.clientHeight*2
      // this.dimensions.width = this.$refs.boxContainer.clientWidth*0.6
      if (this.inputdata){
        this.makePlot()
      }
      
    }
  }
</script>
