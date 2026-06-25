<template>
  <v-container :ref="'boxContainer'" class="mtx-plate-wrap">
    <v-row>
        <v-col sm="12">
          <div class="mtx-plate-controls">
            <div class="mtx-plate-ctrl-wrap">
              <span class="mtx-plate-ctrl-label">Top N <InfoIcon text="Maximum number of taxa shown on the heatmap (left axis) per sample. Ranked by abundance — raise this to see more taxa, lower it to focus on the dominant ones." /></span>
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
            <span v-if="!isDrilledToSpecies">Click a genus cell (or its label on the left axis) to drill down to species.</span>
            <span v-else>Species under genus {{ drillTarget }} across samples.</span>
          </div>
          <div class="mtx-plate-canvas">
            <div :id="`platesDiv`" class="mtx-plate-plot"></div>
            <aside class="mtx-parent-legend" v-if="parentLegend.length">
              <div class="mtx-parent-legend-title">Parents</div>
              <div class="mtx-parent-legend-sub">{{ parentLegendUnit }}</div>
              <ul>
                <li v-for="p in parentLegend" :key="p.source"
                  class="mtx-pl-row"
                  @mouseenter="highlightParent(p.source)"
                  @mouseleave="clearParentHighlight()">
                  <span class="mtx-pl-swatch" :style="{ background: p.color }"></span>
                  <span class="mtx-pl-name" :title="p.source">{{ p.source }}</span>
                  <span class="mtx-pl-val">{{ p.display }}</span>
                </li>
              </ul>
            </aside>
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
      lineageMaps: {},
      parentLegend: [],
      parentLegendUnit: '',
      parentColorScale: null,
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
      onResize(){
        clearTimeout(this._rsz)
        this._rsz = setTimeout(() => { if (this.inputdata) this.makePlot() }, 150)
      },
      // Hovering a parent legend row spotlights that group in the heatmap:
      // its band brightens and all cells outside the group fade back.
      highlightParent(src){
        const svg = d3.select('#svgPlates')
        if (svg.empty() || !src) return
        svg.selectAll('g.nodestop2').style('opacity', (d) => (d && d.source === src) ? 1 : 0.15)
        const sel = src
        svg.selectAll('rect.mtx-band').style('opacity', function(){
          return d3.select(this).attr('data-src') === sel ? 0.34 : 0.04
        })
        svg.selectAll('rect.mtx-band-accent').style('opacity', function(){
          return d3.select(this).attr('data-src') === sel ? 1 : 0.18
        })
      },
      clearParentHighlight(){
        const svg = d3.select('#svgPlates')
        if (svg.empty()) return
        svg.selectAll('g.nodestop2').style('opacity', 1)
        svg.selectAll('rect.mtx-band').style('opacity', 0.12)
        svg.selectAll('rect.mtx-band-accent').style('opacity', 0.7)
      },
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
        this.parentLegend = []
        this.parseddata = {}
        if (!this.inputdata || Object.keys(this.inputdata).length === 0) {
          return
        }
        let samplenames = Object.keys(this.inputdata)

        // taxid -> row map per sample, used to walk the full lineage on hover
        this.lineageMaps = {}
        for (const [sn, rows] of Object.entries(this.inputdata)) {
          const m = {}
          ;(rows || []).forEach((r) => { if (r) m[String(r.taxid)] = r })
          this.lineageMaps[sn] = m
        }

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

        // --- bin/order taxa by their parent (one rank up = `source`): all children
        // of a parent sit contiguously, groups and members ordered by abundance.
        const infoByTaxon = {}
        tops.forEach((t) => {
          if (!t.top || t.top === 'Nothing') return
          if (!infoByTaxon[t.top]) infoByTaxon[t.top] = { source: (t.source || '—'), abu: 0 }
          infoByTaxon[t.top].abu = Math.max(infoByTaxon[t.top].abu, t.abu || 0)
        })
        const groupsMap = {}
        unique_taxids.forEach((name) => {
          const src = (infoByTaxon[name] && infoByTaxon[name].source) || '—'
          ;(groupsMap[src] = groupsMap[src] || []).push(name)
        })
        Object.values(groupsMap).forEach((arr) =>
          arr.sort((a, b) => (infoByTaxon[b].abu || 0) - (infoByTaxon[a].abu || 0)))
        const groupOrder = Object.keys(groupsMap).sort((a, b) =>
          (d3.max(groupsMap[b], (n) => infoByTaxon[n].abu) || 0) -
          (d3.max(groupsMap[a], (n) => infoByTaxon[n].abu) || 0))
        const groupSpans = []
        const ordered = []
        groupOrder.forEach((src) => {
          groupSpans.push({ source: src, members: groupsMap[src] })
          groupsMap[src].forEach((n) => ordered.push(n))
        })
        unique_taxids = ordered

        // ---- parent legend: aggregate each parent across the whole run ----
        // Percent metrics → mean of the per-sample parent percentage across all
        // samples (e.g. 10%,20%,0% over 3 samples = 10%). Raw-fragment metrics →
        // the summed read total instead. We aggregate every child at the rank
        // (full parseddata, not just the top-N shown).
        const metricVal = this.valueAttr.value
        const legendIsRaw = metricVal === 'num_fragments_clade' || metricVal === 'num_fragments_assigned'
        const legendIsFraction = metricVal === 'num_fragments_assigned_fraction' || metricVal === 'num_fragments_clade_fraction'
        const pctScale = legendIsFraction ? 100 : 1   // 'value' is already 0–100; fractions are 0–1
        const nSamples = samplenames.length || 1
        const parentAgg = {}
        for (const sn of samplenames) {
          const prows = this.parseddata[sn] || []
          prows.forEach((r) => {
            const src = r.source || '—'
            parentAgg[src] = (parentAgg[src] || 0) + (Number(r.abu) || 0)
          })
        }
        const parentColor = d3.scaleOrdinal()
          .domain(groupOrder)
          .range(d3.schemeTableau10.concat(d3.schemeSet3 || []))
        this.parentColorScale = parentColor
        this.parentLegend = groupOrder
          .filter((src) => src && src !== '—')
          .map((src) => {
            const raw = parentAgg[src] || 0
            const val = legendIsRaw ? raw : (raw * pctScale) / nSamples
            return {
              source: src,
              value: val,
              display: legendIsRaw ? Math.round(val).toLocaleString() : `${val.toFixed(2)}%`,
              color: parentColor(src)
            }
          })
        this.parentLegendUnit = legendIsRaw ? 'total reads across run' : 'mean % across samples'

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
          // Axes are swapped vs. the original layout: taxa now run down the
          // left (Y) axis, one row per taxon, and samples run across the top
          // (X) axis. So the plot height scales with the number of taxa and the
          // left margin is widened to fit (longer) taxon names; the top margin
          // holds the rotated sample labels.
          this.boxHeight = 26
          var margin = {top: 150, right: 24, bottom: 30, left: 260}
        this.height = this.boxHeight*unique_taxids.length + margin.top + margin.bottom
        d3.select(`#platesDiv`).style("height", `${this.height} px`)

        var width = Math.max(280, this.width - margin.left - margin.right),
              height = Math.max(120, this.height - margin.top - margin.bottom);

        this.margin = margin

        this.boxWidth = Math.max(18, (width / Math.max(1, samplenames.length)))
        
        
        var svgRoot = div.append('svg').attr("id", "svgPlates")
              .attr("width", "100%")
              .attr("preserveAspectRatio", "xMinYMin meet")
              .attr("viewBox", `0 0 ${this.width} ${height + margin.top + margin.bottom}`)
              .classed("svg-content", true)
              .style("cursor", "default")
        var svg = svgRoot
              .append("g")
              .attr("transform",
                    "translate(" + margin.left + "," + margin.top + ")");
        
        // taxidScale is now the vertical (Y) scale — one band per taxon.
        // sampleScale is now the horizontal (X) scale — one band per sample.
        var taxidScale = d3.scaleBand().domain(unique_taxids).range([0, height]).padding(0.14)
        var sampleScale = d3.scaleBand().domain(samplenames).range([6, Math.max(12, width - 6)]).padding(0.11)
        // Append to <body> (not the plot div) and set positioning inline so it is
        // never affected by scoped CSS, container overflow, or ancestor transforms
        // — it tracks the cursor in viewport coordinates.
        const tooltip = d3.select('body')
          .append('div')
          .attr('id', 'plateHoverTip')
          .attr('class', 'mtx-plate-tip')
          .style('position', 'fixed')
          .style('pointer-events', 'none')
          .style('z-index', 99999)
          .style('opacity', 0)

        // Position the (fixed) tooltip right next to the cursor, flipping it away
        // from the right/bottom edges so it never spills off-screen.
        const placeTip = (e) => {
          const pad = 14
          const tnode = tooltip.node()
          const tw = tnode ? tnode.offsetWidth : 220
          const th = tnode ? tnode.offsetHeight : 120
          let x = e.clientX + pad
          let y = e.clientY + pad
          if (x + tw > window.innerWidth - 8) x = e.clientX - tw - pad
          if (y + th > window.innerHeight - 8) y = e.clientY - th - pad
          if (y < 8) y = 8
          if (x < 8) x = 8
          tooltip.style('left', `${x}px`).style('top', `${y}px`)
        }

        // faded parent-group bands (drawn behind the cells), colour-matched to the
        // right-hand parent legend. Names live in the legend, not under the axis,
        // so the labels no longer overlap.
        // Parent-group bands are now horizontal rows (taxa run down the Y axis),
        // each spanning the full plot width, with a thin left accent that ties
        // the band to its swatch in the parent legend.
        const bgLayer = svg.append('g').attr('class', 'mtx-group-bg')
        const _bw = taxidScale.bandwidth()
        const _gap = Math.max(0, taxidScale.step() - _bw)
        groupSpans.forEach((grp) => {
          const ys = grp.members.map((n) => taxidScale(n)).filter((v) => v != null)
          if (!ys.length) return
          const y0 = Math.min(...ys) - _gap / 2
          const y1 = Math.max(...ys) + _bw + _gap / 2
          const c = this.parentColorScale ? this.parentColorScale(grp.source) : '#9bb6cf'
          bgLayer.append('rect')
            .attr('class', 'mtx-band')
            .attr('data-src', grp.source)
            .attr('x', -6).attr('y', y0)
            .attr('width', width + 12).attr('height', Math.max(1, y1 - y0))
            .attr('fill', c).attr('opacity', 0.12)
          // thin left accent ties the band to its legend swatch
          bgLayer.append('rect')
            .attr('class', 'mtx-band-accent')
            .attr('data-src', grp.source)
            .attr('x', -6).attr('y', y0)
            .attr('width', 3).attr('height', Math.max(1, y1 - y0))
            .attr('fill', c).attr('opacity', 0.7)
        })

        const node = svg.selectAll("g.nodestop2")
                        .data(tops)
                        .join("g").attr("class", "nodestop2")
                        .attr('transform', (d) => {
                          return `translate(${sampleScale(d.name) || 0}, ${taxidScale(d.top) || 0})`
                        });



        
        
        
        
        node.append("rect")
          .attr('class', 'mtx-heat-cell')
          .attr("width", Math.max(1, sampleScale.bandwidth()))
          .attr("height", Math.max(1, taxidScale.bandwidth()))
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
            const rankFull = { R: 'Root', D: 'Domain', D1: 'Subdomain', K: 'Kingdom', P: 'Phylum', C: 'Class', O: 'Order', F: 'Family', F1: 'Subfamily', F2: 'Tribe', G: 'Genus', G1: 'Subgenus', S: 'Species', S1: 'Subspecies', U: 'Unclassified' }
            const rankLabel = rankFull[d.rank] || d.rank
            // walk the full lineage (selected rank up to the highest) for this cell
            const lineMap = $this.lineageMaps[d.name] || {}
            const chain = []
            let cur = lineMap[String(d.taxid)]
            let guard = 0
            while (cur && guard++ < 60) {
              if (cur.taxid === -1 || String(cur.taxid) === '-1') break
              chain.push(cur)
              if (cur.parenttaxid == null) break
              cur = lineMap[String(cur.parenttaxid)]
            }
            chain.reverse()
            const lineageHtml = chain.map((r) => {
              const rl = rankFull[r.rank_code] || r.rank_code
              const sel = (String(r.taxid) === String(d.taxid)) ? ' sel' : ''
              return `<div class="mtx-tip-lin${sel}"><span class="r">${rl}</span><span class="n">${$this.getText(r)}</span></div>`
            }).join('')
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
                ${lineageHtml ? `<div class="mtx-tip-lineage-h">Lineage</div><div class="mtx-tip-lineage">${lineageHtml}</div>` : ''}
              `)
            placeTip(e)
          })
          .on('mousemove', (e) => {
            placeTip(e)
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
        // Truncate sample labels (top axis) by how many sample columns there
        // are, and taxon labels (left axis) by how much room the left margin
        // gives us. Full names are always available via the <title> tooltip.
        const nCols = samplenames.length
        const maxChars = nCols > 34 ? 12 : nCols > 22 ? 16 : nCols > 14 ? 20 : 26
        const truncateTick = (name) => {
          const s = `${name || ''}`
          return s.length > maxChars ? `${s.slice(0, maxChars - 1)}...` : s
        }
        const maxCharsY = Math.max(10, Math.floor((margin.left - 16) / 7))
        const truncateTickY = (name) => {
          const s = `${name || ''}`
          return s.length > maxCharsY ? `${s.slice(0, maxCharsY - 1)}...` : s
        }

        // ---- X axis: sample names across the top ----
        var x_axis = d3.axisTop()
                      .scale(sampleScale)
                      .tickFormat((d) => truncateTick(d));

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

        x.selectAll('.tick text')
          .append('title')
          .text((d) => `${d}`)

        // Keep top labels single-line; wrapped tspans can spill into the first cell row.
        x.selectAll('text')
          .style("font-size", '1px')
          .each(getSizeX)
          .style("font-size", function(d) {  return Math.min(11, Math.max(9, sizesY[d])) + "px"; })

        // ---- Y axis: taxa down the left side (click a genus to drill in) ----
        var y_axis = d3.axisLeft()
                      .scale(taxidScale)
                      .tickFormat((d) => truncateTickY(d));
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
          .style("cursor", (this.selectedAttribute === 'G' && !this.isDrilledToSpecies) ? 'pointer' : 'default')

          y.selectAll('.tick text')
            .append('title')
            .text((d) => `${d}`)

          y.selectAll('.tick')
            .on('click', (e, d) => {
              if (this.selectedAttribute === 'G' && !this.isDrilledToSpecies) {
                this.drillIntoGenus(d)
              }
            })

          function getSizeX(d) {

            var bbox = this.getBBox(),
              cbbox = $this.margin.top,
              scale = Math.min(cbbox / Math.max(1, bbox.height), Math.max(16, sampleScale.bandwidth()) / Math.max(1, bbox.width));
            sizesY[d] = scale
            return d
          }

        // Fit the viewBox to the actual rendered content — including the rotated
        // x-axis labels — so nothing runs out of bounds. With width:100% the SVG
        // then scales to the div, and the cells resize with it.
        const rootNode = svgRoot.node()
        if (rootNode) {
          try {
            const bb = rootNode.getBBox()
            if (bb && bb.width) {
              const pad = 10
              rootNode.setAttribute(
                'viewBox',
                `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`
              )
            }
          } catch (err) { /* getBBox can throw if detached; ignore */ }
        }
      }
    },
    mounted(){
      if (this.inputdata){
        this.makePlot()
      }
      window.addEventListener('resize', this.onResize)
    },
    beforeDestroy(){
      window.removeEventListener('resize', this.onResize)
      clearTimeout(this._rsz)
      d3.selectAll('#plateHoverTip').remove()
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
  width: 100%;
  display: flex;
  align-items: stretch;
}
.mtx-plate-plot {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: auto;
}
.mtx-parent-legend {
  flex: 0 0 196px;
  border-left: 1px solid #e7eef5;
  padding: 12px 12px 14px;
  max-height: 520px;
  overflow-y: auto;
  background: #fbfdff;
  border-radius: 0 12px 12px 0;
}
.mtx-parent-legend-title {
  font-size: 11px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .05em; color: #3f5b73;
}
.mtx-parent-legend-sub {
  font-size: 10px; color: #8aa0b3; margin: 1px 0 9px;
}
.mtx-parent-legend ul { list-style: none; margin: 0; padding: 0; }
.mtx-parent-legend li {
  display: flex; align-items: center; gap: 7px;
  padding: 3px 4px; font-size: 12px; color: #33485c;
  border-radius: 5px; cursor: pointer;
}
.mtx-parent-legend li.mtx-pl-row:hover { background: #eef4fb; }
.mtx-pl-swatch { width: 11px; height: 11px; border-radius: 3px; flex: 0 0 auto; }
.mtx-pl-name {
  flex: 1 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.mtx-pl-val { flex: 0 0 auto; font-variant-numeric: tabular-nums; color: #5b7a90; font-weight: 600; }

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

</style>
<style>
/* unscoped so d3-injected tooltip (appended to <body>) is styled */
.mtx-plate-tip {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  background: rgba(30, 41, 59, 0.96);
  color: #f1f5f9;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgba(0,0,0,.25);
  max-width: 340px;
}
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
.mtx-tip-lineage-h {
  margin-top: 6px;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #94a3b8;
  font-weight: 700;
}
.mtx-tip-lineage {
  margin-top: 3px;
  border-left: 2px solid #3b4a5f;
  padding-left: 7px;
}
.mtx-tip-lin {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 1px 0;
}
.mtx-tip-lin .r {
  color: #8aa0b6;
  font-size: 10px;
  min-width: 74px;
  flex: 0 0 auto;
}
.mtx-tip-lin .n { color: #e2e8f0; }
.mtx-tip-lin.sel .n { color: #7fd1ff; font-weight: 700; }
</style>
