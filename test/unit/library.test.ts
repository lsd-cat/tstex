// src/node.ts: the library API over the packed `minimal' bundle (built into build/texmf if missing)
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { normalizePdf } from '../../tools/pdf-normalize.ts'
import { createTeX } from '../../src/node.ts'

const root = new URL('../../', import.meta.url).pathname, oracle = root + 'test/oracle/'

test('createTeX compiles m6-latex-article with runs: auto like pdflatex', async () => {
  if (!existsSync(root + 'build/texmf/index.json.gz')) execFileSync(process.execPath, [root + 'tools/pack-texmf.ts', '--preset', 'minimal', '--fmt', root + 'build/latex.fmt', '--out', root + 'build/texmf'])
  const tex = createTeX({ texmf: root + 'build/texmf' }), runs: number[] = []
  const r = await tex.compile({ files: { 'm6-latex-article.tex': readFileSync(oracle + 'm6-latex-article.tex') }, main: 'm6-latex-article.tex', date: new Date(0), onProgress: p => { if (p.type === 'run') runs.push(p.n) } })
  assert.ok(r.ok, r.log)
  assert.deepStrictEqual(r.log.split('\n').filter(l => l.startsWith('!')), [])
  assert.deepStrictEqual(runs, [1, 2])
  assert.strictEqual(normalizePdf(r.pdf!), normalizePdf(readFileSync(oracle + 'm6-latex-article.expected.pdf')))
})
