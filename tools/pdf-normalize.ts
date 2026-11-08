// Normalise an UNCOMPRESSED pdfTeX-style PDF (no object/xref streams) so pdftex and tstex output can be compared as text.
// Masked: subset prefixes `ABCDEF+`, /CharSet, Type1 font program bodies (streams with /Length1) and their /Length* values.
// Uncompressed object streams are split into their objects (masked the same way). Dropped: xref table or stream, startxref offset. Everything else (incl. binary image bodies, as latin1) is kept verbatim.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export function normalizePdf(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1')
  const objs: { n: string, dict: string, body: string | null }[] = []
  const lengths = new Map<string, number>() // N -> value, for `/Length N 0 R`
  const re = /^(\d+) \d+ obj\r?\n/gm
  let m: RegExpExecArray | null, header = ''
  while ((m = re.exec(s))) {
    if (!objs.length) header = s.slice(0, m.index)
    const start = re.lastIndex
    const sm = /\r?\nstream\r?\n/.exec(s.slice(start, s.indexOf('endobj', start)))
    let dict: string, body: string | null = null
    if (sm) {
      dict = s.slice(start, start + sm.index)
      const L = dict.match(/\/Length (\d+)( 0 R)?/)!
      const len = L[2] ? lengths.get(L[1]!)! : Number(L[1])
      const b0 = start + sm.index + sm[0].length
      body = s.slice(b0, b0 + len)
      re.lastIndex = s.indexOf('endobj', b0 + len) + 6
    } else {
      const e = s.indexOf('endobj', start)
      dict = s.slice(start, e)
      if (/^\d+\s*$/.test(dict)) lengths.set(m[1]!, Number(dict))
      re.lastIndex = e + 6
    }
    objs.push({ n: m[1]!, dict, body })
  }
  const fontLen = new Set<string>() // objects holding the /Length of a font program
  for (const o of objs) if (o.body !== null && /\/Length1\b/.test(o.dict)) { const r = o.dict.match(/\/Length (\d+) 0 R/); if (r) fontLen.add(r[1]!) }
  const out = [header]
  const mask = (d: string) => d.replace(/\/[A-Z]{6}\+/g, '/').replace(/\/CharSet\s*\([^)]*\)\s*/g, '')
  for (const o of objs) {
    let d = o.dict
    if (o.body !== null && /\/Type\s*\/XRef/.test(d)) { out.push(`${o.n} obj\n${d.replace(/\/Length \d+/, '/Length *')}\nstream <<offsets>>\n`); continue } // like the xref table
    // an uncompressed object stream: its objects are listed one by one (masked like top-level objects), its offsets dropped
    if (o.body !== null && /\/Type\s*\/ObjStm/.test(d) && !/\/Filter/.test(d)) {
      const first = Number(d.match(/\/First (\d+)/)![1]), nums = o.body.slice(0, first).trim().split(/\s+/).map(Number)
      out.push(`${o.n} obj\n<<objstm>>\n`)
      for (let k = 0; k < nums.length; k += 2) out.push(`  ${nums[k]} in objstm\n${mask(o.body.slice(first + nums[k + 1]!, k + 3 < nums.length ? first + nums[k + 3]! : undefined))}\n`)
      continue
    }
    const font = o.body !== null && /\/Length1\b/.test(d)
    if (fontLen.has(o.n)) d = '<<font length masked>>'
    d = mask(d)
    if (font) d = d.replace(/\/Length[123]? \d+( 0 R)? */g, m => m.slice(0, m.indexOf(" ")) + " *")
    out.push(`${o.n} obj\n${d}${o.body === null ? '' : `\nstream\n${font ? '<<font program masked>>' : o.body}\nendstream`}\nendobj\n`)
  }
  const t = s.lastIndexOf('trailer')
  out.push(s.slice(t, s.indexOf('startxref', t)))
  return out.join('')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2).map(f => normalizePdf(readFileSync(f!)))
  if (a === b) console.log('identical')
  else {
    const d = mkdtempSync(tmpdir() + '/pdfn-')
    writeFileSync(d + '/a', a!, 'latin1'); writeFileSync(d + '/b', b!, 'latin1')
    process.stdout.write(spawnSync('diff', ['-a', '-u', d + '/a', d + '/b'], { encoding: 'latin1' }).stdout)
    process.exitCode = 1
  }
}
