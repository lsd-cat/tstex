// §1299–1329 \dump and undump: the format is an in-memory snapshot of the tables TeX dumps
import type { Engine } from './engine.ts'
import { batch_mode, log_only, term_and_log, new_string } from './types.ts'
import { print, print_char, print_nl, print_ln, print_int, print_esc, slow_print } from './print.ts'
import { print_scaled } from './arith.ts'
import { print_err, help, succumb } from './error.ts'
import { int_par, year_code, month_code, day_code, tracing_stats_code, int_base, dimen_base, font_id_base } from './eqtb.ts'
import { print_file_name } from './files.ts'
import { init_trie, hyph_state } from './hyphenate.ts'
import { etex_ext_vars } from './engine.ts'

// What §1307–1327 dump: dynamic memory (token lists, nodes, glue specs, \parshape arrays), eqtb (xeq_level is constant
// at level one), par_loc/write_loc, the hash and primitive tables, the fonts, the hyphenation tables, interaction, format_ident.
// The string pool has no counterpart: names live in `text`/`hash`, file names are JS strings.
const fmt_keys = [
  'info', 'link', 'avail', 'mem_end', 'nodes', 'nodes_free', 'spec', 'spec_avail', 'shapes',
  'eq_level', 'eq_type', 'equiv', 'par_loc', 'par_token', 'write_loc',
  'hash', 'text', 'prim', 'prim_text', 'hash_used', 'cs_count',
  'font_info', 'fmem_ptr', 'font_ptr', 'font_check', 'font_size', 'font_dsize', 'font_params', 'font_name', 'font_area',
  'font_bc', 'font_ec', 'font_glue', 'hyphen_char', 'skew_char', 'bchar_label', 'font_bchar', 'font_false_bchar',
  'char_base', 'width_base', 'height_base', 'depth_base', 'italic_base', 'lig_kern_base', 'kern_base', 'exten_base', 'param_base',
  'hy', 'interaction', 'format_ident',
  'eTeX_mode', 'sa', 'sa_free', 'sa_root', // etex.ch Dump the eTeX state, sa_root
  'xord', 'xchr', 'xprn', // tex.ch Dump xord, xchr, and xprn
  'glyph_unicode', // pdftex.web dumptounicode
] as const
type Snapshot = Pick<Engine, typeof fmt_keys[number]>
// A format: the snapshot's bytes; `fresh' is a decoded copy not yet handed to an engine (loadFormat decodes once to check it)
export type Format = { format_ident: string, data: Uint8Array, fresh?: Snapshot | undefined }

// §1324 the trie's initialization arrays (trie_c…trie_op_hash) are not dumped: trie_not_ready is false in every format
const trie_init_only = ['trie_c', 'trie_o', 'trie_l', 'trie_r', 'trie_ref', 'trie_taken', 'trie_back', 'trie_min', 'trie_op_hash', 'trie_op_lang', 'trie_op_val'] as const

// The snapshot, encoded; decoding gives each loading engine its own copy
export function dump_format(e: Engine): Format {
  const f: Partial<Record<keyof Snapshot, unknown>> = {}
  for (const k of fmt_keys) f[k] = e[k]
  const h0 = hyph_state(), hy: Record<string, unknown> = { ...e.hy }
  for (const k of trie_init_only) hy[k] = h0[k]
  f.hy = hy
  const w = new Writer(); w.put(f)
  return { format_ident: e.format_ident, data: w.b.slice(0, w.n) }
}

// §1303 load_fmt_file (pdftex: prev_depth:=pdf_ignored_dimen afterwards)
export function load_fmt_file(e: Engine, f: Format): void {
  const { xord, xchr, xprn } = e
  Object.assign(e, f.fresh ?? decode(f.data)); f.fresh = undefined
  if (e.translate_filename !== '') Object.assign(e, { xord, xchr, xprn }) // tex.ch: a TCX file given now overrides the format's
  if (e.eTeX_ex) etex_ext_vars(e) // etex.ch Undump the eTeX state
  e.prev_depth = e.equiv[dimen_base + 32]! // \pdfignoreddimen
}

// §1302 store_fmt_file
export function store_fmt_file(e: Engine): void {
  if (e.save_ptr !== 0) { // §1304 If dumping is not allowed, abort
    print_err(e, "You can't dump inside a group"); help(e, "`{...\\dump}' is a no-no."); succumb(e)
  }
  // §1328 Create the format_ident, open the format file, and inform the user that dumping has begun
  e.selector = new_string; e.cur_str = []
  print(e, ' (preloaded format='); print(e, e.job_name); print_char(e, 32)
  print_int(e, int_par(e, year_code)); print_char(e, 46)
  print_int(e, int_par(e, month_code)); print_char(e, 46); print_int(e, int_par(e, day_code)); print_char(e, 41)
  e.selector = e.interaction === batch_mode ? log_only : term_and_log
  e.format_ident = String.fromCharCode(...e.cur_str); e.cur_str = []
  print_nl(e, 'Beginning to dump on file '); slow_print(e, e.job_name + '.fmt')
  print_nl(e, ''); slow_print(e, e.format_ident)
  // §1309 the string pool: there is none (AUDIT.md)
  print_ln(e); print_int(e, 0); print(e, ' strings of total length '); print_int(e, 0)
  // §1311 dynamic memory: token memory words and those in use (no variable-size memory)
  let dyn_used = e.mem_end + 1
  for (let p = e.avail; p !== 0; p = e.link[p]!) dyn_used--
  print_ln(e); print_int(e, e.mem_end + 1); print(e, ' memory locations dumped; current usage is ')
  print_int(e, 0); print_char(e, 38); print_int(e, dyn_used)
  // §1318
  print_ln(e); print_int(e, e.cs_count); print(e, ' multiletter control sequences')
  // §1320, §1322 the fonts
  for (let k = 0; k <= e.font_ptr; k++) {
    print_nl(e, '\\font'); print_esc(e, e.text.get(font_id_base + k) ?? 0); print_char(e, 61)
    print_file_name(e, e.font_name[k]!, e.font_area[k]!, '')
    if (e.font_size[k] !== e.font_dsize[k]) { print(e, ' at '); print_scaled(e, e.font_size[k]!); print(e, 'pt') }
  }
  print_ln(e); print_int(e, e.fmem_ptr - 7); print(e, ' words of font info for ')
  print_int(e, e.font_ptr); print(e, ' preloaded font'); if (e.font_ptr !== 1) print_char(e, 115)
  // §1324 the hyphenation tables
  const h = e.hy
  print_ln(e); print_int(e, h.hyph_count); print(e, ' hyphenation exception'); if (h.hyph_count !== 1) print_char(e, 115)
  if (h.trie_not_ready) init_trie(e)
  print_nl(e, 'Hyphenation trie of length '); print_int(e, h.trie_max)
  print(e, ' has '); print_int(e, h.trie_op_ptr); print(e, ' op'); if (h.trie_op_ptr !== 1) print_char(e, 115)
  print(e, ' out of '); print_int(e, e.lim.trie_op_size)
  for (let k = 255; k >= 0; k--) if (h.trie_used[k]! > 0) {
    print_nl(e, '  '); print_int(e, h.trie_used[k]!); print(e, ' for language '); print_int(e, k)
  }
  // pdftex: Dump pdftex data (the font code tables live in pdf_mem; no PDF objects can exist yet)
  print_ln(e); print_int(e, e.ps.mem_ptr - 1); print(e, ' words of pdfTeX memory')
  print_ln(e); print_int(e, 0); print(e, ' indirect objects')
  // §1326 Dump a couple more things and the closing check word
  e.equiv[int_base + 112] = 0; e.pseudo_files = [] // etex.ch Dump the eTeX state: eTeX_state(j):=0, flush pseudo files
  e.fmt_file = dump_format(e)
  e.equiv[int_base + tracing_stats_code] = 0
}

// The snapshot's bytes: a tagged tree in one pass (shared objects by reference, as structuredClone keeps them), with
// number arrays and typed arrays written raw (little-endian int32). Decoding is the copy load_fmt_file needs.
// shortcut: recursive (node lists deeper than the JS stack would overflow), make it iterative if deep boxes are dumped
const T_UNDEF = 0, T_NULL = 1, T_FALSE = 2, T_TRUE = 3, T_INT = 4, T_F64 = 5, T_STR8 = 6, T_STR16 = 7, T_REF = 8,
  T_ARR = 9, T_IARR = 10, T_MAP = 11, T_U8 = 12, T_I32 = 13, T_OBJ = 14
class Writer {
  b = new Uint8Array(1 << 20); v = new DataView(this.b.buffer); n = 0
  seen = new Map<object, number>(); shapes = new Map<string, number>()
  room(k: number) {
    if (this.n + k <= this.b.length) return
    const b = new Uint8Array(Math.max(2 * this.b.length, this.n + k)); b.set(this.b); this.b = b; this.v = new DataView(b.buffer)
  }
  u8(x: number) { this.room(1); this.b[this.n++] = x }
  i32(x: number) { this.room(4); this.v.setInt32(this.n, x, true); this.n += 4 }
  str(s: string) {
    let wide = false
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 255) { wide = true; break }
    this.u8(wide ? T_STR16 : T_STR8); this.i32(s.length); this.room(wide ? 2 * s.length : s.length)
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (wide) { this.v.setUint16(this.n, c, true); this.n += 2 } else this.b[this.n++] = c
    }
  }
  ints(a: ArrayLike<number>) { this.i32(a.length); this.room(4 * a.length); for (let i = 0; i < a.length; i++) { this.v.setInt32(this.n, a[i]!, true); this.n += 4 } }
  put(x: unknown): void {
    if (typeof x === 'number') { if ((x | 0) === x && !Object.is(x, -0)) { this.u8(T_INT); this.i32(x) } else { this.u8(T_F64); this.room(8); this.v.setFloat64(this.n, x, true); this.n += 8 } return }
    if (typeof x === 'string') return this.str(x)
    if (x === undefined) return this.u8(T_UNDEF)
    if (x === null) return this.u8(T_NULL)
    if (typeof x === 'boolean') return this.u8(x ? T_TRUE : T_FALSE)
    if (typeof x !== 'object') throw new Error(`cannot dump a ${typeof x}`)
    const id = this.seen.get(x)
    if (id !== undefined) { this.u8(T_REF); this.i32(id); return }
    this.seen.set(x, this.seen.size)
    if (Array.isArray(x)) {
      let ints = true
      for (let i = 0; i < x.length; i++) { const v = x[i]; if (typeof v !== 'number' || (v | 0) !== v || Object.is(v, -0)) { ints = false; break } }
      if (ints) { this.u8(T_IARR); this.ints(x) } else { this.u8(T_ARR); this.i32(x.length); for (let i = 0; i < x.length; i++) this.put(x[i]) } // holes become undefined
    } else if (x instanceof Map) { this.u8(T_MAP); this.i32(x.size); for (const [k, v] of x) { this.put(k); this.put(v) } }
    else if (x instanceof Uint8Array) { this.u8(T_U8); this.i32(x.length); this.room(x.length); this.b.set(x, this.n); this.n += x.length }
    else if (x instanceof Int32Array) { this.u8(T_I32); this.ints(x) }
    else if (Object.getPrototypeOf(x) === Object.prototype) {
      const keys = Object.keys(x), sig = keys.join('\0')
      let s = this.shapes.get(sig)
      this.u8(T_OBJ)
      if (s === undefined) { this.shapes.set(sig, s = this.shapes.size); this.i32(s); this.i32(keys.length); for (const k of keys) this.str(k) }
      else this.i32(s)
      for (const k of keys) this.put((x as Record<string, unknown>)[k])
    } else throw new Error(`cannot dump a ${x.constructor.name}`)
  }
}
class Reader {
  b: Uint8Array; v: DataView; p = 0; refs: unknown[] = []; shapes: string[][] = []
  constructor(b: Uint8Array) { this.b = b; this.v = new DataView(b.buffer, b.byteOffset, b.byteLength) }
  need(k: number) { if (k < 0 || this.p + k > this.b.length) throw new Error('truncated') }
  u8() { this.need(1); return this.b[this.p++]! }
  i32() { this.need(4); const x = this.v.getInt32(this.p, true); this.p += 4; return x }
  latin1(n: number) {
    this.need(n); let s = ''
    for (let i = 0; i < n; i += 4096) s += String.fromCharCode.apply(null, this.b.subarray(this.p + i, this.p + Math.min(n, i + 4096)) as unknown as number[])
    this.p += n; return s
  }
  key() { if (this.u8() !== T_STR8) throw new Error('bad key'); return this.latin1(this.i32()) }
  get(): unknown {
    const t = this.u8()
    switch (t) {
      case T_UNDEF: return undefined
      case T_NULL: return null
      case T_FALSE: return false
      case T_TRUE: return true
      case T_INT: return this.i32()
      case T_F64: { this.need(8); const x = this.v.getFloat64(this.p, true); this.p += 8; return x }
      case T_STR8: return this.latin1(this.i32())
      case T_STR16: { const n = this.i32(); this.need(2 * n); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.v.getUint16(this.p + 2 * i, true)); this.p += 2 * n; return s }
      case T_REF: { const i = this.i32(); if (!(i >= 0 && i < this.refs.length)) throw new Error('bad reference'); return this.refs[i] }
      case T_ARR: { const n = this.i32(), a: unknown[] = []; this.refs.push(a); for (let i = 0; i < n; i++) a.push(this.get()); return a }
      case T_IARR: { const n = this.i32(), a: number[] = []; this.refs.push(a); this.need(4 * n); for (let i = 0; i < n; i++, this.p += 4) a.push(this.v.getInt32(this.p, true)); return a }
      case T_MAP: { const n = this.i32(), m = new Map(); this.refs.push(m); for (let i = 0; i < n; i++) m.set(this.get(), this.get()); return m }
      case T_U8: { const n = this.i32(); this.need(n); const a = this.b.slice(this.p, this.p + n); this.refs.push(a); this.p += n; return a }
      case T_I32: { const n = this.i32(); this.need(4 * n); const a = new Int32Array(n); this.refs.push(a); for (let i = 0; i < n; i++, this.p += 4) a[i] = this.v.getInt32(this.p, true); return a }
      case T_OBJ: {
        const s = this.i32()
        if (s === this.shapes.length) { const n = this.i32(); this.need(n); const keys: string[] = []; for (let i = 0; i < n; i++) keys.push(this.key()); this.shapes.push(keys) }
        const keys = this.shapes[s]
        if (keys === undefined) throw new Error('bad shape')
        const o: Record<string, unknown> = {}; this.refs.push(o)
        for (const k of keys) o[k] = this.get()
        return o
      }
    }
    throw new Error(`bad tag ${t}`)
  }
}
const decode = (data: Uint8Array): Snapshot => new Reader(data).get() as Snapshot
const fmt_magic = 'tstex format 2' // §1307 format_ident check: bump when fmt_keys or the encoding change
const fmt_max = 128 << 20 // decompressed bytes accepted (latex.fmt: 14 MB); a gzip bomb stops here
const pipe = async (b: Uint8Array, s: CompressionStream | DecompressionStream, max = Infinity) => {
  const r = new Blob([b as Uint8Array<ArrayBuffer>]).stream().pipeThrough(s).getReader(), parts: Uint8Array[] = []
  let n = 0
  for (let c; !(c = await r.read()).done;) { n += c.value.length; if (n > max) { await r.cancel(); throw new Error(`more than ${max} bytes`) } parts.push(c.value) }
  const out = new Uint8Array(n); n = 0
  for (const p of parts) { out.set(p, n); n += p.length }
  return out
}
const magic = Uint8Array.from(fmt_magic, c => c.charCodeAt(0))
export const dumpFormat = (f: Format): Promise<Uint8Array> => {
  const b = new Uint8Array(magic.length + f.data.length); b.set(magic); b.set(f.data, magic.length)
  return pipe(b, new CompressionStream('gzip'))
}
// §1303 load_fmt_file's checks (`(Fatal format file error; I'm stymied)'): any bad byte is one clear JS error, never a hang
export async function loadFormat(b: Uint8Array): Promise<Format> {
  try {
    const raw = await pipe(b, new DecompressionStream('gzip'), fmt_max)
    if (raw.length < magic.length || magic.some((c, i) => raw[i] !== c)) throw new Error(`not a ${fmt_magic} file`)
    const data = raw.subarray(magic.length), r = new Reader(data), s = r.get() as Record<string, unknown>
    if (r.p !== data.length) throw new Error('trailing bytes')
    const missing = fmt_keys.find(k => typeof s !== 'object' || s === null || s[k] === undefined)
    if (missing !== undefined) throw new Error(`no ${missing}`)
    return { format_ident: s.format_ident as string, data, fresh: s as Snapshot }
  } catch (x) { throw new Error(`Fatal format file error; I'm stymied (${x instanceof Error ? x.message : x})`) }
}
