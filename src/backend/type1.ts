// writet1.c: load_enc_file, t1_include (`<<' map entries) and the subsetting path (`<' entries: t1_subset_ascii_part,
// t1_read_subrs, t1_subset_charstrings with cs_mark's glyph closure, t1_subset_end), utils.c make_subset_tag. PFB files only.
import type { Engine } from '../engine.ts'
import { print, print_char } from '../print.ts'
import { pdftex_fail, pdftex_warn } from '../pdf.ts'
import { md5, str as latin1 } from '../utils.ts'
import { find_backend_file } from '../files.ts'

export type Glyphs = (string | null)[] // 256 glyph names; null is notdef
export const notdef = '.notdef'

// writet1.c standard_glyph_names (StandardEncoding)
const std = (s: string) => s.split(' ').map(n => n === '-' ? null : n)
export const standard_glyph_names: Glyphs = [
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

// writet1.c load_enc_file: the glyph names of an encoding vector; logs `{path}'
export function load_enc_file(e: Engine, enc_name: string): Glyphs {
  const found = find_backend_file(e, enc_name, 'enc')
  if (found === null) pdftex_fail(e, enc_name, 'cannot open encoding file for reading')
  const { data, path } = found
  const glyph_names: Glyphs = new Array(256).fill(null)
  print(e, '{'); print(e, path)
  const lines = getlines(latin1(data)).filter(l => l[0] !== '%')
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
export type T1Target = { fontname: string, font_dim: { val: number, set: boolean }[], builtin_glyph_names: Glyphs | null,
  gl_tree: Set<string>, all_glyphs: boolean, subset_tag: string | null, tx_tree: Set<number> | null, fm: { slant: number, extend: number } }

// C's printf %g of a double (6 significant digits, trailing zeros dropped, exponent at least two digits)
function printf_g(x: number): string {
  if (x === 0) return Object.is(x, -0) ? '-0' : '0'
  const [m, ex] = Math.abs(x).toExponential(5).split('e'), exp = Number(ex), sign = x < 0 ? '-' : ''
  const strip = (t: string) => t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t
  if (exp < -4 || exp >= 6) return sign + strip(m!) + 'e' + (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(2, '0')
  return sign + strip(Math.abs(x).toFixed(5 - exp))
}
// writet1.c's static state that outlives one font: the subset tags in use (utils.c make_subset_tag's st_tree), the charstring
// operand stack (cc_stack, never reset between glyphs) and cs_mark's lastargOtherSubr3
export const t1_state = () => ({ st_tree: new Set<string>(), cc_stack: [] as number[], last_arg_othersubr3: 3 })

// C's sscanf("%i"): a signed integer in base 10, 16 (0x) or 8 (leading 0); returns [value, rest] or null
function scan_i(s: string): [number, string] | null {
  const m = /^\s*([+-]?)(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)/.exec(s)
  if (m === null) return null
  const d = m[2]!, v = /^0[xX]/.test(d) ? parseInt(d, 16) : d.length > 1 && d[0] === '0' ? parseInt(d, 8) : parseInt(d, 10)
  return [m[1] === '-' ? -v : v, s.slice(m[0].length)]
}
const valid_code = (c: number) => c >= 0 && c < 256
const bytes = (s: string) => Array.from(s, c => c.charCodeAt(0))
// str_suffix: s ends the buffer, a final LF ignored
const str_suffix = (a: number[], s: string) => { let n = a.length; if (a[n - 1] === 10) n--; return n >= s.length && latin1(a.slice(n - s.length, n)) === s }

// charstring commands (CS_*); cc_init's table: [nargs, bottom, clear]
const CS_CALLSUBR = 10, CS_RETURN = 11, CS_ESCAPE = 12, CS_1BYTE_MAX = 32, CS_SEAC = 38, CS_DIV = 44, CS_CALLOTHERSUBR = 48, CS_POP = 49, CS_MAX = 66
const cc_tab: ([number, boolean, boolean] | undefined)[] = []
for (const [n, b, a, c] of [[1, true, 2, true], [3, true, 2, true], [4, true, 1, true], [5, true, 2, true], [6, true, 1, true], [7, true, 1, true],
  [8, true, 6, true], [9, false, 0, true], [10, false, 1, false], [11, false, 0, false], [13, true, 2, true], [14, false, 0, true], [21, true, 2, true],
  [22, true, 1, true], [30, true, 4, true], [31, true, 4, true], [32, false, 0, true], [33, true, 6, true], [34, true, 6, true], [38, true, 5, true],
  [39, true, 4, true], [44, false, 2, false], [48, false, 0, false], [49, false, 0, false], [65, true, 2, true]] as [number, boolean, number, boolean][])
  cc_tab[n] = [a, b, c]
type CsEntry = { name: string, data: number[], cslen: number, used: boolean, valid: boolean }
const cs_token_pairs_list = [[' RD', 'NP'], [' -|', '|'], [' RD', 'noaccess put'], [' -|', 'noaccess put']]
// shortcut: limits pdfTeX does not have (it crashes or runs for ever on such fonts); raise them if a real font needs more
const SUBRS_MAX = 65536, CS_DEPTH_MAX = 64, CS_WORK_MAX = 20_000_000

// utils.c make_subset_tag: MD5 over the sorted glyph names (each followed by a space), the font name and the round number j
// as a 4-byte little-endian int; six letters from sums of digest bytes
function make_subset_tag(e: Engine, fd: T1Target, warn: (m: string) => void): void {
  const st = e.fm.t1.st_tree, names = [...fd.gl_tree].sort()
  let j = 0, tag: string
  do {
    const m: number[] = []
    for (const g of names) m.push(...bytes(g), 32)
    m.push(...bytes(fd.fontname), j & 255, j >> 8 & 255, j >> 16 & 255, j >>> 24)
    const h = md5(m), d = Array.from({ length: 16 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16))
    const a = [d.slice(0, 13).reduce((x, y) => x + y, 0)]
    for (let i = 1; i < 6; i++) a[i] = a[i - 1]! - d[i - 1]! + d[(i + 12) % 16]!
    tag = a.map(x => String.fromCharCode(x % 26 + 65)).join('')
    j++
  } while (st.has(tag))
  st.add(tag)
  fd.subset_tag = tag
  if (j > 2) warn(`\nmake_subset_tag(): subset-tag collision, resolved in round ${j}.\n`)
}

// writet1.c writet1: `<<' entries go through t1_include, `<' entries through t1_subset_ascii_part, t1_read_subrs,
// t1_subset_charstrings and t1_subset_end; the file is read and written line by line (t1_getline/t1_putline), the eexec part
// decrypted and re-encrypted behind four zero bytes, charstrings kept encrypted (r=4330) and decrypted only to mark glyphs
function t1_write(e: Engine, fd: T1Target, b: Uint8Array, path: string, subsetted: boolean): { data: Uint8Array, length1: number, length2: number } {
  let pos = 0, at_eof = false, block = 0, in_eexec = 0, t1_cs = false, t1_scan = true, synthetic = false, dr = 55665, er = 55665, encrypt = false
  let lenIV = 4, cslen = 0, cs_start = 0, fontname_offset = -1, line: number[] = []
  const out: number[] = []
  const fail = (m: string): never => pdftex_fail(e, path, m), warn = (m: string) => pdftex_warn(e, path, m)
  const getchar = () => { if (pos < b.length) return b[pos++]!; at_eof = true; return -1 }
  const getbyte = (): number => { // t1_getbyte: PFB segments
    let c = getchar()
    if (block === 0) {
      if (c !== 128) fail('invalid marker')
      c = getchar()
      if (c === 3) { while (!at_eof) getchar(); return -1 }
      block = getchar() & 255; block |= (getchar() & 255) << 8; block |= (getchar() & 255) << 16; block |= (getchar() & 255) << 24
      c = getchar()
    }
    block--
    return c
  }
  const edecrypt = (c: number) => { c &= 255; const p = c ^ (dr >> 8); dr = ((c + dr) * 52845 + 22719) & 0xffff; return p }
  const eencrypt = (p: number) => { const c = (p ^ (er >> 8)) & 255; er = ((c + er) * 52845 + 22719) & 0xffff; return c }
  const str = () => { const k = line.indexOf(0); return latin1(k < 0 ? line : line.slice(0, k)) } // the line as a C string
  const prefix = (s: string) => str().startsWith(s)
  const suffix = (s: string) => str_suffix(line, s)
  const charstrings = () => str().includes('/CharStrings'), subrs = () => prefix('/Subrs'), end_eexec = () => suffix('mark currentfile closefile')
  const eol = () => { if (line.length > 1 && line[line.length - 1] !== 10) line.push(10) }
  // t1_scan_num: the error shows the whole line
  const num = (s: string): [number, string] => {
    const p = s[0] === ' ' ? s.slice(1) : s
    const m = /^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(p)
    if (m === null) fail(`a number expected: \`${str().replace(/\n$/, '')}'`)
    let k = 0
    while (k < p.length && /[0-9.eE+-]/.test(p[k]!)) k++
    return [Math.fround(parseFloat(m![1]!)), p.slice(k)]
  }
  const getline = () => { // t1_getline
    for (;;) {
      if (at_eof) fail('unexpected end of file')
      line = []; cslen = 0
      let eexec_scan = 0, c = getbyte()
      if (c === -1) return
      while (!at_eof) {
        if (in_eexec === 1) c = edecrypt(c)
        if (c === 9) c = 32 // append_char_to_buf
        if (c === 13 || c === -1) c = 10
        if (c !== 32 || (line.length > 0 && line[line.length - 1] !== 32)) line.push(c)
        if (in_eexec === 0 && eexec_scan >= 0 && eexec_scan < 17) eexec_scan = line[eexec_scan] === 'currentfile eexec'.charCodeAt(eexec_scan) ? eexec_scan + 1 : -1
        if (c === 10) break
        if (t1_cs && cslen === 0 && line.length > 4 && (suffix(' RD ') || suffix(' -| '))) {
          let p = line.length - 5
          while (p >= 0 && line[p] !== 32) p--
          let l = Math.trunc(num(latin1(line.slice(p + 1)))[0])
          cslen = l & 0xffff // unsigned short t1_cslen
          cs_start = line.length
          while (l-- > 0) { const d = getbyte(); if (at_eof) fail('unexpected end of file'); line.push(edecrypt(d)) }
        }
        c = getbyte()
      }
      if (line.length > 1 && line[line.length - 1] !== 10) line.push(10) // append_eol
      if (line.length > 2 && line[line.length - 2] === 32) { line[line.length - 2] = 10; line.pop() }
      if (line.length < 2) continue
      if (eexec_scan === 17) in_eexec = 1
      return
    }
  }
  const putline = () => { if (line.length > 1) for (const c of line) out.push(encrypt ? eencrypt(c) : c) }
  const puts = (s: string) => { line = bytes(s); putline() }
  const check_block_len = (decrypt: boolean) => {
    if (block === 0) return
    let c = getbyte()
    if (decrypt) c = edecrypt(c)
    if (!(block === 0 && (c === 10 || c === 13))) fail(`${block + 1} bytes more than expected`)
  }
  let length1 = 0, length2 = 0
  const start_eexec = () => {
    length1 = out.length
    check_block_len(false)
    line = []
    for (let i = 0; i < 4; i++) { edecrypt(getbyte()); line.push(0) }
    encrypt = true; putline()
  }
  const stop_eexec = () => { length2 = out.length - length1; encrypt = false; check_block_len(true); t1_cs = false; in_eexec = 2 }
  // t1_scan_param, t1_scan_keys
  const scan_param = () => {
    if (!t1_scan || line[0] !== 47) return
    const s = str()
    if (s.startsWith('/lenIV')) { lenIV = Math.trunc(num(s.slice(6))[0]) << 16 >> 16; if (lenIV < 0) fail('negative value of lenIV is not supported'); return }
    const { slant, extend } = fd.fm
    if ((slant !== 0 || extend !== 0) && s.startsWith('/FontMatrix')) { // t1_modify_fm: slant, then extend; numbers are C floats
      let b = s.indexOf('[')
      if (b < 0 && (b = s.indexOf('{')) < 0) fail(`FontMatrix: an array expected: \`${s.replace(/\n$/, '')}'`)
      const a: number[] = []
      let p = s.slice(b + 1)
      for (let i = 0; i < 6; i++) { const [v, r] = num(p); a.push(v); p = r }
      if (slant !== 0) { const t = slant * 1E-3; a[0] = Math.fround(a[0]! + a[1]! * t); a[2] = Math.fround(a[2]! + a[3]! * t); a[4] = Math.fround(a[4]! + a[5]! * t) }
      if (extend !== 0) { const t = extend * 1E-3; a[0] = Math.fround(a[0]! * t); a[2] = Math.fround(a[2]! * t); a[4] = Math.fround(a[4]! * t) }
      const close = s[b] === '[' ? ']' : '}', c = p.indexOf(close)
      if (c < 0) fail(`FontMatrix: cannot find the corresponding character to '${s[b]}': \`${s.replace(/\n$/, '')}'`)
      line = bytes(s.slice(0, b + 1) + a.map(v => printf_g(v) + ' ').join('') + p.slice(c)); eol()
      return
    }
    if ((slant !== 0 || extend !== 0) && s.startsWith('/ItalicAngle')) { // t1_modify_italic (extend alone: the angle is not even read)
      if (slant === 0) return
      const sp = s.indexOf(' '), [v, r] = num(s.slice(sp + 1)), a = Math.fround(v - Math.atan(slant * 1E-3) * (180 / Math.PI))
      line = bytes(s.slice(0, sp + 1) + printf_g(a) + r); eol()
      fd.font_dim[ITALIC_ANGLE_CODE] = { val: a < 0 ? -Math.round(-a) : Math.round(a), set: true }
      return
    }
    if (s.startsWith('/FontType')) {
      const i = Math.trunc(num(s.slice(9))[0])
      if (i !== 1) fail(`Type${i} fonts unsupported by pdfTeX`)
      return
    }
    let k = font_key.findIndex(([, t1]) => t1 !== '' && s.startsWith(t1, 1))
    if (k < 0) return
    let p = s.slice(font_key[k]![1].length + 1)
    if (p[0] === ' ') p = p.slice(1)
    if (k === FONTNAME_CODE) {
      if (p[0] !== '/') fail(`a name expected: \`${s.replace(/\n$/, '')}'`)
      const r = s.length - p.length + 1 // after the slash
      const name = p.slice(1).split(/[ \n]/)[0]!
      fd.fontname = name + (slant !== 0 ? `-Slant_${slant}` : '') + (extend !== 0 ? `-Extend_${extend}` : '')
      if (subsetted) { // the tag is written over ABCDEF once the glyphs are known
        fontname_offset = out.length + r
        line = bytes(s.slice(0, r) + 'ABCDEF+' + fd.fontname + s.slice(r + name.length)); eol()
      }
      return
    }
    if ((k === STEMV_CODE || k === FONTBBOX1_CODE) && (p[0] === '[' || p[0] === '{')) p = p.slice(1)
    if (k === FONTBBOX1_CODE) {
      for (let i = 0; i < 4; i++, k++) { const [v, r] = num(p); fd.font_dim[k] = { val: Math.trunc(v), set: true }; p = r }
      return
    }
    fd.font_dim[k] = { val: Math.trunc(num(p)[0]), set: true }
  }

  if (!subsetted) { // t1_include
    do { getline(); scan_param(); putline() } while (in_eexec === 0)
    start_eexec()
    do { getline(); scan_param(); putline() } while (!(charstrings() || subrs()))
    t1_cs = true
    do { getline(); putline() } while (!end_eexec())
    stop_eexec()
    return { data: Uint8Array.from(out), length1, length2 }
  }

  // t1_builtin_enc: the font's own /Encoding, starting at the line that begins with /Encoding
  const t1_builtin_enc = (): [Glyphs, boolean] => {
    const glyph_names: Glyphs = new Array(256).fill(null)
    let s = str()
    if (suffix('def')) { // predefined encoding
      const name = s.slice(9).trim().split(/\s+/)[0] ?? ''
      if (name === 'StandardEncoding') return [[...standard_glyph_names], true]
      fail(`cannot subset font (unknown predefined encoding \`${name}')`)
    }
    if (s.startsWith('/Encoding [') || s.startsWith('/Encoding[')) { // the first case
      let r = s.slice(s.indexOf('[') + 1), counter = 0
      if (r[0] === ' ') r = r.slice(1)
      for (;;) {
        while (r[0] === '/') {
          let k = 1
          while (k < r.length && !' \n]/'.includes(r[k]!)) k++
          const buf = r.slice(1, k)
          r = r.slice(k); if (r[0] === ' ') r = r.slice(1)
          if (counter > 255) fail('encoding vector contains more than 256 names')
          if (buf !== notdef) glyph_names[counter] = buf
          counter++
        }
        if (r[0] !== '\n' && r[0] !== '%') {
          if (r.startsWith('] def') || r.startsWith('] readonly def')) break
          fail(`a name or \`] def' or \`] readonly def' expected: \`${s.replace(/\n$/, '')}'`)
        }
        getline(); r = s = str()
      }
      return [glyph_names, false]
    }
    // the second case: `dup <index> <glyph> put' and friends, up to `def'
    const copy = (a: number, b: number) => { glyph_names[b] = glyph_names[a]! }
    let p = s.slice(s.indexOf('\n')) // p is always a suffix of s
    for (;;) {
      if (p[0] === '\n' || p === '') { getline(); p = s = str() }
      let m: RegExpExecArray | null, x: [number, string] | null
      if (p.startsWith('dup ') && (x = scan_i(p.slice(4))) !== null && (m = /^\s*(\S{1,255})/.exec(x[1])) !== null && m[1]![0] === '/' && valid_code(x[0])) {
        if (m[1]!.slice(1) !== notdef) glyph_names[x[0]] = m[1]!.slice(1)
        const k = p.indexOf(' put'); if (k < 0) fail('invalid pfb, no put found in dup')
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
      } else if ((p.length === s.length || s[s.length - p.length - 1] === ' ') && p === 'def\n') return [glyph_names, false]
      else {
        let k = 0
        while (k < p.length && p[k] !== ' ' && p[k] !== '\n') k++
        p = p.slice(k); if (p[0] === ' ') p = p.slice(1)
      }
    }
  }

  // t1_subset_ascii_part
  getline()
  while (!prefix('/Encoding')) {
    scan_param()
    const s = str()
    if (!(s.startsWith('/UniqueID') && s.slice(-4, -1) === 'def')) putline()
    getline()
  }
  const [glyph_names, enc_standard] = t1_builtin_enc()
  fd.builtin_glyph_names = glyph_names
  if (fd.tx_tree !== null) for (const c of fd.tx_tree) fd.gl_tree.add(glyph_names[c] ?? notdef) // non-reencoded characters from TeX
  make_subset_tag(e, fd, warn)
  if (fontname_offset < 0) fail('unsupported: /FontName after /Encoding') // pdfTeX's assertion t1_fontname_offset != 0
  for (let i = 0; i < 6; i++) out[fontname_offset + i] = fd.subset_tag!.charCodeAt(i)
  if (enc_standard) puts('/Encoding StandardEncoding def\n')
  else {
    puts('/Encoding 256 array\n0 1 255 {1 index exch /.notdef put} for\n')
    const first = new Map<string, number>() // create_t1_glyph_tree: a name's first code
    glyph_names.forEach((g, i) => { if (g !== null && !first.has(g)) first.set(g, i) })
    let j = 0
    for (const g of [...fd.gl_tree].sort()) if (first.has(g)) { puts(`dup ${first.get(g)} /${g} put\n`); j++ }
    if (j === 0) puts('dup 0 /.notdef put\n') // for Acrobat 5.0
    puts('readonly def\n')
  }
  do { getline(); scan_param(); if (!prefix('/UniqueID')) putline() } while (in_eexec === 0)
  start_eexec()

  // t1_read_subrs
  let subr_tab: CsEntry[] = [], subr_size = 0, subr_max = -1, subr_array_start = '', subr_array_end = '', cs_token_pair: string[] | null = null
  const check_subr = (subr: number) => { if (subr >= subr_size || subr < 0) fail(`Subrs array: entry index out of range (${subr})`) }
  const cs_store = (is_subr: boolean): CsEntry => { // cs_store
    let k = line.indexOf(32); if (k < 0) k = line.length
    const data = line.slice(cs_start - 4, cs_start + cslen) // " RD " and the charstring
    for (let p = cs_start + cslen; p < line.length && line[p] !== 10; p++) data.push(line[p]!)
    data.push(10)
    const ptr: CsEntry = { name: str().slice(1, k), data, cslen, used: false, valid: true }
    if (is_subr) {
      const subr = Math.trunc(num(latin1(line.slice(k + 1)))[0])
      check_subr(subr)
      subr_tab[subr] = ptr
      cs_token_pair ??= cs_token_pairs_list.find(([a, z]) => latin1(data).startsWith(a!) && str_suffix(data, z!)) ?? null
    }
    return ptr
  }
  getline()
  while (!(charstrings() || subrs())) { scan_param(); if (!prefix('/UniqueID')) putline(); getline() }
  for (;;) { // found:
    t1_cs = true; t1_scan = false
    if (!subrs()) break
    subr_size = Math.trunc(num(str().slice(7))[0])
    if (subr_size < 0 || subr_size > SUBRS_MAX) fail(`unsupported: Subrs array of ${subr_size} entries`)
    if (subr_size === 0) { while (!charstrings()) getline(); break }
    subr_tab = Array.from({ length: subr_size }, () => ({ name: '', data: [], cslen: 0, used: false, valid: false }))
    subr_array_start = str()
    getline()
    while (cslen) { cs_store(true); getline() }
    for (let i = 0; i < subr_size && i < 4; i++) subr_tab[i]!.used = true // the first four, without parsing
    // the end of the Subrs array, up to five lines before /CharStrings; without /CharStrings the font is synthetic
    let i = 0
    subr_array_end = ''
    for (; i < 5; i++) { if (charstrings()) break; subr_array_end += str(); getline() }
    if (i < 5) break
    subr_tab = []; subr_size = 0; subr_array_start = subr_array_end = ''; cs_token_pair = null // cs_init
    t1_cs = false; synthetic = true
    while (!(charstrings() || subrs())) getline()
  }

  // t1_subset_charstrings
  if (scan_i(str().slice(str().indexOf('/CharStrings') + 12)) === null) { // t1_check_unusual_charstring: the size is on the next line
    const s = str().slice(0, -1) + ' '
    getline()
    line = bytes(s + str()); eol()
  }
  const cs_size_pos = str().indexOf('/CharStrings') + 13, cs_size = Math.trunc(num(str().slice(cs_size_pos))[0])
  const cs_tab: CsEntry[] = []
  let cs_notdef: CsEntry | null = null
  const cs_dict_start = str()
  getline()
  while (cslen) {
    if (cs_tab.length >= cs_size) fail(`CharStrings dict: more entries than dict size (${cs_size})`)
    cs_tab.push(cs_store(false)); getline()
  }
  const cs_dict_end = str()
  // cs_mark
  const S = e.fm.t1.cc_stack
  let work = 0
  const cs_mark = (cs_name: string | null, subr: number, depth: number): void => {
    let ptr: CsEntry
    if (cs_name === null) {
      check_subr(subr)
      ptr = subr_tab[subr]!
      if (!ptr.valid) return
    } else if (cs_notdef !== null && cs_name === notdef) ptr = cs_notdef
    else {
      const p = cs_tab.find(p => p.name === cs_name)
      if (p === undefined) { warn(`glyph \`${cs_name}' undefined`); return }
      ptr = p
      if (ptr.name === notdef) cs_notdef = ptr
    }
    // only marked CharString entries and invalid entries can be skipped; valid marked subrs are parsed to keep the stack in sync
    if (!ptr.valid || (ptr.used && cs_name !== null)) return
    ptr.used = true
    const cs_fail = (m: string): never => fail(cs_name === null ? `Subr (${subr}): ${m}` : `CharString (/${cs_name}): ${m}`)
    if (depth > CS_DEPTH_MAX) cs_fail('unsupported: subroutines nested too deeply')
    const data = ptr.data
    let cr = 4330, k = 4, cs_len = ptr.cslen, last_cmd = 0
    const getc = () => { const c = (data[k++] ?? 0) & 255, p = c ^ (cr >> 8); cr = ((c + cr) * 52845 + 22719) & 0xffff; return p }
    const stack_error = (n: number): never => fail(`CharString: invalid access (${n}) to stack (${S.length} entries)`)
    const pop = (n: number) => { if (n < 0 || S.length < n) stack_error(n); S.length -= n }
    const push = (v: number) => { if (S.length >= 24) cs_fail('unsupported: more than 24 operands'); S.push(v) } // C overruns cc_stack
    const get = (n: number) => (n < 0 ? S[S.length + n] : S[n]) ?? 0
    for (let i = 0; i < lenIV; i++, cs_len--) getc()
    if ((work += Math.max(cs_len, 0)) > CS_WORK_MAX) cs_fail('unsupported: too much charstring code to parse')
    while (cs_len > 0) {
      --cs_len
      let b = getc()
      if (b >= 32) {
        let a: number
        if (b <= 246) a = b - 139
        else if (b <= 250) { --cs_len; a = ((b - 247) << 8) + 108 + getc() }
        else if (b <= 254) { --cs_len; a = -((b - 251) << 8) - 108 - getc() }
        else { cs_len -= 4; a = getc() << 24 | getc() << 16 | getc() << 8 | getc() }
        push(a)
        continue
      }
      if (b === CS_ESCAPE) { b = getc() + CS_1BYTE_MAX; cs_len-- }
      if (b >= CS_MAX) cs_fail(`command value out of range: ${b}`)
      const cc = cc_tab[b]
      if (cc === undefined) cs_fail(`command not valid: ${b}`)
      const [nargs, bottom, clear] = cc!
      if (bottom) {
        if (S.length < nargs) cs_fail(`less arguments on stack (${S.length}) than required (${nargs})`)
        else if (S.length > nargs) cs_fail(`more arguments on stack (${S.length}) than required (${nargs})`)
      }
      last_cmd = b
      if (b === CS_CALLSUBR) {
        const a1 = get(-1)
        pop(1)
        cs_mark(null, a1, depth + 1)
        if (!subr_tab[a1]!.valid) cs_fail(`cannot call subr (${a1})`)
      } else if (b === CS_DIV) { pop(2); push(0) }
      else if (b === CS_CALLOTHERSUBR) {
        if (get(-1) === 3) e.fm.t1.last_arg_othersubr3 = get(-3)
        pop(get(-2) + 2)
      } else if (b === CS_POP) push(e.fm.t1.last_arg_othersubr3) // matters only after OtherSubrs[3] (hint replacement)
      else if (b === CS_SEAC) {
        const a1 = get(3), a2 = get(4)
        S.length = 0
        if (!valid_code(a1) || !valid_code(a2)) cs_fail(`unsupported: seac with character code ${valid_code(a1) ? a2 : a1}`) // C indexes out of bounds
        const g1 = standard_glyph_names[a1] ?? notdef, g2 = standard_glyph_names[a2] ?? notdef
        cs_mark(g1, 0, depth); cs_mark(g2, 0, depth)
        fd.gl_tree.add(g1); fd.gl_tree.add(g2) // base and accent characters are needed in CharSet
      } else if (clear) S.length = 0
    }
    if (cs_name === null && last_cmd !== CS_RETURN) {
      warn(`last command in subr \`${subr}' is not a RETURN; I will add it now but please consider fixing the font`)
      // append_cs_return
      let r = 4330
      const plain: number[] = []
      for (let i = 0; i < ptr.cslen; i++) { const c = (data[4 + i] ?? 0) & 255; plain.push(c ^ (r >> 8)); r = ((c + r) * 52845 + 22719) & 0xffff }
      plain.push(CS_RETURN)
      r = 4330
      const enc = plain.map(p => { const c = (p ^ (r >> 8)) & 255; r = ((c + r) * 52845 + 22719) & 0xffff; return c })
      ptr.data = [...data.slice(0, 4), ...enc, ...data.slice(4 + ptr.cslen)]
      ptr.cslen++
    }
  }
  // t1_mark_glyphs
  if (synthetic || fd.all_glyphs) {
    for (const p of cs_tab) if (p.valid) p.used = true
    for (const p of subr_tab) if (p.valid) p.used = true
    subr_max = subr_size - 1
  } else {
    cs_mark(notdef, 0, 0)
    // in strcmp order; names seac adds after the current one are visited too (libavl's traverser follows insertions)
    let list = [...fd.gl_tree].sort()
    for (let i = 0; i < list.length; i++) {
      const g = list[i]!
      cs_mark(g, 0, 0)
      if (fd.gl_tree.size !== list.length) { list = [...fd.gl_tree].sort(); i = list.indexOf(g) }
    }
    subr_tab.forEach((p, i) => { if (p.used) subr_max = i })
  }
  // t1_flush_cs
  const flush_head = (start: string, size_pos: number, count: number) => {
    let p = size_pos
    while (p < start.length && /[0-9]/.test(start[p]!)) p++
    line = bytes(start.slice(0, size_pos) + count + start.slice(p)); eol(); putline()
  }
  const flush_end = (s: string) => { line = bytes(s); eol(); putline() }
  if (subr_size > 0) {
    if (cs_token_pair === null) fail('This Type 1 font uses mismatched subroutine begin/end token pairs.')
    flush_head(subr_array_start, 7, subr_max + 1)
    let r = 4330
    const return_cs = [...new Array<number>(lenIV).fill(0), CS_RETURN].map(p => { const c = (p ^ (r >> 8)) & 255; r = ((c + r) * 52845 + 22719) & 0xffff; return c })
    for (let i = 0; i <= subr_max; i++) {
      const p = subr_tab[i]!
      if (p.used) { line = [...bytes(`dup ${i} ${p.cslen}`), ...p.data]; putline() }
      else { // unused subrs become `return'
        line = [...bytes(`dup ${i} ${return_cs.length}${cs_token_pair![0]} `), ...return_cs]; putline()
        line = bytes(` ${cs_token_pair![1]}`); eol(); putline()
      }
    }
    flush_end(subr_array_end)
  }
  flush_head(cs_dict_start, cs_size_pos, cs_tab.filter(p => p.used).length)
  for (const p of cs_tab) if (p.used) { line = [...bytes(`/${p.name} ${p.cslen}`), ...p.data]; putline() }
  flush_end(cs_dict_end)

  // t1_subset_end
  if (synthetic) { // copy to "dup /FontName get exch definefont pop", drop the rest
    while (!str().includes('definefont')) { getline(); putline() }
    while (!end_eexec()) getline()
    putline()
  } else while (!end_eexec()) { getline(); putline() }
  stop_eexec()
  return { data: Uint8Array.from(out), length1, length2 }
}

// writet1.c writet1: logs `<path>' or `<<path>>'
export function writet1(e: Engine, fd: T1Target, ff_name: string, subsetted: boolean): { data: Uint8Array, length1: number, length2: number } {
  const b = e.fs.find(ff_name, 'type1')
  if (b === null) pdftex_fail(e, ff_name, 'cannot open Type 1 font file for reading')
  const path = e.fs.path?.(ff_name, 'type1') ?? ff_name
  print(e, subsetted ? '<' : '<<'); print(e, path)
  if (b[0] !== 128) pdftex_fail(e, path, 'unsupported: PFA font files') // shortcut: PFB only; port t1_getbyte's PFA branch if a map names a .pfa
  const r = t1_write(e, fd, b, path, subsetted)
  print(e, subsetted ? '>' : '>>')
  return r
}
