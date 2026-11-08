// Normalise an UNCOMPRESSED pdfTeX-style PDF so pdftex and tstex output can be compared as text: the xref table (or the
// offsets of an xref stream) and the startxref offset are dropped, uncompressed object streams are split into their objects.
// Everything else (font programs, binary image bodies, as latin1) is kept verbatim. Terminates on any input; a stream whose
// /Length is unusable (missing, an indirect object that is not an integer, past the end of the file) ends at `endstream'.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export function normalizePdf(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1')
  const objs: { n: string, dict: string, body: string | null }[] = []
  const lengths = new Map<string, number>() // N -> value of an integer object, for `/Length N 0 R' (pdfTeX writes it after the stream)
  for (const m of s.matchAll(/^(\d+) \d+ obj\s*(\d+)\s*endobj/gm)) lengths.set(m[1]!, Number(m[2]))
  const re = /^(\d+) \d+ obj\r?\n/gm
  let m: RegExpExecArray | null, header = ''
  while ((m = re.exec(s))) {
    if (!objs.length) header = s.slice(0, m.index)
    const start = re.lastIndex
    let e = s.indexOf('endobj', start)
    if (e < 0) e = s.length
    const sm = /\r?\nstream\r?\n/.exec(s.slice(start, e))
    let dict: string, body: string | null = null, next = e + 6
    if (sm) {
      dict = s.slice(start, start + sm.index)
      const b0 = start + sm.index + sm[0].length
      const L = dict.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/)
      let len = L === null ? NaN : L[2] ? lengths.get(L[1]!) ?? NaN : Number(L[1])
      if (!(len >= 0 && b0 + len <= s.length && /^\r?\n?endstream/.test(s.slice(b0 + len, b0 + len + 12)))) {
        const k = s.indexOf('endstream', b0)
        if (k < 0) throw new Error(`pdf-normalize: object ${m[1]}: stream without endstream`)
        len = k - b0 - (s[k - 1] === '\n' ? s[k - 2] === '\r' ? 2 : 1 : s[k - 1] === '\r' ? 1 : 0) // the line end before endstream
      }
      body = s.slice(b0, b0 + len)
      const k = s.indexOf('endobj', b0 + len)
      next = k < 0 ? s.length : k + 6
    } else dict = s.slice(start, e)
    re.lastIndex = Math.max(next, start)
    objs.push({ n: m[1]!, dict, body })
  }
  const out = [header]
  for (const o of objs) {
    const d = o.dict
    if (o.body !== null && /\/Type\s*\/XRef/.test(d)) { out.push(`${o.n} obj\n${d.replace(/\/Length \d+/, '/Length *')}\nstream <<offsets>>\n`); continue } // like the xref table
    // an uncompressed object stream: its objects are listed one by one, its offsets dropped
    const first = Number(d.match(/\/First (\d+)/)?.[1]), nums = o.body?.slice(0, first).trim().split(/\s+/).map(Number) ?? []
    if (o.body !== null && /\/Type\s*\/ObjStm/.test(d) && !/\/Filter/.test(d) && first >= 0 && nums.length % 2 === 0 && nums.every(Number.isInteger)) {
      out.push(`${o.n} obj\n<<objstm>>\n`)
      for (let k = 0; k < nums.length; k += 2) out.push(`  ${nums[k]} in objstm\n${o.body.slice(first + nums[k + 1]!, k + 3 < nums.length ? first + nums[k + 3]! : undefined)}\n`)
      continue
    }
    out.push(`${o.n} obj\n${d}${o.body === null ? '' : `\nstream\n${o.body}\nendstream`}\nendobj\n`)
  }
  const t = s.lastIndexOf('trailer'), x = s.indexOf('startxref', t)
  if (t >= 0) out.push(s.slice(t, x < 0 ? undefined : x))
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
