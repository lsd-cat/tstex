// pdftex's utils.c string helpers used by conv_toks (pdftex.web §470 cases): escapes, MD5, PDF dates. Byte arrays in, byte arrays out.

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
const bytes = (s: string) => Array.from(s, c => c.charCodeAt(0))

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

// utils.c makepdftime: D:YYYYMMDDHHMMSS then Z or ±HH'MM' (local time)
export function makepdftime(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0'), off = -d.getTimezoneOffset()
  const z = off === 0 ? 'Z' : (off < 0 ? '-' : '+') + p2(Math.trunc(Math.abs(off) / 60)) + "'" + p2(Math.abs(off) % 60) + "'"
  return `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}${z}`
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
