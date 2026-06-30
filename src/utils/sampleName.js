// Shared helpers for rendering hierarchical sample ids.
//
// The backend now mints unique, parent-scoped sample ids for barcoded runs so
// that two run folders that both contain barcode01..24 don't collide. The id
// encodes the hierarchy as `<group>__<label>` (e.g. "RunA__barcode01"). These
// helpers turn that machine id back into something readable for the UI/plots
// without needing the samplesheet — the id alone carries the hierarchy.

export const SAMPLE_ID_SEP = '__';

// Split a sample id into { group, label }. Standalone (non-barcoded) samples
// have no separator, so group is null and label is the id itself.
export function splitSampleId(id) {
  if (id == null) return { group: null, label: '' };
  const s = String(id);
  const i = s.indexOf(SAMPLE_ID_SEP);
  if (i > 0) return { group: s.slice(0, i), label: s.slice(i + SAMPLE_ID_SEP.length) };
  return { group: null, label: s };
}

// "RunA__barcode01" -> "RunA / barcode01"; standalone ids are returned as-is.
export function fmtSampleName(id) {
  const { group, label } = splitSampleId(id);
  return group ? `${group} / ${label}` : label;
}

// Just the short label within its group ("barcode01").
export function sampleLabel(id) {
  return splitSampleId(id).label;
}

// Just the parent group/run name, or null for standalone samples.
export function sampleGroup(id) {
  return splitSampleId(id).group;
}

// Register a global `fmtSample` filter + `$fmtSample` method on a Vue instance.
export function installSampleNameHelpers(Vue) {
  Vue.filter('fmtSample', fmtSampleName);
  Vue.prototype.$fmtSample = fmtSampleName;
  Vue.prototype.$sampleLabel = sampleLabel;
  Vue.prototype.$sampleGroup = sampleGroup;
}
