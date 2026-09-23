/*
 * plotExport.js — dependency-free export of a D3/SVG plot to PNG, JPEG, SVG or PDF.
 *
 * Everything in this app draws with D3 into an <svg> that inherits its styling
 * from the component's <style> block. A raw `outerHTML` of that node therefore
 * loses every color, font and stroke once it leaves the page, so the pipeline
 * here is: clone the node -> walk it and copy the *computed* value of the
 * properties that matter onto each element inline -> serialize. From that
 * standalone SVG string we either download directly (svg) or rasterize through
 * an <img> + <canvas> (png / jpeg) and, for pdf, wrap the JPEG bytes in a
 * hand-built single-page PDF so no extra npm dependency is needed.
 *
 * Several plots pair the chart with a legend built from plain HTML rather than
 * SVG (the heatmap's parent legend, Explore's group legend, the co-occurrence
 * colour scale's caption). Any element tagged `data-export-include` is carried
 * into the output inside a <foreignObject>, positioned exactly where it sits on
 * screen, so the exported file matches what the user is looking at. Anything
 * tagged `data-export-ignore` (the export button itself, pagination controls)
 * is left out.
 */

// Properties worth inlining. Copying *all* computed styles works but bloats the
// output by ~50x and slows the clone walk to a crawl on big heatmaps.
const STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'color', 'visibility', 'display',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'letter-spacing', 'word-spacing',
  'text-anchor', 'dominant-baseline', 'alignment-baseline', 'text-decoration',
  'paint-order', 'mix-blend-mode', 'shape-rendering', 'vector-effect',
  'marker-start', 'marker-mid', 'marker-end', 'clip-path', 'mask', 'filter'
]

// HTML legends are laid out by the browser, so reproducing them inside a
// <foreignObject> means carrying over the box model and flex/grid properties as
// well as the paint properties above.
const HTML_PROPS = [
  'box-sizing', 'display', 'position', 'float', 'clear', 'overflow',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-radius',
  'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat',
  'color', 'opacity', 'visibility',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform',
  'text-decoration', 'text-overflow', 'white-space', 'vertical-align',
  'list-style', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
  'align-content', 'align-self', 'flex-grow', 'flex-shrink', 'flex-basis', 'gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'transform', 'transform-origin', 'writing-mode'
]

function inlineHtmlStyles(sourceNode, targetNode) {
  const srcAll = [sourceNode, ...sourceNode.querySelectorAll('*')]
  const dstAll = [targetNode, ...targetNode.querySelectorAll('*')]
  for (let i = 0; i < srcAll.length; i++) {
    const src = srcAll[i]
    const dst = dstAll[i]
    if (!dst || dst.nodeType !== 1) continue
    // Nested SVG inside an HTML legend (a colour-scale strip, say) keeps the
    // SVG property set instead.
    const isSvg = dst.namespaceURI === 'http://www.w3.org/2000/svg'
    const props = isSvg ? STYLE_PROPS : HTML_PROPS
    let computed
    try { computed = window.getComputedStyle(src) } catch (e) { continue }
    if (!computed) continue
    let css = ''
    for (const prop of props) {
      const val = computed.getPropertyValue(prop)
      if (val === '' || val == null) continue
      css += `${prop}:${val};`
    }
    if (css) dst.setAttribute('style', css)
  }
}

/**
 * Serialize an HTML subtree into a <foreignObject> block placed at x/y.
 * Scrollable legends are unclipped so nothing is cut off in the export.
 */
function serializeHtmlPart(el, x, y, width, height) {
  const clone = el.cloneNode(true)
  clone.querySelectorAll('[data-export-ignore]').forEach(n => n.remove())
  inlineHtmlStyles(el, clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  // The live node may be a scroll container; the export shows it in full.
  const base = clone.getAttribute('style') || ''
  clone.setAttribute('style', `${base}overflow:visible;max-height:none;width:${Math.ceil(width)}px;`)
  const xml = new XMLSerializer().serializeToString(clone)
  return `<foreignObject x="${Math.round(x)}" y="${Math.round(y)}" ` +
    `width="${Math.ceil(width) + 2}" height="${Math.ceil(height) + 2}">${xml}</foreignObject>`
}

/** Explicit pixel size of an SVG, falling back to its viewBox then a default. */
export function svgSize(svg) {
  let w = 0
  let h = 0
  try {
    const box = svg.getBoundingClientRect()
    w = box.width
    h = box.height
  } catch (e) { /* detached node */ }
  if ((!w || !h) && svg.viewBox && svg.viewBox.baseVal) {
    w = w || svg.viewBox.baseVal.width
    h = h || svg.viewBox.baseVal.height
  }
  return { width: Math.round(w) || 900, height: Math.round(h) || 600 }
}

function isVisible(el) {
  const b = el.getBoundingClientRect()
  return b.width > 0 && b.height > 0
}

/**
 * Collect the pieces that make up one plot, in document order: every <svg>
 * plus every element explicitly tagged `data-export-include` (HTML legends,
 * colour-scale captions). Anything inside a `data-export-ignore` subtree — the
 * export button itself, pagination controls — is skipped, as is anything that
 * already sits inside a collected part, so nothing is drawn twice.
 *
 * Returns [{ kind: 'svg' | 'html', el, rect }].
 */
export function collectParts(root) {
  if (!root) return []
  const candidates = []
  if (root.tagName && root.tagName.toLowerCase() === 'svg') {
    candidates.push(root)
  } else {
    if (root.matches && root.matches('[data-export-include]')) candidates.push(root)
    candidates.push(...root.querySelectorAll('svg, [data-export-include]'))
  }

  const parts = []
  for (const el of candidates) {
    if (el.closest('[data-export-ignore]')) continue
    if (!isVisible(el)) continue
    // Already covered by an enclosing part (e.g. a colour-scale <svg> that
    // lives inside an included legend block).
    if (parts.some(p => p.el !== el && p.el.contains(el))) continue
    parts.push({
      kind: el.tagName.toLowerCase() === 'svg' ? 'svg' : 'html',
      el,
      rect: el.getBoundingClientRect()
    })
  }

  // Nothing vector to grab — an HTML-only view such as the paginated table
  // panel. Fall back to exporting the whole container as rendered.
  if (!parts.length && root.nodeType === 1 && isVisible(root)) {
    parts.push({ kind: 'html', el: root, rect: root.getBoundingClientRect() })
  }
  return parts
}

/** Back-compatible helper: just the SVG pieces of a plot. */
export function collectSvgs(root) {
  return collectParts(root).filter(p => p.kind === 'svg').map(p => p.el)
}

/** Union bounding box of everything that would be exported, in CSS pixels. */
export function plotSize(root) {
  const parts = collectParts(root)
  if (!parts.length) return null
  if (parts.length === 1 && parts[0].kind === 'svg') return svgSize(parts[0].el)
  const rects = parts.map(p => p.rect)
  return {
    width: Math.ceil(Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left))),
    height: Math.ceil(Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)))
  }
}

function inlineStyles(sourceNode, targetNode) {
  const srcAll = [sourceNode, ...sourceNode.querySelectorAll('*')]
  const dstAll = [targetNode, ...targetNode.querySelectorAll('*')]
  for (let i = 0; i < srcAll.length; i++) {
    const src = srcAll[i]
    const dst = dstAll[i]
    if (!dst || dst.nodeType !== 1) continue
    let computed
    try { computed = window.getComputedStyle(src) } catch (e) { continue }
    if (!computed) continue
    let css = ''
    for (const prop of STYLE_PROPS) {
      const val = computed.getPropertyValue(prop)
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto') {
        css += `${prop}:${val};`
      }
    }
    // Foreign HTML inside the plot needs its box model carried over too.
    if (dst.namespaceURI && dst.namespaceURI.indexOf('xhtml') !== -1) {
      for (const prop of ['background-color', 'padding', 'margin', 'border', 'width', 'height', 'line-height']) {
        const val = computed.getPropertyValue(prop)
        if (val) css += `${prop}:${val};`
      }
    }
    if (css) dst.setAttribute('style', css)
  }
}

/**
 * Serialize one live <svg> to a standalone, style-inlined SVG string.
 * `size` (optional) overrides the output width/height; the drawing is scaled to
 * fit via the viewBox rather than being cropped.
 */
export function serializeSvg(svg, size) {
  const natural = svgSize(svg)
  const clone = svg.cloneNode(true)

  inlineStyles(svg, clone)

  // Interactive chrome (tooltips, hover cursors) has no meaning in a file.
  clone.querySelectorAll('.mtx-tip, .tooltip, [data-export-ignore]').forEach(n => n.remove())

  let vb = svg.getAttribute('viewBox')
  if (!vb) vb = `0 0 ${natural.width} ${natural.height}`
  clone.setAttribute('viewBox', vb)
  clone.setAttribute('width', String((size && size.width) || natural.width))
  clone.setAttribute('height', String((size && size.height) || natural.height))
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  const xml = new XMLSerializer().serializeToString(clone)
  return `<?xml version="1.0" standalone="no"?>\n${xml}`
}

/**
 * Compose every piece of `root` — charts and HTML legends alike — into a single
 * SVG string, preserving their on-screen relative positions so the export is
 * laid out the way the user sees it.
 */
export function serializePlot(root, size, background) {
  const parts = collectParts(root)
  if (!parts.length) throw new Error('Nothing to export — this plot has not been drawn yet.')

  // Single chart, no legend: keep the plain path so the output stays a clean,
  // directly editable SVG with no wrapper.
  if (parts.length === 1 && parts[0].kind === 'svg') {
    const one = serializeSvg(parts[0].el, size)
    return background ? injectBackground(one, background) : one
  }

  const boxes = parts.map(p => p.rect)
  const minX = Math.min(...boxes.map(b => b.left))
  const minY = Math.min(...boxes.map(b => b.top))
  const maxX = Math.max(...boxes.map(b => b.right))
  const maxY = Math.max(...boxes.map(b => b.bottom))
  const w = Math.ceil(maxX - minX)
  const h = Math.ceil(maxY - minY)

  const pieces = parts.map((part) => {
    const b = part.rect
    const x = Math.round(b.left - minX)
    const y = Math.round(b.top - minY)
    if (part.kind === 'html') {
      return serializeHtmlPart(part.el, x, y, b.width, b.height)
    }
    const inner = serializeSvg(part.el, { width: Math.round(b.width), height: Math.round(b.height) })
      .replace(/^<\?xml[^>]*\?>\s*/, '')
    return `<g transform="translate(${x},${y})">${inner}</g>`
  })

  const bg = background
    ? `<rect x="0" y="0" width="${w}" height="${h}" fill="${background}"/>`
    : ''
  return `<?xml version="1.0" standalone="no"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${(size && size.width) || w}" height="${(size && size.height) || h}" ` +
    `viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${bg}${pieces.join('')}</svg>`
}

function injectBackground(svgString, background) {
  return svgString.replace(/(<svg[^>]*>)/, (m) => {
    return `${m}<rect x="0" y="0" width="100%" height="100%" fill="${background}"/>`
  })
}

function svgToImage(svgString) {
  return new Promise((resolve, reject) => {
    // A data: URL (rather than a blob: URL) keeps the canvas untainted in every
    // browser, which is what lets us call toDataURL() afterwards.
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The plot could not be rendered to an image.'))
    img.src = url
  })
}

/** Rasterize a plot to a canvas at exactly width x height CSS pixels * scale. */
export async function rasterize(svgString, width, height, scale, background) {
  const img = await svgToImage(svgString)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/* ------------------------------------------------------------------ *
 * Minimal single-page PDF containing one JPEG image.
 * Written by hand so the app gains no new npm dependency; jsPDF would
 * embed the very same DCTDecode stream for a canvas image anyway.
 * ------------------------------------------------------------------ */
function dataUrlToBinaryString(dataUrl) {
  return atob(dataUrl.split(',')[1])
}

function buildPdf(jpegBinary, pxWidth, pxHeight, ptWidth, ptHeight) {
  const objects = []
  const header = '%PDF-1.4\n'

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth.toFixed(2)} ${ptHeight.toFixed(2)}] ` +
    `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`
  const content = `q ${ptWidth.toFixed(2)} 0 0 ${ptHeight.toFixed(2)} 0 0 cm /Im0 Do Q`
  objects[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  objects[5] = `<< /Type /XObject /Subtype /Image /Width ${pxWidth} /Height ${pxHeight} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBinary.length} >>\n` +
    `stream\n${jpegBinary}\nendstream`

  let pdf = header
  const offsets = []
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n`
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  // Latin-1 round-trip: every byte of the JPEG survives as one char code.
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff
  return new Blob([bytes], { type: 'application/pdf' })
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function safeFilename(name) {
  return String(name || 'plot')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'plot'
}

/**
 * Export a plot.
 *
 * @param {Element} root      wrapper element (or the <svg> itself)
 * @param {Object}  opts
 *   format     'png' | 'jpeg' | 'svg' | 'pdf'
 *   width      output width in px (for pdf, in points at 72dpi)
 *   height     output height in px
 *   scale      raster oversampling factor (png/jpeg/pdf), default 2
 *   background css color painted behind the plot; null = transparent (png/svg)
 *   filename   base name without extension
 */
export async function exportPlot(root, opts = {}) {
  const format = (opts.format || 'png').toLowerCase()
  const scale = Math.min(8, Math.max(1, Number(opts.scale) || 2))
  const background = opts.background || null
  const base = safeFilename(opts.filename)

  const natural = plotSize(root)
  if (!natural) throw new Error('Nothing to export — this plot has not been drawn yet.')

  const width = Math.max(1, Math.round(Number(opts.width) || natural.width))
  const height = Math.max(1, Math.round(Number(opts.height) || natural.height))

  // JPEG and PDF have no alpha channel, so they always get a solid backdrop.
  const needsOpaque = format === 'jpeg' || format === 'jpg' || format === 'pdf'
  const bg = needsOpaque ? (background || '#ffffff') : background

  const svgString = serializePlot(root, { width, height }, bg)

  if (format === 'svg') {
    triggerDownload(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`)
    return
  }

  const canvas = await rasterize(svgString, width, height, scale, bg)

  if (format === 'png') {
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    triggerDownload(blob, `${base}.png`)
    return
  }

  if (format === 'jpeg' || format === 'jpg') {
    const quality = opts.quality != null ? opts.quality : 0.95
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    triggerDownload(blob, `${base}.jpg`)
    return
  }

  if (format === 'pdf') {
    const jpeg = dataUrlToBinaryString(canvas.toDataURL('image/jpeg', 0.95))
    // Page is sized in points so the requested width/height maps 1:1 at 72dpi,
    // while the embedded image keeps the full oversampled pixel resolution.
    const blob = buildPdf(jpeg, canvas.width, canvas.height, width, height)
    triggerDownload(blob, `${base}.pdf`)
    return
  }

  throw new Error(`Unsupported export format: ${format}`)
}

export default { exportPlot, serializePlot, collectParts, collectSvgs, plotSize, svgSize, safeFilename }
