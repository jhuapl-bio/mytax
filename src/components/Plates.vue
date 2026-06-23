<template>
  <v-container :ref="'boxContainer'" class="mtx-plate-wrap">
    <v-row>
        <v-col sm="12">
          <div class="mtx-plate-controls">
            <div class="mtx-plate-ctrl-wrap">
              <span class="mtx-plate-ctrl-label">Top N <InfoIcon text="Maximum number of taxa shown on the heatmap x-axis per sample. Ranked by abundance — raise this to see more taxa, lower it to focus on the dominant ones." /></span>
              <v-text-field
                hint="Maximum Taxa Seen per sample"
                v-model="top_n"
                persistent-hint outlined
                single-line dense
                type="number"
                min=1
                class="mtx-plate-input"
              ></v-text-field>
            </div>
            <div class="mtx-plate-ctrl-wrap">
              <span class="mtx-plate-ctrl-label">Cell Values <InfoIcon text="What each cell's color intensity encodes. 'Percent of entire report for clade' includes all descendants; 'specific taxa' counts only direct assignments; 'Relative Percent at Rank' normalises within the selected rank." /></span>
              <v-select
                  v-model="valueAttr" solo
                  :items="valueAttrSelections"
                  item-value="value"
                  item-text="name"
                  hint="Choose Cell Values"
                  single-line return-object
                  persistent-hint
                  class="mtx-plate-input-wide"
              ></v-select>
            </div>
            <div class="mtx-plate-ctrl-wrap">
              <span class="mtx-plate-ctrl-label">Name Type <InfoIcon text="Display format for taxon labels. 'default (scientific name)' uses the Kraken2 scientific name; other options use alternative name mappings if loaded." /></span>
              <v-select
                  v-model="selectedNameAttr"
                  :items="nameTypes"
                  dense
                  hide-details
                  outlined
                  hint="Name type"
                  persistent-hint
                  single-line
                  class="mtx-plate-input-wide"
              ></v-select>
            </div>
            <div v-if="isDrilledToSpecies" class="mtx-drill-chip">
              <span>Genus: <strong>{{ drillTarget }}</strong></span>
              <v-btn small text color="primary" @click="clearDrill">Back to genera</v-btn>
            </div>
          </div>
          <div v-if="selectedAttribute === 'G'" class="mtx-drill-note">
            <span v-if="!isDrilledToSpecies">Click a genus cell (or x-axis label) to drill down to species.</span>
            <span v-else>Species under genus {{ drillTarget }} across samples.</span>
          </div>
          <div :id="`platesDiv`" class="mtx-plate-canvas">
          </div>
        </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import * as d3 from 'd3'
  import InfoIcon from '@/components/InfoIcon.vue'
  export default {
    name: 'Plates',
    components: { InfoIcon },
    props: ["inputdata", "namesData", "socket", 'samplenames', 'selectedTaxid', 'selectedAttribute', 'legendPlacement'],
    watch: {
      valueAttr(newval){
        this.makePlot()
      },
      selectedAttribute(val){
        if (val !== 'G') {
          this.drillTarget = null
        }
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
      drillTarget: null,
      selectedNameAttr: 'default (scientific name)',
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
    computed: {
      isDrilledToSpecies(){
        return this.selectedAttribute === 'G' && !!this.drillTarget
      },
      nameTypes() {
        const base = ['default (scientific name)']
        if (this.namesData && typeof this.namesData === 'object') {
          return base.concat(Object.keys(this.namesData).filter((k) => k && base.indexOf(k) === -1))
        }
        return base
      }
    },
    methods: {
      clearDrill(){
        if (!this.isDrilledToSpecies) {
          return
        }
        this.drillTarget = null
        this.makePlot()
      },
      selectMetric(row, sampleTotal){
        if (!row) {
          return 0
        }
        if (this.valueAttr.value === 'num_fragments_assigned_fraction') {
          return sampleTotal > 0 ? row.num_fragments_assigned / sampleTotal : 0
        }
        if (this.valueAttr.value === 'num_fragments_clade_fraction') {
          return sampleTotal > 0 ? row.num_fragments_clade / sampleTotal : 0
        }
        return Number(row[this.valueAttr.value]) || 0
      },
      drillIntoGenus(name){
        if (this.selectedAttribute !== 'G' || !name) {
          return
        }
        this.drillTarget = name
        this.makePlot()
      },
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
        d3.selectAll("#svgPlatesEmpty").remove()
        d3.selectAll("#plateHoverTip").remove()
        if (!this.inputdata || Object.keys(this.inputdata).length === 0) {
          return
        }
        let samplenames = Object.keys(this.inputdata)
        
        let tops = []
        for (let [samplename, sample] of Object.entries(this.inputdata)){
          if (sample){
            let data = sample.filter((f)=>{
              if (!f || f.taxid === -1) {
                return false
              }
              if (this.isDrilledToSpecies) {
                return f.rank_code === 'S' && f.source === this.drillTarget
              }
              return f.rank_code === this.selectedAttribute
            })
            this.fullsize[samplename] = d3.sum(sample,(d)=>{
                return d.num_fragments_assigned
            })
            
            
            let testdata = d3.rollups(
              data,
              (rows) => {
                const first = rows[0] || {}
                return {
                  value: d3.sum(rows, (r) => this.selectMetric(r, this.fullsize[samplename])),
                  row: first
                }
              },
              (d) => d.target
            )
            let sorted = testdata
              .map(([label, payload]) => ({
                top: label,
                abu: payload.value,
                rank: payload.row.rank_code,
                source: payload.row.source,
                taxid: payload.row.taxid
              }))
              .sort((a, b) => b.abu - a.abu)
            let top_n = this.top_n
            this.parseddata[samplename] = sorted
            if (sorted.length  > 0){
              for (let i = 0; i < top_n; i++){
                if (i < sorted.length && isFinite(sorted[i].abu)){
                  tops.push({
                    name: samplename, 
                    top: sorted[i].top,
                    abu: sorted[i].abu,
                    rank: sorted[i].rank,
                    source: sorted[i].source,
                    taxid: sorted[i].taxid
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
        let unique_taxids = [ ... new Set(tops.filter((f)=>{
          return f.top && f.top !== 'Nothing'
        }).map((f)=> f.top))]

        if (!unique_taxids.length || !samplenames.length) {
          const element = div.node()
          const width = element ? element.getBoundingClientRect().width : 700
          const emptyHeight = 180
          this.height = emptyHeight
          let emptySvg = div.append('svg').attr('id', 'svgPlatesEmpty')
            .attr('width', '100%')
            .attr('viewBox', `0 0 ${Math.max(300, width)} ${emptyHeight}`)
          emptySvg.append('text')
            .attr('x', Math.max(300, width) / 2)
            .attr('y', emptyHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', '#718096')
            .style('font-size', '14px')
            .text(this.isDrilledToSpecies ? `No species found under genus ${this.drillTarget}.` : 'No data available for this rank.')
          return
        }

        let scalesHeatmap = {}
        let maxBySample = {}
        for (let [samplename, sampledata] of Object.entries(this.parseddata)   ){
          if (samplename && sampledata && sampledata.length){
            const ext = d3.extent(sampledata, (f)=> f.abu)
            const max = Number(ext[1]) || 0
            maxBySample[samplename] = max || 1
            var colorScaleHeatmap = d3.scaleSequential(d3.interpolateBlues)
            .domain([0, max || 1]);
            scalesHeatmap[samplename] = colorScaleHeatmap
          }
        }


        var element = div.node();
        this.width = element.getBoundingClientRect().width;
        function wrap(text, width) {
          text.each(function() {
            
            var text = d3.select(this),
                words = text.text().split(/\s+/).reverse(),
                word,
                line = [],
                lineNumber = 0,
                lineHeight = 1, // ems
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
          this.boxHeight = 30
          var margin = {top: 210, right: 24, bottom: 30, left: 160}
        this.height = this.boxHeight*samplenames.length + margin.top + margin.bottom
        d3.select(`#platesDiv`).style("height", `${this.height} px`)  
        
        var width = Math.max(280, this.width - margin.left - margin.right),
              height = Math.max(120, this.height - margin.top - margin.bottom);  
        
        this.margin = margin
              
        this.boxWidth = Math.max(18, (width / unique_taxids.length))
        
        
        var svg = div.append('svg').attr("id", "svgPlates")
              .attr("width", "100%")
              .attr("preserveAspectRatio", "xMinYMin meet")
              .attr("viewBox", `0 0 ${this.width} ${height + margin.top + margin.bottom}`)
              .classed("svg-content", true)
              .style("cursor", "default")
              .append("g")
              .attr("transform", 
                    "translate(" + margin.left + "," + margin.top + ")");
        
        var taxidScale = d3.scaleBand().domain(unique_taxids).range([6, Math.max(12, width - 6)]).padding(0.14)
        var sampleScale = d3.scaleBand().domain(samplenames).range([0, height]).padding(0.11)
        const tooltip = div
          .append('div')
          .attr('id', 'plateHoverTip')
          .attr('class', 'mtx-plate-tip')
          .style('opacity', 0)
        const node = svg.selectAll("g.nodestop2")
                        .data(tops)
                        .join("g").attr("class", "nodestop2")
                        .attr('transform', (d) => {
                          return `translate(${taxidScale(d.top) || 0}, ${sampleScale(d.name) || 0})`
                        });  



        
        
        
        
        node.append("rect") 
          .attr('class', 'mtx-heat-cell')
          .attr("width", Math.max(1, taxidScale.bandwidth())) 
          .attr("height", Math.max(1, sampleScale.bandwidth()))
          .attr('rx', 2)
          .attr('ry', 2)
          .style("fill", (d)=>{
            if (!isFinite(d.abu) || !scalesHeatmap[d.name] || d.abu <= 0) {
              return '#f3f6f9'
            }
            return scalesHeatmap[d.name](d.abu)
          })
          .style('stroke', '#dbe6f1')
          .style('stroke-width', 0.8)
          .style("cursor", (d) => (this.selectedAttribute === 'G' && !this.isDrilledToSpecies && d.rank === 'G') ? 'pointer' : 'default')
          .on('mouseenter', function (e, d) {
            d3.select(this)
              .style('stroke', '#0b5fa4')
              .style('stroke-width', 1.2)
            const isRaw = $this.valueAttr.value === 'num_fragments_clade' || $this.valueAttr.value === 'num_fragments_assigned'
            const valueText = isRaw
              ? Number(d.abu || 0).toLocaleString()
              : `${Number(d.abu || 0).toFixed(3)}%`
            const rankLabel = { D: 'Domain', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', G: 'Genus', S: 'Species' }[d.rank] || d.rank
            tooltip
              .style('opacity', 1)
              .html(`
                <div class="mtx-tip-title">${d.top}</div>
                <table class="mtx-tip-table">
                  <tr><td>Sample</td><td>${d.name}</td></tr>
                  <tr><td>Rank</td><td>${rankLabel}</td></tr>
                  <tr><td>Value</td><td>${valueText}</td></tr>
                  <tr><td>Metric</td><td>${$this.valueAttr.name}</td></tr>
                </table>
              `)
              .style('left', `${e.offsetX + 14}px`)
              .style('top', `${e.offsetY - 8}px`)
          })
          .on('mousemove', (e) => {
            tooltip
              .style('left', `${e.offsetX + 14}px`)
              .style('top', `${e.offsetY - 8}px`)
          })
          .on('mouseleave', function () {
            d3.select(this)
              .style('stroke', '#dbe6f1')
              .style('stroke-width', 0.8)
            tooltip.style('opacity', 0)
          })
          .on('click', (e, d) => {
            if (this.selectedAttribute === 'G' && !this.isDrilledToSpecies && d.rank === 'G') {
              this.drillIntoGenus(d.top)
            }
          })
        const truncateTick = (name) => {
          const s = `${name || ''}`
          const maxChars = 26
          return s.length > maxChars ? `${s.slice(0, maxChars - 1)}...` : s
        }

        // Add scales to axis
        var x_axis = d3.axisTop()
                      .scale(taxidScale)
                      .tickFormat((d,i) => { 
                        return truncateTick(d)
                      });
                      
        //Append group and insert axis
        
        let sizes = {}
        let sizesY = {}
        let x = svg
          .append("g")
          .attr("transform", "translate(0,-14)")
          .attr("class", "xAxisPlate").style("font-size", '1px')
          .call(x_axis)
        x.selectAll('text').style("font-size", 22)
          .style("overflow", "auto")
            .attr("transform", "rotate(-42)")
            .attr('dx', '0.28em')
            .attr('dy', '-1.2em')
            .style("text-anchor", "start")
            .style('fill', '#5a6b7b')
            .style("cursor", (this.selectedAttribute === 'G' && !this.isDrilledToSpecies) ? 'pointer' : 'default')

        x.selectAll('.tick text')
          .append('title')
          .text((d) => `${d}`)

        x.selectAll('.tick')
          .on('click', (e, d) => {
            if (this.selectedAttribute === 'G' && !this.isDrilledToSpecies) {
              this.drillIntoGenus(d)
            }
          })
            
          
        // Keep top labels single-line; wrapped tspans can spill into the first cell row.

        x.selectAll('text')
          .style("font-size", '1px')
          .each(getSizeX)
          .style("font-size", function(d) {  return Math.min(11, Math.max(9, sizesY[d])) + "px"; })
            
            
        
        // Add scales to axis
        var y_axis = d3.axisLeft()
                      .scale(sampleScale);
        let y = svg
          .append("g")
          .attr("transform", 
                    "translate(0,0)")
          .attr("class", "yAxis")
          .style("font-size", '1px')
          .call(y_axis);
          
          y.selectAll('text') // select all the text elements 
          .style("font-size", '12px')
          .style('fill', '#5a6b7b')
          // .each(getSizeY)
          // .style("font-size", function(d) {  return sizes[d] + "px"; });
          
          // function getSizeY(d) {
          //   var bbox = this.getBBox(),
          //     cbbox = $this.margin.left + ($this.margin.left/2),
          //     scale = Math.min(cbbox/bbox.width/1.2, $this.boxWidth);
          //   sizes[d] = scale
          //   return d
          // }
          function getSizeX(d) {
            
            var bbox = this.getBBox(),
              cbbox = $this.margin.top,
              scale = Math.min(cbbox / Math.max(1, bbox.height), Math.max(16, taxidScale.bandwidth()) / Math.max(1, bbox.width));
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

<style scoped>
.mtx-plate-wrap { padding-top: 4px; }
.mtx-plate-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  background: linear-gradient(180deg, #f9fcff 0%, #f2f8fd 100%);
  border: 1px solid #dce8f2;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: inset 0 1px 0 #ffffff;
}
.mtx-plate-ctrl-wrap { display: flex; flex-direction: column; gap: 5px; }
.mtx-plate-ctrl-label {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .05em; color: #5b7a90;
}

.mtx-plate-input { max-width: 220px; min-width: 150px; }
.mtx-plate-input-wide { max-width: 320px; min-width: 200px; }

/* ---- modern pill inputs for the 3 heatmap controls ---- */
.mtx-plate-controls ::v-deep .v-input { font-size: 13px; }
.mtx-plate-controls ::v-deep .v-text-field.v-text-field--solo .v-input__slot,
.mtx-plate-controls ::v-deep .v-text-field--outlined .v-input__slot {
  min-height: 40px !important;
  border-radius: 10px !important;
  background: #fff !important;
  box-shadow: 0 1px 2px rgba(20, 56, 84, 0.06) !important;
  border: 1px solid #d3e0ec !important;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.mtx-plate-controls ::v-deep .v-text-field--outlined fieldset { border: none !important; }
.mtx-plate-controls ::v-deep .v-text-field .v-input__slot:hover {
  border-color: #b6cde2 !important;
}
.mtx-plate-controls ::v-deep .v-input.v-input--is-focused .v-input__slot {
  border-color: #1e6b97 !important;
  box-shadow: 0 0 0 3px rgba(30, 107, 151, 0.15) !important;
}
.mtx-plate-controls ::v-deep .v-text-field__details { margin-top: 4px; }
.mtx-plate-controls ::v-deep .v-messages__message {
  font-size: 10px; color: #93a6b6; line-height: 1.2;
}
.mtx-plate-controls ::v-deep .v-select__selections { color: #274766; font-weight: 500; }
.mtx-plate-controls ::v-deep .v-icon { color: #6f8aa1; }
.mtx-plate-canvas {
  position: relative;
  background: #fff;
  border: 1px solid #e2ebf2;
  border-radius: 12px;
  padding-bottom: 0;
  width: 100%;
  overflow-y: auto;
  overflow-x: auto;
}

.mtx-drill-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 2px 10px;
  border: 1px solid #d9e2ec;
  border-radius: 14px;
  background: #f7fafc;
  font-size: 12px;
  color: #334e68;
  margin-top: 2px;
}

.mtx-drill-note {
  font-size: 12px;
  color: #486581;
  margin: 8px 0;
}

.mtx-plate-wrap ::v-deep .xAxisPlate text,
.mtx-plate-wrap ::v-deep .yAxis text {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.mtx-plate-wrap ::v-deep .xAxisPlate .tick line,
.mtx-plate-wrap ::v-deep .xAxisPlate path,
.mtx-plate-wrap ::v-deep .yAxis .tick line,
.mtx-plate-wrap ::v-deep .yAxis path {
  stroke: #d9e3ed;
}

.mtx-plate-tip {
  position: absolute;
  z-index: 9999;
  pointer-events: none;
  background: rgba(30, 41, 59, 0.96);
  color: #f1f5f9;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgba(0,0,0,.25);
  white-space: nowrap;
  max-width: 320px;
}
</style>
<style>
/* unscoped so d3-injected HTML inside the tip is styled */
.mtx-tip-title {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 4px;
  color: #e2e8f0;
}
.mtx-tip-table {
  border-collapse: collapse;
  font-size: 11px;
}
.mtx-tip-table td {
  padding: 1px 8px 1px 0;
}
.mtx-tip-table td:first-child {
  color: #94a3b8;
  font-weight: 600;
}
</style>
