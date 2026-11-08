// Trust boundary: a hostile .tex (and hostile .tfm/.tcx bytes) run through Engine + nodeFS. Reads stay inside the roots,
// texmf trees, files written this run and /dev/null; writes stay inside the first root; nothing throws (AUDIT.md Security).
import { test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Engine } from '../../src/engine.ts'
import { nodeFS } from '../../src/platform/node.ts'

const texmf = new URL('../texmf/', import.meta.url).pathname
const tstex = new URL('../../bin/tstex.ts', import.meta.url).pathname
const top = mkdtempSync(join(tmpdir(), 'tstex-sec-')), root = join(top, 'root'), tree = join(top, 'tree')
const secret = 'SECRET-7f3a'
writeFileSync(join(top, 'secret.tex'), secret + '\n')
mkdirSync(root); mkdirSync(join(root, 'sub'))
symlinkSync(join(top, 'secret.tex'), join(root, 'link.tex')) // a symlink inside a root pointing outside
symlinkSync(top, join(root, 'linkdir'))
symlinkSync(join(top, 'victim.tex'), join(root, 'outlink.tex')) // \openout through it would write outside
mkdirSync(join(tree, 'tex/latex/foo'), { recursive: true })
writeFileSync(join(tree, 'tex/latex/foo/bar.sty'), 'BAR\n')
symlinkSync(join(top, 'secret.tex'), join(tree, 'tex/latex/foo/leak.sty'))
writeFileSync(join(tree, 'ls-R'), './tex/latex/foo:\nbar.sty\nleak.sty\n')
let seed = 1; const rand = (n: number) => Uint8Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24)
writeFileSync(join(root, 'rand.tfm'), rand(1000))
writeFileSync(join(root, 'empty.tfm'), new Uint8Array())
writeFileSync(join(root, 'lf.tfm'), Uint8Array.from({ length: 24 }, (_, i) => i < 2 ? 0xff : 0))
writeFileSync(join(root, 'garbage.tcx'), rand(4000))

const pre = '\\catcode`\\{=1 \\catcode`\\}=2 \\catcode`\\#=6 \\catcode`\\^=7 \\catcode0=12 \\catcode`\\%=12 \\scrollmode '
async function run(body: string, tcx?: string, limits?: { main_memory: number }): Promise<Engine> {
  writeFileSync(join(root, 't.tex'), pre + body.replaceAll('TOP', top) + '\n\\end\n')
  const e = new Engine({ fs: nodeFS([root, texmf], [tree]), tcx, limits })
  await e.run({ file: 't', mode: 'etex' }) // must not throw
  assert.ok(!e.log.includes(secret), 'secret leaked into the log')
  return e
}

const unreadable = ['../secret', '../secret.tex', 'TOP/secret', 'TOP/secret.tex', '/etc/passwd', './../secret', '././../secret',
  'sub/../../secret', 'sub/../t', 'link', 'link.tex', 'linkdir/secret', 'a^^@b', 'x'.repeat(5000), 'a%b', 'a^^Jb',
  'evil/bar.sty', '/tex/latex/foo/bar.sty', 'leak.sty', 'foo/leak.sty']
for (const name of unreadable) test(`read refused: ${name.slice(0, 40)}`, async () => {
  const e = await run(`\\message{[\\pdffilesize{${name}}][\\pdfmdfivesum file{${name}}][\\pdffilemoddate{${name}}]}` +
    `\\openin1={${name}} \\message{\\ifeof1 EOF\\else OPEN\\fi}\\input{${name}}`)
  assert.match(e.log, /\[\]\[\]\[\] EOF/)
  assert.match(e.log, /! I can't find file `/)
  assert.match(e.log, /! Emergency stop\.|End of file on the terminal!/)
})

test('read refused: quoted and unbraced names', async () => {
  for (const b of ['\\input "../secret"', '\\input TOP/secret', '\\input ../secret ', '\\openin1=../secret \\read1to\\x\\show\\x']) {
    const e = await run(b)
    assert.doesNotMatch(e.log, /OPEN/)
  }
})

test('readable: roots, texmf trees, /dev/null, files written this run', async () => {
  const e = await run('\\message{[\\pdffilesize{/dev/null}][\\pdffilesize{foo/bar.sty}][\\pdffilesize{plain}]}' +
    '\\immediate\\openout1=sub/w \\immediate\\write1{WRITTEN}\\immediate\\closeout1 \\openin1=sub/w \\read1to\\x\\message{\\x}' +
    '\\input /dev/null \\input ./././sub/w ')
  assert.match(e.log, /\[0\]\[4\]\[\d+\]/)
  assert.match(e.log, /WRITTEN /)
  assert.match(e.log, /\(\/dev\/null\)/)
})

const unwritable = ['../x', 'TOP/x', '.bashrc', 'x/../../y', 'sub/.hidden', '{a^^@b}', 'x'.repeat(300), 'nodir/x', 'linkdir/x', 'outlink']
for (const name of unwritable) test(`write refused: ${name.slice(0, 40)}`, async () => {
  const e = await run(`\\immediate\\openout1=${name} \\immediate\\write1{x}`)
  assert.match(e.log, /! I can't write on file `/)
  assert.deepStrictEqual([...e.outputFiles.keys()], [])
})

test('CLI writes only inside the job directory, never through a symlink', () => {
  const job = join(top, 'job'); mkdirSync(job)
  writeFileSync(join(top, 'victim.log'), 'untouched')
  symlinkSync(join(top, 'victim.log'), join(job, 't.log')) // e.g. unpacked from a hostile tarball
  symlinkSync(top, join(job, 'up'))
  writeFileSync(join(job, 't.tex'), pre.replace('\\scrollmode ', '') + '\\immediate\\openout1=ok \\immediate\\write1{ok}' +
    '\\immediate\\openout2=up/escaped \\immediate\\openout3=../escaped \\immediate\\openout4=/tmp/escaped\\end\n')
  const r = spawnSync(process.execPath, [tstex, '--texmf', texmf, join(job, 't.tex')], { encoding: 'latin1' })
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /not writing "t\.log"/)
  assert.strictEqual(readFileSync(join(top, 'victim.log'), 'latin1'), 'untouched')
  assert.strictEqual(readFileSync(join(job, 'ok.tex'), 'latin1'), 'ok\n')
  assert.deepStrictEqual(readdirSync(job).sort(), ['ok.tex', 't.log', 't.tex', 'up'])
  assert.ok(!readdirSync(top).includes('escaped.tex'))
})

for (const f of ['rand', 'empty', 'lf']) test(`hostile TFM: ${f}.tfm is a bad metric file`, async () => {
  const e = await run(`\\font\\x=${f} `)
  assert.match(e.log, new RegExp(`! Font \\\\x=${f} not loadable: Bad metric \\(TFM\\) file\\.`))
})

test('hostile TCX: random bytes are tolerated', async () => {
  const e = await run('\\message{ok}', 'garbage.tcx')
  assert.match(e.log, /\(\.\/garbage\.tcx\)/)
})

// Resource exhaustion ends in TeX's capacity errors, not a JS exception
const capacity: [string, string][] = [
  ['\\count1=0 \\def\\l{\\advance\\count1 1 \\expandafter\\let\\csname x\\the\\count1\\endcsname\\relax\\l}\\l', 'hash size=615000'],
  ['\\def\\a{\\scantokens{\\a}}\\a', 'text input levels=15'],
  ['\\def\\a{\\a\\a}\\a', 'input stack size=10000'],
  ['\\def\\x{xxxxxxxxxx}' + '\\edef\\x{\\x\\x\\x\\x\\x\\x\\x\\x\\x\\x}'.repeat(5) + '\\expandafter\\show\\csname\\x\\endcsname', 'buffer size=200000'],
]
for (const [body, what] of capacity) test(`capacity: ${what}`, async () => {
  const e = await run(body)
  assert.ok(e.log.includes(`! TeX capacity exceeded, sorry [${what}].`))
})

test('capacity: main memory', async () => {
  for (const body of ['\\def\\a{x\\a}\\edef\\b{\\a}', '\\def\\a#1{\\a{#1#1}}\\a x']) {
    const e = await run(body, undefined, { main_memory: 300000 })
    assert.match(e.log, /Runaway (definition|argument)\?\n.*\\ETC\.\n! TeX capacity exceeded, sorry \[main memory size=300000\]\./)
  }
})

test('capacity: 10^6-character strings in \\message, \\pdffilesize, \\pdfmatch', async () => {
  const e = await run('\\def\\x{xxxxxxxxxx}' + '\\edef\\x{\\x\\x\\x\\x\\x\\x\\x\\x\\x\\x}'.repeat(5) +
    '\\message{\\x}\\message{[\\pdffilesize{\\x}]\\pdfmatch{x+}{\\x}\\pdflastmatch0}')
  const log = e.log.replaceAll('\n', '') // long lines wrap, and §1280's separating space becomes a line break
  assert.match(log, /\(\.\/t\.tex ?x{1000000} ?\[\]10->x{1000000} \)/)
})

test('capacity: a 10^6-character braced file name is just not found', async () => {
  const e = await run('\\def\\x{xxxxxxxxxx}' + '\\edef\\x{\\x\\x\\x\\x\\x\\x\\x\\x\\x\\x}'.repeat(5) + '\\input{\\x}')
  assert.match(e.log, /! I can't find file `x{58}/)
})

test('capacity: pattern memory', async () => {
  const a = 'abcdefghijklmnopqrstuvwxyz'
  let s = ''
  for (let i = 0; i < 400000; i++) { let w = '', n = i; for (let k = 0; k < 6; k++) { w += a[n % 26]! + (k === 2 ? '1' : ''); n = Math.floor(n / 26) + k * 7 } s += w + (i % 1000 ? ' ' : '\n') }
  const e = await run('\\count1=97 \\def\\l{\\lccode\\count1=\\count1 \\advance\\count1 1 \\ifnum\\count1<123 \\expandafter\\l\\fi}\\l \\patterns{' + s + '}')
  assert.ok(e.log.includes('! TeX capacity exceeded, sorry [pattern memory=1000000].'))
})
