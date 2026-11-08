// writet1.c t1_include: a PDF whose fonts are all `<<' (whole, t1_include-normalised) entries is byte-identical to pdftex's,
// font programs and xref offsets included (pdf-normalize masks font programs, so the oracle test alone cannot see them)
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { Engine } from '../../src/engine.ts'
import { nodeFS } from '../../src/platform/node.ts'

const oracle = new URL('../oracle/', import.meta.url).pathname, texmf = new URL('../texmf/', import.meta.url).pathname
const TEXMFDIST = process.env.TEXMFDIST ?? '/Users/g/texlive/2026/texmf-dist', TEXMFVAR = process.env.TEXMFVAR ?? '/Users/g/texlive/2026/texmf-var'

test('t1_include: whole fonts are byte-identical to pdftex', async () => {
  const name = 'm6-review-type1-include'
  const e = new Engine({ fs: nodeFS([oracle, texmf], [TEXMFVAR, TEXMFDIST]), limits: { max_print_line: 9999 } })
  await e.run({ jobname: name, mode: 'etex', date: new Date(0) })
  const want = readFileSync(`${oracle}${name}.expected.pdf`)
  assert.ok(e.pdf)
  assert.ok(Buffer.from(e.pdf).equals(want), `PDF bytes differ (${e.pdf.length} vs ${want.length})`)
})
