import taxaStore from '../../src/store/taxa.js'

// A small kraken2 report with a real nesting structure.
const report = [
  '100.00\t1000\t0\tR\t1\troot',
  ' 90.00\t900\t0\tD\t2\t  Bacteria',
  ' 60.00\t600\t0\tP\t1224\t    Proteobacteria',
  ' 40.00\t400\t0\tG\t561\t      Escherichia',
  ' 35.00\t350\t350\tS\t562\t        Escherichia coli',
  ' 20.00\t200\t0\tG\t590\t      Salmonella',
  ' 18.00\t180\t180\tS\t28901\t        Salmonella enterica',
  ' 30.00\t300\t0\tP\t1239\t    Firmicutes',
  ' 25.00\t250\t250\tG\t1279\t      Staphylococcus'
].join('\n')

const report2 = report.replace('\t350\t350\t', '\t700\t700\t')

taxaStore.ingestReport('barcode01', report)
taxaStore.ingestReport('barcode02', report2)

let fails = 0
const check = (name, cond, got) => {
  if (cond) console.log('  ok   ', name)
  else { fails++; console.log('  FAIL ', name, got !== undefined ? `→ ${JSON.stringify(got)}` : '') }
}

console.log('\nstore reads')
check('sample count', taxaStore.count('barcode01') === 9, taxaStore.count('barcode01'))
check('total reads', taxaStore.total('barcode01') === 780, taxaStore.total('barcode01'))

const genera = taxaStore.query('barcode01', { ranks: ['G'], limit: 10 })
check('genus query returns 3', genera.length === 3, genera.map(r => r.target))
check('genus sorted by clade desc', genera[0].target === 'Escherichia', genera[0].target)
check('parent resolved from dictionary', genera[0].source === 'Proteobacteria', genera[0].source)
check('percent decoded', Math.abs(genera[0].value - 40) < 0.01, genera[0].value)

console.log('\nhasTaxon (drives linked zoom)')
check('present taxon found', taxaStore.hasTaxon('barcode01', '561') === true)
check('string/number agnostic', taxaStore.hasTaxon('barcode01', 561) === true)
check('absent taxon rejected', taxaStore.hasTaxon('barcode01', '99999') === false)
check('unknown sample rejected', taxaStore.hasTaxon('nope', '561') === false)

console.log('\nhierarchy (drives the sunburst)')
const h = taxaStore.hierarchy('barcode01', { maxNodes: 100 })
check('tree built', !!h)
const names = []
;(function walk(n) { names.push(n.name); (n.children || []).forEach(walk) })(h)
check('tree contains all taxa', names.includes('Escherichia coli') && names.includes('Staphylococcus'), names)
const bact = (h.children || []).find(c => c.name === 'Bacteria') || h
check('tree is nested, not flat', (bact.children || []).length > 0, (bact.children || []).map(c => c.name))
check('taxids are strings throughout', typeof h.children[0].taxid === 'string', typeof h.children[0].taxid)

console.log('\ndictionary is shared across samples')
const before = taxaStore.dict.size
taxaStore.ingestReport('barcode03', report)
check('no new dict entries for identical taxonomy', taxaStore.dict.size === before, `${before} → ${taxaStore.dict.size}`)
check('but the new sample has its own counts', taxaStore.count('barcode03') === 9)

console.log('\ncache invalidation')
const q1 = taxaStore.query('barcode01', { ranks: ['S'], limit: 5 })
taxaStore.ingestReport('barcode01', report2)
const q2 = taxaStore.query('barcode01', { ranks: ['S'], limit: 5 })
check('query reflects the update', q1[0].num_fragments_clade !== q2[0].num_fragments_clade, [q1[0].num_fragments_clade, q2[0].num_fragments_clade])

console.log(`\n${fails ? fails + ' FAILURES' : 'all passed'}\n`)
process.exit(fails ? 1 : 0)
