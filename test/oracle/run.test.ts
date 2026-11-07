// Intended API for M1 (src/engine.ts, src/platform/fs.ts, src/platform/node.ts):
//   interface TexFS { find(name: string, kind: string): Uint8Array | null }   // synchronous: TeX is
//   nodeFS(roots: string[]): TexFS            // src/platform/node.ts, searches roots in order
//   class Engine {
//     constructor(opts: { fs: TexFS })
//     run(opts: { jobname: string, mode: 'ini' | 'etex' | 'latex' }): Promise<void>
//     log: string                             // full .log contents, unnormalised
//     dvi: Uint8Array | null                  // DVI bytes if any page shipped
//   }
import { test } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { normalizeLog } from '../../tools/normalize-log.ts'

const dir = new URL('.', import.meta.url).pathname
const lvt = new URL('../lvt/', import.meta.url).pathname
const texmf = new URL('../texmf/', import.meta.url).pathname

// zero the k preamble comment bytes (§617: 247 id num den mag k comment)
const maskDvi = (b: Uint8Array) => {
  const m = Uint8Array.from(b)
  m.fill(0, 15, 15 + (m[14] ?? 0))
  return m
}

for (const file of readdirSync(dir).filter(f => f.endsWith('.tex')).sort()) {
  const name = file.slice(0, -4)
  if (!existsSync(`${dir}${name}.expected.log`)) continue
  test(name, async () => {
    const expected = readFileSync(`${dir}${name}.expected.log`, 'utf8')
    const mode = (readFileSync(dir + file, 'utf8').split('\n')[0]!.match(/^%! oracle: *(\w+)/)?.[1] ?? 'ini') as 'ini' | 'etex' | 'latex'
    // string specifiers keep tsc quiet while the modules do not exist yet
    const [{ Engine }, { nodeFS }] = await Promise.all([
      import('../../src/engine' + '.ts').catch(() => assert.fail('src/engine.ts missing')),
      import('../../src/platform/node' + '.ts').catch(() => assert.fail('src/platform/node.ts missing')),
    ])
    const engine = new Engine({ fs: nodeFS([dir, texmf, lvt]) })
    await engine.run({ jobname: name, mode })
    assert.strictEqual(normalizeLog(engine.log), expected)
    if (existsSync(`${dir}${name}.expected.out`)) assert.strictEqual(engine.outputFiles.get(`${name}.out`), readFileSync(`${dir}${name}.expected.out`, 'utf8'))
    if (!existsSync(`${dir}${name}.expected.dvi`)) return
    const want = maskDvi(readFileSync(`${dir}${name}.expected.dvi`))
    const got = engine.dvi ? maskDvi(engine.dvi) : new Uint8Array()
    const at = want.findIndex((v, i) => v !== got[i])
    assert.deepStrictEqual(got, want, `DVI differs; first differing byte ${at < 0 ? want.length : at}`)
  })
}
