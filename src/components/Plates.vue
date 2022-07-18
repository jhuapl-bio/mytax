<template>
  <v-container>
    <v-toolbar-title>
        Top Hits Per Sample
    </v-toolbar-title>
    <v-row >
        <v-col sm="12">
          <div :id="`platesDiv`" 
            style="position:relative; background: none; padding-bottom: 100px; background-opacity: 0.5; width: 100%; height: 500px; overflow-y:auto;overflow-x:auto"
            >
          </div>
        </v-col>
        <!-- <v-col
          sm="3"
        >
          <div :id="`platesLegend`" 
            style="position:relative; background: none; padding-bottom: 100px; background-opacity: 0.5; width: 100%; height: 500px; overflow-y:auto;overflow-x:auto"
          >
          </div>

        </v-col> -->
    </v-row>
  </v-container>
</template>

<script>
  import * as d3 from 'd3'
// 
  export default {
    name: 'Plates',
    props: ["inputdata", "dimensions", "socket", 'samplenames', 'selectedTaxid', 'selectedAttribute',  'legendPlacement'],
    watch: {
      selectedAttribute(val){
        if (val){
          this.makePlot()
        }
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
      height: 500,

    }),
    methods: {
      makePlot(){
        let div = d3.selectAll("#platesDiv")
        div.selectAll("#svgPlates").remove()
        d3.selectAll("#svgLegend").remove()
        let samplenames = Object.keys(this.inputdata)
        let tops = []
        for (let [samplename, sample] of Object.entries(this.inputdata)){
          if (sample){
            let data = sample.filter((f)=>{
              return f.rank_code == this.selectedAttribute
            })
            let max = d3.maxIndex(data, (f)=>{
              return f.value
            })
            if (max > -1){
              tops.push({
                name: samplename, 
                top: data[max],
                abu: data[max].value
              })
            } else {
              tops.push({
                name: samplename,
                top:{taxid: -1, target: "None"},
                abu: 0
              })
            }
            
          }
        }
        let unique_taxids = [ ... new Set(tops.map((f)=>{
          return `${f.top.target}`
        }))]
        tops = []
        let scalesHeatmap = {}
        for (let [samplename, sample] of Object.entries(this.inputdata)){
          if (sample){
            let data = sample.filter((f)=>{
              return unique_taxids.indexOf(f.target) > -1
            })
            data.forEach((entry)=>{
              tops.push({
                name: samplename, 
                top: entry,
                abu: entry.value
              })
            })
            var colorScaleHeatmap = d3.scaleLinear().range(["#5ff4ff", "#c42bd4"])
            .domain(d3.extent(data, (f)=>{
              return f.value
            }));
            scalesHeatmap[samplename] = colorScaleHeatmap

            
          }
        }


        var element = div.node();
        this.width = element.getBoundingClientRect().width;
        this.height = element.getBoundingClientRect().height;
        

        var margin = {top: 70, right: 20, bottom: 40, left: 70},
              width = this.width - margin.left - margin.right,
              height = this.height - margin.top - margin.bottom;  
        


        this.margin = margin
        this.boxHeight = ( (this.height - this.margin.bottom - this.margin.top) / samplenames.length )
        this.boxWidth = ( (width - this.margin.left - this.margin.right) / unique_taxids.length )
        var svg = div.append('svg').attr("id", "svgPlates")
              .attr("width", "100%")
              .attr("height", height + margin.top + margin.bottom)
              .append("g")
              .attr("transform", 
                    "translate(" + margin.left + "," + margin.top + ")");
        

        

        var taxidScale = d3.scaleOrdinal().domain(unique_taxids).range(unique_taxids.map((_,i)=>{
          return ((i) * this.boxWidth ) + this.margin.left - this.margin.right
        }))
        var sampleScale = d3.scaleOrdinal().domain(samplenames).range(samplenames.map((_,i)=>{
          return ((i) * this.boxHeight ) + this.margin.top - this.margin.bottom
        }))
        const node = svg.selectAll("g.nodes")
                        .data(tops)
                        .join("g").attr("class", "nodes")
                        .attr('transform', (d) => {
                          return `translate(${taxidScale(d.top.target)}, ${sampleScale(d.name)})`
                        });  



        
        
        
        
        node.append("rect")
          .attr("width", this.boxWidth)
          .attr("height", this.boxHeight)
          // .style("fill", (d)=>{
          //   return colorRampPieChart(`${d.top.taxid}-${d.top.target}`)
          // })
          .style("fill", (d)=>{
            return scalesHeatmap[d.name](`${d.abu}`)
          })
        node.append("text").classed("nodeText", true)
                .attr("font-family", "sans-serif")
                .attr("font-size",12)
                .attr("x", this.boxWidth/2) // +/- 6 pixels relative to container
                .attr("y", () => {
                  return this.boxHeight/2
                }) // middle of node
                .attr("text-anchor", "middle")
                .text(d => `${d.abu}%`); 
        // Add scales to axis
        var x_axis = d3.axisTop()
                      .scale(taxidScale);

        //Append group and insert axis
        svg
          .append("g")
          .attr("transform", 
                    "translate(" + this.boxWidth/2 + "," + margin.top / 4 + ")")
          .attr("class", "xAxis")
          .call(x_axis);
        
        // Add scales to axis
        var y_axis = d3.axisLeft()
                      .scale(sampleScale);

        //Append group and insert axis
        svg
          .append("g")
          .attr("transform", 
                    "translate(" + this.margin.left/2 + "," +this.boxHeight / 2 + ")")
          .attr("class", "yAxis")
          .call(y_axis);


        // let r = 10
        // let colorScalePiechart = d3.schemeCategory10.slice(1)        
        // let colorRampPieChart = d3.scaleOrdinal(colorScalePiechart)
        //   .domain(unique_taxids)
        // var legendSvg = d3.select("#platesLegend").append('svg').attr("id", "svgLegend")
        //       .attr("width", width + margin.left)
        //       .attr("height", height + margin.top )
        //     .append("g")
        //       .attr("transform", 
        //             "translate(" + 10 + "," + 10 + ")");
        // const legendNodes = legendSvg.selectAll("g.legendNodes")
        //   .data(unique_taxids)
        //   .join("g")
        //   .attr('transform', (d,i) => {
        //     return `translate(${10}, ${(i)*r*2})`
        //   })
        //   .attr("class", 'legendNodes')
        //   ; 
        // legendNodes.append("circle").attr("r", r).style("fill", (d)=>{
        //   return colorRampPieChart(d)
        // })
        // legendNodes.append("text").classed("nodeText", true)
        //         .attr("font-family", "sans-serif")
        //         .classed("text-caption", true)
        //         .attr("dy", "0.25em")
        //         .text((d)=>{
        //           return d
        //         })
        //         .attr("text-anchor", "start")
        //         .attr("dx", "1em")

        
        
      }
    },
    mounted(){
      console.log("mountd plates")
      if (this.inputdata){
        this.makePlot()
      }
      
    }
  }
</script>
