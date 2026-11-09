// §1302–1337: \dump into an in-memory format, `&name' loads it; the terminal option feeds `**' and error prompts
import { test } from 'node:test'
import assert from 'node:assert'
import { Engine } from '../../src/engine.ts'
import type { TexFS } from '../../src/platform/fs.ts'
import { candidates } from '../../src/platform/lookup.ts'

const files: Record<string, string> = {
  'a.tex': '\\catcode`\\{=1 \\catcode`\\}=2 \\def\\hello{Hi}\\count7=42 \\dump\n',
  'b.tex': '\\message{\\hello\\the\\count7}\\undefinedcs\\end\n',
}
const fs: TexFS = { find: n => { const c = candidates(n, 'tex').find(c => c in files); return c === undefined ? null : new TextEncoder().encode(files[c]) } }
const date = new Date(2000, 0, 2, 3, 4)

test('format round trip and terminal dialogue', async () => {
  const e1 = new Engine({ fs })
  await e1.run({ mode: 'ini', terminal: ['', 'a'], date })
  assert.match(e1.terminal, /^This is tstex.*\n\*\*\nPlease type the name of your input file\.\n\*\*a\n/)
  assert.match(e1.log, /Beginning to dump on file a\.fmt\n \(preloaded format=a 2000\.1\.2\)/)
  assert.ok(e1.fmt_file)
  const e2 = new Engine({ fs, format: e1.fmt_file })
  await e2.run({ mode: 'ini', terminal: ['&a b', ''], date }) // the empty line answers the error's `?' prompt
  assert.match(e2.log, /^This is tstex, Version 3\.141592653 \(preloaded format=a 2000\.1\.2\)/)
  assert.match(e2.log, /Hi42/)
  assert.match(e2.log, /! Undefined control sequence\.[^]*\? \n/)
  assert.strictEqual(e2.history, 2) // error_message_issued, not a fatal stop
})

// pdftex.web 37185: `if not no_new_control_sequence then … else' skips §1337's format load right after `*' enters
// extended mode. `printf '*&x \message{hi}\end\n' | pdftex -ini' prints on the terminal:
//   entering extended mode
//   ! I can't find file `&x'.
//   <*> *&x 
//           \message{hi}\end
test('* then &name: &name is a file name, not a format', async () => {
  const e = new Engine({ fs })
  await e.run({ mode: 'ini', terminal: ['*&x \\message{hi}\\end'], date })
  assert.match(e.terminal, /entering extended mode\n! I can't find file `&x'\.\n<\*> \*&x \n {8}\\message\{hi\}\\end\n/)
  assert.match(e.log, /End of file on the terminal!/) // the file-name prompt reads the exhausted terminal
})

// loadFormat on hostile bytes: one clear error each, bounded memory (the decompressed size is capped)
test('format bytes: round trip, then corrupt formats fail cleanly', async () => {
  const { dumpFormat, loadFormat } = await import('../../src/format.ts')
  const e1 = new Engine({ fs })
  await e1.run({ mode: 'ini', terminal: ['a'], date })
  const good = await dumpFormat(e1.fmt_file!)
  assert.strictEqual((await loadFormat(good)).format_ident, e1.fmt_file!.format_ident)
  const gz = async (s: string | Uint8Array<ArrayBuffer>) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
  const i32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24]
  const bin = (...parts: number[][]) => Uint8Array.from([...'tstex format 3'].map(c => c.charCodeAt(0)).concat(parts.flat()))
  const bad: [string, Uint8Array][] = [
    ['truncated gzip', good.slice(0, good.length >> 1)],
    ['not gzip', new TextEncoder().encode('hello')],
    ['empty', new Uint8Array()],
    ['gzip of garbage', await gz('\x00\x01 not a format')],
    ['wrong magic', await gz('tstex format 1[]')],
    ['JSON format (old encoding)', await gz(JSON.stringify(['tstex format 1', {}]))],
    ['missing tables', await gz(bin([14, ...i32(0), ...i32(1), 6, ...i32(4), ...'info'].map(c => typeof c === 'string' ? c.charCodeAt(0) : c), [10, ...i32(0)]))],
    ['unknown tag', await gz(bin([99]))],
    ['truncated', await gz(bin([10, ...i32(1000)]))],
    ['trailing bytes', await gz(bin([1, 1]))],
    ['bad reference', await gz(bin([9, ...i32(1), 8, ...i32(7)]))],
    ['deep nesting', await gz(bin(Array.from({ length: 200000 }, () => [9, ...i32(1)]).flat()))],
    ['gzip bomb', await gz(new Uint8Array(130 << 20).fill(32))],
  ]
  for (const [what, b] of bad) await assert.rejects(loadFormat(b), /^Error: Fatal format file error; I'm stymied/, what)
})
