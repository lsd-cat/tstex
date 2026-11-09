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
import { bundleFS } from '../../src/platform/browser.ts'

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
// hostile images: a PNG signature or JPEG/PDF header followed by random bytes, a PNG whose IHDR claims a huge image
const png_sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const ihdr = (w: number, h: number) => [0, 0, 0, 13, ...Buffer.from('IHDR'), w >>> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255,
  h >>> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255, 8, 2, 0, 0, 0, 0, 0, 0, 0]
writeFileSync(join(root, 'r.png'), Uint8Array.from([...png_sig, ...rand(3000)]))
writeFileSync(join(root, 'big.png'), Uint8Array.from([...png_sig, ...ihdr(60000, 60000), 0, 0, 0, 20, ...Buffer.from('IDAT'), ...rand(24), 0, 0, 0, 0, ...Buffer.from('IEND'), 0, 0, 0, 0]))
writeFileSync(join(root, 'r.jpg'), Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 40, ...Buffer.from('Exif\0'), ...rand(3000)]))
writeFileSync(join(root, 'r.pdf'), Uint8Array.from([...Buffer.from('%PDF-1.4\n1 0 obj << /Kids [1 0 R] /Count 5 >> endobj /Root 2 0 R 2 0 obj << /Pages 1 0 R >> endobj '), ...rand(500)]))

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
  const r = spawnSync(process.execPath, [tstex, '--texmf', texmf, join(job, 't.tex')], { encoding: 'latin1', env: { ...process.env, TEXMFDIST: '' } })
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

for (const f of ['r.png', 'big.png', 'r.jpg', 'r.pdf']) test(`hostile image: ${f} fails cleanly`, async () => {
  const e = await run(`\\pdfoutput=1 \\pdfcompresslevel=0 \\pdfximage{${f}}\\shipout\\hbox{\\pdfrefximage\\pdflastximage}`)
  assert.match(e.log, /pdfTeX error|unsupported: |Output written on t\.pdf/)
})

// hostile PDFs for \pdfximage (pdfread.ts): loops, absurd sizes, deep nesting; each ends without a JS exception, quickly
function build(objs: Record<number, string>, trailer: string): string {
  let b = '%PDF-1.4\n'; const offs: Record<number, number> = {}
  for (const n of Object.keys(objs).map(Number).sort((a, b) => a - b)) { offs[n] = b.length; b += `${n} 0 obj\n${objs[n]}\nendobj\n` }
  const size = Math.max(...Object.keys(objs).map(Number)) + 1, x = b.length
  b += `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let n = 1; n < size; n++) b += n in offs ? `${String(offs[n]).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n'
  return (b + `trailer\n<< /Size ${size} ${trailer} >>\nstartxref\n${x}\n%%EOF\n`).replace('/Prev SELF', `/Prev ${x}`)
}
const cat = '<< /Type /Catalog /Pages 2 0 R >>', pages = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
const page = (res: string, extra = '') => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Resources ${res} ${extra} >>`
const hostile_pdfs: Record<string, string> = {
  'prev-self': build({ 1: cat, 2: pages, 3: page('<< >>') }, '/Root 1 0 R /Prev SELF'),
  'kids-loop': build({ 1: cat, 2: '<< /Type /Pages /Kids [2 0 R] /Count 1 >>' }, '/Root 1 0 R'),
  'kids-loop-count0': build({ 1: cat, 2: '<< /Type /Pages /Kids [2 0 R 4 0 R] /Count 0 >>', 4: '<< /Type /Pages /Kids [2 0 R] >>' }, '/Root 1 0 R'),
  'pages-3000-deep': build(Object.fromEntries([[1, cat], ...Array.from({ length: 3000 }, (_, i) => [i + 2, `<< /Type /Pages /Kids [${i + 3} 0 R] /Count 0 >>`])]), '/Root 1 0 R'),
  'objstm-self': '%PDF-1.5\n1 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length 2 0 R >>\nstream\n2 0 2\nendstream\nendobj\ntrailer << /Root 2 0 R >>\n',
  'xrefstm-w000': '%PDF-1.5\n1 0 obj\n<< /Type /XRef /Size 3 /W [0 0 0] /Index [0 2000000000] /Root 1 0 R /Length 0 >>\nstream\n\nendstream\nendobj\nstartxref\n9\n%%EOF\n',
  'xrefstm-prev-self': '%PDF-1.5\n1 0 obj\n<< /Type /XRef /Size 3 /W [1 1 1] /Prev 9 /Root 1 0 R /Length 3 >>\nstream\n\x01\x09\x00\nendstream\nendobj\nstartxref\n9\n%%EOF\n',
  'xref-section-2e9': build({ 1: cat }, '/Root 1 0 R').replace(/xref\n0 \d+/, 'xref\n0 2000000000'),
  'count-2147483647': build({ 1: cat, 2: '<< /Type /Pages /Kids [3 0 R] /Count 2147483647 >>', 3: page('<< >>') }, '/Root 1 0 R'),
  'length-1e9': build({ 1: cat, 2: pages, 3: page('<< >>', '/Contents 4 0 R'), 4: '<< /Length 1000000000 >>\nstream\nxx\nendstream' }, '/Root 1 0 R'),
  'length-self': build({ 1: cat, 2: pages, 3: page('<< >>', '/Contents 4 0 R'), 4: '<< /Length 4 0 R >>\nstream\nxx\nendstream' }, '/Root 1 0 R'),
  'array-100000-deep': build({ 1: cat, 2: pages, 3: page('<< /XObject << /A 5 0 R >> >>'), 5: '['.repeat(100000) }, '/Root 1 0 R'),
  'dict-450-deep': build({ 1: cat, 2: pages, 3: page('<< /X ' + '<< /A '.repeat(450) + ' >>'.repeat(450) + ' >>') }, '/Root 1 0 R'),
  'startxref-23-digits': build({ 1: cat }, '/Root 1 0 R').replace(/startxref\n\d+/, 'startxref\n99999999999999999999999'),
  'ref-0-0-R': build({ 1: cat, 2: pages, 3: page('<< /X << /A 0 0 R >> >>') }, '/Root 1 0 R'),
  'lzw-contents': build({ 1: cat, 2: pages, 3: page('<< >>', '/Contents [4 0 R]'), 4: '<< /Length 3 /Filter /LZWDecode >>\nstream\nabc\nendstream' }, '/Root 1 0 R'),
  'predictor-columns-1e8': build({ 1: cat, 2: pages, 3: page('<< >>', '/Contents [4 0 R 4 0 R]'),
    4: '<< /Length 3 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Columns 100000000 /Colors 30 >> >>\nstream\nabc\nendstream' }, '/Root 1 0 R'),
  'empty': '',
  'garbage': '%PDF-1.4\n' + 'x'.repeat(5000),
}
for (const [name, pdf] of Object.entries(hostile_pdfs)) test(`hostile PDF: ${name}`, async () => {
  writeFileSync(join(root, 'h.pdf'), Buffer.from(pdf, 'latin1'))
  const t0 = Date.now()
  const e = await run('\\pdfoutput=1 \\pdfcompresslevel=0 \\pdfximage{h.pdf}\\shipout\\hbox{\\pdfrefximage\\pdflastximage}')
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`)
  assert.match(e.log, /pdfTeX error|pdfTeX warning|unsupported: |Output written on t\.pdf|No pages of output/)
})

// hostile Type 1 fonts for the subsetter (writet1.c): cmr10.pfb with its eexec part edited
const pfb = readFileSync(new URL('../../bundles/minimal/fonts/type1/public/amsfonts/cm/cmr10.pfb', import.meta.url))
const segs: Buffer[] = [] // PFB: 128, type, 4-byte length, data; types 1 (text), 2 (binary), 3 (end)
for (let i = 0; pfb[i] === 128 && pfb[i + 1] !== 3; i += 6 + pfb.readUInt32LE(i + 2)) segs.push(pfb.subarray(i + 6, i + 6 + pfb.readUInt32LE(i + 2)))
const crypt = (b: Uint8Array, r: number, enc: boolean) => Uint8Array.from(b, c => { const p = c ^ (r >> 8); r = (((enc ? p : c) + r) * 52845 + 22719) & 0xffff; return p })
const make_pfb = (text: Buffer, bin: Uint8Array) => Buffer.concat([Buffer.from([128, 1]), Buffer.from(Uint32Array.of(text.length).buffer), text,
  Buffer.from([128, 2]), Buffer.from(Uint32Array.of(bin.length).buffer), bin, segs[2] ? Buffer.concat([Buffer.from([128, 1]), Buffer.from(Uint32Array.of(segs[2].length).buffer), segs[2]]) : Buffer.alloc(0), Buffer.from([128, 3])])
const plain = Buffer.from(crypt(segs[1]!, 55665, false)).toString('latin1')
// replace glyph /A's charstring and optionally Subr 4 (lenIV 4 zero bytes, then the given plaintext bytes)
const enc_cs = (cs: number[]) => `${cs.length + 4} RD ${Buffer.from(crypt(Uint8Array.from([0, 0, 0, 0, ...cs]), 4330, true)).toString('latin1')}`
const with_A = (cs: number[], subr4?: number[]) => {
  let p = plain.replace(/\/A \d+ RD [\s\S]*? ND/, () => `/A ${enc_cs(cs)} ND`)
  if (subr4) p = p.replace(/dup 4 \d+ RD [\s\S]*? NP/, () => `dup 4 ${enc_cs(subr4)} NP`)
  assert.ok(p !== plain && (subr4 === undefined || p.includes(`dup 4 ${enc_cs(subr4)}`)))
  return make_pfb(segs[0]!, crypt(Buffer.from(p, 'latin1'), 55665, true))
}
const hostile_fonts: Record<string, Buffer> = {
  'truncated-eexec': pfb.subarray(0, segs[0]!.length + 6 + 6 + (segs[1]!.length >> 1)),
  'callsubr-30000': with_A([255, 0, 0, 0x75, 0x30, 10, 14]),
  'seac-missing-glyph': with_A([139, 139, 139, 204, 247, 54, 12, 6, 14]), // 0 0 0 65 162 seac: StandardEncoding 162 is `cent'
  'seac-code-300': with_A([139, 139, 139, 204, 248, 84, 12, 6, 14]),
  'stack-overflow': with_A([...new Array<number>(30).fill(139), 14]),
  'callothersubr-negative': with_A([134, 139, 12, 16, 14]), // -5 0 callothersubr: pops -3 arguments
  'subr-recursion': with_A([143, 10, 14], [143, 10, 11]), // A: 4 callsubr; Subr 4: 4 callsubr return
  'lenIV-minus-1': make_pfb(segs[0]!, crypt(Buffer.from(plain.replace('/Private', '/Private\n/lenIV -1 def'), 'latin1'), 55665, true)),
}
for (const [name, font] of Object.entries(hostile_fonts)) test(`hostile Type 1 font: ${name}`, async () => {
  writeFileSync(join(root, 'h.pfb'), font)
  const t0 = Date.now()
  const e = await run('\\pdfoutput=1 \\pdfcompresslevel=0 \\pdfmapline{=cmr10 CMR10 <h.pfb}\\font\\x=cmr10 \\shipout\\hbox{\\x AB}')
  process.env.SEC_DEBUG && console.log(name, e.log.split("\n").filter(l => /error|warning|unsupported|Output|No pages|^!/.test(l)).join(" / ").slice(0, 300))
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`)
  assert.match(e.log, /pdfTeX error|unsupported: |Output written on t\.pdf/)
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

test('bundleFS (browser): no escape through names, no Object.prototype keys, user files before the bundle', () => {
  const read: string[] = []
  const fs = bundleFS({ version: 'x', files: { 'a.sty': { path: 'tex/latex/a/a.sty', size: 1 }, 'b.tex': { path: 'tex/generic/b.tex', size: 1 } } },
    p => { read.push(p); return Uint8Array.of(1) }, new Map([['b.tex', Uint8Array.of(2)]]))
  for (const n of ['../a.sty', '/etc/passwd', '/dev/null', 'a.sty\0', 'constructor', '__proto__', 'toString', 'x/../a.sty', 'tex/latex/a/../../../a.sty'])
    assert.strictEqual(fs.find(n, 'tex'), null, n)
  assert.deepStrictEqual(read, [])
  assert.deepStrictEqual(fs.find('a.sty', 'tex'), Uint8Array.of(1))
  assert.strictEqual(fs.find('a.sty', 'tfm'), null) // kind search path applies
  assert.deepStrictEqual(fs.find('b', 'tex'), Uint8Array.of(2))
  assert.strictEqual(fs.path!('b', 'tex'), './b.tex')
  assert.strictEqual(fs.writable!('../x'), false)
})
