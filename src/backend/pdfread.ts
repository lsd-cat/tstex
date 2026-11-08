// The little of xpdf (TeX Live's libs/xpdf: Lexer.cc, Parser.cc, XRef.cc, Stream.cc, PDFDoc.cc, Catalog.cc, Page.cc) that
// pdftoepdf.cc needs, with xpdf's behaviour on well-formed and damaged files: the lexer and parser, xref tables with /Prev
// chains and hybrid /XRefStm links, xref streams, object streams, reconstruction by scanning (constructXRef), the page tree with
// inherited attributes and merged resources. Filters: FlateDecode with predictors (inflate is the platform's); xpdf's other
// decoders are refused. Encrypted files are refused (xpdf would decrypt those with an empty user password).
import type { Engine } from '../engine.ts'
import { fatal_error } from '../error.ts'

export type XRef = { e: Engine, b: Uint8Array, start: number, size: number, last: number, ent: Map<number, { off: number, gen: number, type: number }>,
  trailer: PDict | null, root_num: number, root_gen: number, stream_ends: number[] | null, ok: boolean, objstms: Map<number, ObjStm> }
export type PDict = { t: 'dict', m: Map<string, PObj>, x: XRef | null } // x: the xref Dict::lookup fetches through (NULL in xpdf's xref parsing)
export type PStream = { t: 'stream', d: PDict, b: Uint8Array, pos: number, len: number }
export type PRef = { t: 'ref', num: number, gen: number }
export type PObj = null | boolean | number | { t: 'real', v: number } | { t: 'str', v: string } | { t: 'name', v: string } | PObj[] | PDict | PStream
  | PRef | { t: 'cmd', v: string } | { t: 'error' } | { t: 'eof' }
type ObjStm = { nums: number[], objs: PObj[] }

const LIMIT = 500 // Parser.h objectRecursionLimit
const FREE = 0, UNCOMPRESSED = 1, COMPRESSED = 2

// Object.cc objTypeNames
export function type_name(o: PObj): string {
  if (o === null) return 'null'
  if (typeof o === 'boolean') return 'boolean'
  if (typeof o === 'number') return 'integer'
  if (Array.isArray(o)) return 'array'
  return { real: 'real', str: 'string', name: 'name', dict: 'dictionary', stream: 'stream', ref: 'ref', cmd: 'cmd', error: 'error', eof: 'eof' }[o.t]
}
const tag = (o: PObj) => o !== null && typeof o === 'object' && !Array.isArray(o) ? o.t : ''
export const is_name = (o: PObj, v?: string): o is { t: 'name', v: string } => tag(o) === 'name' && (v === undefined || (o as { v: string }).v === v)
export const is_dict = (o: PObj): o is PDict => tag(o) === 'dict'
export const is_stream = (o: PObj): o is PStream => tag(o) === 'stream'
export const is_ref = (o: PObj): o is PRef => tag(o) === 'ref'
export const is_num = (o: PObj) => typeof o === 'number' || tag(o) === 'real'
export const num = (o: PObj) => typeof o === 'number' ? o : tag(o) === 'real' ? (o as { v: number }).v : 0
const is_cmd = (o: PObj, v: string) => tag(o) === 'cmd' && (o as { v: string }).v === v
const new_dict = (x: XRef | null): PDict => ({ t: 'dict', m: new Map(), x })

// Object::fetch (one level), Dict::lookup, Dict::lookupNF
export const deref = (x: XRef | null, o: PObj, depth = 0): PObj => is_ref(o) && x !== null ? fetch(x, o.num, o.gen, depth) : o
export const lookup = (d: PDict, k: string, depth = 0): PObj => deref(d.x, d.m.get(k) ?? null, depth)
export const lookup_nf = (d: PDict, k: string): PObj => d.m.get(k) ?? null

// Lexer.cc
const special = new Uint8Array(256)
for (const c of [0, 9, 10, 12, 13, 32]) special[c] = 1
for (const c of '%()/<>[]{}') special[c.charCodeAt(0)] = 2
const is_space = (c: number) => c >= 0 && c <= 255 && special[c] === 1
const is_digit = (c: number) => c >= 48 && c <= 57
type Lexer = { b: Uint8Array, p: number, end: number, eof: boolean }
const lexer = (b: Uint8Array, p: number, end = b.length): Lexer => ({ b, p: Math.min(p, end), end, eof: false })
const getc = (l: Lexer) => { if (l.p < l.end) return l.b[l.p++]!; l.eof = true; return -1 }
const lookc = (l: Lexer) => l.p < l.end ? l.b[l.p]! : -1
const hexv = (c: number) => c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1

function lex(l: Lexer): PObj {
  let c: number, comment = false
  for (;;) {
    if ((c = getc(l)) === -1) return { t: 'eof' }
    if (comment) { if (c === 13 || c === 10) comment = false }
    else if (c === 37) comment = true
    else if (special[c] !== 1) break
  }
  if (is_digit(c) || c === 43 || c === 45 || c === 46) { // number, with Adobe's "interesting" behaviour
    let neg = false, double_minus = false, xf = 0, xi = 0, real = false
    if (c === 45) { neg = true; if (lookc(l) === 45) { double_minus = true; do getc(l); while (lookc(l) === 45) } }
    else if (c === 46) real = true
    else if (c !== 43) xf = xi = c - 48
    if (!real) for (;;) {
      c = lookc(l)
      if (is_digit(c)) { getc(l); xi = (Math.imul(xi, 10) + c - 48) | 0; if (xf < 1e20) xf = xf * 10 + (c - 48) }
      else if (c === 46) { getc(l); real = true; break }
      else break
    }
    if (real) {
      let scale = 0.1
      for (;;) {
        c = lookc(l)
        if (c === 45) { getc(l); continue }
        if (!is_digit(c)) break
        getc(l); xf = xf + scale * (c - 48); scale *= 0.1
      }
    }
    while ((c = lookc(l)) === 45 || is_digit(c)) getc(l)
    if (real) return { t: 'real', v: neg ? -xf : xf }
    if (neg) xi = -xi | 0
    return double_minus ? 0 : xi
  }
  if (c === 40) { // string
    let s = '', paren = 1
    for (;;) {
      let c2 = -1
      c = getc(l)
      if (c === -1) break
      if (c === 40) { paren++; c2 = c }
      else if (c === 41) { if (--paren === 0) break; c2 = c }
      else if (c === 13) { if (lookc(l) === 10) getc(l); c2 = 10 }
      else if (c === 92) {
        c = getc(l)
        if (c === 110) c2 = 10; else if (c === 114) c2 = 13; else if (c === 116) c2 = 9; else if (c === 98) c2 = 8; else if (c === 102) c2 = 12
        else if (c >= 48 && c <= 55) {
          c2 = c - 48
          if ((c = lookc(l)) >= 48 && c <= 55) { getc(l); c2 = (c2 << 3) + c - 48; if ((c = lookc(l)) >= 48 && c <= 55) { getc(l); c2 = (c2 << 3) + c - 48 } }
        } else if (c === 13) { if (lookc(l) === 10) getc(l) }
        else if (c === 10) { /* line continuation */ }
        else if (c === -1) break
        else c2 = c
      } else c2 = c
      if (c2 !== -1) s += String.fromCharCode(c2 & 255)
    }
    return { t: 'str', v: s }
  }
  if (c === 47) { // name
    let s = '', invalid = false
    while ((c = lookc(l)) !== -1 && !special[c]) {
      getc(l)
      if (c === 35) {
        const h = hexv(lookc(l))
        if (h >= 0) {
          getc(l)
          const h2 = hexv(lookc(l))
          if (h2 >= 0) { getc(l); c = (h << 4) + h2; if (c === 0) invalid = true } else c = h // "Invalid hex escape in name": the digit is the char
        }
      }
      s += String.fromCharCode(c)
    }
    return invalid ? { t: 'error' } : { t: 'name', v: s }
  }
  if (c === 91 || c === 93) return { t: 'cmd', v: String.fromCharCode(c) }
  if (c === 60) {
    if (lookc(l) === 60) { getc(l); return { t: 'cmd', v: '<<' } }
    let s = '', m = 0, c2 = 0, errors = 0
    while (errors < 100) {
      c = getc(l)
      if (c === 62 || c === -1) break
      if (special[c] !== 1) {
        c2 <<= 4
        const h = hexv(c)
        if (h >= 0) c2 += h; else errors++
        if (++m === 2) { s += String.fromCharCode(c2 & 255); c2 = 0; m = 0 }
      }
    }
    if (m === 1) s += String.fromCharCode((c2 << 4) & 255)
    return { t: 'str', v: s }
  }
  if (c === 62) { if (lookc(l) === 62) { getc(l); return { t: 'cmd', v: '>>' } } return { t: 'error' } }
  if (c === 41 || c === 123 || c === 125) return { t: 'error' }
  let s = String.fromCharCode(c), n = 1 // command
  while ((c = lookc(l)) !== -1 && !special[c]) { getc(l); if (++n === 128) break; s += String.fromCharCode(c) }
  return s === 'true' ? true : s === 'false' ? false : s === 'null' ? null : { t: 'cmd', v: s }
}

// Parser.cc (content-stream inline images never reach us)
type Parser = { x: XRef | null, l: Lexer, streams: boolean, b1: PObj, b2: PObj }
function parser(x: XRef | null, l: Lexer, streams: boolean): Parser { const b1 = lex(l); return { x, l, streams, b1, b2: lex(l) } }
function shift(p: Parser): void { p.b1 = p.b2; p.b2 = lex(p.l) }
function get_obj(p: Parser, simple: boolean, depth: number): PObj {
  if (!simple && depth < LIMIT && is_cmd(p.b1, '[')) {
    shift(p)
    const a: PObj[] = []
    while (!is_cmd(p.b1, ']') && tag(p.b1) !== 'eof') a.push(get_obj(p, false, depth + 1))
    shift(p)
    return a
  }
  if (!simple && depth < LIMIT && is_cmd(p.b1, '<<')) {
    shift(p)
    const d = new_dict(p.x)
    while (!is_cmd(p.b1, '>>') && tag(p.b1) !== 'eof') {
      if (!is_name(p.b1)) { shift(p); continue }
      const k = p.b1.v
      shift(p)
      if (tag(p.b1) === 'eof' || tag(p.b1) === 'error') break
      d.m.set(k, get_obj(p, false, depth + 1)) // Dict::add: a repeated key keeps its place and takes the new value
    }
    if (p.streams && is_cmd(p.b2, 'stream')) return make_stream(p, d, depth + 1) ?? { t: 'error' }
    shift(p)
    return d
  }
  if (typeof p.b1 === 'number') {
    const n = p.b1
    shift(p)
    if (typeof p.b1 === 'number' && is_cmd(p.b2, 'R')) {
      const g = p.b1
      shift(p); shift(p)
      return n >= 0 && g >= 0 ? { t: 'ref', num: n, gen: g } : { t: 'error' }
    }
    return n
  }
  const o = p.b1
  shift(p)
  return o
}

// Parser::makeStream: the data is the undecoded bytes [pos, pos+len) of the file (clipped at its end)
function make_stream(p: Parser, d: PDict, depth: number): PStream | null {
  const l = p.l
  for (;;) { const c = getc(l); if (c === -1 || c === 10) break; if (c === 13) { if (lookc(l) === 10) getc(l); break } } // skipToNextLine
  if (l.eof) return null
  const pos = l.p
  let len = 0, have = false
  const end = p.x !== null ? stream_end(p.x, pos) : -1
  if (end >= 0) { len = end - pos; have = true }
  else {
    const o = lookup(d, 'Length', depth)
    if (typeof o === 'number') { len = o >>> 0; have = true }
  }
  const at = (s: string, i: number) => { for (let k = 0; k < s.length; k++) if (l.b[i + k] !== s.charCodeAt(k) || i + k >= l.end) return false; return true }
  if (!have) {
    let i = pos
    for (; i < l.end; i++) if (l.b[i] === 101 && i + 9 <= l.end && at('ndstream', i + 1)) break
    if (i >= l.end) return null
    len = i - pos
    l.p = i + 9
  } else {
    l.p = Math.min(pos + len, l.end)
    let i = pos + len, c = -1
    for (let k = 0; k < 100; k++) { c = i < l.end ? l.b[i++]! : -1; if (!is_space(c)) break }
    if (!(c === 101 && i + 8 <= l.end && at('ndstream', i))) len += 5000 // "Missing 'endstream'": xpdf's kludge
  }
  return { t: 'stream', d, b: l.b, pos, len }
}
export const raw_bytes = (s: PStream) => s.b.subarray(Math.min(s.pos, s.b.length), Math.min(s.pos + s.len, s.b.length))

// Stream::addFilters, makeFilter (FlateStream + StreamPredictor); /F and /DP stand in for missing /Filter and /DecodeParms
export function decode_stream(s: PStream): Uint8Array {
  const x = s.d.x
  let f = lookup(s.d, 'Filter')
  if (f === null) f = lookup(s.d, 'F')
  let params = lookup(s.d, 'DecodeParms')
  if (params === null) params = lookup(s.d, 'DP')
  let data = raw_bytes(s)
  const filter = (name: string, p: PObj) => {
    if (name === 'Crypt') return
    if (name !== 'FlateDecode' && name !== 'Fl') fatal_error(x!.e, `unsupported: PDF stream filter /${name}`)
    const e = x!.e
    if (e.fs.inflate === undefined) fatal_error(e, 'unsupported: PDF inclusion without an inflater')
    data = e.fs.inflate(data, Math.min(1 << 28, Math.max(1 << 20, data.length * 1032)))
    const pi = (k: string, v: number) => { if (!is_dict(p)) return v; const o = lookup(p, k); return typeof o === 'number' ? o : v }
    const pred = pi('Predictor', 1)
    if (pred !== 1) data = predict(e, data, pred, pi('Columns', 1), pi('Colors', 1), pi('BitsPerComponent', 8))
  }
  if (is_name(f)) filter(f.v, params)
  else if (Array.isArray(f)) {
    for (let i = 0; i < f.length; i++) {
      const o = deref(x, f[i]!), q = Array.isArray(params) && i < params.length ? deref(x, params[i]!) : null
      if (!is_name(o)) return new Uint8Array(0) // "Bad filter name": an EOFStream
      filter(o.v, q)
    }
  }
  return data
}

// StreamPredictor (an invalid parameter set leaves the data as it is)
function predict(e: Engine, d: Uint8Array, pred: number, width: number, ncomps: number, nbits: number): Uint8Array {
  const nvals = width * ncomps, pix = (ncomps * nbits + 7) >> 3, row = ((nvals * nbits + 7) >> 3) + pix
  if (width <= 0 || ncomps <= 0 || nbits <= 0 || ncomps > 32 || nbits > 16 || width >= 0x7fffffff / ncomps || nvals >= (0x7fffffff - 7) / nbits) return d
  if (pred === 2 && nbits !== 8) fatal_error(e, `unsupported: TIFF predictor with ${nbits} bits per component`)
  const line = new Uint8Array(row), out: number[] = []
  let q = 0
  for (;;) {
    let cur = pred
    if (pred >= 10) { if (q >= d.length) break; cur = d[q++]! + 10 }
    const ul = new Uint8Array(pix + 1)
    let i = pix
    for (; i < row; i++) {
      for (let j = pix; j > 0; j--) ul[j] = ul[j - 1]!
      ul[0] = line[i]!
      if (q >= d.length) break
      const c = d[q++]!
      if (cur === 11) line[i] = line[i - pix]! + c
      else if (cur === 12) line[i] = line[i]! + c
      else if (cur === 13) line[i] = ((line[i - pix]! + line[i]!) >> 1) + c
      else if (cur === 14) {
        const left = line[i - pix]!, up = line[i]!, upleft = ul[pix]!, p = left + up - upleft
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upleft)
        line[i] = (pa <= pb && pa <= pc ? left : pb <= pc ? up : upleft) + c
      } else line[i] = c
    }
    if (i < row && i === pix) break // nothing of this line: end of data
    if (pred === 2) for (let k = pix; k < row; k++) line[k] = line[k]! + line[k - ncomps]!
    for (let k = pix; k < row; k++) out.push(line[k]!) // a truncated last line keeps the previous line's bytes, as xpdf's does
    if (i < row) break
  }
  return Uint8Array.from(out)
}

// XRef.cc
const entry = (x: XRef, n: number) => x.ent.get(n) ?? { off: -1, gen: 0, type: FREE }
function set_entry(x: XRef, n: number, off: number, gen: number, type: number): void { x.ent.set(n, { off, gen, type }); if (n > x.last) x.last = n }

// XRef::fetch (xpdf's object cache is not observable: the file does not change)
export function fetch(x: XRef, n: number, gen: number, depth = 0): PObj {
  if (n < 0 || n >= x.size) return null
  const en = entry(x, n)
  if (en.type === UNCOMPRESSED) {
    if (en.gen !== gen) return null
    const p = parser(x, lexer(x.b, x.start + en.off), true)
    const a = get_obj(p, true, 0), b = get_obj(p, true, 0), c = get_obj(p, true, 0)
    if (a !== n || b !== gen || !is_cmd(c, 'obj')) return null
    return get_obj(p, false, depth)
  }
  if (en.type === COMPRESSED) {
    if (en.off >= x.size || entry(x, en.off).type !== UNCOMPRESSED) return null // "Invalid object stream"
    if (depth >= LIMIT) return null
    let os = x.objstms.get(en.off)
    if (os === undefined) { const o = object_stream(x, en.off, depth + 1); if (o === null) return null; x.objstms.set(en.off, os = o) }
    return en.gen >= 0 && en.gen < os.nums.length && os.nums[en.gen] === n ? os.objs[en.gen]! : null
  }
  return null
}

// ObjectStream::ObjectStream
function object_stream(x: XRef, n: number, depth: number): ObjStm | null {
  const s = fetch(x, n, 0, depth)
  if (!is_stream(s)) return null
  const N = lookup(s.d, 'N', depth), first = lookup(s.d, 'First', depth)
  if (typeof N !== 'number' || N <= 0 || typeof first !== 'number' || first < 0 || N > 1000000) return null
  const d = decode_stream(s), nums: number[] = [], offs: number[] = []
  const hp = parser(x, lexer(d, 0, Math.min(first, d.length)), false)
  for (let i = 0; i < N; i++) {
    const a = get_obj(hp, true, 0), b = get_obj(hp, true, 0)
    if (typeof a !== 'number' || typeof b !== 'number' || a < 0 || b < 0 || (i > 0 && b < offs[i - 1]!)) return null
    nums.push(a); offs.push(b)
  }
  const objs = nums.map((_, i) => get_obj(parser(x, lexer(d, first + offs[i]!, i === N - 1 ? d.length : Math.min(d.length, first + offs[i + 1]!)), false), false, 0))
  return { nums, objs }
}

// XRef::getStreamEnd: the first `endstream' found by constructXRef at or after the stream's start
function stream_end(x: XRef, start: number): number {
  const s = x.stream_ends
  if (s === null || s.length === 0 || start > s[s.length - 1]!) return -1
  let a = -1, b = s.length - 1
  while (b - a > 1) { const m = (a + b) >> 1; if (start <= s[m]!) b = m; else a = m }
  return s[b]!
}

// XRef::XRef
function new_xref(e: Engine, b: Uint8Array, start: number, repair: boolean): XRef {
  const x: XRef = { e, b, start, size: 0, last: -1, ent: new Map(), trailer: null, root_num: -1, root_gen: 0, stream_ends: null, ok: true, objstms: new Map() }
  if (repair) {
    if (!(x.ok = construct_xref(x))) return x
  } else {
    const pos = { v: get_start_xref(x) }
    if (pos.v === 0) { x.ok = false; return x }
    const seen = new Set<number>()
    while (read_xref(x, pos, seen, false)) { /* follow /Prev */ }
    if (!x.ok) return x
  }
  const r = x.trailer === null ? null : lookup_nf(x.trailer, 'Root')
  if (is_ref(r)) { x.root_num = r.num; x.root_gen = r.gen }
  else if (!(x.ok = construct_xref(x))) return x
  if (x.trailer !== null) x.trailer.x = x
  return x
}

// XRef::getStartXref: `startxref' in the last 1024 bytes
function get_start_xref(x: XRef): number {
  const b = x.b, n = Math.min(1024, b.length), o = b.length - n
  let i = n - 9
  for (; i >= 0; i--) if (String.fromCharCode(...b.subarray(o + i, o + i + 9)) === 'startxref') break
  if (i < 0) return 0
  let p = o + i + 9
  while (p < b.length && [9, 10, 11, 12, 13, 32].includes(b[p]!)) p++
  let v = 0
  for (; p < b.length && is_digit(b[p]!); p++) { if (v > (Number.MAX_SAFE_INTEGER - 9) / 10) break; v = v * 10 + b[p]! - 48 }
  return v
}

// XRef::readXRef
function read_xref(x: XRef, pos: { v: number }, seen: Set<number>, hybrid: boolean): boolean {
  if (seen.has(pos.v)) return false // "Infinite loop in xref table"
  seen.add(pos.v)
  const b = x.b, at = x.start + pos.v, n = Math.max(0, Math.min(100, b.length - at))
  let i = 0
  while (i < n && is_space(b[at + i]!)) i++
  if (!hybrid && i + 4 < n && b[at + i] === 120 && b[at + i + 1] === 114 && b[at + i + 2] === 101 && b[at + i + 3] === 102 && is_space(b[at + i + 4]!))
    return read_xref_table(x, pos, i + 5, seen)
  const p = parser(null, lexer(b, at), true)
  let s: PObj = null
  if (typeof get_obj(p, true, 0) === 'number' && typeof get_obj(p, true, 0) === 'number' && is_cmd(get_obj(p, true, 0), 'obj') && is_stream(s = get_obj(p, false, 0)))
    return read_xref_stream(x, s, pos)
  if (!hybrid) x.ok = false // hybrid: "Invalid XRefStm link in trailer"
  return false
}

// XRef::readXRefTable
function read_xref_table(x: XRef, pos: { v: number }, offset: number, seen: Set<number>): boolean {
  const b = x.b
  let q = x.start + pos.v + offset
  const gc = () => q < b.length ? b[q++]! : -1
  const err = () => { x.ok = false; return false }
  const INT_MAX = 0x7fffffff
  for (;;) {
    let c: number
    do c = gc(); while (is_space(c))
    if (c === 116) {
      if (q + 6 > b.length || String.fromCharCode(...b.subarray(q, q + 6)) !== 'railer') return err()
      q += 6
      break
    }
    if (!is_digit(c)) return err()
    let first = 0, n = 0
    do { const d = c - 48; if (first > (INT_MAX - d) / 10) return err(); first = first * 10 + d; c = gc() } while (is_digit(c))
    if (!is_space(c)) return err()
    do c = gc(); while (is_space(c))
    do { const d = c - 48; if (n > (INT_MAX - d) / 10) return err(); n = n * 10 + d; c = gc() } while (is_digit(c))
    if (!is_space(c)) return err()
    if (first > INT_MAX - n) return err()
    if (first + n > x.size) {
      let s = x.size !== 0 ? x.size : 512
      do { if (s > INT_MAX / 2) return err(); s *= 2 } while (first + n > s)
      x.size = s
    }
    for (let i = first; i < first + n; i++) {
      do c = gc(); while (is_space(c))
      let off = 0, gen = 0
      do { off = off * 10 + (c - 48); c = gc() } while (is_digit(c))
      if (!is_space(c)) return err()
      do c = gc(); while (is_space(c))
      do { gen = (Math.imul(gen, 10) + (c - 48)) | 0; c = gc() } while (is_digit(c))
      if (!is_space(c)) return err()
      do c = gc(); while (is_space(c))
      const type = c === 110 ? UNCOMPRESSED : c === 102 ? FREE : -1
      if (type < 0) return err()
      if (!is_space(gc())) return err()
      if (entry(x, i).off === -1) {
        set_entry(x, i, off, gen, type)
        if (i === 1 && first === 1 && off === 0 && gen === 65535 && type === FREE) { // IBM's xref tables that start at 1
          i = first = 0
          x.ent.set(0, x.ent.get(1)!); x.ent.set(1, { off: -1, gen, type: FREE })
        }
      }
    }
  }
  const o = get_obj(parser(null, lexer(b, q), true), false, 0)
  if (!is_dict(o)) return err()
  const prev = lookup_nf(o, 'Prev')
  let more = false
  if (typeof prev === 'number') { pos.v = prev >>> 0; more = true }
  else if (is_ref(prev)) { pos.v = prev.num >>> 0; more = true } // "/Prev NNN 0 R" from buggy generators
  if (x.trailer === null) x.trailer = o
  const xs = lookup_nf(o, 'XRefStm')
  if (typeof xs === 'number') { read_xref(x, { v: xs >>> 0 }, seen, true); if (!x.ok) return err() }
  return more
}

// XRef::readXRefStream, readXRefStreamSection
function read_xref_stream(x: XRef, s: PStream, pos: { v: number }): boolean {
  const d = s.d, err = () => { x.ok = false; return false }
  const size = lookup_nf(d, 'Size')
  if (typeof size !== 'number' || size < 0) return err()
  if (size > x.size) x.size = size
  const W = lookup_nf(d, 'W')
  if (!Array.isArray(W) || W.length < 3) return err()
  const w = W.slice(0, 3).map(o => deref(d.x, o))
  if (!w.every(v => typeof v === 'number')) return err()
  const [w0, w1, w2] = w as number[]
  if (w0! < 0 || w0! > 8 || w1! < 0 || w1! > 8 || w2! < 0 || w2! > 8) return err()
  const data = decode_stream(s)
  let q = 0, budget = 1e7 // shortcut: at most 10^7 entries per stream (xpdf allocates whatever /Index asks for); raise if a real file needs more
  const rd = (k: number) => { let v = 0; for (let j = 0; j < k; j++) { if (q >= data.length) return -1; v = v * 256 + data[q++]! } return v }
  const section = (first: number, n: number): boolean => {
    if (((first + n) | 0) < 0) return false
    if (first + n > x.size) {
      let ns = x.size !== 0 ? (2 * x.size) | 0 : 1024
      while (first + n > ns && ns > 0) ns = ns << 1
      if (ns < 0) return false
      x.size = ns
    }
    for (let i = first; i < first + n; i++) {
      if (--budget < 0) return false
      const type = w0 === 0 ? 1 : rd(w0!), off = rd(w1!), gen = rd(w2!)
      if (type < 0 || off < 0 || gen < 0) return false
      if (off >= 2 ** 63) return false
      if (gen > 0x7fffffff && type !== 0) return false
      if (entry(x, i).off === -1) {
        if (type > 2) return false
        set_entry(x, i, off, gen | 0, type === 0 ? FREE : type === 1 ? UNCOMPRESSED : COMPRESSED)
      }
    }
    return true
  }
  const idx = lookup_nf(d, 'Index')
  if (Array.isArray(idx)) {
    for (let i = 0; i + 1 < idx.length; i += 2) {
      const a = deref(d.x, idx[i]!), n = deref(d.x, idx[i + 1]!)
      if (typeof a !== 'number' || typeof n !== 'number') return err()
      if (a < 0 || n < 0 || !section(a, n)) return err()
    }
  } else if (!section(0, size)) return err()
  const prev = lookup_nf(d, 'Prev')
  if (x.trailer === null) x.trailer = d
  if (typeof prev === 'number') { pos.v = prev >>> 0; return true }
  return false
}

// XRef::constructXRef: scan the whole file for `n g obj', `trailer' and `endstream'
function construct_xref(x: XRef): boolean {
  const b = x.b, len = b.length, at = (i: number) => i < len ? b[i]! : 0
  const match = (i: number, s: string) => { for (let k = 0; k < s.length; k++) if (at(i + k) !== s.charCodeAt(k)) return false; return true }
  const stream_nums: number[] = [], ends: number[] = []
  let last_obj = -1, p = x.start, sol = true, space = true
  x.root_num = -1
  while (p < len) {
    if (sol && match(p, 'trailer')) {
      const o = get_obj(parser(null, lexer(b, p + 7), false), false, 0) // constructTrailerDict
      if (is_dict(o)) save_trailer(x, o, false)
      p += 7; sol = space = false
    } else if (sol && match(p, 'endstream')) { ends.push(p); p += 9; sol = space = false }
    else if (space && is_digit(at(p))) { // constructObjectEntry
      let n = 0, g = 0
      const p_obj = p
      do n = n * 10 + at(p++) - 48; while (is_digit(at(p)) && n < 100000000)
      sol = space = false
      const sp = (c: number) => c === 9 || c === 12 || c === 32
      if (!sp(at(p))) continue
      do p++; while (sp(at(p)))
      if (!is_digit(at(p))) continue
      do g = g * 10 + at(p++) - 48; while (is_digit(at(p)) && g < 100000000)
      if (!sp(at(p))) continue
      do p++; while (sp(at(p)))
      if (!match(p, 'obj')) continue
      construct_entry(x, n, g, p_obj - x.start, UNCOMPRESSED)
      last_obj = n
    } else if (at(p) === 62 && at(p + 1) === 62) {
      p += 2; sol = space = false
      while ([9, 10, 12, 13, 32].includes(at(p))) { if (at(p) === 10 || at(p) === 13) sol = true; space = true; p++ }
      if (match(p, 'stream')) { if (last_obj >= 0) stream_nums.push(last_obj); p += 6; sol = space = false }
    } else {
      const c = at(p)
      if (c === 10 || c === 13) sol = space = true
      else if (is_space(c)) space = true
      else sol = space = false
      p++
    }
  }
  x.stream_ends = ends
  for (const n of stream_nums) {
    const o = fetch(x, n, entry(x, n).gen)
    if (!is_stream(o)) continue
    const t = lookup(o.d, 'Type')
    if (is_name(t, 'XRef')) save_trailer(x, o.d, true)
    else if (is_name(t, 'ObjStm')) { // constructObjectStreamEntries (the index is stored as the generation)
      const N = lookup(o.d, 'N')
      if (typeof N !== 'number' || N <= 0 || N > 1000000) continue
      const hp = parser(null, lexer(decode_stream(o), 0), false)
      for (let i = 0; i < N; i++) {
        const a = get_obj(hp, true, 0), c = get_obj(hp, true, 0)
        if (typeof a === 'number' && typeof c === 'number' && a >= 0 && a < 1000000) construct_entry(x, a, i, n, COMPRESSED)
      }
    }
  }
  return x.root_num >= 0 // else "Couldn't find trailer dictionary"
}
// XRef::constructXRefEntry
function construct_entry(x: XRef, n: number, gen: number, pos: number, type: number): void {
  if (n >= x.size) x.size = (n + 1 + 255) & ~255
  const en = entry(x, n)
  if (en.type === FREE || gen >= en.gen) set_entry(x, n, pos, gen, type)
}
// XRef::saveTrailerDict: a dict with /Root becomes the trailer (an xref stream's only if the root object exists)
function save_trailer(x: XRef, d: PDict, xref_stream: boolean): void {
  const r = lookup_nf(d, 'Root')
  if (is_ref(r) && (!xref_stream || r.num <= x.last)) { x.root_num = r.num; x.root_gen = r.gen; x.trailer = d }
}

// Page.cc PDFRectangle, PageAttrs, Page
export type Box = { x1: number, y1: number, x2: number, y2: number }
type Attrs = { media: Box, crop: Box, have_crop: boolean, bleed: Box, trim: Box, art: Box, rotate: number, group: PObj, resources: PObj }
export type Page = { attrs: Attrs, contents: PObj }
type Node = { ref: PRef, count: number, parent: Node | null, kids: Node[] | null, attrs: Attrs | null }
export type PdfDoc = { x: XRef, version: number, num_pages: number, tree: Node, pages: Page[], page_refs: (PRef | null)[] }

function clip_to(b: Box, r: Box): void {
  const c = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v
  b.x1 = c(b.x1, r.x1, r.x2); b.x2 = c(b.x2, r.x1, r.x2); b.y1 = c(b.y1, r.y1, r.y2); b.y2 = c(b.y2, r.y1, r.y2)
}
function read_box(x: XRef, d: PDict, k: string): Box | null {
  const a = lookup(d, k)
  if (!Array.isArray(a) || a.length !== 4) return null
  const v = a.map(o => deref(x, o))
  if (!v.every(is_num)) return null
  const [x1, y1, x2, y2] = v.map(o => Math.max(-1e9, Math.min(1e9, num(o))))
  return { x1: Math.min(x1!, x2!), y1: Math.min(y1!, y2!), x2: Math.max(x1!, x2!), y2: Math.max(y1!, y2!) }
}
const default_attrs = (): Attrs => {
  const b = () => ({ x1: 0, y1: 0, x2: 50, y2: 50 })
  return { media: b(), crop: b(), have_crop: false, bleed: b(), trim: b(), art: b(), rotate: 0, group: null, resources: null }
}
function page_attrs(x: XRef, parent: Attrs | null, d: PDict): Attrs {
  const media = parent !== null ? { ...parent.media } : { x1: 0, y1: 0, x2: 612, y2: 792 }
  let crop = parent !== null ? { ...parent.crop } : { x1: 0, y1: 0, x2: 0, y2: 0 }, have_crop = parent?.have_crop ?? false
  let rotate = parent?.rotate ?? 0
  const m = read_box(x, d, 'MediaBox')
  if (m !== null) Object.assign(media, m)
  const c = read_box(x, d, 'CropBox')
  if (c !== null) { crop = c; have_crop = true }
  if (!have_crop) crop = { ...media }
  const r = lookup(d, 'Rotate')
  if (typeof r === 'number') rotate = r
  rotate = ((rotate % 360) + 360) % 360
  // resources: a node's own are merged into its parent's (xpdf's tolerance of files that expect it)
  const child = lookup(d, 'Resources')
  let resources: PObj = null
  if (parent !== null && is_dict(parent.resources) && is_dict(child)) {
    const res = new_dict(x)
    for (const [k, v] of parent.resources.m) {
      const sub = deref(parent.resources.x, v)
      if (is_dict(sub)) res.m.set(k, { t: 'dict', m: new Map(sub.m), x })
    }
    for (const [k, v] of child.m) {
      const sub = deref(child.x, v)
      if (!is_dict(sub)) continue
      const have = lookup(res, k)
      if (is_dict(have)) for (const [k2, v2] of sub.m) have.m.set(k2, v2)
      else res.m.set(k, sub)
    }
    resources = res
  } else if (parent !== null && is_dict(parent.resources)) resources = parent.resources
  else if (is_dict(child)) resources = child
  return { media, crop, have_crop, bleed: read_box(x, d, 'BleedBox') ?? { ...crop }, trim: read_box(x, d, 'TrimBox') ?? { ...crop },
    art: read_box(x, d, 'ArtBox') ?? { ...crop }, rotate, group: lookup(d, 'Group'), resources }
}
function new_page(x: XRef, d: PDict, attrs: Attrs): Page | null {
  for (const b of [attrs.crop, attrs.bleed, attrs.trim, attrs.art]) clip_to(b, attrs.media) // clipBoxes
  const ok = (o: PObj) => is_ref(o) || Array.isArray(o) || o === null
  if (!ok(lookup_nf(d, 'Annots')) || !ok(lookup_nf(d, 'Contents'))) return null
  return { attrs, contents: lookup_nf(d, 'Contents') }
}
export const page_group = (p: Page) => is_dict(p.attrs.group) ? p.attrs.group : null
export const page_resources = (p: Page) => is_dict(p.attrs.resources) ? p.attrs.resources : null

// PDFDoc::checkHeader, setup, setup2 (a damaged xref or catalog makes xpdf reconstruct the xref; null: not a readable PDF)
export function pdf_open(e: Engine, b: Uint8Array): PdfDoc | null {
  let start = 0, version = 0
  const n = Math.min(b.length, 1024)
  for (let i = 0; i < 1024 - 5; i++) {
    if (i + 5 > n || String.fromCharCode(...b.subarray(i, i + 5)) !== '%PDF-') continue
    start = i
    let j = i + 5
    while (j < n && [32, 9, 10, 13].includes(b[j]!)) j++
    let k = j
    while (k < n && b[k] !== 0 && ![32, 9, 10, 13].includes(b[k]!)) k++
    version = parseFloat(String.fromCharCode(...b.subarray(j, k))) || 0 // atof
    break
  }
  for (const repair of [false, true]) {
    const x = new_xref(e, b, start, repair)
    if (!x.ok) continue
    if (is_dict(lookup(x.trailer!, 'Encrypt'))) fatal_error(e, 'unsupported: encrypted PDF inclusion')
    const doc = catalog(x, version)
    if (doc !== null) return doc
  }
  return null
}

// Catalog::Catalog, readPageTree, countPageTree
function catalog(x: XRef, version: number): PdfDoc | null {
  const cat = fetch(x, x.root_num, x.root_gen)
  if (!is_dict(cat)) return null
  const top = lookup_nf(cat, 'Pages')
  if (!is_ref(top) || !is_dict(fetch(x, top.num, top.gen))) return null
  const c = lookup(fetch(x, top.num, top.gen) as PDict, 'Count')
  let n = 1
  if (typeof c === 'number') {
    n = c
    if (n === 0 || n > 50000) n = count_page_tree(x, top, new Set(), 0)
  }
  if (n < 0) return null
  return { x, version, num_pages: n, tree: { ref: top, count: n, parent: null, kids: null, attrs: null }, pages: [], page_refs: [] }
}
function count_page_tree(x: XRef, ref: PObj, touched: Set<number>, depth: number): number {
  if (depth > 1000) return 0 // shortcut: deeper trees count 0 pages (xpdf recurses on the C stack); hostile input only
  if (is_ref(ref) && (ref.num < 0 || ref.num >= x.size)) return 0
  let node = ref
  if (is_ref(ref)) { if (touched.has(ref.num)) return 0; touched.add(ref.num); node = fetch(x, ref.num, ref.gen) }
  if (!is_dict(node)) return 0
  const kr = lookup_nf(node, 'Kids')
  let kids: PObj = kr
  if (is_ref(kr) && kr.num >= 0 && kr.num < x.size) { if (touched.has(kr.num)) return 0; touched.add(kr.num); kids = fetch(x, kr.num, kr.gen) }
  if (!Array.isArray(kids)) return 1
  let n = 0
  for (const k of kids) { const n2 = count_page_tree(x, k, touched, depth + 1); n = n2 < 0x7fffffff - n ? n + n2 : 0x7fffffff }
  return n
}

// Catalog::getPage, getPageRef (loadPage2); a broken tree gives xpdf's empty 50x50 page
export function get_page(doc: PdfDoc, pg: number): Page {
  if (doc.pages[pg - 1] === undefined) load_page(doc, pg, pg - 1, doc.tree, 0)
  return doc.pages[pg - 1]!
}
export const get_page_ref = (doc: PdfDoc, pg: number) => { get_page(doc, pg); return doc.page_refs[pg - 1] ?? null }
function load_page(doc: PdfDoc, pg: number, rel: number, node: Node, depth: number): void {
  const x = doc.x, dummy = () => { doc.pages[pg - 1] = { attrs: default_attrs(), contents: null } }
  if (rel >= node.count || depth > 1000) return dummy() // depth: shortcut as in count_page_tree
  if (node.kids === null) {
    for (let p = node.parent; p !== null; p = p.parent) if (p.ref.num === node.ref.num && p.ref.gen === node.ref.gen) return dummy() // "Loop in Pages tree"
    const d = fetch(x, node.ref.num, node.ref.gen)
    if (!is_dict(d)) return dummy()
    const attrs = page_attrs(x, node.parent?.attrs ?? null, d), kids = lookup(d, 'Kids')
    if (Array.isArray(kids)) {
      node.attrs = attrs; node.kids = []
      for (const k of kids) {
        if (!is_ref(k)) continue
        const kd = fetch(x, k.num, k.gen)
        if (!is_dict(kd)) continue
        const c = lookup(kd, 'Count')
        node.kids.push({ ref: k, count: typeof c === 'number' ? c : 1, parent: node, kids: null, attrs: null })
      }
    } else {
      doc.page_refs[pg - 1] = node.ref
      doc.pages[pg - 1] = new_page(x, d, attrs) ?? { attrs: default_attrs(), contents: null }
    }
  }
  if (node.kids !== null) {
    for (const k of node.kids) { if (rel < k.count) return load_page(doc, pg, rel, k, depth + 1); rel -= k.count }
    dummy() // "Invalid page count in page tree"
  }
}

// FoFiType1::parse: the font file's /Encoding (null: none in the first 100 lines; 'std': StandardEncoding)
export function fofi_type1_encoding(d: Uint8Array): (string | null)[] | 'std' | null {
  if (d[0] === 0x80) { // undoPFB
    const out: number[] = []
    let p = 0
    while (d[p] === 0x80 && (d[p + 1] === 1 || d[p + 1] === 2) && p + 6 <= d.length) {
      const len = (d[p + 2]! | d[p + 3]! << 8 | d[p + 4]! << 16 | d[p + 5]! << 24) >>> 0
      p += 6
      if (p + len > d.length) break
      for (let k = 0; k < len; k++) out.push(d[p + k]!)
      p += len
    }
    d = Uint8Array.from(out)
  }
  const len = d.length, next = (l: number) => { // getNextLine
    while (l < len && d[l] !== 10 && d[l] !== 13) l++
    if (l < len && d[l] === 13) l++
    if (l < len && d[l] === 10) l++
    return l >= len ? -1 : l
  }
  const starts = (l: number, s: string) => l + s.length <= len && String.fromCharCode(...d.subarray(l, l + s.length)) === s
  const text = (a: number, b: number) => String.fromCharCode(...d.subarray(a, b)).split('\0')[0]!
  let enc: (string | null)[] | 'std' | null = null, line = 0, matrix = false
  for (let i = 1; i <= 100 && line >= 0 && enc === null; i++) {
    if (!matrix && starts(line, '/FontMatrix')) { matrix = true; continue } // this round does not advance the line
    if (starts(line, '/Encoding StandardEncoding def')) { enc = 'std'; continue }
    if (!starts(line, '/Encoding 256 array')) { line = next(line); continue }
    const e: (string | null)[] = new Array(256).fill(null)
    enc = e
    let l1: number
    for (let j = 0, l = next(line); j < 300 && l >= 0 && (l1 = next(l)) >= 0; j++, l = l1) {
      const buf = text(l, Math.min(l1, l + 255))
      let p = 0
      while (buf[p] === ' ' || buf[p] === '\t') p++
      const ends_dup = (l >= 4 && starts(l - 4, 'dup\n')) || (l >= 5 && starts(l - 5, 'dup\r'))
      const starts_dup = buf.startsWith('dup', p)
      if (ends_dup || starts_dup) {
        if (starts_dup) p += 3
        for (;;) {
          while (buf[p] === ' ' || buf[p] === '\t') p++
          let base = 10, code = 0
          if (buf[p] === '8' && buf[p + 1] === '#') { base = 8; p += 2 }
          else if (!(buf[p]! >= '0' && buf[p]! <= '9')) break
          while (p < buf.length && buf[p]! >= '0' && buf.charCodeAt(p) < 48 + base) code = code * base + buf.charCodeAt(p++) - 48
          while (buf[p] === ' ' || buf[p] === '\t') p++
          if (buf[p] !== '/') break
          let p2 = ++p
          while (p2 < buf.length && buf[p2] !== ' ' && buf[p2] !== '\t') p2++
          if (code < 256) e[code] = buf.slice(p, p2)
          p = p2
          while (buf[p] === ' ' || buf[p] === '\t') p++
          if (!buf.startsWith('put', p)) break
          p += 3
          while (buf[p] === ' ' || buf[p] === '\t') p++
          if (!buf.startsWith('dup', p)) break
          p += 3
        }
      } else { // strtok(buf, " \t") && (p = strtok(NULL, " \t\n\r")) && !strcmp(p, "def")
        const a = /^[ \t]*[^ \t]+/.exec(buf), b = a === null ? null : /^[ \t\n\r]*([^ \t\n\r]+)/.exec(buf.slice(a[0].length + 1))
        if (b !== null && b[1] === 'def') break
      }
    }
    // xpdf does not advance past the encoding here; the next round finds no further /Encoding line
  }
  return enc
}
