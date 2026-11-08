// writet1.c, the parts pdfTeX needs when it embeds a whole Type 1 font: load_enc_file, the PFB segments, t1_scan_param
// (/FontName, /ItalicAngle, /FontBBox, /StdVW ...) and t1_builtin_enc. We never subset, so the font program is the
// PFB's cleartext and binary segments as they are (/Length3 0, as pdfTeX's fixedcontent=false).
import type { Engine } from '../engine.ts'
import { print, print_char } from '../print.ts'
import { pdftex_fail } from '../pdf.ts'

export type Glyphs = (string | null)[] // 256 glyph names; null is notdef
export const notdef = '.notdef'

// writet1.c standard_glyph_names (StandardEncoding)
const std = (s: string) => s.split(' ').map(n => n === '-' ? null : n)
const standard_glyph_names: Glyphs = [
  ...new Array<null>(32).fill(null),
  ...std('space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash'),
  ...std('zero one two three four five six seven eight nine colon semicolon less equal greater question'),
  ...std('at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore'),
  ...std('quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde -'),
  ...new Array<null>(32).fill(null),
  ...std('- exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl'),
  ...std('- endash dagger daggerdbl periodcentered - paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand - questiondown'),
  ...std('- grave acute circumflex tilde macron breve dotaccent dieresis - ring cedilla - hungarumlaut ogonek caron'),
  ...std('emdash - - - - - - - - - - - - - - -'),
  ...std('- AE - ordfeminine - - - - Lslash Oslash OE ordmasculine - - - -'),
  ...std('- ae - - - dotlessi - - lslash oslash oe germandbls - - - -'),
]

// ptexmac.h append_char_to_buf/append_eol over a line already cut at LF: tab is a space, spaces collapse, no leading space,
// a trailing space before the end of line is dropped; the result ends in `\n'
function normalize_line(raw: string): string {
  let p = ''
  for (let c of raw) {
    if (c === '\t') c = ' '
    if (c !== ' ' || (p.length > 0 && p[p.length - 1] !== ' ')) p += c
  }
  p += '\n'
  if (p.length > 2 && p[p.length - 2] === ' ') p = p.slice(0, -2) + '\n'
  return p
}
// split text into the lines t1_getline/enc_getline return: CR and LF end a line (CR is turned into LF), short lines are skipped
function getlines(text: string): string[] {
  return text.split(/\r|\n/).map(normalize_line).filter(l => l.length >= 2)
}

// writet1.c t1_scan_num: sscanf %g after one optional space; the rest starts after the digits, `.', `e', `E', `+', `-'
function scan_num(e: Engine, s: string, file: string): [number, string] {
  const p = s[0] === ' ' ? s.slice(1) : s
  const m = /^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(p)
  if (m === null) pdftex_fail(e, file, `a number expected: \`${p.replace(/\n$/, '')}'`)
  let k = 0
  while (k < p.length && /[0-9.eE+-]/.test(p[k]!)) k++
  return [Math.fround(parseFloat(m[1]!)), p.slice(k)]
}

// writet1.c load_enc_file: the glyph names of an encoding vector; logs `{path}'
export function load_enc_file(e: Engine, enc_name: string): Glyphs {
  const data = e.fs.find(enc_name, 'enc')
  if (data === null) pdftex_fail(e, enc_name, 'cannot open encoding file for reading')
  const path = e.fs.path?.(enc_name, 'enc') ?? enc_name
  const glyph_names: Glyphs = new Array(256).fill(null)
  print(e, '{'); print(e, path)
  const lines = getlines(Array.from(data, c => String.fromCharCode(c)).join('')).filter(l => l[0] !== '%')
  let li = 0
  const next = () => { if (li >= lines.length) pdftex_fail(e, path, 'unexpected end of file'); return lines[li++]! }
  let line = next()
  let r = line.indexOf('[')
  if (line[0] !== '/' || r < 0) pdftex_fail(e, path, `invalid encoding vector (a name or \`[' missing): \`${line.replace(/\n$/, '')}'`)
  let s = line.slice(r + 1), names_count = 0
  if (s[0] === ' ') s = s.slice(1)
  for (;;) {
    while (s[0] === '/') {
      let k = 1
      while (k < s.length && !' \n]/'.includes(s[k]!)) k++
      const buf = s.slice(1, k)
      s = s.slice(k); if (s[0] === ' ') s = s.slice(1)
      if (names_count > 255) pdftex_fail(e, path, 'encoding vector contains more than 256 names')
      if (buf !== notdef) glyph_names[names_count] = buf
      names_count++
    }
    if (s[0] !== '\n' && s[0] !== '%') {
      if (s.startsWith('] def')) break
      pdftex_fail(e, path, `invalid encoding vector: a name or \`] def' expected: \`${s.replace(/\n$/, '')}'`)
    }
    line = next(); s = line
  }
  print_char(e, 125)
  return glyph_names
}

// the font dimensions t1_scan_keys looks for (ptexlib.h font_key, ptexmac.h *_CODE)
export const ASCENT_CODE = 0, CAPHEIGHT_CODE = 1, DESCENT_CODE = 2, ITALIC_ANGLE_CODE = 3, STEMV_CODE = 4, XHEIGHT_CODE = 5,
  FONTBBOX1_CODE = 6, FONTBBOX2_CODE = 7, FONTBBOX3_CODE = 8, FONTBBOX4_CODE = 9, FONTNAME_CODE = 10
export const font_key: [string, string][] = [['Ascent', 'Ascender'], ['CapHeight', 'CapHeight'], ['Descent', 'Descender'],
  ['ItalicAngle', 'ItalicAngle'], ['StemV', 'StdVW'], ['XHeight', 'XHeight'], ['FontBBox', 'FontBBox'], ['', ''], ['', ''], ['', ''],
  ['FontName', 'FontName']]
export type T1Target = { fontname: string, font_dim: { val: number, set: boolean }[], builtin_glyph_names: Glyphs | null }

// writet1.c t1_scan_param / t1_scan_keys on one line (SlantFont/ExtendFont are refused before we get here)
function t1_scan_param(e: Engine, fd: T1Target, line: string, file: string): void {
  if (line[0] !== '/') return
  if (line.startsWith('/lenIV')) { if (scan_num(e, line.slice(6), file)[0] < 0) pdftex_fail(e, file, 'negative value of lenIV is not supported'); return }
  if (line.startsWith('/FontType')) {
    const i = Math.trunc(scan_num(e, line.slice(9), file)[0])
    if (i !== 1) pdftex_fail(e, file, `Type${i} fonts unsupported by pdfTeX`)
    return
  }
  let k = font_key.findIndex(([, t1]) => t1 !== '' && line.startsWith(t1, 1))
  if (k < 0) return
  let p = line.slice(font_key[k]![1].length + 1)
  if (p[0] === ' ') p = p.slice(1)
  if (k === FONTNAME_CODE) {
    if (p[0] !== '/') pdftex_fail(e, file, `a name expected: \`${line.replace(/\n$/, '')}'`)
    fd.fontname = p.slice(1).split(/[ \n]/)[0]!
    return
  }
  if ((k === STEMV_CODE || k === FONTBBOX1_CODE) && (p[0] === '[' || p[0] === '{')) p = p.slice(1)
  if (k === FONTBBOX1_CODE) {
    for (let i = 0; i < 4; i++, k++) { const [v, r] = scan_num(e, p, file); fd.font_dim[k] = { val: Math.trunc(v), set: true }; p = r }
    return
  }
  fd.font_dim[k] = { val: Math.trunc(scan_num(e, p, file)[0]), set: true }
}

// C's sscanf("%i"): a signed integer in base 10, 16 (0x) or 8 (leading 0); returns [value, rest] or null
function scan_i(s: string): [number, string] | null {
  const m = /^\s*([+-]?)(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)/.exec(s)
  if (m === null) return null
  const d = m[2]!, v = /^0[xX]/.test(d) ? parseInt(d, 16) : d.length > 1 && d[0] === '0' ? parseInt(d, 8) : parseInt(d, 10)
  return [m[1] === '-' ? -v : v, s.slice(m[0].length)]
}
const valid_code = (c: number) => c >= 0 && c < 256

// writet1.c t1_builtin_enc: the font's own /Encoding, starting at the line that begins with /Encoding
function t1_builtin_enc(e: Engine, lines: string[], at: { i: number }, file: string): Glyphs {
  const glyph_names: Glyphs = new Array(256).fill(null)
  let line = lines[at.i]!
  const getline = () => { if (++at.i >= lines.length) pdftex_fail(e, file, 'unexpected end of file'); line = lines[at.i]! }
  if (/def\n?$/.test(line)) { // predefined encoding
    const name = line.slice(9).trim().split(/\s+/)[0] ?? ''
    if (name === 'StandardEncoding') return [...standard_glyph_names]
    pdftex_fail(e, file, `cannot subset font (unknown predefined encoding \`${name}')`)
  }
  if (line.startsWith('/Encoding [') || line.startsWith('/Encoding[')) { // the first case
    let r = line.slice(line.indexOf('[') + 1), counter = 0
    if (r[0] === ' ') r = r.slice(1)
    for (;;) {
      while (r[0] === '/') {
        let k = 1
        while (k < r.length && !' \n]/'.includes(r[k]!)) k++
        const buf = r.slice(1, k)
        r = r.slice(k); if (r[0] === ' ') r = r.slice(1)
        if (counter > 255) pdftex_fail(e, file, 'encoding vector contains more than 256 names')
        if (buf !== notdef) glyph_names[counter] = buf
        counter++
      }
      if (r[0] !== '\n' && r[0] !== '%') {
        if (r.startsWith('] def') || r.startsWith('] readonly def')) break
        pdftex_fail(e, file, `a name or \`] def' or \`] readonly def' expected: \`${line.replace(/\n$/, '')}'`)
      }
      getline(); r = line
    }
    return glyph_names
  }
  // the second case: `dup <index> <glyph> put' and friends, up to `def'
  const copy = (a: number, b: number) => { glyph_names[b] = glyph_names[a]! }
  let p = line.slice(line.indexOf('\n')) // p is always a suffix of line
  for (;;) {
    if (p[0] === '\n') { getline(); p = line }
    let m: RegExpExecArray | null, x: [number, string] | null
    if (p.startsWith('dup ') && (x = scan_i(p.slice(4))) !== null && (m = /^\s*(\S{1,255})/.exec(x[1])) !== null && m[1]![0] === '/' && valid_code(x[0])) {
      if (m[1]!.slice(1) !== notdef) glyph_names[x[0]] = m[1]!.slice(1)
      const k = p.indexOf(' put'); if (k < 0) pdftex_fail(e, file, 'invalid pfb, no put found in dup')
      p = p.slice(k + 4); if (p[0] === ' ') p = p.slice(1)
    } else if ((m = /^dup dup\s*([+-]?\w+)\s*exch\s*([+-]?\w+)\s*get put/.exec(p)) !== null && scan_i(m[1]!) && scan_i(m[2]!)
      && valid_code(scan_i(m[2]!)![0]) && valid_code(scan_i(m[1]!)![0])) {
      copy(scan_i(m[2]!)![0], scan_i(m[1]!)![0])
      p = p.slice(p.indexOf(' get put') + 8); if (p[0] === ' ') p = p.slice(1)
    } else if ((m = /^dup dup\s*([+-]?\w+)\s*([+-]?\w+)\s*getinterval\s*([+-]?\w+)\s*exch putinterval/.exec(p)) !== null
      && [1, 2, 3].every(i => scan_i(m![i]!) !== null && valid_code(scan_i(m![i]!)![0]))) {
      const [a, c, b] = [1, 2, 3].map(i => scan_i(m![i]!)![0])
      for (let i = 0; i < c!; i++) copy(a! + i, b! + i)
      p = p.slice(p.indexOf(' putinterval') + 12); if (p[0] === ' ') p = p.slice(1)
    } else if ((p.length === line.length || line[line.length - p.length - 1] === ' ') && p === 'def\n') return glyph_names
    else {
      let k = 0
      while (k < p.length && p[k] !== ' ' && p[k] !== '\n') k++
      p = p.slice(k); if (p[0] === ' ') p = p.slice(1)
    }
  }
}

// writet1.c writet1 for one font descriptor: scans the font as t1_subset_ascii_part/t1_read_subrs do (subsetted map
// entries) or t1_include (`<<'), logging `<path>' or `<<path>>'; returns the PFB's cleartext and binary segments
export function writet1(e: Engine, fd: T1Target, ff_name: string, subsetted: boolean): { data: Uint8Array, length1: number, length2: number } {
  const b = e.fs.find(ff_name, 'type1')
  if (b === null) pdftex_fail(e, ff_name, 'cannot open Type 1 font file for reading')
  const path = e.fs.path?.(ff_name, 'type1') ?? ff_name
  print(e, subsetted ? '<' : '<<'); print(e, path)
  if (b[0] !== 128) pdftex_fail(e, path, 'unsupported: PFA font files') // shortcut: PFB only; port t1_getbyte's PFA branch if a map names a .pfa
  // PFB segments: 128, type (1 text, 2 binary, 3 end), 4-byte little-endian length; text after the binary part is the trailer
  const parts: [Uint8Array[], Uint8Array[]] = [[], []]
  for (let i = 0; i < b.length;) {
    if (b[i] !== 128) pdftex_fail(e, path, 'invalid marker')
    const t = b[i + 1]!, n = b[i + 2]! | b[i + 3]! << 8 | b[i + 4]! << 16 | b[i + 5]! << 24
    if (t === 3) break
    if (t === 2 || parts[1].length === 0) parts[t === 2 ? 1 : 0].push(b.subarray(i + 6, i + 6 + n))
    i += 6 + n
  }
  const join = (l: Uint8Array[]) => { const r = new Uint8Array(l.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of l) { r.set(x, o); o += x.length } return r }
  const clear = join(parts[0]), bin = join(parts[1])
  const text = (a: Uint8Array) => Array.from(a, c => String.fromCharCode(c)).join('')
  // the cleartext part, up to and including the `currentfile eexec' line
  const lines = getlines(text(clear)), at = { i: 0 }
  if (subsetted) {
    while (at.i < lines.length && !lines[at.i]!.startsWith('/Encoding')) { t1_scan_param(e, fd, lines[at.i]!, path); at.i++ }
    if (at.i >= lines.length) pdftex_fail(e, path, 'unexpected end of file')
    fd.builtin_glyph_names = t1_builtin_enc(e, lines, at, path)
    at.i++
  }
  for (; at.i < lines.length; at.i++) t1_scan_param(e, fd, lines[at.i]!, path)
  // the eexec part: decrypt (r=55665), drop four bytes, scan the Private dictionary up to /Subrs or /CharStrings
  const plain: number[] = []
  let r = 55665
  for (const c of bin) { plain.push(c ^ (r >> 8)); r = ((c + r) * 52845 + 22719) & 0xffff }
  for (const line of getlines(text(Uint8Array.from(plain.slice(4))))) {
    if (line.includes('/CharStrings') || line.startsWith('/Subrs')) break
    t1_scan_param(e, fd, line, path)
  }
  print(e, subsetted ? '>' : '>>')
  const data = new Uint8Array(clear.length + bin.length); data.set(clear); data.set(bin, clear.length)
  return { data, length1: clear.length, length2: bin.length }
}
