// pdfTeX's C font back end: mapfile.c (pdftex.map), writeenc.c (/Encoding objects), writefont.c (font dictionaries,
// descriptors, /Widths) and tounicode.c (\pdfglyphtounicode, /ToUnicode CMaps). The AVL trees are Maps; where pdfTeX walks
// a tree in order, the keys are sorted with strcmp's byte order.
import type { Engine } from '../engine.ts'
import { int_base } from '../types.ts'
import { print } from '../print.ts'
import { find_backend_file } from '../files.ts'
import { char_info, char_width, char_height, char_depth, char_exists, height_depth, param, slant_code, x_height_code, quad_code } from '../tfm.ts'
import { divide_scaled, pdf_new_objnum, pdf_begin_obj, pdf_end_obj, pdf_begin_dict, pdf_end_dict, pdf_print, pdf_char_marked,
  pdftex_fail, pdftex_warn, pdf_begin_stream, pdf_end_stream } from '../pdf.ts'
import { writet1, load_enc_file, notdef, ASCENT_CODE, CAPHEIGHT_CODE, DESCENT_CODE, ITALIC_ANGLE_CODE, STEMV_CODE, XHEIGHT_CODE,
  FONTBBOX1_CODE, FONTBBOX2_CODE, FONTBBOX3_CODE, FONTBBOX4_CODE, font_key } from './type1.ts'
import type { Glyphs } from './type1.ts'

// ptexmac.h fm_entry type flags
const F_INCLUDED = 0x01, F_SUBSETTED = 0x02, F_STDT1FONT = 0x04, F_TYPE1 = 0x10, F_TRUETYPE = 0x20, F_OTF = 0x40, F_PK = 0x80
const FD_FLAGS_NOT_SET_IN_MAPLINE = -1, FD_FLAGS_DEFAULT_EMBED = 4, FD_FLAGS_DEFAULT_NON_EMBED = 0x22
const FM_DUPIGNORE = 0, FM_REPLACE = 1, FM_DELETE = 2

export type FmEntry = { tfm_name: string, ps_name: string | null, fd_flags: number, slant: number, extend: number, encname: string | null,
  ff_name: string | null, type: number, pid: number, in_use: boolean }
type FeEntry = { name: string, fe_objnum: number, glyph_names: Glyphs, tx_tree: Set<number> | null }
export type FdEntry = { fd_objnum: number, fontname: string, ff_found: boolean, ff_objnum: number, fn_objnum: number, font_dim: { val: number, set: boolean }[],
  builtin_glyph_names: Glyphs | null, fm: FmEntry, tx_tree: Set<number> | null }
type FoEntry = { fo_objnum: number, tex_font: number, fm: FmEntry, fd: FdEntry | null, fe: FeEntry | null, cw_objnum: number,
  width: number[], first_char: number, last_char: number, tounicode_objnum: number }

// the C side's static state
export function font_state() {
  return {
    // mapfile.c mitem: the pending map file or line (at first the default map file, read at the first lookup)
    map_item: { line: 'pdftex.map', mode: 0, type: 0 } as { line: string, mode: number, type: number } | null,
    tfm_tree: null as Map<string, FmEntry> | null, ps_tree: new Map<string, FmEntry>(), font_map: [] as (FmEntry | null | undefined)[], // pdf_font_map[f]; null: no entry
    fe_tree: new Map<string, FeEntry>(), fd_tree: new Map<string, FdEntry>(), fo_tree: new Map<string, FoEntry>(),
  }
}
export type FontState = ReturnType<typeof font_state>

const is_type1 = (fm: FmEntry) => (fm.type & F_TYPE1) !== 0
const is_pk = (fm: FmEntry) => (fm.type & F_PK) !== 0
const is_included = (fm: FmEntry) => (fm.type & F_INCLUDED) !== 0
const is_subsetted = (fm: FmEntry) => (fm.type & F_SUBSETTED) !== 0
const is_truetype = (fm: FmEntry) => (fm.type & F_TRUETYPE) !== 0
const is_fontfile = (fm: FmEntry) => fm.ff_name !== null
const is_t1fontfile = (fm: FmEntry) => is_fontfile(fm) && is_type1(fm)
const strcmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

// mapfile.c check_std_t1font
const std_t1font_names = ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique', 'Helvetica', 'Helvetica-Bold',
  'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Symbol', 'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic', 'ZapfDingbats']
const check_std_t1font = (s: string) => std_t1font_names.indexOf(s)

// mapfile.c check_fm_entry: nonzero means a bad line
function check_fm_entry(e: Engine, fm: FmEntry, file: string | null): number {
  let a = 0
  const warn = (s: string) => pdftex_warn(e, file, s)
  if (is_fontfile(fm) && !is_included(fm)) {
    warn(`ambiguous entry for \`${fm.tfm_name}': font file present but not included, will be treated as font file not present`)
    fm.ff_name = null
  }
  if (fm.tfm_name === '') { warn('invalid map entry: tfm missing'); a += 1 }
  if (is_truetype(fm) && fm.encname !== null && !is_subsetted(fm)) {
    warn(`invalid entry for \`${fm.tfm_name}': only subsetted TrueType fonts can be reencoded`); a += 2
  }
  if ((fm.slant !== 0 || fm.extend !== 0) && (fm.tfm_name.length === 0 || !(is_t1fontfile(fm) && is_included(fm)))) {
    warn(`invalid entry for \`${fm.tfm_name}': SlantFont/ExtendFont can be used only with embedded Type1 fonts`); a += 4
  }
  if (Math.abs(fm.slant) > 1000) { warn(`invalid entry for \`${fm.tfm_name}': SlantFont value too big: ${g(fm.slant / 1000)}`); a += 8 }
  if (Math.abs(fm.extend) > 2000) { warn(`invalid entry for \`${fm.tfm_name}': ExtendFont value too big: ${g(fm.extend / 1000)}`); a += 16 }
  if (fm.pid !== -1 && !(is_truetype(fm) && is_subsetted(fm) && fm.encname === null)) {
    warn(`invalid entry for \`${fm.tfm_name}': PidEid can be used only with subsetted non-reencoded TrueType fonts`); a += 32
  }
  if (is_fontfile(fm) && is_pk(fm)) { warn(`invalid entry for \`${fm.tfm_name}': FontFile cannot be specified for bitmap PK font: ${fm.ff_name}`); a += 64 }
  if (fm.ps_name !== null && is_pk(fm)) { warn(`invalid entry for \`${fm.tfm_name}': PsName cannot be specified for bitmap PK font: ${fm.ps_name}`); a += 128 }
  return a
}
const g = (x: number) => String(Number(x.toPrecision(6))) // printf %g for the values check_fm_entry prints

// mapfile.c fm_scan_line
function fm_scan_line(e: Engine, s: string, mode: number, file: string | null): void {
  if (s === '' || '\n*#;%'.includes(s[0]!)) return
  const fm: FmEntry = { tfm_name: '', ps_name: null, fd_flags: FD_FLAGS_NOT_SET_IN_MAPLINE, slant: 0, extend: 0, encname: null,
    ff_name: null, type: 0, pid: -1, in_use: false }
  let r = 0
  const read_field = () => { const q = r; while (r < s.length && !' <"'.includes(s[r]!)) r++; const b = s.slice(q, r); if (s[r] === ' ') r++; return b }
  const isdigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
  done: {
    let buf = read_field()
    fm.tfm_name = buf
    if (r >= s.length) break done
    if (!isdigit(s[r])) { buf = read_field(); if (buf !== '') fm.ps_name = buf; if (r >= s.length) break done }
    if (isdigit(s[r])) {
      let t = r
      while (isdigit(s[t])) t++
      if (t >= s.length || ' "<'.includes(s[t]!)) { fm.fd_flags = parseInt(s.slice(r, t), 10); r = t }
    }
    let u = '', v = ''
    for (;;) {
      if (s[r] === ' ') r++
      if (r >= s.length) break done
      if (s[r] === '"') {
        r++; u = v = ''
        do {
          if (s[r] === ' ') r++
          const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(r))
          if (m !== null) {
            let t = r + m[0].length
            while (t < s.length && /\s/.test(s[t]!)) t++
            const d = Math.fround(Math.fround(parseFloat(m[0])) * 1000)
            const rnd = d > 0 ? Math.trunc(d + 0.5) : Math.trunc(d - 0.5)
            if (s.startsWith('SlantFont', t)) { fm.slant = rnd; r = t + 9 }
            else if (s.startsWith('ExtendFont', t)) { fm.extend = rnd === 1000 ? 0 : rnd; r = t + 10 }
            else {
              r = t; while (r < s.length && s[r] !== ' ' && s[r] !== '"') r++
              pdftex_warn(e, file, `invalid entry for \`${fm.tfm_name}': unknown name \`${s.slice(t, r)}' ignored`)
            }
          } else while (r < s.length && s[r] !== ' ' && s[r] !== '"') r++
        } while (s[r] === ' ')
        if (s[r] === '"') r++
        else { pdftex_warn(e, file, `invalid entry for \`${fm.tfm_name}': closing quote missing`); return }
        continue
      }
      const pe = s[r] === 'P' ? /^PidEid=\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*/.exec(s.slice(r)) : null
      if (pe !== null) { fm.pid = +pe[1]!; r += pe[0].length; continue }
      let a = '', b = ''
      if (s[r] === '<') { a = s[r++]!; if (s[r] === '<' || s[r] === '[') b = s[r++]! }
      buf = read_field()
      if (buf.length > 4 && buf.slice(-4).toLowerCase() === '.enc') { fm.encname = buf; u = v = '' }
      else if (buf.length > 0) {
        if (a === '<' || u === '<') {
          fm.type |= F_INCLUDED
          if ((a === '<' && b === '') || (a === '' && v === '')) fm.type |= F_SUBSETTED
        }
        fm.ff_name = buf
        if (r >= s.length) break done
        u = v = ''
      } else { u = a; v = b }
    }
  }
  if (fm.ps_name !== null && check_std_t1font(fm.ps_name) >= 0) fm.type |= F_STDT1FONT
  if (fm.ff_name !== null && fm.ff_name.length > 3) {
    const x = fm.ff_name.slice(-4).toLowerCase()
    fm.type |= x === '.ttf' || x === '.ttc' ? F_TRUETYPE : x === '.otf' ? F_OTF : F_TYPE1
  } else if (fm.ps_name === null) fm.type |= F_PK
  else fm.type |= F_TYPE1
  if (check_fm_entry(e, fm, file) !== 0) return
  if (fm.tfm_name.includes('@')) return // shortcut: subfont (`@sfd@') entries are not registered; port handle_subfont_fm for CJK subfonts
  // avl_do_entry: the tfm_name link, then the ps_name link (lookup_fontmap, for PDF inclusion)
  const tree = e.fm.tfm_tree!
  if (fm.tfm_name !== '<nontfm>') {
    const p = tree.get(fm.tfm_name)
    if (p !== undefined) {
      if (mode === FM_DUPIGNORE) {
        if (e.equiv[int_base + 94]! <= 0) // \pdfsuppresswarningdupmap
          pdftex_warn(e, file, `fontmap entry for \`${fm.tfm_name}' already exists, duplicates ignored`)
        return
      }
      if (p.in_use) { pdftex_warn(e, file, `fontmap entry for \`${fm.tfm_name}' has been used, replace/delete not allowed`); return }
      tree.delete(fm.tfm_name)
    }
    if (mode !== FM_DELETE) tree.set(fm.tfm_name, fm)
  }
  if (fm.ps_name !== null) {
    const ps = e.fm.ps_tree, k = ps_key(fm.ps_name, fm.slant, fm.extend), p = ps.get(k)
    if (p !== undefined) { if (mode === FM_DUPIGNORE || p.in_use) return; ps.delete(k) }
    if (mode !== FM_DELETE && is_t1fontfile(fm) && is_included(fm)) ps.set(k, fm)
  }
}
const ps_key = (ps_name: string, slant: number, extend: number) => ps_name + '\0' + slant + '\0' + extend

// mapfile.c lookup_fontmap: the map entry replacing an included PDF's Type 1 font (a subset tag and -Slant_/-Extend_ suffixes are
// read off the name); fm_valid_for_font_replacement wants its font file to exist
export function lookup_fontmap(e: Engine, ps_name: string): FmEntry | null {
  if (e.fm.tfm_tree === null) fm_read_info(e)
  let s = ps_name.length > 7 && /^[A-Z]{6}\+/.test(ps_name) ? ps_name.slice(7) : ps_name, slant = 0, extend = 0
  const int = (t: string) => /^[ \t\n\v\f\r]*[+-]?\d+$/.test(t) ? parseInt(t, 10) : null // strtol consuming the whole rest
  const a = s.indexOf('-Slant_')
  if (a >= 0) {
    const m = /^[ \t\n\v\f\r]*[+-]?\d+/.exec(s.slice(a + 7)), rest = m === null ? '' : s.slice(a + 7 + m[0].length)
    if (m !== null && rest === '') { slant = parseInt(m[0], 10); s = s.slice(0, a) }
    else if (m !== null) {
      const c = rest.indexOf('-Extend_'), ex = c >= 0 ? int(rest.slice(c + 8)) : null
      if (ex !== null) { slant = parseInt(m[0], 10); extend = ex; s = s.slice(0, a) }
    }
  } else {
    const b = s.indexOf('-Extend_'), ex = b >= 0 ? int(s.slice(b + 8)) : null
    if (ex !== null) { extend = ex; s = s.slice(0, b) }
  }
  const fm = e.fm.ps_tree.get(ps_key(s, slant, extend))
  return fm !== undefined && e.fs.find(fm.ff_name!, 'type1') !== null ? fm : null
}

// epdf.c epdf_create_fontdescriptor (the descriptor shared with TeX's own use of the font file), get_fn_objnum
export function epdf_create_fontdescriptor(e: Engine, fm: FmEntry, stemv: number): FdEntry {
  let fd = e.fm.fd_tree.get(fd_key(fm))
  if (fd === undefined) {
    fm.in_use = true
    fd = { fd_objnum: pdf_new_objnum(e), fontname: fm.ps_name!, ff_found: false, ff_objnum: 0, fn_objnum: 0,
      font_dim: Array.from({ length: 11 }, () => ({ val: 0, set: false })), builtin_glyph_names: null, fm, tx_tree: null }
    fd.font_dim[STEMV_CODE] = { val: stemv, set: true }
    e.fm.fd_tree.set(fd_key(fm), fd)
  }
  return fd // shortcut: epdf_mark_glyphs/embed_whole_font only feed subsetting and /CharSet, which we do not write
}
export const get_fn_objnum = (e: Engine, fd: FdEntry) => fd.fn_objnum !== 0 ? fd.fn_objnum : (fd.fn_objnum = pdf_new_objnum(e))

// writeenc.c epdf_write_enc: every slot that is not notdef (a pointer comparison: a `.notdef' name from the file is written)
export function epdf_write_enc(e: Engine, glyph_names: (string | null)[], objnum: number): void {
  pdf_begin_dict(e, objnum, 1)
  pdf_print(e, '/Type /Encoding\n/Differences [')
  let i_old = -2
  for (let i = 0; i < 256; i++) {
    const g = glyph_names[i]
    if (g === null || g === undefined) continue
    pdf_print(e, i === i_old + 1 ? `/${g}` : (i_old === -2 ? '' : ' ') + `${i}/${g}`)
    i_old = i
  }
  pdf_print(e, ']\n')
  pdf_end_dict(e)
}

// mapfile.c fm_read_info: the pending map file or map line, if any
const MAPFILE = 0, MAPLINE = 1
function fm_read_info(e: Engine): void {
  const st = e.fm
  if (st.tfm_tree === null) st.tfm_tree = new Map()
  if (st.map_item === null) return
  const { line: name, mode, type } = st.map_item
  st.map_item = null
  if (type === MAPLINE) { fm_scan_line(e, name, mode, null); return }
  const found = find_backend_file(e, name, 'map')
  if (found === null) { pdftex_warn(e, name, 'cannot open font map file'); return }
  const { data, path } = found
  print(e, '{' + path)
  // fm_getchar lines: tab is a space, spaces collapse, no leading space, CR ends a line like LF
  const text = Array.from(data, c => String.fromCharCode(c)).join('')
  const lines = text.split(/\r|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  for (const raw of lines) {
    let l = ''
    for (let c of raw) { if (c === '\t') c = ' '; if (c !== ' ' || (l.length > 0 && l[l.length - 1] !== ' ')) l += c }
    fm_scan_line(e, l, mode, path)
  }
  print(e, '}')
}

// mapfile.c process_map_item (\pdfmapfile, \pdfmapline): [+=-] choose the mode; no prefix also drops the unread default map file
export function process_map_item(e: Engine, s: string, type: number): void {
  const st = e.fm
  let mode = FM_DUPIGNORE
  if (s[0] === ' ') s = s.slice(1)
  if (s[0] === '+') s = s.slice(1)
  else if (s[0] === '=') { mode = FM_REPLACE; s = s.slice(1) }
  else if (s[0] === '-') { mode = FM_DELETE; s = s.slice(1) }
  else st.map_item = null
  if (s[0] === ' ') s = s.slice(1)
  if (type === MAPFILE) s = s.split(' ')[0]!
  if (st.map_item !== null) fm_read_info(e)
  if (s !== '') { st.map_item = { line: s, mode, type }; fm_read_info(e) }
}

// mapfile.c hasfmentry, isscalable, hasspacechar
export function hasfmentry(e: Engine, f: number): boolean {
  const st = e.fm
  if (st.font_map[f] === undefined) { // fmlookup
    if (st.tfm_tree === null) fm_read_info(e)
    const fm = st.tfm_tree!.get(e.font_name[f]!)
    if (fm !== undefined) fm.in_use = true
    st.font_map[f] = fm ?? null
  }
  return st.font_map[f] !== null
}
export const isscalable = (e: Engine, f: number) => hasfmentry(e, f) && !is_pk(e.fm.font_map[f]!)
export function hasspacechar(e: Engine, f: number): boolean {
  if (!isscalable(e, f)) return false
  const fm = e.fm.font_map[f]!
  const fe = fm.encname !== null ? get_fe_entry(e, fm.encname) : null
  return fe !== null && fe.glyph_names[32] === 'space'
}

// writeenc.c get_fe_entry (load_enc_file fails rather than returning NULL)
function get_fe_entry(e: Engine, s: string): FeEntry {
  let fe = e.fm.fe_tree.get(s)
  if (fe === undefined) { fe = { name: s, fe_objnum: 0, glyph_names: load_enc_file(e, s), tx_tree: null }; e.fm.fe_tree.set(s, fe) }
  return fe
}

// writefont.c is_valid_char helpers (pdftex.web get_charwidth & co.)
function valid(e: Engine, f: number, c: number): number | null {
  if (e.font_bc[f]! <= c && c <= e.font_ec[f]!) { const i = char_info(e, f, c); if (char_exists(i)) return i }
  return null
}
const getcharwidth = (e: Engine, f: number, c: number) => { const i = valid(e, f, c); return i === null ? 0 : char_width(e, f, i) }
const getcharheight = (e: Engine, f: number, c: number) => { const i = valid(e, f, c); return i === null ? 0 : char_height(e, f, height_depth(i)) }
const getchardepth = (e: Engine, f: number, c: number) => { const i = valid(e, f, c); return i === null ? 0 : char_depth(e, f, height_depth(i)) }

// writefont.c preset_fontmetrics: TFM fallbacks; a double argument of dividescaled is truncated to an integer, as in C
function preset_fontmetrics(e: Engine, fd: FdEntry, f: number): void {
  const size = e.ps.font_size[f]!, d = (s: number) => divide_scaled(e, Math.trunc(s), size, 3), dim = fd.font_dim
  dim[ITALIC_ANGLE_CODE]!.val = d(-Math.atan(param(e, slant_code, f) / 65536.0) * (180 / Math.PI))
  dim[ASCENT_CODE]!.val = d(getcharheight(e, f, 104))
  dim[CAPHEIGHT_CODE]!.val = d(getcharheight(e, f, 72))
  const i = -d(getchardepth(e, f, 121))
  dim[DESCENT_CODE]!.val = i < 0 ? i : 0
  dim[STEMV_CODE]!.val = d(Math.trunc(getcharwidth(e, f, 46) / 3))
  dim[XHEIGHT_CODE]!.val = d(param(e, x_height_code, f))
  dim[FONTBBOX1_CODE]!.val = 0
  dim[FONTBBOX2_CODE]!.val = dim[DESCENT_CODE]!.val
  dim[FONTBBOX3_CODE]!.val = d(param(e, quad_code, f))
  dim[FONTBBOX4_CODE]!.val = Math.max(dim[CAPHEIGHT_CODE]!.val, dim[ASCENT_CODE]!.val)
  for (let k = 0; k <= FONTBBOX4_CODE; k++) dim[k]!.set = true
}

// writefont.c write_fontmetrics (fix_fontmetrics first)
function write_fontmetrics(e: Engine, fd: FdEntry): void {
  const p = fd.font_dim
  if (!p[FONTBBOX1_CODE]!.set || !p[FONTBBOX2_CODE]!.set || !p[FONTBBOX3_CODE]!.set || !p[FONTBBOX4_CODE]!.set) {
    pdftex_warn(e, null, `font \`${fd.fm.ff_name}' doesn't have a BoundingBox`)
  } else {
    if (!p[ASCENT_CODE]!.set) p[ASCENT_CODE] = { val: p[FONTBBOX4_CODE]!.val, set: true }
    if (!p[DESCENT_CODE]!.set) p[DESCENT_CODE] = { val: p[FONTBBOX2_CODE]!.val, set: true }
    if (!p[CAPHEIGHT_CODE]!.set) p[CAPHEIGHT_CODE] = { val: p[FONTBBOX4_CODE]!.val, set: true }
    pdf_print(e, `/FontBBox [${p[FONTBBOX1_CODE]!.val} ${p[FONTBBOX2_CODE]!.val} ${p[FONTBBOX3_CODE]!.val} ${p[FONTBBOX4_CODE]!.val}]\n`)
  }
  for (let i = 0; i <= XHEIGHT_CODE; i++) if (p[i]!.set) pdf_print(e, `/${font_key[i]![0]} ${p[i]!.val}\n`)
}

// writefont.c write_fontname: no subset tag, we embed whole fonts
const write_fontname = (e: Engine, fd: FdEntry, key: string) => pdf_print(e, `/${key} /${fd.fontname}\n`)

// writefont.c write_fontdescriptor (write_fontfile, writet1 for Type 1)
function write_fontdescriptor(e: Engine, fd: FdEntry): void {
  if (is_fontfile(fd.fm)) {
    if (!is_type1(fd.fm)) pdftex_fail(e, fd.fm.ff_name, 'unsupported: TrueType/OpenType font files') // pass B
    const t1 = writet1(e, fd, fd.fm.ff_name!, is_subsetted(fd.fm))
    fd.ff_found = true
    fd.ff_objnum = pdf_new_objnum(e)
    pdf_begin_dict(e, fd.ff_objnum, 0)
    pdf_print(e, `/Length1 ${t1.length1}\n/Length2 ${t1.length2}\n/Length3 0\n`)
    pdf_begin_stream(e); pdf_print(e, Array.from(t1.data)); pdf_end_stream(e)
  }
  if (fd.fn_objnum !== 0) { pdf_begin_obj(e, fd.fn_objnum, 1); pdf_print(e, `/${fd.fontname}\n`); pdf_end_obj(e) } // write_fontname_object
  if (fd.fd_objnum === 0) fd.fd_objnum = pdf_new_objnum(e)
  pdf_begin_dict(e, fd.fd_objnum, 1)
  pdf_print(e, '/Type /FontDescriptor\n')
  write_fontname(e, fd, 'FontName')
  let fd_flags: number
  if (fd.fm.fd_flags !== FD_FLAGS_NOT_SET_IN_MAPLINE) fd_flags = fd.fm.fd_flags
  else if (fd.ff_found) fd_flags = FD_FLAGS_DEFAULT_EMBED
  else {
    const std_flags = [1 + 2 + (1 << 5), 1 + 2 + (1 << 5) + (1 << 18), 1 + 2 + (1 << 5) + (1 << 6), 1 + 2 + (1 << 5) + (1 << 6) + (1 << 18),
      1 << 5, (1 << 5) + (1 << 18), (1 << 5) + (1 << 6), (1 << 5) + (1 << 6) + (1 << 18), 4, 2 + (1 << 5), 2 + (1 << 5) + (1 << 18),
      2 + (1 << 5) + (1 << 6), 2 + (1 << 5) + (1 << 6) + (1 << 18), 4]
    fd_flags = (fd.fm.type & F_STDT1FONT) !== 0 ? std_flags[check_std_t1font(fd.fm.ps_name!)]! : FD_FLAGS_DEFAULT_NON_EMBED
    pdftex_warn(e, null, `No flags specified for non-embedded font \`${fd.fm.ps_name ?? 'No name given'}' (${fd.fm.tfm_name}) (I'm using ${fd_flags}): fix your map entry.`)
  }
  pdf_print(e, `/Flags ${fd_flags}\n`)
  write_fontmetrics(e, fd)
  // shortcut: no /CharSet (pdfTeX writes it for subsetted fonts; a whole font has every glyph, and the oracle masks it)
  if (fd.ff_found) pdf_print(e, `/FontFile ${fd.ff_objnum} 0 R\n`)
  pdf_end_dict(e)
}

// writefont.c write_charwidth_array: tenths, printed as C's `%i' of /10 and %10
function write_charwidth_array(e: Engine, fo: FoEntry): void {
  fo.cw_objnum = pdf_new_objnum(e)
  pdf_begin_obj(e, fo.cw_objnum, 1)
  const w: string[] = []
  for (let i = fo.first_char; i <= fo.last_char; i++) {
    const x = fo.width[i]!, j = x % 10
    w.push(String(Math.trunc(x / 10)) + (j !== 0 ? '.' + j : ''))
  }
  pdf_print(e, '[' + w.join(' ') + ']\n')
  pdf_end_obj(e)
}

// writefont.c mark_chars
function mark_chars(e: Engine, fo: FoEntry, tx: Set<number> | null, f: number): Set<number> {
  tx ??= new Set()
  for (let i = fo.first_char; i <= fo.last_char; i++) if (pdf_char_marked(e, f, i)) tx.add(i)
  return tx
}

// writefont.c create_fontdescriptor
function create_fontdescriptor(e: Engine, fo: FoEntry, f: number): FdEntry {
  const fd: FdEntry = { fd_objnum: 0, fontname: fo.fm.ps_name ?? fo.fm.tfm_name, ff_found: false, ff_objnum: 0, fn_objnum: 0,
    font_dim: Array.from({ length: 11 }, () => ({ val: 0, set: false })), builtin_glyph_names: null, fm: fo.fm, tx_tree: null }
  preset_fontmetrics(e, fd, f)
  return fd
}
const fd_key = (fm: FmEntry) => fm.ff_name + '\0' + fm.slant + '\0' + fm.extend

// writefont.c create_fontdictionary
function create_fontdictionary(e: Engine, fm: FmEntry, font_objnum: number, f: number): void {
  const fo: FoEntry = { fo_objnum: font_objnum, tex_font: f, fm, fd: null, fe: null, cw_objnum: 0, width: [], first_char: 1, last_char: 0, tounicode_objnum: 0 }
  // get_char_range
  let i = e.font_bc[f]!
  while (i <= e.font_ec[f]! && !pdf_char_marked(e, f, i)) i++
  fo.first_char = i
  i = e.font_ec[f]!
  while (i >= e.font_bc[f]! && !pdf_char_marked(e, f, i)) i--
  fo.last_char = i
  if (fo.first_char > fo.last_char || !pdf_char_marked(e, f, fo.first_char)) { fo.last_char = 0; fo.first_char = 1 }
  if (fm.slant !== 0 || fm.extend !== 0) pdftex_fail(e, fm.ff_name, 'unsupported: SlantFont/ExtendFont') // pass B: t1_modify_fm
  if (fm.encname !== null) {
    fo.fe = get_fe_entry(e, fm.encname)
    if (is_type1(fm)) {
      if (fo.fe.fe_objnum === 0) fo.fe.fe_objnum = pdf_new_objnum(e)
      fo.fe.tx_tree = mark_chars(e, fo, fo.fe.tx_tree, f)
    }
  }
  const create_charwidth_array = () => { for (let c = fo.first_char; c <= fo.last_char; c++) fo.width[c] = divide_scaled(e, getcharwidth(e, f, c), e.ps.font_size[f]!, 4) }
  if (is_fontfile(fm)) {
    if (!is_type1(fm)) pdftex_fail(e, fm.ff_name, 'unsupported: TrueType/OpenType font files') // pass B
    fo.fd = e.fm.fd_tree.get(fd_key(fm)) ?? null
    if (fo.fd === null) { fo.fd = create_fontdescriptor(e, fo, f); e.fm.fd_tree.set(fd_key(fm), fo.fd) }
    create_charwidth_array(); write_charwidth_array(e, fo)
    if (fo.fe === null) fo.fd.tx_tree = mark_chars(e, fo, fo.fd.tx_tree, f) // mark_reenc_glyphs only feeds /CharSet
  } else { // builtin fonts still need the /Widths array and /FontDescriptor
    create_charwidth_array(); write_charwidth_array(e, fo)
    fo.fd = create_fontdescriptor(e, fo, f); write_fontdescriptor(e, fo.fd)
    if ((fm.type & F_STDT1FONT) === 0) pdftex_warn(e, null, `font \`${fm.ps_name}' is not a standard font; I suppose it is available to your PDF viewer then`)
  }
  e.fm.fo_tree.set(fm.tfm_name, fo) // register_fo_entry (Type 1 only, the others are refused above)
}

// writefont.c dopdffont
export function do_pdf_font(e: Engine, font_objnum: number, f: number): void {
  let i = e.font_bc[f]!
  while (i <= e.font_ec[f]! && !pdf_char_marked(e, f, i)) i++
  if (i > e.font_ec[f]!) return // font_is_used
  const fm = hasfmentry(e, f) ? e.fm.font_map[f]! : null
  if (fm === null || is_pk(fm)) pdftex_fail(e, e.font_name[f]!, 'unsupported: bitmap (PK) fonts, Type 3 output') // writet3
  create_fontdictionary(e, fm, font_objnum, f)
}

// writeenc.c write_enc
function write_enc(e: Engine, fe: FeEntry): void {
  pdf_begin_dict(e, fe.fe_objnum, 1)
  pdf_print(e, '/Type /Encoding\n/Differences [')
  let i_old = -2
  for (const p of [...fe.tx_tree!].sort((a, b) => a - b)) {
    const g = fe.glyph_names[p] ?? notdef
    if (p === i_old + 1) pdf_print(e, `/${g}`)
    else pdf_print(e, (i_old === -2 ? '' : ' ') + `${p}/${g}`)
    i_old = p
  }
  pdf_print(e, ']\n')
  pdf_end_dict(e)
}

// writefont.c write_fontdictionary
function write_fontdictionary(e: Engine, fo: FoEntry): void {
  // the `== 0' applies to the whole conjunction (C's parenthesisation): true also when there is no descriptor
  if ((e.ps.fixed_gen_tounicode > 0 && fo.fd !== null && !e.ps.font_nobuiltin_tounicode[fo.tex_font])
    || !(fo.fd !== null && fo.fm.tfm_name !== 'dummy-space')) {
    if (fo.fe !== null) fo.tounicode_objnum = write_tounicode(e, fo.fe.glyph_names, fo.fm.tfm_name, fo.fe.name)
    else if (is_type1(fo.fm)) {
      if (fo.fd!.builtin_glyph_names === null) pdftex_fail(e, null, 'builtin glyph names is empty')
      fo.tounicode_objnum = write_tounicode(e, fo.fd!.builtin_glyph_names, fo.fm.tfm_name, null)
    }
  }
  pdf_begin_dict(e, fo.fo_objnum, 1)
  pdf_print(e, '/Type /Font\n/Subtype /Type1\n')
  write_fontname(e, fo.fd!, 'BaseFont')
  pdf_print(e, `/FontDescriptor ${fo.fd!.fd_objnum} 0 R\n`)
  pdf_print(e, `/FirstChar ${fo.first_char}\n/LastChar ${fo.last_char}\n/Widths ${fo.cw_objnum} 0 R\n`)
  if (fo.fe !== null && fo.fe.fe_objnum !== 0) pdf_print(e, `/Encoding ${fo.fe.fe_objnum} 0 R\n`)
  if (fo.tounicode_objnum !== 0) pdf_print(e, `/ToUnicode ${fo.tounicode_objnum} 0 R\n`)
  const attr = e.ps.font_attr[fo.tex_font] // \pdffontattr; even an empty one prints its newline (a string other than the null string)
  if (attr !== undefined) pdf_print(e, attr + '\n')
  pdf_end_dict(e)
}

// writefont.c writefontstuff: descriptors (by font file, slant, extend), encodings (by name), dictionaries (by TFM name)
export function write_fontstuff(e: Engine): void {
  const sorted = <T>(m: Map<string, T>) => [...m.entries()].sort((a, b) => strcmp(a[0], b[0])).map(x => x[1])
  const fds = [...e.fm.fd_tree.values()].sort((a, b) => strcmp(a.fm.ff_name!, b.fm.ff_name!) || a.fm.slant - b.fm.slant || a.fm.extend - b.fm.extend)
  for (const fd of fds) write_fontdescriptor(e, fd)
  for (const fe of sorted(e.fm.fe_tree)) if (fe.fe_objnum !== 0) write_enc(e, fe)
  for (const fo of sorted(e.fm.fo_tree)) write_fontdictionary(e, fo)
}

// tounicode.c: the glyph name -> Unicode table (\pdfglyphtounicode; dumped in the format). A number is a code point,
// a string a sequence of 4-hex-digit groups (UNI_STRING), -1 an out-of-range value (UNI_UNDEF)
const UNI_UNDEF = -1
export function def_tounicode(e: Engine, glyph: string, unistr: string): void {
  glyph = glyph.split('\0')[0]!; let p = unistr.split('\0')[0]!.replace(/^ +/, '').replace(/ +$/, '')
  let valid_unistr = 1
  for (const c of p) { if (c === ' ') valid_unistr = 2; else if (!/[0-9A-Fa-f]/.test(c)) { valid_unistr = 0; break } }
  if (p.length === 0 || valid_unistr === 0 || glyph.length === 0 || glyph === notdef) {
    pdftex_warn(e, null, `ToUnicode: invalid parameter(s): \`${glyph}' => \`${p}'`); return
  }
  if (valid_unistr === 2) { e.glyph_unicode.set(glyph, p.replace(/ /g, '')); return }
  const v = parseInt(p, 16)
  if (v > 0x10FFFF) { pdftex_warn(e, null, `ToUnicode: value out of range [0,10FFFF]: ${v.toString(16).toUpperCase()}`); e.glyph_unicode.set(glyph, UNI_UNDEF) }
  else e.glyph_unicode.set(glyph, v)
}

// tounicode.c check_unicode_value, utf16be_str
function check_unicode_value(s: string, multiple: boolean): number {
  const l = s.length
  if (l === 0 || (multiple && l % 4 !== 0) || (!multiple && !(4 <= l && l <= 6)) || !/^[0-9A-Fa-f]+$/.test(s)) return UNI_UNDEF
  let code = UNI_UNDEF
  if (multiple) {
    for (let i = 3; i < l; i += 4) {
      code = parseInt(s.slice(i - 3, i + 1), 16)
      if (!(code <= 0xD7FF || (0xE000 <= code && code <= 0xFFFF))) return UNI_UNDEF
    }
  } else {
    code = parseInt(s, 16)
    if (!(code <= 0xD7FF || (0xE000 <= code && code <= 0x10FFFF))) return UNI_UNDEF
  }
  return code
}
function utf16be_str(code: number): string {
  const h4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')
  if (code <= 0xFFFF) return h4(code)
  const v = code - 0x10000
  return h4(Math.trunc(v / 0x400) + 0xD800) + h4(v % 0x400 + 0xDC00)
}

// tounicode.c set_glyph_unicode: a code point, a hex string (UNI_STRING/UNI_EXTRA_STRING) or UNI_UNDEF
function set_glyph_unicode(e: Engine, s: string | null, tfmname: string): number | string {
  if (s === null) return UNI_UNDEF
  const dot = s.indexOf('.')
  if (dot >= 0) s = s.slice(0, dot)
  if (s.length === 0) return UNI_UNDEF
  if (s.includes('_')) { // multiple components
    let buf2 = ''
    for (const part of s.split('_')) {
      const t = set_glyph_unicode(e, part, tfmname)
      if (typeof t === 'string') buf2 += t
      else if (t !== UNI_UNDEF) buf2 += utf16be_str(t)
    }
    return buf2
  }
  const t = e.glyph_unicode.get(`tfm:${tfmname}/${s}`) ?? e.glyph_unicode.get(s)
  if (t !== undefined) return t
  if (s.startsWith('uni')) {
    const code = check_unicode_value(s.slice(3), true)
    return code === UNI_UNDEF ? UNI_UNDEF : s.length - 3 === 4 ? code : s.slice(3)
  }
  if (s.startsWith('u')) {
    const code = check_unicode_value(s.slice(1), false)
    if (code !== UNI_UNDEF) return code
  }
  return UNI_UNDEF
}

// tounicode.c write_tounicode
function write_tounicode(e: Engine, glyph_names: Glyphs, tfmname: string, encname: string | null): number {
  if (e.glyph_unicode.size === 0) {
    pdftex_warn(e, null, 'no GlyphToUnicode entry has been inserted yet!')
    e.ps.fixed_gen_tounicode = 0
    return 0
  }
  let buf = tfmname + '-'
  if (encname !== null) {
    buf += encname
    if (buf.endsWith('.enc') && buf.lastIndexOf('.') === buf.length - 4) buf = buf.slice(0, -4)
    else pdftex_warn(e, null, `Dubious encoding file name: \`${encname}'`)
  } else buf += 'builtin'
  const objnum = pdf_new_objnum(e)
  pdf_begin_dict(e, objnum, 0)
  pdf_begin_stream(e)
  pdf_print(e, `%!PS-Adobe-3.0 Resource-CMap\n%%DocumentNeededResources: ProcSet (CIDInit)\n%%IncludeResource: ProcSet (CIDInit)\n`
    + `%%BeginResource: CMap (TeX-${buf}-0)\n%%Title: (TeX-${buf}-0 TeX ${buf} 0)\n%%Version: 1.000\n%%EndComments\n`
    + `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo\n<< /Registry (TeX)\n/Ordering (${buf})\n`
    + `/Supplement 0\n>> def\n/CMapName /TeX-${buf}-0 def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n`)
  const gtab: (number | string)[] = []
  for (let i = 0; i < 256; i++) gtab[i] = set_glyph_unicode(e, glyph_names[i] ?? null, tfmname)
  gtab[256] = UNI_UNDEF
  const num = (x: number | string): x is number => typeof x === 'number'
  // is_last_byte_valid: the last byte of the first code may not run past 255
  const last_byte_ok = (j: number, i: number, code: number) => parseInt(utf16be_str(code).slice(-2), 16) < 255 - (i - j)
  const range_size: number[] = new Array(257).fill(0)
  for (let i = 0; i < 256;) {
    const c = gtab[i]!
    if (!num(c)) { range_size[i] = 1; i++ }
    else if (c === UNI_UNDEF) { range_size[i] = 0; i++ }
    else {
      const j = i
      while (i < 256 && num(gtab[i + 1]!) && (gtab[i + 1] as number) >= 0 && (gtab[i] as number) + 1 === gtab[i + 1] && last_byte_ok(j, i, gtab[i] as number)) i++
      i++
      range_size[j] = i - j
    }
  }
  let bfrange_count = 0, bfchar_count = 0
  for (let i = 0; i < 256;) {
    if (range_size[i] === 1) { bfchar_count++; i++ } else if (range_size[i]! > 1) { bfrange_count++; i += range_size[i]! } else i++
  }
  const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
  let i = 0
  do { // write out bfrange
    const sub = Math.min(bfrange_count, 100); bfrange_count -= sub
    pdf_print(e, `${sub} beginbfrange\n`)
    for (let j = 0; j < sub; j++) {
      while (range_size[i]! <= 1 && i < 256) i++
      pdf_print(e, `<${h2(i)}> <${h2(i + range_size[i]! - 1)}> <${utf16be_str(gtab[i] as number)}>\n`)
      i += range_size[i]!
    }
    pdf_print(e, 'endbfrange\n')
  } while (bfrange_count > 0)
  i = 0
  do { // write out bfchar
    const sub = Math.min(bfchar_count, 100); bfchar_count -= sub
    pdf_print(e, `${sub} beginbfchar\n`)
    for (let j = 0; j < sub; j++) {
      while (i < 256) { if (range_size[i]! > 1) i += range_size[i]!; else if (range_size[i] === 0) i++; else break }
      const c = gtab[i]!
      pdf_print(e, `<${h2(i)}> <${num(c) ? utf16be_str(c) : c}>\n`)
      i++
    }
    pdf_print(e, 'endbfchar\n')
  } while (bfchar_count > 0)
  pdf_print(e, 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n%%EndResource\n%%EOF\n')
  pdf_end_stream(e)
  return objnum
}

