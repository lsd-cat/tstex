// §1302–1337: \dump into an in-memory format, `&name' loads it; the terminal option feeds `**' and error prompts
import { test } from 'node:test'
import assert from 'node:assert'
import { Engine } from '../../src/engine.ts'
import type { TexFS } from '../../src/platform/fs.ts'

const files: Record<string, string> = {
  'a.tex': '\\catcode`\\{=1 \\catcode`\\}=2 \\def\\hello{Hi}\\count7=42 \\dump\n',
  'b.tex': '\\message{\\hello\\the\\count7}\\undefinedcs\\end\n',
}
const fs: TexFS = { find: n => n in files ? new TextEncoder().encode(files[n]) : null }
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
