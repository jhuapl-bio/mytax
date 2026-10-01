// Regression: "edit sample -> change kraken2 database -> rerun" must update
// names, ranks and the tree, not just counts. Different databases (newer NCBI
// taxonomy, GTDB, custom builds) reuse the same taxids with different
// attributes; the run dictionary used to keep the first database's forever.
//
//   node server/bench/dbswitch.mjs
import assert from 'node:assert/strict'
import { taxonStore } from '../taxonstore.mjs'

const NCBI = [
    '10.00\t10\t10\tU\t0\tunclassified',
    '90.00\t90\t0\tR\t1\troot',
    '90.00\t90\t0\tD\t2\t  Bacteria',
    '90.00\t90\t90\tS\t562\t    Escherichia coli'
].join('\n') + '\n'
const GTDB = [
    '10.00\t10\t10\tU\t0\tunclassified',
    '90.00\t90\t0\tR\t1\troot',
    '90.00\t90\t0\tD\t2\t  d__Archaea',
    '90.00\t90\t0\tP\t3\t    p__Halobacteriota',
    '90.00\t90\t90\tS\t562\t      s__Haloferax volcanii'
].join('\n') + '\n'

const RUN = 'dbswitch', SAMPLE = 's1'
const dict = new Map()
const rows = new Map()
const cursor = { version: 0 }, dictCursor = { sent: 0 }
const pull = () => {
    const d = taxonStore.encodeDict(RUN, dictCursor)
    for (let i = 0; d && i < d.length; i += 7) dict.set(d[i], { taxid: d[i + 1], rank: d[i + 2], depth: d[i + 3], parent: d[i + 4], name: d[i + 5] })
    const f = taxonStore.encodeFor(RUN, SAMPLE, cursor)
    if (!f) return
    if (f.full) rows.clear()
    for (let i = 0; i < f.upd.length; i += 4) rows.set(f.upd[i], f.upd[i + 1])
    for (const idx of f.del) rows.delete(idx)
}
const byTaxid = (taxid) => Array.from(rows.keys()).map((i) => dict.get(i)).find((e) => e.taxid === taxid)

let pass = 0
const ok = (msg, fn) => { fn(); pass++; console.log(`  ok    ${msg}`) }

taxonStore.ingest(RUN, SAMPLE, NCBI); pull()
ok('first database: names as reported', () => {
    assert.equal(byTaxid('562').name, 'Escherichia coli')
    assert.equal(byTaxid('2').name, 'Bacteria')
})

taxonStore.ingest(RUN, SAMPLE, GTDB); pull()
ok('second database: same taxids take the new names', () => {
    assert.equal(byTaxid('562').name, 's__Haloferax volcanii')
    assert.equal(byTaxid('2').name, 'd__Archaea')
})
ok('second database: new depth and parent', () => {
    const sp = byTaxid('562')
    assert.equal(sp.depth, 6)
    assert.equal(dict.get(sp.parent).name, 'p__Halobacteriota')
})
ok('old variants are deleted from the client, not left behind', () => {
    const names = Array.from(rows.keys()).map((i) => dict.get(i).name)
    assert.ok(!names.includes('Escherichia coli'))
    assert.ok(!names.includes('Bacteria'))
    assert.equal(rows.size, 5)
})

taxonStore.ingest(RUN, SAMPLE, NCBI); pull()
ok('switching back reuses the original entries (no dictionary churn)', () => {
    assert.equal(byTaxid('562').name, 'Escherichia coli')
    assert.equal(taxonStore.dictFor(RUN).size, 7)
})

taxonStore.drop(RUN)
ok('dropping a run forgets its report hashes too', () => {
    assert.equal(taxonStore.ingest(RUN, SAMPLE, NCBI), true)
})

console.log(`\n${pass} passed`)
