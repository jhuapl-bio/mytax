/* ---------------------------------------------------------------------------
 * render/canvasChart.js — canvas drawing primitives for the per-sample panels.
 *
 * WHY CANVAS
 * ----------
 * The panels were drawn with d3 into SVG. Each bar was a <rect> plus a <text>
 * plus usually a <line> and a <title>: four or five DOM nodes per taxon, per
 * panel, per sample. Twenty-four barcodes showing forty taxa each is ~4,000
 * live SVG elements, every one of them a layout-participating node the browser
 * must style, lay out and repaint. Worse, a live run replaced them all every
 * time a report arrived — so the browser was continuously tearing down and
 * rebuilding thousands of nodes while also running layout on the rest of the
 * page. That is the visible lag.
 *
 * A canvas panel is ONE DOM node regardless of how many taxa it shows, and
 * redrawing it is a pure paint with no layout, no style recalculation and no
 * garbage. Redraw cost becomes proportional to pixels, not to taxa.
 *
 * WHAT WE GIVE UP, AND HOW IT IS REPLACED
 * ---------------------------------------
 * SVG gives you hit-testing and tooltips for free. Canvas does not, so each
 * chart keeps a small array of {x, y, w, h, row} hit boxes and resolves pointer
 * position against it — cheap, since it is the same data we just drew.
 * Accessible text is preserved by keeping the panel's underlying numbers in the
 * DOM as a visually-hidden table where it matters.
 * ------------------------------------------------------------------------- */

// Sharp rendering on HiDPI without paying 4x fill cost on every redraw: size the
// backing store to devicePixelRatio once, then draw in CSS pixels.
export function fitCanvas(canvas, cssWidth, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.round(cssWidth))
  const h = Math.max(1, Math.round(cssHeight))
  if (canvas._fitW === w && canvas._fitH === h && canvas._fitDpr === dpr) {
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    return ctx
  }
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  canvas._fitW = w; canvas._fitH = h; canvas._fitDpr = dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return ctx
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo)}…`
}

const FONT = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const LABEL_COLOR = '#334155'
const MUTED_COLOR = '#94a3b8'
const GRID_COLOR = '#eef2f7'

/**
 * Horizontal bar chart.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 *   rows      [{ target, num_fragments_clade, value, ... }]
 *   width     css px
 *   rowHeight css px per bar (default 18)
 *   valueKey  which numeric field drives bar length
 *   color     (row, i) => css color
 *   labelWidth px reserved for taxon names
 *   highlight  row identity (taxid) to emphasise
 * @returns {Array} hit boxes: [{x, y, w, h, row}]
 */
export function drawBars(canvas, opts) {
  const rows = opts.rows || []
  const rowHeight = opts.rowHeight || 18
  const gap = 3
  const labelWidth = opts.labelWidth || 130
  const valueWidth = 58
  const width = opts.width || canvas.clientWidth || 320
  const height = Math.max(rowHeight, rows.length * (rowHeight + gap))
  const ctx = fitCanvas(canvas, width, height)
  const valueKey = opts.valueKey || 'num_fragments_clade'

  const plotX = labelWidth + 6
  const plotW = Math.max(10, width - plotX - valueWidth)
  let max = 0
  for (const r of rows) { const v = +r[valueKey] || 0; if (v > max) max = v }
  if (max <= 0) max = 1

  ctx.font = FONT
  ctx.textBaseline = 'middle'
  const hits = []

  // Gridlines first, so bars sit on top.
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  for (let t = 0; t <= 4; t++) {
    const x = Math.round(plotX + (plotW * t) / 4) + 0.5
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const y = i * (rowHeight + gap)
    const v = +row[valueKey] || 0
    const w = Math.max(1, (v / max) * plotW)
    const highlighted = opts.highlight != null && String(row.taxid) === String(opts.highlight)

    ctx.fillStyle = opts.color ? opts.color(row, i) : '#4c78a8'
    ctx.globalAlpha = (opts.highlight != null && !highlighted) ? 0.35 : 1
    ctx.fillRect(plotX, y, w, rowHeight)
    ctx.globalAlpha = 1

    ctx.fillStyle = highlighted ? '#0f172a' : LABEL_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(truncate(ctx, String(row.target || ''), labelWidth), labelWidth, y + rowHeight / 2)

    ctx.fillStyle = MUTED_COLOR
    ctx.textAlign = 'left'
    ctx.fillText(formatCount(v), plotX + plotW + 6, y + rowHeight / 2)

    hits.push({ x: 0, y, w: width, h: rowHeight + gap, row })
  }
  return hits
}

/**
 * Lollipop chart: a stem plus a dot. Same contract as drawBars.
 */
export function drawLollipop(canvas, opts) {
  const rows = opts.rows || []
  const rowHeight = opts.rowHeight || 18
  const gap = 4
  const labelWidth = opts.labelWidth || 130
  const valueWidth = 58
  const width = opts.width || canvas.clientWidth || 320
  const height = Math.max(rowHeight, rows.length * (rowHeight + gap))
  const ctx = fitCanvas(canvas, width, height)
  const valueKey = opts.valueKey || 'num_fragments_clade'

  const plotX = labelWidth + 6
  const plotW = Math.max(10, width - plotX - valueWidth)
  let max = 0
  for (const r of rows) { const v = +r[valueKey] || 0; if (v > max) max = v }
  if (max <= 0) max = 1

  ctx.font = FONT
  ctx.textBaseline = 'middle'
  const hits = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const y = i * (rowHeight + gap) + rowHeight / 2
    const v = +row[valueKey] || 0
    const x = plotX + (v / max) * plotW
    const highlighted = opts.highlight != null && String(row.taxid) === String(opts.highlight)
    const color = opts.color ? opts.color(row, i) : '#4c78a8'

    ctx.globalAlpha = (opts.highlight != null && !highlighted) ? 0.35 : 1
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(plotX, y); ctx.lineTo(x, y); ctx.stroke()

    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(x, y, highlighted ? 5.5 : 4, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = highlighted ? '#0f172a' : LABEL_COLOR
    ctx.textAlign = 'right'
    ctx.fillText(truncate(ctx, String(row.target || ''), labelWidth), labelWidth, y)

    ctx.fillStyle = MUTED_COLOR
    ctx.textAlign = 'left'
    ctx.fillText(formatCount(v), plotX + plotW + 6, y)

    hits.push({ x: 0, y: i * (rowHeight + gap), w: width, h: rowHeight + gap, row })
  }
  return hits
}

/**
 * Sunburst / ring chart from a nested hierarchy.
 *
 * Arc geometry is computed here rather than via d3.partition so we never build
 * the intermediate node objects d3 attaches layout to — the tree from
 * taxaStore.hierarchy() is walked directly.
 *
 * @returns {Array} hit wedges: [{ a0, a1, r0, r1, node }] in canvas coords,
 *                  resolved by hitWedge().
 */
export function drawSunburst(canvas, opts) {
  const root = opts.root
  const size = opts.size || 220
  const ctx = fitCanvas(canvas, size, size)
  if (!root) return []

  const cx = size / 2
  const cy = size / 2
  const maxDepth = opts.maxDepth || 4
  const ringWidth = (size / 2 - 8) / maxDepth
  const total = root.value || 1
  const hits = []

  const walk = (node, depth, a0, a1) => {
    if (depth > maxDepth) return
    if (a1 - a0 < 0.004) return // sub-pixel wedge: not worth a path

    if (depth > 0) {
      const r0 = depth * ringWidth - ringWidth
      const r1 = depth * ringWidth
      ctx.beginPath()
      ctx.arc(cx, cy, r1, a0, a1)
      ctx.arc(cx, cy, r0, a1, a0, true)
      ctx.closePath()
      ctx.fillStyle = opts.color ? opts.color(node, depth) : '#4c78a8'
      ctx.globalAlpha = opts.highlight != null && String(node.taxid) !== String(opts.highlight) ? 0.4 : 1
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.75
      ctx.stroke()
      hits.push({ a0, a1, r0, r1, node })
    }

    const children = node.children || []
    if (!children.length) return
    let sum = 0
    for (const c of children) sum += (c.value || 0)
    if (sum <= 0) return
    let a = a0
    const span = a1 - a0
    for (const c of children) {
      const frac = (c.value || 0) / sum
      const next = a + span * frac
      walk(c, depth + 1, a, next)
      a = next
    }
  }

  walk(root, 0, -Math.PI / 2, Math.PI * 1.5)

  // Centre label: total reads.
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(formatCount(total), cx, cy)
  return hits
}

// Resolve a pointer position to a wedge from drawSunburst's hit list.
export function hitWedge(hits, x, y, size) {
  const cx = size / 2
  const cy = size / 2
  const dx = x - cx
  const dy = y - cy
  const r = Math.sqrt(dx * dx + dy * dy)
  let a = Math.atan2(dy, dx)
  // drawSunburst starts at -PI/2 and sweeps a full turn, so normalise into
  // [-PI/2, 3PI/2) to match.
  if (a < -Math.PI / 2) a += Math.PI * 2
  for (const h of hits) {
    if (r >= h.r0 && r <= h.r1 && a >= h.a0 && a < h.a1) return h.node
  }
  return null
}

// Resolve a pointer position to a row from drawBars/drawLollipop's hit list.
export function hitRow(hits, x, y) {
  for (const h of hits) {
    if (y >= h.y && y < h.y + h.h) return h.row
  }
  return null
}

export function formatCount(v) {
  v = +v || 0
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return String(v)
}

/* ---------------------------------------------------------------------------
 * Redraw scheduler.
 *
 * Coalesces redraw requests from many panels into ONE animation frame, and
 * spends a bounded slice of that frame drawing. With 24 panels on screen and a
 * report landing every second, this is the difference between 24 synchronous
 * redraws blocking the frame and a smooth progressive repaint.
 * ------------------------------------------------------------------------- */
const DRAW_BUDGET_MS = 10

export class RedrawQueue {
  constructor() {
    this.pending = new Map()  // key -> draw fn
    this.handle = null
    this._run = this._run.bind(this)
  }

  // Latest draw call wins per key, so a panel asked to redraw five times in one
  // frame draws once, with the newest data.
  schedule(key, fn) {
    this.pending.set(key, fn)
    if (!this.handle) this.handle = requestAnimationFrame(this._run)
  }

  cancel(key) {
    this.pending.delete(key)
  }

  clear() {
    this.pending.clear()
    if (this.handle) cancelAnimationFrame(this.handle)
    this.handle = null
  }

  _run() {
    this.handle = null
    const started = performance.now()
    for (const key of Array.from(this.pending.keys())) {
      if (performance.now() - started > DRAW_BUDGET_MS) break
      const fn = this.pending.get(key)
      this.pending.delete(key)
      try { fn() } catch (err) { console.error('panel draw failed', err) }
    }
    if (this.pending.size) this.handle = requestAnimationFrame(this._run)
  }
}

export const redrawQueue = new RedrawQueue()
