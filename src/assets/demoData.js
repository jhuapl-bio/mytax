/*
 * Demo Kraken2 reports for offline / GitHub Pages (frontend-only) mode.
 *
 * When the app is served without a backend (e.g. on GitHub Pages) the socket.io
 * connection fails and the UI drops into "offline mode". These canned reports let
 * a visitor explore every visualization tab without a server, and mirror the shape
 * the live backend would stream in over the "data" / "sampledata" socket events.
 *
 * Each report mimics standard `kraken2 --report` output, tab-separated:
 *   percent  clade_reads  assigned_reads  rank_code  taxid  name(indented 2 spaces/level)
 *
 * Building the rows programmatically (join('\t')) guarantees correct tab delimiters
 * regardless of editor settings.
 */

function buildReport(rows) {
  return rows.map((r) => r.join('\t')).join('\n')
}

// ---- Sample 1: coastal seawater bacterioplankton ----------------------------
const seawater = buildReport([
  ['11.20', '1120', '1120', 'U', '0', 'unclassified'],
  ['88.80', '8880', '0', 'R', '1', 'root'],
  ['88.50', '8850', '12', 'R1', '131567', '  cellular organisms'],
  ['74.30', '7430', '60', 'D', '2', '    Bacteria'],
  ['41.10', '4110', '30', 'P', '1224', '      Proteobacteria'],
  ['28.40', '2840', '20', 'C', '28211', '        Alphaproteobacteria'],
  ['16.70', '1670', '40', 'O', '204455', '          Rhodobacterales'],
  ['12.30', '1230', '900', 'F', '31989', '            Rhodobacteraceae'],
  ['6.40', '640', '610', 'G', '265', '              Roseobacter'],
  ['9.80', '980', '50', 'C', '1236', '        Gammaproteobacteria'],
  ['5.10', '510', '480', 'O', '135619', '          Oceanospirillales'],
  ['18.60', '1860', '40', 'P', '976', '      Bacteroidetes'],
  ['14.20', '1420', '120', 'C', '117743', '        Flavobacteriia'],
  ['11.90', '1190', '950', 'F', '49546', '            Flavobacteriaceae'],
  ['8.10', '810', '60', 'P', '1117', '      Cyanobacteria'],
  ['6.30', '630', '600', 'G', '1118', '        Synechococcus'],
  ['2.10', '210', '30', 'D', '2157', '    Archaea'],
  ['1.40', '140', '120', 'P', '28890', '      Euryarchaeota'],
])

// ---- Sample 2: marine sediment community ------------------------------------
const sediment = buildReport([
  ['8.60', '860', '860', 'U', '0', 'unclassified'],
  ['91.40', '9140', '0', 'R', '1', 'root'],
  ['91.00', '9100', '15', 'R1', '131567', '  cellular organisms'],
  ['68.20', '6820', '70', 'D', '2', '    Bacteria'],
  ['22.40', '2240', '30', 'P', '1224', '      Proteobacteria'],
  ['15.10', '1510', '50', 'C', '28216', '        Betaproteobacteria'],
  ['9.70', '970', '820', 'O', '80840', '          Burkholderiales'],
  ['19.80', '1980', '40', 'P', '201174', '      Actinobacteria'],
  ['12.60', '1260', '110', 'C', '1760', '        Actinomycetia'],
  ['8.90', '890', '700', 'F', '85023', '            Micrococcaceae'],
  ['14.50', '1450', '60', 'P', '1239', '      Firmicutes'],
  ['9.30', '930', '90', 'C', '91061', '        Bacilli'],
  ['6.10', '610', '560', 'G', '1386', '              Bacillus'],
  ['11.70', '1170', '30', 'P', '976', '      Bacteroidetes'],
  ['7.40', '740', '690', 'G', '838', '              Prevotella'],
  ['4.20', '420', '40', 'D', '2157', '    Archaea'],
  ['3.10', '310', '90', 'P', '28890', '      Euryarchaeota'],
  ['2.20', '220', '200', 'C', '183968', '        Methanomicrobia'],
])

// ---- Sample 3: marine mammal swab (host + microbiome) -----------------------
const mammalSwab = buildReport([
  ['6.90', '690', '690', 'U', '0', 'unclassified'],
  ['93.10', '9310', '0', 'R', '1', 'root'],
  ['92.80', '9280', '10', 'R1', '131567', '  cellular organisms'],
  ['38.40', '3840', '40', 'D', '2759', '    Eukaryota'],
  ['34.10', '3410', '50', 'K', '33208', '      Metazoa'],
  ['31.50', '3150', '60', 'P', '7711', '        Chordata'],
  ['29.80', '2980', '70', 'C', '40674', '          Mammalia'],
  ['24.60', '2460', '120', 'O', '9721', '            Cetacea'],
  ['20.10', '2010', '1900', 'F', '9722', '              Delphinidae'],
  ['54.20', '5420', '60', 'D', '2', '    Bacteria'],
  ['33.70', '3370', '40', 'P', '1224', '      Proteobacteria'],
  ['21.40', '2140', '60', 'C', '1236', '        Gammaproteobacteria'],
  ['12.80', '1280', '90', 'O', '135625', '          Pasteurellales'],
  ['9.10', '910', '780', 'F', '712', '            Pasteurellaceae'],
  ['14.90', '1490', '50', 'P', '1239', '      Firmicutes'],
  ['10.30', '1030', '120', 'C', '91061', '        Bacilli'],
  ['7.20', '720', '650', 'G', '1301', '              Streptococcus'],
  ['5.60', '560', '40', 'P', '976', '      Bacteroidetes'],
])

// Demo sampling sites around the Florida coast so the Map tab is populated
// out-of-the-box: Biscayne Bay (Miami), Tampa Bay, and Sarasota Bay.
const demoSamples = [
  { sample: 'demo_seawater_01', report: seawater, lat: 25.46, lon: -80.16 },
  { sample: 'demo_sediment_02', report: sediment, lat: 27.76, lon: -82.64 },
  { sample: 'demo_mammal_swab_03', report: mammalSwab, lat: 27.34, lon: -82.55 },
]

export default demoSamples
