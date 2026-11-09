// writet1.c t1_include and the subsetting path: PDFs with `<<' (whole) and `<' (subsetted) Type 1 fonts are byte-identical
// to pdftex's, xref offsets included (the oracle test compares them after dropping the xref)
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { Engine } from '../../src/engine.ts'
import { gunzipSync } from 'node:zlib'
import { nodeFS } from '../../src/platform/node.ts'
import { bundleFS } from '../../src/platform/browser.ts'

const oracle = new URL('../oracle/', import.meta.url).pathname, texmf = new URL('../texmf/', import.meta.url).pathname
const TEXMFDIST = process.env.TEXMFDIST ?? '/Users/g/texlive/2026/texmf-dist', TEXMFVAR = process.env.TEXMFVAR ?? '/Users/g/texlive/2026/texmf-var'
const haveTL = existsSync(TEXMFDIST + '/ls-R') && existsSync(TEXMFVAR + '/ls-R')
const bundle = new URL('../../bundles/minimal/', import.meta.url).pathname // no TeX Live: the committed bundle
const index = haveTL ? null : JSON.parse(gunzipSync(readFileSync(bundle + 'index.json.gz')).toString())
const texFS = () => {
  if (haveTL) return nodeFS([oracle, texmf], [TEXMFVAR, TEXMFDIST])
  const base = nodeFS([oracle, texmf]), b = bundleFS(index, (p: string) => { try { return new Uint8Array(readFileSync(bundle + p)) } catch { return null } })
  return { ...b, find: (n: string, k: string) => base.find(n, k) ?? b.find(n, k), path: (n: string, k: string) => base.path!(n, k) ?? b.path!(n, k) }
}

for (const name of ['m6-review-type1-include', 'm8-subset-exact', 'm8-subset-seac', 'm8-subset-quirks']) test(`writet1: ${name} is byte-identical to pdftex`, async () => {
  const e = new Engine({ fs: texFS(), limits: { max_print_line: 9999 } })
  await e.run({ jobname: name, mode: 'etex', date: new Date(0) })
  const want = readFileSync(`${oracle}${name}.expected.pdf`)
  assert.ok(e.pdf)
  assert.ok(Buffer.from(e.pdf).equals(want), `PDF bytes differ (${e.pdf.length} vs ${want.length})`)
})
