// LaTeX regression suite (.lvt). Not part of `npm test`; run with `npm run test:lvt`, optionally LVT=base/foo,l3kernel/bar.
// Engine contract: run({ jobname: name, mode: 'latex', file: name + '.lvt' }) -- `file` is the main file name, default jobname + '.tex'.
// Expected files come from tools/gen-lvt.sh (pdftex oracle); tests listed in skip.txt are meaningless (missing support file).
import { test } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { normalizeLog } from '../../tools/normalize-log.ts'

const dir = new URL('.', import.meta.url).pathname
const fmtPath = new URL('../../build/latex.fmt', import.meta.url).pathname
const TEXMFDIST = process.env.TEXMFDIST ?? '/Users/g/texlive/2026/texmf-dist'
const TEXMFVAR = process.env.TEXMFVAR ?? '/Users/g/texlive/2026/texmf-var'
const skip = new Map(readFileSync(dir + 'skip.txt', 'utf8').split('\n').filter(Boolean).map(l => [l.split(': ')[0]!, l.split(': ').slice(1).join(': ')]))
const only = process.env.LVT?.split(',')
const maskDvi = (b: Uint8Array) => { const m = Uint8Array.from(b); m.fill(0, 15, 15 + (m[14] ?? 0)); return m }

for (const pkg of readdirSync(dir).filter(p => existsSync(`${dir}${p}/`) && !p.startsWith('_') && p !== 'node_modules').sort()) {
  for (const file of readdirSync(dir + pkg).filter(f => f.endsWith('.lvt')).sort()) {
    const name = file.slice(0, -4), id = `${pkg}/${name}`, base = `${dir}${pkg}/${name}`
    if (!existsSync(`${base}.expected.log`) || (only && !only.includes(id))) continue
    test(id, { skip: skip.get(id) }, async () => {
      if (!existsSync(fmtPath)) assert.fail('build/latex.fmt missing: run `node tools/build-format.ts --out build/latex.fmt` first')
      const [{ Engine }, { nodeFS }, { loadFormat }] = await Promise.all([
        import('../../src/engine' + '.ts').catch(() => assert.fail('src/engine.ts missing')),
        import('../../src/platform/node' + '.ts').catch(() => assert.fail('src/platform/node.ts missing')),
        import('../../src/format' + '.ts').catch(() => assert.fail('src/format.ts missing')),
      ])
      const fs = nodeFS([dir + pkg, dir], [TEXMFDIST, TEXMFVAR])
      const engine = new Engine({ fs, format: loadFormat(readFileSync(fmtPath)), limits: { max_print_line: 9999 } })
      await engine.run({ jobname: name, mode: 'latex', file: name + '.lvt' })
      assert.strictEqual(normalizeLog(engine.log), readFileSync(`${base}.expected.log`, 'utf8'))
      if (!existsSync(`${base}.expected.dvi`)) return
      const want = maskDvi(readFileSync(`${base}.expected.dvi`)), got = engine.dvi ? maskDvi(engine.dvi) : new Uint8Array()
      const at = want.findIndex((v, i) => v !== got[i])
      assert.deepStrictEqual(got, want, `DVI differs; first differing byte ${at < 0 ? want.length : at}`)
    })
  }
}
