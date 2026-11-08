// web/synctex.js, the demo's SyncTeX reader, over pdftex-written oracle files
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
// @ts-ignore: plain JS module without types
import { parseSynctex, pageOf, sourceOf } from '../../web/synctex.js'

const read = (n: string) => parseSynctex(readFileSync(new URL(`../oracle/${n}.expected.synctex`, import.meta.url), 'latin1'))

test('synctex reader: inputs, records, both directions', () => {
  const sx = read('m9-synctex-input')
  assert.strictEqual(sx.inputs.size, 6)
  assert.ok(sx.records.every((r: { page: number }) => r.page === 1))
  assert.strictEqual(pageOf(sx, 'm9-synctex-sub1.tex', 1), 1)
  assert.strictEqual(pageOf(sx, 'm9-synctex-input.tex', 6), 1) // no record on line 6: the nearest earlier line
  assert.strictEqual(pageOf(sx, 'nowhere.tex', 1), 0)
  assert.deepStrictEqual(sourceOf(sx, 1, ['m9-synctex-input.tex']), { file: 'm9-synctex-input.tex', line: 5 })
  const la = read('m9-synctex-latex')
  assert.strictEqual(pageOf(la, 'm9-synctex-latex.tex', 10), 1)
  assert.strictEqual(pageOf(la, 'm9-synctex-latex.tex', 20), 2)
  assert.strictEqual(sourceOf(la, 2, ['m9-synctex-latex.tex'])?.file, 'm9-synctex-latex.tex')
})
