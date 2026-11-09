// src/node.ts: the library API over the packed `minimal' bundle (the committed bundles/minimal)
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { normalizePdf } from '../../tools/pdf-normalize.ts'
import { createTeX } from '../../src/node.ts'

const root = new URL('../../', import.meta.url).pathname, oracle = root + 'test/oracle/'

test('createTeX compiles m6-latex-article with runs: auto like pdflatex', async () => {
  const tex = createTeX({ texmf: root + 'bundles/minimal' }), runs: number[] = []
  const r = await tex.compile({ files: { 'm6-latex-article.tex': readFileSync(oracle + 'm6-latex-article.tex') }, main: 'm6-latex-article.tex', date: new Date(0), onProgress: p => { if (p.type === 'run') runs.push(p.n) } })
  assert.ok(r.ok, r.log)
  assert.deepStrictEqual(r.log.split('\n').filter(l => l.startsWith('!')), [])
  assert.deepStrictEqual(runs, [1, 2])
  assert.strictEqual(normalizePdf(r.pdf!), normalizePdf(readFileSync(oracle + 'm6-latex-article.expected.pdf')))
})
