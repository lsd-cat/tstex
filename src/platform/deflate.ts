// zlib (RFC 1950/1951) for platforms without a synchronous one (browsers: CompressionStream is async, but the engine
// deflates each PDF stream when it ends, since the xref needs its length)
// shortcut: deflate emits one fixed-Huffman block with greedy LZ77 (output is valid but ~20% larger than zlib's and
// not byte-equal to it); add dynamic Huffman blocks if compressed PDF size matters.

// RFC 1951 3.2.5: base values and extra bits of length codes 257..285 and distance codes 0..29
const len_base = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const len_extra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const dist_base = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const dist_extra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

function adler32(d: Uint8Array): number {
  let a = 1, b = 0
  for (let i = 0; i < d.length;) {
    for (const end = Math.min(i + 5552, d.length); i < end; i++) { a += d[i]!; b += a }
    a %= 65521; b %= 65521
  }
  return ((b << 16) | a) >>> 0
}

// index of the last table entry <= v
const code_of = (table: number[], v: number) => { let i = table.length - 1; while (table[i]! > v) i--; return i }

export function deflate(data: Uint8Array, level: number): Uint8Array {
  const out: number[] = [0x78, 0x9c]
  let bits = 0, nbits = 0
  const put = (v: number, n: number) => { bits |= v << nbits; nbits += n; while (nbits >= 8) { out.push(bits & 255); bits >>>= 8; nbits -= 8 } }
  const put_rev = (code: number, n: number) => { let r = 0; for (let i = 0; i < n; i++) r |= ((code >> i) & 1) << (n - 1 - i); put(r, n) } // Huffman codes go MSB first
  const lit = (c: number) => { // fixed literal/length code
    if (c < 144) put_rev(0x30 + c, 8); else if (c < 256) put_rev(0x190 + c - 144, 9); else if (c < 280) put_rev(c - 256, 7); else put_rev(0xc0 + c - 280, 8)
  }
  put(1, 1); put(1, 2) // BFINAL, BTYPE=01 fixed Huffman
  const head = new Int32Array(1 << 15).fill(-1), prev = new Int32Array(32768), chain = 4 << Math.min(level, 9)
  const hash = (i: number) => ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & 0x7fff
  const insert = (i: number) => { if (i + 2 < data.length) { const h = hash(i); prev[i & 32767] = head[h]!; head[h] = i } }
  for (let i = 0; i < data.length;) {
    let best = 0, dist = 0
    if (i + 2 < data.length) {
      for (let j = head[hash(i)]!, n = chain; j >= 0 && i - j <= 32768 && n > 0; j = prev[j & 32767]!, n--) {
        let l = 0
        while (l < 258 && i + l < data.length && data[j + l] === data[i + l]) l++
        if (l > best) { best = l; dist = i - j; if (l === 258) break }
      }
    }
    if (best >= 3) {
      const lc = code_of(len_base, best), dc = code_of(dist_base, dist)
      lit(257 + lc); put(best - len_base[lc]!, len_extra[lc]!)
      put_rev(dc, 5); put(dist - dist_base[dc]!, dist_extra[dc]!)
      for (const end = i + best; i < end; i++) insert(i)
    } else { lit(data[i]!); insert(i); i++ }
  }
  lit(256)
  if (nbits > 0) out.push(bits & 255)
  const a = adler32(data)
  out.push(a >>> 24, (a >>> 16) & 255, (a >>> 8) & 255, a & 255)
  return Uint8Array.from(out)
}

// zlib inflate of at most max bytes; throws on bad or truncated data, a bad checksum, or more than max bytes
export function inflate(z: Uint8Array, max: number): Uint8Array {
  if (z.length < 2 || (z[0]! & 15) !== 8 || ((z[0]! << 8) | z[1]!) % 31 !== 0 || (z[1]! & 32) !== 0) throw new Error('bad zlib header')
  let pos = 2, bit = 0, n = 0
  let out = new Uint8Array(Math.min(max, Math.max(1024, z.length * 4)))
  const get = (k: number) => { // k bits, LSB first
    let v = 0
    for (let i = 0; i < k; i++) {
      if (pos >= z.length) throw new Error('unexpected end of data')
      v |= ((z[pos]! >> bit) & 1) << i
      if (++bit === 8) { bit = 0; pos++ }
    }
    return v
  }
  const emit = (b: number) => {
    if (n === out.length) {
      if (n >= max) throw new Error('output too large')
      const o = new Uint8Array(Math.min(max, n * 2)); o.set(out); out = o
    }
    out[n++] = b
  }
  // canonical Huffman decoding table from code lengths: counts per length and symbols in code order
  const table = (lens: number[]) => {
    const count = new Array(16).fill(0), offs = new Array(16).fill(0)
    for (const l of lens) count[l]++
    count[0] = 0
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1]
    const sym = new Array(lens.length)
    lens.forEach((l, s) => { if (l !== 0) sym[offs[l]++] = s })
    return { count, sym }
  }
  const decode = (t: { count: number[], sym: number[] }) => {
    let code = 0, first = 0, index = 0
    for (let l = 1; l < 16; l++) {
      code |= get(1); const c = t.count[l]!
      if (code - c < first) return t.sym[index + code - first]!
      index += c; first += c; first <<= 1; code <<= 1
    }
    throw new Error('bad Huffman code')
  }
  const fixed_lit = table([...new Array(144).fill(8), ...new Array(112).fill(9), ...new Array(24).fill(7), ...new Array(8).fill(8)])
  const fixed_dist = table(new Array(30).fill(5))
  for (let final = 0; !final;) {
    final = get(1)
    const type = get(2)
    if (type === 0) {
      if (bit > 0) { bit = 0; pos++ }
      if (pos + 4 > z.length) throw new Error('unexpected end of data')
      const len = z[pos]! | (z[pos + 1]! << 8)
      if ((len ^ 0xffff) !== (z[pos + 2]! | (z[pos + 3]! << 8))) throw new Error('bad stored block')
      pos += 4
      if (pos + len > z.length) throw new Error('unexpected end of data')
      for (let i = 0; i < len; i++) emit(z[pos++]!)
      continue
    }
    if (type === 3) throw new Error('bad block type')
    let lt = fixed_lit, dt = fixed_dist
    if (type === 2) { // RFC 1951 3.2.7
      const hlit = get(5) + 257, hdist = get(5) + 1, hclen = get(4) + 4
      const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], cl = new Array(19).fill(0)
      for (let i = 0; i < hclen; i++) cl[order[i]!] = get(3)
      const ct = table(cl), lens: number[] = []
      while (lens.length < hlit + hdist) {
        const s = decode(ct)
        if (s < 16) lens.push(s)
        else if (s === 16) { if (lens.length === 0) throw new Error('bad repeat'); const p = lens[lens.length - 1]!; for (let r = 3 + get(2); r > 0; r--) lens.push(p) }
        else for (let r = s === 17 ? 3 + get(3) : 11 + get(7); r > 0; r--) lens.push(0)
      }
      if (lens.length > hlit + hdist) throw new Error('bad code lengths')
      lt = table(lens.slice(0, hlit)); dt = table(lens.slice(hlit))
    }
    for (;;) {
      const s = decode(lt)
      if (s < 256) emit(s)
      else if (s === 256) break
      else {
        if (s > 285) throw new Error('bad length code')
        const len = len_base[s - 257]! + get(len_extra[s - 257]!), dc = decode(dt)
        if (dc > 29) throw new Error('bad distance code')
        const d = dist_base[dc]! + get(dist_extra[dc]!)
        if (d > n) throw new Error('distance too far back')
        for (let i = 0; i < len; i++) emit(out[n - d]!)
      }
    }
  }
  if (bit > 0) pos++
  if (pos + 4 > z.length) throw new Error('unexpected end of data')
  const want = ((z[pos]! << 24) | (z[pos + 1]! << 16) | (z[pos + 2]! << 8) | z[pos + 3]!) >>> 0
  const got = out.subarray(0, n)
  if (adler32(got) !== want) throw new Error('bad checksum')
  return got
}
