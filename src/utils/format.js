// Small, dependency-free display formatters shared by the summary and database
// panels.

export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1000)))
  const v = n / Math.pow(1000, i)
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export function formatCount(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(1)}k`
  return v.toLocaleString()
}

export function formatPct(p, digits = 1) {
  const v = Number(p)
  if (p === null || p === undefined || !Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)}%`
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

export function median(values) {
  const v = (values || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

// Build a case-insensitive matcher from a search box string.
//
// The string is treated as a regular expression, so `Sample5|S2|specimenA`
// matches any of the three. Empty alternatives (e.g. the `||` in
// `Sample5||S2`) are dropped — in a raw regex they would match everything.
// If the text isn't a valid regex it falls back to a plain substring match.
// Returns { test(str) -> bool, isRegex, error }.
export function makeMatcher(query) {
  const q = (query == null ? '' : String(query)).trim()
  if (!q) return { test: () => true, isRegex: false, error: null, empty: true }
  const parts = q.split('|').map((p) => p.trim()).filter(Boolean)
  const source = parts.join('|')
  if (!source) return { test: () => true, isRegex: false, error: null, empty: true }
  try {
    const re = new RegExp(source, 'i')
    return { test: (s) => re.test(String(s == null ? '' : s)), isRegex: /[|^$.*+?()[\]{}\\]/.test(source), error: null, empty: false }
  } catch (err) {
    const lower = q.toLowerCase()
    return {
      test: (s) => String(s == null ? '' : s).toLowerCase().includes(lower),
      isRegex: false,
      error: 'Not a valid regular expression — matching as plain text',
      empty: false
    }
  }
}
