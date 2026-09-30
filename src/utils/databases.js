// Shared status vocabulary for reference databases, so the drawer selector,
// the settings list and the add-sample dialog all show the same icon, colour
// and hover explanation for a given database.
import { formatBytes } from '@/utils/format'

export function dbOnDisk(db) {
  if (!db) return false
  return !!(db.exists || (db.size && db.size !== 0))
}

export function dbEngineLabel(db) {
  const t = db && db.type
  if (t === 'minimap2') return 'minimap2 reference (FASTA/MMI)'
  if (t === 'taxdump') return 'NCBI taxonomy (support resource, not a classifier)'
  return 'Kraken2 / Bracken index'
}

// -> { state, icon, color, label, tip }
export function dbStatus(db) {
  if (!db) return { state: 'none', icon: 'mdi-help-circle-outline', color: 'grey', label: '', tip: '' }
  const name = db.label || db.key
  if (db.downloading && db.phase === 'extracting') {
    return {
      state: 'extracting', icon: 'mdi-package-down', color: 'deep-purple lighten-1', label: 'Extracting…',
      tip: `${name}: download finished, now unpacking the archive. Large databases can take several minutes.`
    }
  }
  if (db.downloading) {
    const pct = db.progress != null ? `${Math.round(db.progress)}%` : 'starting'
    const bytes = db.downloaded ? ` (${formatBytes(db.downloaded)}${db.total ? ` of ${formatBytes(db.total)}` : ''})` : ''
    return {
      state: 'downloading', icon: 'mdi-download', color: 'blue darken-1', label: `Downloading ${pct}`,
      tip: `${name}: downloading — ${pct}${bytes}. It can be used once the download and extraction finish.`
    }
  }
  if (db.error) {
    return {
      state: 'error', icon: 'mdi-alert-circle', color: 'red darken-1', label: 'Download failed',
      tip: `${name}: the last download failed — ${db.error}. Use Download to retry.`
    }
  }
  if (dbOnDisk(db)) {
    return {
      state: 'ready', icon: 'mdi-check-circle', color: 'green darken-1', label: `Ready${db.size ? ` · ${db.size}` : ''}`,
      tip: `${name}: downloaded and ready${db.size ? ` (${db.size} on disk)` : ''}.${db.fullpath ? ` Location: ${db.fullpath}` : ''}`
    }
  }
  return {
    state: 'missing', icon: 'mdi-alert', color: 'orange darken-1', label: 'Not downloaded',
    tip: `${name}: not downloaded yet. Select it and press Download. Samples that use it will fail to classify until it is on disk.`
  }
}

// Find the catalogue entry a stored database path refers to. The stored value
// is the entry's `fullpath`, which can change once a download completes (the
// server resolves nested kraken2 index folders), so also match on the
// canonical folder name.
export function findDbByPath(databases, value) {
  if (!value) return null
  const list = databases || []
  const exact = list.find((d) => d && d.fullpath === value)
  if (exact) return exact
  const parts = String(value).split(/[\\/]/)
  return list.find((d) => d && d.final && parts.includes(d.final)) || null
}
