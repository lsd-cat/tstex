// pdftex's utils.c string helpers used by conv_toks (pdftex.web §470 cases): escapes, MD5, PDF dates. Byte arrays in, byte arrays out.

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
const bytes = (s: string) => Array.from(s, c => c.charCodeAt(0))
// bytes to a string, and appending, without a spread (`fromCharCode(...a)' overflows the JS stack past ~10^5 elements)
export const str = (a: number[]) => a.map(c => String.fromCharCode(c)).join('')
export function append(a: number[], b: number[] | string): void { for (let i = 0; i < b.length; i++) a.push(typeof b === 'string' ? b.charCodeAt(i) : b[i]!) }

// utils.c escapestring: PDF literal-string escaping
export function escapestring(s: number[]): number[] {
  const out: number[] = []
  for (const ch of s) {
    if (ch < 0x21 || ch > 0x7e) out.push(...bytes('\\' + ch.toString(8).padStart(3, '0')))
    else { if (ch === 0x28 || ch === 0x29 || ch === 0x5c) out.push(0x5c); out.push(ch) }
  }
  return out
}

// utils.c escapename: PDF name escaping
export function escapename(s: number[]): number[] {
  const out: number[] = []
  for (const ch of s) {
    if (ch === 0) continue
    if (ch <= 32 || ch >= 127 || '#%()/<>[]{}'.includes(String.fromCharCode(ch))) out.push(...bytes('#' + hex(ch)))
    else out.push(ch)
  }
  return out
}

// utils.c escapehex
export const escapehex = (s: number[]): number[] => s.flatMap(ch => bytes(hex(ch)))

// utils.c unescapehex: non-hex characters are skipped; an odd final digit is the high nibble
export function unescapehex(s: number[]): number[] {
  const out: number[] = []
  let a = -1
  for (const ch of s) {
    const d = ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - 55 : ch >= 97 && ch <= 102 ? ch - 87 : -1
    if (d < 0) continue
    if (a < 0) a = d << 4; else { out.push(a + d); a = -1 }
  }
  if (a >= 0) out.push(a)
  return out
}

// utils.c makepdftime: D:YYYYMMDDHHMMSS then Z or ±HH'MM' (local time, or UTC as with SOURCE_DATE_EPOCH)
export function makepdftime(d: Date, utc = false): string {
  const p2 = (n: number) => String(n).padStart(2, '0'), off = utc ? 0 : -d.getTimezoneOffset()
  const z = off === 0 ? 'Z' : (off < 0 ? '-' : '+') + p2(Math.trunc(Math.abs(off) / 60)) + "'" + p2(Math.abs(off) % 60) + "'"
  const [y, mo, da, h, mi, se] = utc ? [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    : [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]
  return `D:${y}${p2(mo + 1)}${p2(da)}${p2(h)}${p2(mi)}${p2(se)}${z}`
}

// RFC 1321 MD5 (utils.c getmd5sum uses md5.c); returns 32 uppercase hex digits
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0)
const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
export function md5(data: Uint8Array | number[]): string {
  const n = data.length, len = ((n + 8) >> 6) + 1 << 6, m = new Uint8Array(len)
  m.set(data); m[n] = 0x80
  const bits = n * 8
  for (let i = 0; i < 8; i++) m[len - 8 + i] = Math.floor(bits / 2 ** (8 * i)) & 255
  const dv = new DataView(m.buffer)
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476
  for (let off = 0; off < len; off += 64) {
    let a = a0, b = b0, c = c0, d = d0
    for (let i = 0; i < 64; i++) {
      let f: number, g: number
      if (i < 16) { f = (b & c) | (~b & d); g = i }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15 }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15 }
      else { f = c ^ (b | ~d); g = (7 * i) & 15 }
      const t = (a + f + K[i]! + dv.getInt32(off + 4 * g, true)) | 0, s = R[(i >> 4) * 4 + (i & 3)]!
      a = d; d = c; c = b; b = (b + ((t << s) | (t >>> (32 - s)))) | 0
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0
  }
  return [a0, b0, c0, d0].map(w => Array.from({ length: 4 }, (_, i) => hex((w >>> (8 * i)) & 255)).join('')).join('')
}

// utils.c matchstrings/getmatch: POSIX extended regexps (regcomp REG_EXTENDED) through RegExp. Bracket expressions are
// translated ([:class:], literal `\' and leading `]'); POSIX's leftmost-longest match is found by asking for the longest end.
// shortcut: POSIX subexpression rules and other ERE/RegExp differences are not emulated; port a POSIX matcher if a document needs them
const classes: Record<string, string> = { alpha: 'A-Za-z', digit: '0-9', alnum: '0-9A-Za-z', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f\\x7f', print: ' -~', graph: '!-~' }
function ere_to_js(re: string): string {
  let out = ''
  for (let i = 0; i < re.length; i++) {
    if (re[i] !== '[') { out += re[i] === '\\' ? re.slice(i, ++i + 1) : re[i]; continue }
    out += '['; i++
    if (re[i] === '^') { out += '^'; i++ }
    if (re[i] === ']') { out += '\\]'; i++ }
    for (; i < re.length && re[i] !== ']'; i++) {
      const m = /^\[:([a-z]+):\]/.exec(re.slice(i))
      if (m && classes[m[1]!] !== undefined) { out += classes[m[1]!]; i += m[0].length - 1 }
      else out += re[i] === '\\' || re[i] === '[' ? '\\' + re[i] : re[i]
    }
    out += ']'
  }
  return out
}
// returns null for a bad pattern, else the matched [start, text] per subexpression (null: no match for it) or [] for no match
export function matchstrings(pattern: string, s: string, icase: boolean): ([number, string] | null)[] | null {
  let re: RegExp
  try { re = new RegExp(ere_to_js(pattern), icase ? 'i' : '') } catch { return null }
  const first = re.exec(s)
  if (first === null) return []
  const start = first.index, src = re.source
  for (let end = s.length; end >= start; end--) { // leftmost-longest: the longest match at the leftmost start
    const r = new RegExp(`(?:${src})(?<=^[\\s\\S]{${end}})`, (icase ? 'i' : '') + 'yd'); r.lastIndex = start
    const m = r.exec(s)
    if (m) return Array.from(m, (t, i) => t === undefined ? null : [m.indices![i]![0], t])
  }
  return []
}
