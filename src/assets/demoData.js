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
 *
 * Species ('S') entries were added under every genus so cross-sample / map species
 * views are populated in offline/demo mode. Genus assigned_reads are reduced
 * accordingly (most reads pushed down to species).
 */

function buildReport(rows) {
  return rows.map((r) => r.join('\t')).join('\n')
}

// ---- Sample 1: coastal seawater bacterioplankton ----------------------------
const seawater = buildReport([
  ['11.20', '1120', '1120', 'U', '0', 'unclassified'],
  ['88.80', '8880', '0',    'R', '1', 'root'],
  ['88.50', '8850', '12',   'R1', '131567', '  cellular organisms'],
  ['74.30', '7430', '60',   'D',  '2',      '    Bacteria'],
  ['41.10', '4110', '30',   'P',  '1224',   '      Proteobacteria'],
  ['28.40', '2840', '20',   'C',  '28211',  '        Alphaproteobacteria'],
  ['16.70', '1670', '40',   'O',  '204455', '          Rhodobacterales'],
  ['12.30', '1230', '30',   'F',  '31989',  '            Rhodobacteraceae'],
  // Roseobacter genus → two species
  ['6.40',  '640',  '10',   'G',  '265',    '              Roseobacter'],
  ['3.80',  '380',  '380',  'S',  '35917',  '                Roseobacter denitrificans'],
  ['2.50',  '250',  '250',  'S',  '1099768','                Roseobacter litoralis'],
  ['9.80',  '980',  '50',   'C',  '1236',   '        Gammaproteobacteria'],
  // Oceanospirillales → Alcanivoracaceae → Alcanivorax → two species
  ['5.10',  '510',  '30',   'O',  '135619', '          Oceanospirillales'],
  ['4.80',  '480',  '40',   'F',  '135620', '            Alcanivoracaceae'],
  ['4.40',  '440',  '20',   'G',  '288255', '              Alcanivorax'],
  ['2.60',  '260',  '260',  'S',  '72754',  '                Alcanivorax borkumensis'],
  ['1.60',  '160',  '160',  'S',  '693772', '                Alcanivorax dieselolei'],
  ['18.60', '1860', '40',   'P',  '976',    '      Bacteroidetes'],
  ['14.20', '1420', '120',  'C',  '117743', '        Flavobacteriia'],
  // Flavobacteriaceae → two genera → two species each
  ['11.90', '1190', '30',   'F',  '49546',  '            Flavobacteriaceae'],
  ['7.00',  '700',  '40',   'G',  '1193',   '              Polaribacter'],
  ['3.90',  '390',  '390',  'S',  '170248', '                Polaribacter irgensii'],
  ['2.70',  '270',  '270',  'S',  '1408388','                Polaribacter sp. MED152'],
  ['4.60',  '460',  '30',   'G',  '237',    '              Flavobacterium'],
  ['2.80',  '280',  '280',  'S',  '1382',   '                Flavobacterium johnsoniae'],
  ['1.50',  '150',  '150',  'S',  '96345',  '                Flavobacterium psychrophilum'],
  // Cyanobacteria → Synechococcus → two species
  ['8.10',  '810',  '60',   'P',  '1117',   '      Cyanobacteria'],
  ['6.30',  '630',  '30',   'G',  '1118',   '        Synechococcus'],
  ['3.70',  '370',  '370',  'S',  '32046',  '          Synechococcus elongatus'],
  ['2.30',  '230',  '230',  'S',  '84588',  '          Synechococcus sp. CC9902'],
  ['2.10',  '210',  '30',   'D',  '2157',   '    Archaea'],
  ['1.40',  '140',  '120',  'P',  '28890',  '      Euryarchaeota'],
])

// ---- Sample 2: marine sediment community ------------------------------------
const sediment = buildReport([
  ['8.60',  '860',  '860',  'U',  '0',      'unclassified'],
  ['91.40', '9140', '0',    'R',  '1',      'root'],
  ['91.00', '9100', '15',   'R1', '131567', '  cellular organisms'],
  ['68.20', '6820', '70',   'D',  '2',      '    Bacteria'],
  ['22.40', '2240', '30',   'P',  '1224',   '      Proteobacteria'],
  ['15.10', '1510', '50',   'C',  '28216',  '        Betaproteobacteria'],
  // Burkholderiales → Burkholderiaceae → Burkholderia → two species
  ['9.70',  '970',  '30',   'O',  '80840',  '          Burkholderiales'],
  ['9.00',  '900',  '30',   'F',  '119060', '            Burkholderiaceae'],
  ['8.20',  '820',  '20',   'G',  '48736',  '              Burkholderia'],
  ['4.80',  '480',  '480',  'S',  '292',    '                Burkholderia cepacia'],
  ['3.20',  '320',  '320',  'S',  '57975',  '                Burkholderia pseudomallei'],
  ['19.80', '1980', '40',   'P',  '201174', '      Actinobacteria'],
  ['12.60', '1260', '110',  'C',  '1760',   '        Actinomycetia'],
  // Micrococcaceae → Micrococcus → two species
  ['8.90',  '890',  '30',   'F',  '85023',  '            Micrococcaceae'],
  ['8.20',  '820',  '20',   'G',  '1743',   '              Micrococcus'],
  ['4.80',  '480',  '480',  'S',  '1744',   '                Micrococcus luteus'],
  ['3.20',  '320',  '320',  'S',  '1743297','                Micrococcus yunnanensis'],
  ['14.50', '1450', '60',   'P',  '1239',   '      Firmicutes'],
  ['9.30',  '930',  '90',   'C',  '91061',  '        Bacilli'],
  // Bacillus genus → two species
  ['6.10',  '610',  '10',   'G',  '1386',   '              Bacillus'],
  ['3.50',  '350',  '350',  'S',  '1423',   '                Bacillus subtilis'],
  ['2.50',  '250',  '250',  'S',  '1396',   '                Bacillus cereus'],
  ['11.70', '1170', '30',   'P',  '976',    '      Bacteroidetes'],
  // Prevotella genus → two species
  ['7.40',  '740',  '10',   'G',  '838',    '              Prevotella'],
  ['4.20',  '420',  '420',  'S',  '28132',  '                Prevotella melaninogenica'],
  ['3.10',  '310',  '310',  'S',  '28131',  '                Prevotella intermedia'],
  ['4.20',  '420',  '40',   'D',  '2157',   '    Archaea'],
  ['3.10',  '310',  '90',   'P',  '28890',  '      Euryarchaeota'],
  ['2.20',  '220',  '200',  'C',  '183968', '        Methanomicrobia'],
])

// ---- Sample 3: marine mammal swab (host + microbiome) -----------------------
const mammalSwab = buildReport([
  ['6.90',  '690',  '690',  'U',  '0',      'unclassified'],
  ['93.10', '9310', '0',    'R',  '1',      'root'],
  ['92.80', '9280', '10',   'R1', '131567', '  cellular organisms'],
  ['38.40', '3840', '40',   'D',  '2759',   '    Eukaryota'],
  ['34.10', '3410', '50',   'K',  '33208',  '      Metazoa'],
  ['31.50', '3150', '60',   'P',  '7711',   '        Chordata'],
  ['29.80', '2980', '70',   'C',  '40674',  '          Mammalia'],
  ['24.60', '2460', '120',  'O',  '9721',   '            Cetacea'],
  // Delphinidae → Tursiops → Tursiops truncatus
  ['20.10', '2010', '30',   'F',  '9722',   '              Delphinidae'],
  ['19.50', '1950', '30',   'G',  '9737',   '                Tursiops'],
  ['18.00', '1800', '1800', 'S',  '9739',   '                  Tursiops truncatus'],
  ['54.20', '5420', '60',   'D',  '2',      '    Bacteria'],
  ['33.70', '3370', '40',   'P',  '1224',   '      Proteobacteria'],
  ['21.40', '2140', '60',   'C',  '1236',   '        Gammaproteobacteria'],
  ['12.80', '1280', '90',   'O',  '135625', '          Pasteurellales'],
  // Pasteurellaceae → Haemophilus → two species
  ['9.10',  '910',  '30',   'F',  '712',    '            Pasteurellaceae'],
  ['8.40',  '840',  '20',   'G',  '724',    '              Haemophilus'],
  ['5.20',  '520',  '520',  'S',  '727',    '                Haemophilus influenzae'],
  ['3.00',  '300',  '300',  'S',  '1839',   '                Haemophilus parainfluenzae'],
  ['14.90', '1490', '50',   'P',  '1239',   '      Firmicutes'],
  ['10.30', '1030', '120',  'C',  '91061',  '        Bacilli'],
  // Streptococcus genus → two species
  ['7.20',  '720',  '20',   'G',  '1301',   '              Streptococcus'],
  ['4.50',  '450',  '450',  'S',  '1313',   '                Streptococcus pneumoniae'],
  ['2.50',  '250',  '250',  'S',  '1314',   '                Streptococcus pyogenes'],
  ['5.60',  '560',  '40',   'P',  '976',    '      Bacteroidetes'],
  // Bacteroides genus → two species
  ['3.80',  '380',  '30',   'G',  '816',    '          Bacteroides'],
  ['2.20',  '220',  '220',  'S',  '817',    '            Bacteroides fragilis'],
  ['1.30',  '130',  '130',  'S',  '818',    '            Bacteroides thetaiotaomicron'],
])

// Demo sampling sites around the Florida coast so the Map tab is populated
// out-of-the-box: Biscayne Bay (Miami), Tampa Bay, and Sarasota Bay.
const demoSamples = [
  { sample: 'demo_seawater_01',    report: seawater,   lat: 25.46, lon: -80.16 },
  { sample: 'demo_sediment_02',    report: sediment,   lat: 27.76, lon: -82.64 },
  { sample: 'demo_mammal_swab_03', report: mammalSwab, lat: 27.34, lon: -82.55 },
]

export default demoSamples
