<template>
  <v-container :ref="'boxContainer'">
    <v-toolbar-title>
        Top Hits Per Sample
    </v-toolbar-title>
    <v-row >
        <v-col sm="12">
          <v-text-field
            hint="Top N per sample"
            v-model="top_n"
            persistent-hint 
            single-line
            type="number"
            min=1
          ></v-text-field>
          <div :id="`platesDiv`" 
            style="position:relative; background: none; padding-bottom: 100px; background-opacity: 0.5; width: 100%; height: 500px; overflow-y:auto;overflow-x:auto"
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
      height: 500,
      top_n: 3,
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
            
            let sorted = data.sort((a, b) => a.value - b.value)
            let top_n = this.top_n
            if (sorted.length  > 0){
              for (let i = 0; i < top_n; i++){
                if (i < sorted.length){
                  tops.push({
                    name: samplename, 
                    top: sorted[i],
                    abu: `${sorted[i].value.toFixed(2)}`
                  })
                } 
              }
       
            } else {
              tops.push({
                name: samplename,
                top:{taxid: -1, target: "None"},
                abu: 0
              })
            }
            
          }
        }
        const $this = this
        let attribute = 'target'
        if (this.selectedNameAttr && !this.selectedNameAttr == 'default (scientific name)'){
          attribute = this.selectedNameAttr
        }
        let seentaxids = {}
        let unique_taxids = [ ... new Set(tops.map((f)=>{
          if (f.top.taxid && f.top.taxid !== -1){
            
            seentaxids[f.top.taxid] = `${this.getText(f.top)}`
            
            return f.top.taxid
          }
          // return 
        }))]
        tops = []
        let scalesHeatmap = {}
        for (let [samplename, sample] of Object.entries(this.inputdata)){
          if (sample){
            let data = sample.filter((f)=>{
              return seentaxids[f.taxid]
            })
            data.forEach((entry)=>{
              tops.push({
                name: samplename, 
                top: entry,
                abu: `${entry.value.toFixed(2)}`
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
        
        var taxidScale = d3.scaleOrdinal().domain([]).range(unique_taxids.map((_,i)=>{
          return ((i) * this.boxWidth ) + this.margin.left - this.margin.right
        }))
        var sampleScale = d3.scaleOrdinal().domain(samplenames).range(samplenames.map((_,i)=>{
          return ((i) * this.boxHeight ) + this.margin.top - this.margin.bottom
        }))
        const node = svg.selectAll("g.nodestop")
                        .data(tops)
                        .join("g").attr("class", "nodestop")
                        .attr('transform', (d) => {
                          return `translate(${taxidScale(d.top.taxid)}, ${sampleScale(d.name)})`
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
                .text(d => `${d.abu}%`).attr("dominant-baseline", "middle"); 
        // Add scales to axis
        var x_axis = d3.axisTop()
                      .scale(taxidScale)
                      .tickFormat((d,i) => { 
                        return seentaxids[d]
                      });
    
        //Append group and insert axis
        svg
          .append("g")
          .attr("transform", 
                    "translate(" + this.boxWidth/2 + "," + margin.top / 4 + ")")
          .attr("class", "xAxisPlate")
          .call(x_axis)
          .selectAll("text")
            .attr("x", 0)
            .attr("dy", ".35em")
            .style("width", 10)
            .style("overflow", "auto")
            .style("font-size", "10")
            .attr("transform", "rotate(315)")
            .style("text-anchor", "start");
        
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


        
      }
    },
    mounted(){
      console.log("mountd plates")
      this.dimensions.windowHeight = window.innerHeight
      this.dimensions.windowWidth = window.innerWidth
      this.dimensions.height = this.$refs.boxContainer.clientHeight*2
      this.dimensions.width = this.$refs.boxContainer.clientWidth*0.6
      console.log("mounted")
      if (this.inputdata){
        this.makePlot()
      }
      
    }
  }
</script>
