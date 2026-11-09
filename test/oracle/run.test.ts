// Intended API for M1 (src/engine.ts, src/platform/fs.ts, src/platform/node.ts):
//   interface TexFS { find(name: string, kind: string): Uint8Array | null }   // synchronous: TeX is
//   nodeFS(roots: string[]): TexFS            // src/platform/node.ts, searches roots in order
//   class Engine {
//     constructor(opts: { fs: TexFS })
//     run(opts: { jobname: string, mode: 'ini' | 'etex' | 'latex' }): Promise<void>
//     log: string                             // full .log contents, unnormalised
//     dvi: Uint8Array | null                  // DVI bytes if any page shipped
//     pdf: Uint8Array | null                  // PDF bytes (modes pdflatex/pdftex; run({ date: new Date(0) }) fixes /ID, dates)
// Images: tests use `images/NAME`, resolved against the test/texmf root (oracle.sh copies test/texmf/images into the cwd).
//   }
import { test } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { normalizeLog } from '../../tools/normalize-log.ts'
import { normalizePdf } from '../../tools/pdf-normalize.ts'
import { candidates } from '../../src/platform/lookup.ts'

const dir = new URL('.', import.meta.url).pathname
const lvt = new URL('../lvt/', import.meta.url).pathname
const fmtPath = new URL('../../build/latex.fmt', import.meta.url).pathname
const TEXMFDIST = process.env.TEXMFDIST ?? '/Users/g/texlive/2026/texmf-dist'
const TEXMFVAR = process.env.TEXMFVAR ?? '/Users/g/texlive/2026/texmf-var'
const texmf = new URL('../texmf/', import.meta.url).pathname

// zero the k preamble comment bytes (§617: 247 id num den mag k comment)
const maskDvi = (b: Uint8Array) => {
  const m = Uint8Array.from(b)
  m.fill(0, 15, 15 + (m[14] ?? 0))
  return m
}

// TSTEX_RECORD=FILE appends every texmf-tree file opened (tools/pack-texmf.ts --record)
const record = process.env.TSTEX_RECORD ? new Set<string>() : undefined
if (record) process.on('exit', () => appendFileSync(process.env.TSTEX_RECORD!, [...record].map(f => f + '\n').join('')))
const skip: Record<string, string> = { 'm4-texxet': 'TeXXeT not ported (PLAN: deferred)' }
for (const file of readdirSync(dir).filter(f => f.endsWith('.tex')).sort()) {
  const name = file.slice(0, -4)
  if (!existsSync(`${dir}${name}.expected.log`)) continue
  test(name, { skip: skip[name] }, async () => {
    const expected = readFileSync(`${dir}${name}.expected.log`, 'latin1')
    const oracle = (readFileSync(dir + file, 'utf8').split('\n')[0]!.match(/^%! oracle: *(\w+)/)?.[1] ?? 'ini') as 'ini' | 'etex' | 'latex' | 'pdflatex' | 'pdftex'
    const pdfMode = oracle === 'pdflatex' || oracle === 'pdftex'
    const mode = oracle === 'pdftex' ? 'etex' : oracle // 'pdflatex' is its own engine mode (format + PDF output)
    // string specifiers keep tsc quiet while the modules do not exist yet
    const [{ Engine }, { nodeFS }, { loadFormat }] = await Promise.all([
      import('../../src/engine' + '.ts').catch(() => assert.fail('src/engine.ts missing')),
      import('../../src/platform/node' + '.ts').catch(() => assert.fail('src/platform/node.ts missing')),
      import('../../src/format' + '.ts').catch(() => ({ loadFormat: undefined })),
    ])
    let format, fs = pdfMode ? nodeFS([dir, texmf, lvt], [TEXMFVAR, TEXMFDIST], { record }) : nodeFS([dir, texmf, lvt]), runs = 1, limits = pdfMode ? { max_print_line: 9999 } : {}
    if (mode === 'latex' || mode === 'pdflatex') {
      if (!existsSync(fmtPath)) assert.fail('build/latex.fmt missing: run `node tools/build-format.ts --out build/latex.fmt` first')
      assert.ok(loadFormat, 'src/format.ts missing')
      format = loadFormat(readFileSync(fmtPath))
      fs = nodeFS([dir, texmf, lvt], [TEXMFVAR, TEXMFDIST], { record })
      runs = Number(readFileSync(dir + file, 'utf8').match(/^%! runs: *(\d+)/m)?.[1] ?? 1)
      limits = { max_print_line: 9999 }
    }
    const overlay = new Map<string, string | Uint8Array>() // files written by earlier runs (.aux ...)
    const base = fs
    fs = { ...base, find: (n: string, k: string) => { const o = candidates(n, k).map(c => overlay.get(c)).find(o => o !== undefined); return o === undefined ? base.find(n, k) : typeof o === 'string' ? Buffer.from(o, 'latin1') : o } }
    // SyncTeX: -synctex=N from `%! synctex: N'; Input lines are absolute, so the engine gets pdftex's (temporary) cwd
    const wantSynctex = existsSync(`${dir}${name}.expected.synctex`) ? readFileSync(`${dir}${name}.expected.synctex`, 'latin1') : null
    const synctex = Number(readFileSync(dir + file, 'utf8').match(/^%! synctex: *(-?\d+)/m)?.[1] ?? NaN)
    const cwd = wantSynctex?.match(/^Input:1:(.*)\/\.\/[^/]*$/m)?.[1]
    let engine
    for (let i = 0; i < runs; i++) {
      engine = new Engine({ fs, format, limits })
      await engine.run({ jobname: name, mode, ...(pdfMode && { date: new Date(0) }), ...(!isNaN(synctex) && { synctex }), cwd })
      for (const [n, v] of engine.outputFiles) overlay.set(n, v)
    }
    assert.strictEqual(normalizeLog(engine!.log), expected)
    if (existsSync(`${dir}${name}.expected.out`)) assert.strictEqual(engine!.outputFiles.get(`${name}.out`), readFileSync(`${dir}${name}.expected.out`, 'utf8'))
    if (wantSynctex !== null) {
      assert.ok(engine!.synctex, 'no SyncTeX file produced')
      const got = engine!.synctex[0] === 0x1f && engine!.synctex[1] === 0x8b ? gunzipSync(engine!.synctex) : engine!.synctex
      assert.strictEqual(Buffer.from(got).toString('latin1'), wantSynctex)
    } else assert.strictEqual(engine!.synctex, null, 'pdftex wrote no SyncTeX file')
    const wantPdf = `${dir}${name}.expected.pdf`
    if (pdfMode && !existsSync(wantPdf)) assert.strictEqual(engine!.pdf, null, 'pdftex wrote no PDF')
    else if (pdfMode && readFileSync(wantPdf).length === 0) assert.strictEqual(engine!.pdf?.length, 0, 'pdftex wrote an empty PDF (opened, no pages)')
    else if (pdfMode) {
      assert.ok(engine!.pdf, 'no PDF produced')
      assert.strictEqual(normalizePdf(engine!.pdf), normalizePdf(readFileSync(wantPdf)))
    }
    if (!existsSync(`${dir}${name}.expected.dvi`)) return
    const want = maskDvi(readFileSync(`${dir}${name}.expected.dvi`))
    const got = engine!.dvi ? maskDvi(engine!.dvi) : new Uint8Array()
    const at = want.findIndex((v, i) => v !== got[i])
    assert.deepStrictEqual(got, want, `DVI differs; first differing byte ${at < 0 ? want.length : at}`)
  })
}
