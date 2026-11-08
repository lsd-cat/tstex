// writeimg.c readimage/writeimage/deleteimage, pdftoepdf.cc (read_pdf_info, write_epdf: PDF pages as form XObjects),
// writepng.c (read_png_info, write_png: the copy path and the decoded write_png_gray/rgb/palette/gray_alpha/rgb_alpha
// paths), writejpg.c (read_jpg_info incl. JFIF/Exif resolution, write_jpg). libpng's work is done here: chunks are parsed and
// CRC-checked, IDAT is inflated by the platform (TexFS.inflate), the rows unfiltered and deinterlaced, libpng's tRNS, alpha,
// gamma and 16-bit transformations applied. JBIG2 inclusion is unsupported.
import type { Engine } from '../engine.ts'
import { print } from '../print.ts'
import { fatal_error } from '../error.ts'
import { int_base } from '../types.ts'
import { int_par } from '../eqtb.ts'
import { pdftex_fail, pdftex_warn, pdf_print, pdf_print_ln, pdf_begin_stream, pdf_end_stream, pdf_create_obj, pdf_begin_dict, pdf_begin_obj, pdf_end_obj,
  pdf_new_objnum } from '../pdf.ts'
import { pdf_open, get_page, get_page_ref, page_group, page_resources, fetch, deref, lookup, lookup_nf, decode_stream, raw_bytes, fofi_type1_encoding,
  type_name, is_name, is_dict, is_stream, is_ref, num } from './pdfread.ts'
import type { PdfDoc, Page, Box, PObj, PDict, PRef, PStream, XRef } from './pdfread.ts'
import { lookup_fontmap, epdf_create_fontdescriptor, epdf_mark_glyphs, get_fn_objnum, epdf_write_enc } from './fonts.ts'
import type { FdEntry, FmEntry } from './fonts.ts'
import { standard_glyph_names } from './type1.ts'

export const IMAGE_COLOR_B = 1, IMAGE_COLOR_C = 2, IMAGE_COLOR_I = 4
// gamma: the file gamma (×100000, 0: none); trns: a valid tRNS chunk's data; sbit: sBIT's significant bits
type Png = { ct: number, bd: number, il: number, palette: Uint8Array, chunks: Set<string>, gamma: number, trns: Uint8Array | null, sbit: Uint8Array }
export type Img = { name: string, data: Uint8Array, type: 'png' | 'jpg' | 'pdf', orig_x: number, orig_y: number, color: number, width: number, height: number, xres: number, yres: number,
  pages: number, colorspace_ref: number, group_ref: number, rotate: number, bpc: number, jpg_color_space: number, png: Png | null,
  doc: EpdfDoc | null, selected_page: number, page_box: number }

const u16 = (d: Uint8Array, i: number) => (d[i]! << 8) | d[i + 1]!
const u32 = (d: Uint8Array, i: number) => ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0
const tag = (d: Uint8Array, i: number) => String.fromCharCode(d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!)
const cround = (x: number) => x < 0 ? -Math.round(-x) : Math.round(x) // C round(): halves away from zero

// writeimg.c readimage (checktypebyheader, then checktypebyextension)
export function read_image(e: Engine, s: string, page: number, named: boolean, colorspace: number, pagebox: number): Img {
  const data = e.fs.find(s, 'tex'), name = e.fs.path?.(s, 'tex') ?? s
  if (data === null) pdftex_fail(e, null, `cannot find image file ${s}`)
  const img: Img = { name, data, type: 'png', orig_x: 0, orig_y: 0, color: 0, width: 0, height: 0, xres: 0, yres: 0, pages: 1, colorspace_ref: colorspace,
    group_ref: 0, rotate: 0, bpc: 0, jpg_color_space: 0, png: null, doc: null, selected_page: 0, page_box: 0 }
  if (data.length < 8) pdftex_fail(e, name, 'reading image file failed')
  const head = String.fromCharCode(...data.subarray(0, 8)), ext = /\.[^.]*$/.exec(s)?.[0].toLowerCase()
  const type = head.startsWith('\xFF\xD8') ? 'jpg' : head === '\x89PNG\r\n\x1A\n' ? 'png' : head === '\x97JB2\r\n\x1A\n' ? 'jbig2'
    : head.startsWith('%PDF-1.') ? 'pdf' : ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpg'
    : ext === '.jbig2' || ext === '.jb2' ? 'jbig2' : ext === '.pdf' ? 'pdf' : 'none'
  if (type === 'pdf' && named) fatal_error(e, 'unsupported: \\pdfximage named (PDF destinations)')
  if (type === 'jbig2') fatal_error(e, 'unsupported: JBIG2 image inclusion')
  if (type === 'none') pdftex_fail(e, name, 'unknown type of image')
  img.type = type
  if (type === 'png') read_png_info(e, img); else if (type === 'jpg') read_jpg_info(e, img); else read_pdf_info(e, img, page, pagebox)
  return img
}

// pdftoepdf.cc: read_pdf_info and write_epdf on the reader in pdfread.ts. A document stays open with its list of copied
// objects (PdfDocument) while images of it are pending; epdf_delete forgets the list once the last one is written (never in -ini)
type InObj = { num: number, gen: number, type: number, newnum: number, fd: FdEntry | null, enc_objnum: number, written: boolean }
const OBJ_FONT = 0, OBJ_FONTDESC = 1, OBJ_OTHER = 2
export type EpdfDoc = { pdf: PdfDoc, objs: InObj[], index: Map<string, InObj>, occurences: number, released: boolean }

// find_add_document (an unchanged released document is reused; we cannot see a file change)
function find_add_document(e: Engine, img: Img): EpdfDoc {
  let p = e.ps.epdf_docs.get(img.name)
  if (p !== undefined) { p.released = false; p.occurences++; return p }
  const pdf = pdf_open(e, img.data)
  if (pdf === null) pdftex_fail(e, img.name, 'xpdf: reading PDF image failed')
  p = { pdf, objs: [], index: new Map(), occurences: 0, released: false }
  e.ps.epdf_docs.set(img.name, p)
  return p
}

// get_pagebox
function get_pagebox(e: Engine, img: Img, page: Page, spec: number): Box {
  const a = page.attrs
  if (spec < 1 || spec > 5) pdftex_fail(e, img.name, `PDF inclusion: unknown value of pagebox spec (${spec})`)
  return [a.media, a.crop, a.bleed, a.trim, a.art][spec - 1]!
}

// read_pdf_info (`page_name', i.e. \pdfximage named, is refused by read_image)
function read_pdf_info(e: Engine, img: Img, page_num: number, pagebox_spec: number): void {
  const doc = find_add_document(e, img), pdf = doc.pdf
  img.doc = doc
  const found = Math.fround(pdf.version), wanted = Math.fround(e.ps.fixed_major + e.ps.fixed_minor * 0.1), level = e.equiv[int_base + 78]!
  if (found > wanted + 0.01) {
    const msg = `PDF inclusion: found PDF version <${found.toFixed(1)}>, but at most version <${wanted.toFixed(1)}> allowed`
    if (level > 0) pdftex_fail(e, img.name, msg); else if (level === 0) pdftex_warn(e, img.name, msg)
  }
  img.pages = pdf.num_pages
  if (page_num <= 0 || page_num > pdf.num_pages) pdftex_fail(e, img.name, `PDF inclusion: required page does not exist <${pdf.num_pages}>`)
  const page = get_page(pdf, page_num), b = get_pagebox(e, img, page, pagebox_spec), f = Math.fround
  const bp2int = (p: number) => cround(p * (6578176 / 100.0)) // writeimg.c bp2int of the float epdf_* values
  img.orig_x = bp2int(f(b.x2 > b.x1 ? b.x1 : b.x2)); img.width = bp2int(f(b.x2 > b.x1 ? b.x2 - b.x1 : b.x1 - b.x2))
  img.orig_y = bp2int(f(b.y2 > b.y1 ? b.y1 : b.y2)); img.height = bp2int(f(b.y2 > b.y1 ? b.y2 - b.y1 : b.y1 - b.y2))
  img.rotate = page.attrs.rotate
  img.group_ref = page_group(page) !== null ? -1 : 0 // the object number is made by out_image
  img.selected_page = page_num; img.page_box = pagebox_spec
}

// utils.c convertStringToPDFString, stripzeros; convertNumToPDF; sprintf's %.8f (exact decimal ties round to even)
const pdf_string = (s: string) => Array.from(s, ch => { const c = ch.charCodeAt(0); return c < 33 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : ch === '(' || ch === ')' || ch === '\\' ? '\\' + ch : ch }).join('')
function stripzeros(a: string): string {
  const NONUM = 0, DOTNONUM = 1, INT = 2, DOT = 3, LEADDOT = 4, FRAC = 5
  const b = Array.from(a)
  let s = NONUM, t = NONUM, q = 0, r = 0
  for (let p = 0; p < b.length;) {
    const c = b[p]!, dig = c >= '0' && c <= '9'
    switch (s) {
      case NONUM: if (dig) s = INT; else if (c === '.') s = LEADDOT; break
      case DOTNONUM: if (c !== '.' && !dig) s = NONUM; break
      case INT: if (c === '.') s = DOT; else if (!dig) s = NONUM; break
      case DOT: case LEADDOT: s = dig ? FRAC : c === '.' ? DOTNONUM : NONUM; break
      case FRAC: if (c === '.') s = DOTNONUM; else if (!dig) s = NONUM; break
    }
    switch (s) {
      case DOT: r = q; break
      case LEADDOT: r = q + 1; break
      case FRAC: if (c > '0') r = q + 1; break
      case NONUM: if ((t === FRAC || t === DOT) && r !== 0) { q = r--; if (b[r] === '.') b[r] = '0'; r = 0 } break
    }
    b[q++] = b[p++]!; t = s
  }
  return b.slice(0, q).join('')
}
function c_fixed(x: number, d: number): string {
  const y = x * 2 ** (d + 1)
  if (Number.isInteger(y) && Math.abs(y) % 2 === 1 && Math.abs(x) < 2 ** 40) { // a tie: toFixed would round away from zero
    let n = Math.floor(Math.abs(x) * 10 ** d)
    if (n % 2 === 1) n++
    const t = String(n).padStart(d + 1, '0')
    return (x < 0 ? '-' : '') + t.slice(0, -d) + '.' + t.slice(-d)
  }
  return Object.is(x, -0) ? '-' + x.toFixed(d) : x.toFixed(d)
}
// C's (int) of a double: x86 cvttsd2si wraps out-of-range values to INT_MIN; we match the arm64 build we test against (fcvtzs saturates, NaN is 0)
const c_int = (v: number) => Number.isNaN(v) ? 0 : Math.max(-(2 ** 31), Math.min(2 ** 31 - 1, Math.trunc(v)))
// pdftoepdf.cc convertNumToPDF: precision 6; fval may exceed 10^6 after saturation, then only its last 6 digits are written
function num_to_pdf(n: number): string {
  if (Math.abs(n) < 0.5e-6) return '0'
  let s = ''
  if (n < 0) { s = '-'; n = -n }
  n += 0.5e-6
  const ival = c_int(Math.floor(n))
  n -= ival
  s += String(ival)
  let fval = c_int(Math.floor(n * 1e6)), k = 6
  if (fval === 0) return s
  while (fval % 10 === 0 && k > 0) { fval = Math.trunc(fval / 10); k-- }
  let d = ''
  for (; k > 0; k--) { d = String(fval % 10) + d; fval = Math.trunc(fval / 10) }
  return s + '.' + d
}

// GfxFont::makeFont, Gfx8BitFont: the font's encoding (base encoding, from the font file or the default, plus /Differences)
function font_encoding(e: Engine, img: Img, x: XRef, fontdict: PDict): (string | null)[] {
  const unsupported = (what: string): never => fatal_error(e, `unsupported: PDF inclusion of a replaced font with ${what} (${img.name})`)
  const bn = lookup(fontdict, 'BaseFont'), name = is_name(bn) ? bn.v : tag_str(bn)
  const desc = lookup(fontdict, 'FontDescriptor')
  let emb: PObj = null, cff = false
  if (is_dict(desc)) for (const k of ['FontFile3', 'FontFile2', 'FontFile']) { const r = lookup_nf(desc, k); if (is_ref(r)) { emb = r; if (k !== 'FontFile') cff = true; break } }
  let file: Uint8Array | null = null
  if (emb !== null) {
    const s = deref(x, emb)
    if (is_stream(s)) {
      const d = decode_stream(e, s), head = String.fromCharCode(...d.subarray(d[0] === 0x80 ? 6 : 0, (d[0] === 0x80 ? 6 : 0) + 16))
      if (head.startsWith('%!PS-AdobeFont-1') || head.startsWith('%!FontType1')) file = d // FoFiIdentifier: Type 1 PFA/PFB
      else if (cff || d[0] === 1) unsupported('a CFF (Type1C) font file')
    }
  }
  let base: (string | null)[] | null = null
  const enc = lookup(fontdict, 'Encoding'), predefined = (o: PObj) => is_name(o, 'MacRomanEncoding') || is_name(o, 'MacExpertEncoding') || is_name(o, 'WinAnsiEncoding')
  if (is_dict(enc) ? predefined(lookup(enc, 'BaseEncoding')) : predefined(enc)) unsupported('a Mac/WinAnsi base encoding')
  if (file !== null) { const f = fofi_type1_encoding(file); if (f !== null) base = f === 'std' ? standard_glyph_names : f }
  if (base === null) {
    if (file === null && /^(Symbol(,Bold|,Italic|,BoldItalic)?|ZapfDingbats)$/.test(name.replace(/ /g, ''))) unsupported('a built-in symbol encoding')
    base = standard_glyph_names
  }
  const names = base.slice(0, 256)
  while (names.length < 256) names.push(null)
  const diff = is_dict(enc) ? lookup(enc, 'Differences') : null
  if (Array.isArray(diff)) {
    let code = 0
    for (const o of diff) {
      const v = deref(x, o)
      if (typeof v === 'number') code = v
      else if (is_name(v)) { if (code >= 0 && code < 256) names[code] = v.v; code++ }
    }
  }
  return names
}
const tag_str = (o: PObj) => o !== null && typeof o === 'object' && !Array.isArray(o) && o.t === 'str' ? o.v : ''

// write_epdf
function write_epdf(e: Engine, img: Img): void {
  const doc = img.doc!, pdf = doc.pdf, x = pdf.x, ps = e.ps
  const file = img.name, fail = (msg: string): never => pdftex_fail(e, file, msg)
  doc.occurences--
  const objs = doc.objs, index = doc.index, find = (r: PRef) => index.get(r.num + ' ' + r.gen), encodings: { names: (string | null)[], objnum: number }[] = []
  let last = 0 // pdflastbyte: the last byte of a pdf_puts (pdfout does not set it), for pdf_newline
  const puts = (s: string) => { pdf_print(e, s); if (s.length > 0) last = s.charCodeAt(s.length - 1) }
  const newline = () => { if (last !== 10) puts('\n') }
  const add = (type: number, r: PRef, fd: FdEntry | null, enc: number): number => { // addInObj
    if (r.num === 0) fail('PDF inclusion: invalid reference')
    const o = find(r)
    if (o !== undefined) return o.newnum
    const n: InObj = { num: r.num, gen: r.gen, type, newnum: 0, fd, enc_objnum: enc, written: false }
    objs.push(n); index.set(r.num + ' ' + r.gen, n)
    n.newnum = type === OBJ_FONTDESC ? fd!.fd_objnum : pdf_new_objnum(e)
    return n.newnum
  }
  const copy_name = (s: string) => {
    puts('/')
    pdf_print(e, Array.from(s, ch => /[0-9A-Za-z_.+-]/.test(ch) ? ch : '#' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(''))
  }
  const copy_dict_entry = (k: string, v: PObj) => { copy_name(k); puts(' '); copy_object(v); puts('\n') }
  const copy_dict = (o: PObj) => {
    if (!is_dict(o)) fail(`PDF inclusion: invalid dict type <${type_name(o)}>`)
    for (const [k, v] of (o as PDict).m) copy_dict_entry(k, v)
  }
  const copy_stream = (b: Uint8Array) => { pdf_print(e, b); last = b.length > 0 ? b[b.length - 1]! : 0 }
  const copy_object = (o: PObj): void => {
    if (typeof o === 'boolean') puts(o ? 'true' : 'false')
    else if (typeof o === 'number') puts(String(o))
    else if (o === null) puts('null')
    else if (Array.isArray(o)) { puts('['); for (const v of o) { if (!is_name(v)) puts(' '); copy_object(v) } puts(']') }
    else if (o.t === 'real') puts(num_to_pdf(o.v))
    else if (o.t === 'str') {
      if (!o.v.includes('\0')) {
        puts('(')
        for (const ch of o.v) {
          const c = ch.charCodeAt(0)
          if (ch === '(' || ch === ')' || ch === '\\') puts('\\' + ch)
          else if (c < 0x20 || c > 0x7f) puts('\\' + c.toString(8).padStart(3, '0'))
          else pdf_print(e, ch)
        }
        puts(')')
      } else puts('<' + Array.from(o.v, ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('') + '>')
    } else if (o.t === 'name') copy_name(o.v)
    else if (o.t === 'dict') { puts('<<\n'); copy_dict(o); puts('>>') }
    else if (o.t === 'stream') { puts('<<\n'); copy_dict(o.d); puts('>>\n'); puts('stream\n'); copy_stream(raw_bytes(o)); puts('\nendstream') }
    else if (o.t === 'ref') { if (o.num === 0) fail('PDF inclusion: reference to invalid object (is the included pdf broken?)'); puts(`${add(OBJ_OTHER, o, null, 0)} 0 R`) }
    else fail(`PDF inclusion: type <${type_name(o)}> cannot be copied`)
  }
  const copy_font = (tag: string, r: PRef) => {
    const p = find(r)
    if (p !== undefined) { copy_name(tag); puts(` ${p.newnum} 0 R `); return }
    // only included Type1 (and Type1C) fonts named in the font map are replaced; anything else is copied
    let fontdict: PObj = null, basefont: PObj = null, descref: PObj = null, desc: PObj = null, ff: PObj, fm: FmEntry | null = null
    if (ps.fixed_inclusion_copy_font === 0 && is_dict(fontdict = deref(x, r)) && is_name(lookup(fontdict, 'Subtype'), 'Type1')
      && is_name(basefont = lookup(fontdict, 'BaseFont')) && is_ref(descref = lookup_nf(fontdict, 'FontDescriptor')) && is_dict(desc = deref(x, descref))
      && (is_stream(lookup(desc, 'FontFile')) || (is_stream(ff = lookup(desc, 'FontFile3')) && is_name(lookup(ff.d, 'Subtype'), 'Type1C')))
      && (fm = lookup_fontmap(e, basefont.v)) !== null) {
      const stemv = lookup(desc, 'StemV')
      const fd = epdf_create_fontdescriptor(e, fm, cround(num(stemv))) // zround: the PDF's /StemV may be a real
      const charset = lookup(desc, 'CharSet')
      epdf_mark_glyphs(e, fm, fd, charset !== null && typeof charset === 'object' && !Array.isArray(charset) && charset.t === 'str' ? charset.v : null)
      add(OBJ_FONTDESC, descref, fd, 0)
      copy_name(tag)
      const names = font_encoding(e, img, x, fontdict)
      const enc = pdf_new_objnum(e) // addEncoding
      encodings.unshift({ names, objnum: enc })
      puts(` ${add(OBJ_FONT, r, fd, enc)} 0 R `)
    } else { copy_name(tag); puts(' '); copy_object(r) }
  }
  const page = get_page(pdf, img.selected_page), page_ref = get_page_ref(pdf, img.selected_page)
  const page_obj = page_ref === null ? null : fetch(x, page_ref.num, page_ref.gen)
  if (!is_dict(page_obj)) fail('xpdf: reading PDF image failed') // pdftex dereferences a null page dictionary here
  const page_dict = page_obj as PDict, rotate = page.attrs.rotate, suppress = int_par(e, 97), sep = int_par(e, 101) !== 0 ? '_' : '.'
  puts('/Type /XObject\n'); puts('/Subtype /Form\n'); puts('/FormType 1\n')
  if ((suppress & 2) === 0) puts(`/PTEX${sep}FileName (${pdf_string(file)})\n`)
  if ((suppress & 4) === 0) puts(`/PTEX${sep}PageNumber ${img.selected_page}\n`)
  if ((suppress & 8) === 0) {
    const info = lookup_nf(x.trailer!, 'Info')
    if (is_ref(info)) { puts(`/PTEX${sep}InfoDict `); puts(`${add(OBJ_OTHER, info, null, 0)} 0 R\n`) } // the info dict must be indirect
  }
  const b = get_pagebox(e, img, page, img.page_box)
  if (rotate !== 0 && rotate % 90 === 0) { // the /Rotate key is clockwise, the matrix counterclockwise; the image turns about its centre
    print(e, `, page is rotated ${rotate} degrees`)
    const m = rotate === 90 ? [0, -1, 1, 0, b.x1 - b.y1, b.y1 + b.x2] : rotate === 180 ? [-1, 0, 0, -1, b.x1 + b.x2, b.y1 + b.y2] : [0, 1, -1, 0, b.x1 + b.y2, b.y1 - b.x1]
    puts(stripzeros(`/Matrix [${m.map(v => c_fixed(v, 8)).join(' ')}]\n`))
  }
  puts(stripzeros(`/BBox [${[b.x1, b.y1, b.x2, b.y2].map(v => c_fixed(v, 8)).join(' ')}]\n`))
  const meta = lookup_nf(page_dict, 'Metadata')
  if (meta !== null && !is_ref(meta)) pdftex_warn(e, file, 'PDF inclusion: /Metadata must be indirect object')
  for (const k of ['LastModified', 'Metadata', 'PieceInfo', 'SeparationInfo']) { // selected page dictionary items (indirection kept)
    const o = lookup_nf(page_dict, k)
    if (o !== null) { newline(); puts(`/${k} `); copy_object(o) }
  }
  let group: PDict | null = null
  const g = lookup_nf(page_dict, 'Group')
  if (g !== null) {
    if (ps.page_group_val === 0) { // another pdf with a page group came earlier on this page: the Group entry is copied as it is
      if (int_par(e, 95) === 0) pdftex_warn(e, file, 'PDF inclusion: multiple pdfs with page group included in a single page')
      newline(); puts('/Group '); copy_object(g)
    } else { // a separate object, since the page dictionary refers to it too
      if (!is_dict(lookup(page_dict, 'Group'))) fail('PDF inclusion: /Group dict missing')
      group = { t: 'dict', m: new Map(page_group(page)!.m), x }
      puts(`/Group ${ps.page_group_val} 0 R\n`)
    }
  }
  const res = page_resources(page)
  if (res === null) pdftex_warn(e, file, "PDF inclusion: /Resources missing. 'This practice is not recommended' (PDF Ref)")
  else {
    newline(); puts('/Resources <<\n')
    for (const [k, v] of res.m) {
      const o = deref(x, v)
      if (k === 'Font') {
        if (!is_dict(o)) fail(`PDF inclusion: invalid font resources dict type <${type_name(o)}>`)
        puts('/Font << ')
        for (const [t, f] of (o as PDict).m) {
          if (is_ref(f)) copy_font(t, f)
          else if (is_dict(f)) { copy_name(t); puts(' '); copy_object(f) } // some programs write the font dictionary inline
          else fail(`PDF inclusion: invalid font in reference type <${type_name(f)}>`)
        }
        puts('>>\n')
      } else if (k === 'ProcSet') {
        if (!Array.isArray(o)) fail(`PDF inclusion: invalid ProcSet array type <${type_name(o)}>`)
        puts('/ProcSet [ ')
        for (const n of o as PObj[]) { if (!is_name(n)) fail(`PDF inclusion: invalid ProcSet entry type <${type_name(n)}>`); copy_name((n as { v: string }).v); puts(' ') }
        puts(']\n')
      } else if (k === 'Subtype' ? !is_name(o) : !is_dict(o)) { // copyOtherResources
        pdftex_warn(e, file, k === 'Subtype' ? `PDF inclusion: Subtype in Resources dict is not a name (key '${k}', type <${type_name(o)}>); ignored.`
          : `PDF inclusion: invalid other resource which is no dict (key '${k}', type <${type_name(o)}>); ignored.`)
      } else { copy_name(k); puts(' '); copy_object(o) }
    }
    puts('>>\n')
  }
  // the page contents: one stream is copied with its filters; the streams of an array are decoded and joined
  const contents = deref(x, page.contents)
  if (is_stream(contents)) {
    if (lookup(contents.d, 'F') !== null) fail('PDF inclusion: Unsupported external stream')
    puts('/Length '); copy_object(lookup(contents.d, 'Length')); puts('\n')
    const f = lookup(contents.d, 'Filter')
    if (f !== null) {
      puts('/Filter '); copy_object(f); puts('\n')
      const dp = lookup(contents.d, 'DecodeParms')
      if (dp !== null) { puts('/DecodeParms '); copy_object(dp); puts('\n') }
    }
    puts('>>\nstream\n')
    copy_stream(raw_bytes(contents))
    pdf_end_stream(e)
  } else if (Array.isArray(contents)) {
    pdf_begin_stream(e); last = 0
    contents.forEach((o, i) => {
      const s = deref(x, o)
      if (!is_stream(s)) fail(`PDF inclusion: type <${type_name(s)}> cannot be copied`) // pdftex reads a non-stream as one
      copy_stream(decode_stream(e, s as PStream))
      if (i < contents.length - 1) newline()
    })
    pdf_end_stream(e)
  } else { pdf_begin_stream(e); pdf_end_stream(e) } // the contents are optional, an empty stream is not
  for (const r of encodings) epdf_write_enc(e, r.names, r.objnum) // writeEncodings
  if (group !== null) { pdf_begin_obj(e, ps.page_group_val, 2); copy_object(group); puts('\n'); pdf_end_obj(e); ps.page_group_val = 0 }
  for (let i = 0; i < objs.length; i++) { // writeRefs: the list grows while it is written
    const r = objs[i]!
    if (r.written) continue
    r.written = true
    const o = fetch(x, r.num, r.gen)
    if (r.type === OBJ_FONT) { // copyFontDict
      pdf_begin_obj(e, r.newnum, 2)
      if (!is_dict(o)) fail(`PDF inclusion: invalid dict type <${type_name(o)}>`)
      puts('<<\n')
      for (const [k, v] of (o as PDict).m) if (!k.startsWith('FontDescriptor') && !k.startsWith('BaseFont') && !k.startsWith('Encoding')) copy_dict_entry(k, v)
      puts(`/FontDescriptor ${r.fd!.fd_objnum} 0 R\n/BaseFont ${get_fn_objnum(e, r.fd!)} 0 R\n/Encoding ${r.enc_objnum} 0 R\n>>`)
      puts('\n'); pdf_end_obj(e)
    } else if (r.type !== OBJ_FONTDESC) { // the descriptor is pdfTeX's own (write_fontdescriptor)
      pdf_begin_obj(e, r.newnum, is_stream(o) ? 0 : 2)
      copy_object(o); puts('\n'); pdf_end_obj(e)
    }
  }
}

// epdf_delete (deleteimage does nothing in -ini: the image may be dumped)
export function delete_image(e: Engine, img: Img): void {
  if (e.ini_version || img.type !== 'pdf') return
  const doc = img.doc!
  if (doc.occurences < 0 && !doc.released) { doc.objs = []; doc.index = new Map(); doc.released = true }
}

// writepng.c read_png_info (libpng's png_read_info: the chunks before IDAT)
function read_png_info(e: Engine, img: Img): void {
  const d = img.data, png: Png = { ct: 0, bd: 0, il: 0, palette: new Uint8Array(0), chunks: new Set(), gamma: 0, trns: null, sbit: new Uint8Array(0) }
  img.png = png
  for (let i = 8; i + 8 <= d.length;) {
    const len = u32(d, i), t = tag(d, i + 4), b = i + 8
    if (t === 'IDAT') break // png_read_info stops here
    if (b + len + 4 > d.length) pdftex_fail(e, img.name, 'libpng: internal error')
    i = b + len + 4
    if (crc32(d.subarray(b - 4, b + len)) !== u32(d, b + len)) { // png_crc_finish: an error for critical chunks, ancillary ones are dropped (silent warn)
      if (t.charCodeAt(0) & 32) continue
      pdftex_fail(e, img.name, 'libpng: internal error')
    }
    if (t === 'tRNS') { // png_handle_tRNS: a wrong length, a palette without PLTE, a colour type with alpha or a second tRNS: ignored
      const ok = png.trns === null && (png.ct === 0 ? len === 2 : png.ct === 2 ? len === 6 : png.ct === 3 && len > 0 && len <= 256 && 3 * len <= png.palette.length)
      if (!ok) continue
      png.trns = d.subarray(b, b + len)
    }
    if (t === 'gAMA') { // png_colorspace_set_gamma: 16..625000000
      if (len !== 4 || u32(d, b) < 16 || u32(d, b) > 625000000) continue
      png.gamma = u32(d, b)
    }
    if (t === 'sBIT') png.sbit = d.subarray(b, b + Math.min(len, 4))
    png.chunks.add(t)
    if (t === 'IHDR') { img.width = u32(d, b); img.height = u32(d, b + 4); png.bd = d[b + 8]!; png.ct = d[b + 9]!; png.il = d[b + 12]! }
    else if (t === 'pHYs' && d[b + 8] === 1) { img.xres = cround(0.0254 * u32(d, b)); img.yres = cround(0.0254 * u32(d, b + 4)) } // png_get_x_pixels_per_meter is 0 unless the unit is the metre
    else if (t === 'PLTE') png.palette = d.subarray(b, b + len)
    else if (t === 'IEND') break
  }
  switch (png.ct) {
    case 3: img.color = IMAGE_COLOR_C | IMAGE_COLOR_I; break
    case 0: case 4: img.color = IMAGE_COLOR_B; break
    case 2: case 6: img.color = IMAGE_COLOR_C; break
    default: pdftex_fail(e, img.name, `unsupported type of color_type <${png.ct}>`)
  }
  if ((e.ps.fixed_major > 1 || e.ps.fixed_minor >= 4) && (png.ct === 4 || png.ct === 6)) { // a dummy page group for Adobe
    if (e.ps.transparent_page_group === 0) e.ps.transparent_page_group = pdf_new_objnum(e)
    if (e.ps.page_group_val === 0) e.ps.page_group_val = e.ps.transparent_page_group // whatever page (or none) is being shipped
    img.group_ref = e.ps.page_group_val
  }
}

// libpng's CRC-32 (ISO 3309) over a chunk's type and data
const crc_table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const x of b) c = crc_table[(c ^ x) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// writejpg.c read_jpg_info (read_APP1_Exif for the Exif resolution)
function read_jpg_info(e: Engine, img: Img): void {
  const d = img.data
  if (u16(d, 0) !== 0xFFD8) pdftex_fail(e, img.name, 'reading JPEG image failed (no JPEG header found)')
  const appmk = u16(d, 2)
  if (appmk === 0xFFE0) {
    if (String.fromCharCode(...d.subarray(6, 11)) === 'JFIF\0') {
      const units = d[13]!
      img.xres = u16(d, 14); img.yres = u16(d, 16)
      if (units === 2) { img.xres = Math.trunc(img.xres * 2.54); img.yres = Math.trunc(img.yres * 2.54) }
      else if (units !== 1) img.xres = img.yres = 0
    }
    if (img.xres === 0 && img.yres !== 0) img.xres = img.yres
    if (img.yres === 0 && img.xres !== 0) img.yres = img.xres
  } else if (appmk === 0xFFE1) {
    const length = u16(d, 4) - 2
    let xx = 0, yy = 0
    if (length > 5 && String.fromCharCode(...d.subarray(6, 11)) === 'Exif\0') [xx, yy] = read_APP1_Exif(d.subarray(11, 11 + length - 5))
    img.xres = xx; img.yres = yy
  }
  // a C stream: getc at the end sets the EOF flag and returns -1; fseek clears the flag (and may go past the end)
  let i = 0, eof = false
  const getc = () => { if (i < d.length) return d[i++]!; eof = true; return -1 }
  for (;;) {
    if (eof) pdftex_fail(e, img.name, 'reading JPEG image failed (premature file end)')
    if (getc() !== 0xFF) pdftex_fail(e, img.name, 'reading JPEG image failed (no marker found)')
    const m = getc()
    if ([0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) pdftex_fail(e, img.name, 'unsupported type of compression')
    if (m === 0xc2 && e.ps.fixed_major === 1 && e.ps.fixed_minor <= 2) pdftex_fail(e, img.name, 'cannot use progressive DCT with PDF-1.2')
    if (m === 0xc0 || m === 0xc1 || m === 0xc2 || m === 0xc3) {
      img.bpc = d[i + 2]!; img.height = u16(d, i + 3); img.width = u16(d, i + 5); img.jpg_color_space = d[i + 7]!
      if (img.jpg_color_space === 1) img.color = IMAGE_COLOR_B
      else if (img.jpg_color_space === 3 || img.jpg_color_space === 4) img.color = IMAGE_COLOR_C
      else pdftex_fail(e, img.name, `Unsupported color space ${img.jpg_color_space}`)
      return
    }
    if (m === 0xd8 || m === 0xd9 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue
    const c = getc(), l = ((c << 8) + getc()) & 0xffff; i += l - 2; eof = false // read2bytes, then xfseek(SEEK_CUR)
  }
}
function read_APP1_Exif(b: Uint8Array): [number, number] {
  let p = 0
  while (p < b.length && b[p] === 0) p++
  const th = p, big = b[p] === 77 && b[p + 1] === 77
  if (!big && !(b[p] === 73 && b[p + 1] === 73)) return [0, 0]
  const rd = (n: number) => { let v = 0; for (let k = 0; k < n; k++) v = big ? v * 256 + (b[p + k] ?? 0) : v + (b[p + k] ?? 0) * 256 ** k; p += n; return v }
  p += 2
  if (rd(2) !== 42) return [0, 0]
  p = th + rd(4)
  let n = rd(2), value = 0, num = 0, den = 0, xres = 72.0, yres = 72.0, unit = 1.0
  while (n-- > 0) {
    const t = rd(2), type = rd(2); rd(4)
    if (type === 1 || type === 7) { value = b[p]!; p += 4 }
    else if (type === 3) { value = rd(2); p += 2 }
    else if (type === 4 || type === 9) value = rd(4)
    else if (type === 5 || type === 10) { value = rd(4); const q = p; p = th + value; num = rd(4); den = rd(4); p = q }
    else p += 4
    if (t === 282 && den !== 0) xres = Math.trunc(num / den) // num / den: C integer division
    else if (t === 283 && den !== 0) yres = Math.trunc(num / den)
    else if (t === 296) unit = value === 3 ? 2.54 : value === 2 ? 1.0 : unit
  }
  return [Math.trunc(xres * unit), Math.trunc(yres * unit)]
}

// writeimg.c writeimage
export function write_image(e: Engine, img: Img): void {
  print(e, ' <' + img.name)
  if (img.type === 'png') write_png(e, img); else if (img.type === 'jpg') write_jpg(e, img); else write_epdf(e, img)
  print(e, '>')
}

function write_jpg(e: Engine, img: Img): void {
  pdf_print(e, '/Type /XObject\n/Subtype /Image\n')
  pdf_print(e, `/Width ${img.width}\n/Height ${img.height}\n/BitsPerComponent ${img.bpc}\n/Length ${img.data.length}\n`)
  pdf_print(e, '/ColorSpace ')
  if (img.colorspace_ref !== 0) pdf_print(e, `${img.colorspace_ref} 0 R\n`)
  else pdf_print(e, img.jpg_color_space === 1 ? '/DeviceGray\n' : img.jpg_color_space === 3 ? '/DeviceRGB\n' : '/DeviceCMYK\n/Decode [1 0 1 0 1 0 1 0]\n')
  pdf_print(e, '/Filter /DCTDecode\n>>\nstream\n')
  pdf_print(e, Array.from(img.data))
  pdf_end_stream(e)
}

// writepng.c write_png. libpng's transformations as pdfTeX requests them, in png_do_read_transformations' order: with a tRNS
// chunk png_set_tRNS_to_alpha (palette to RGB plus alpha, gray below 8 bits to 8, the tRNS colour to alpha 0), below PDF 1.4
// png_set_strip_alpha (decided on the file's colour type), png_set_gamma with \pdfimageapplygamma, png_set_strip_16 (the
// high byte) without \pdfimagehicolor or below PDF 1.5; png_set_interlace_handling deinterlaces Adam7. The writer is chosen
// by the colour type after them, so a tRNS image below PDF 1.4 writes its RGBA/gray-alpha rows as /DeviceRGB or /DeviceGray.
function write_png(e: Engine, img: Img): void {
  const png = img.png!, ps = e.ps
  if (ps.fixed_major === 1 && ps.fixed_minor < 5) ps.fixed_image_hicolor = 0 // fixedimagehicolor is a global: it stays 0
  pdf_print(e, '/Type /XObject\n/Subtype /Image\n')
  const trns = png.trns !== null
  const strip_alpha = ps.fixed_major === 1 && ps.fixed_minor < 4 && (png.ct & 4) !== 0
  const strip16 = png.bd === 16 && ps.fixed_image_hicolor === 0
  let copy = !trns && !strip_alpha && !strip16, g: Gamma | null = null
  if (ps.fixed_image_apply_gamma) {
    copy = false
    // png_set_gamma(screen, file): convert_gamma; the transform is on only if screen*file is not within 5% of 1
    const convert = (x: number) => { if (x > 0 && x < 128) x *= 100000; x = Math.floor(x + .5); if (!(x <= 0x7fffffff && x >= -0x80000000)) png_error(); return x }
    const png_error = (): never => pdftex_fail(e, img.name, 'libpng: internal error') // pdfTeX's setjmp is gone by now: undefined there
    const screen = convert(ps.fixed_gamma / 1000.0), file = convert(png.gamma !== 0 ? png.gamma * .00001 : 1000.0 / ps.fixed_image_gamma)
    if (file <= 0 || screen <= 0) png_error()
    const t = Math.floor(screen * file / 100000 + .5) // png_muldiv
    if (!(t <= 0x7fffffff) || significant(t)) g = gamma_tables(png, screen, file, strip16)
  }
  let ct = png.ct, bd = png.bd // png_read_update_info
  if (trns) { if (ct === 3) { ct = 6; bd = 8 } else { ct |= 4; if (bd < 8) bd = 8 } }
  if (strip_alpha) ct &= 3
  if (strip16) bd = 8
  pdf_print(e, `/Width ${img.width}\n/Height ${img.height}\n/BitsPerComponent ${bd}\n`)
  pdf_print(e, '/ColorSpace ')
  const n_pal = Math.trunc(png.palette.length / 3)
  if (copy && (ps.fixed_major > 1 || ps.fixed_minor > 1) && png.il === 0 && (png.ct === 0 || png.ct === 2) && (!png.chunks.has('gAMA') || png.gamma === 100000)
    && !['cHRM', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'hIST', 'tRNS', 'sPLT'].some(c => png.chunks.has(c))) {
    pdf_print(e, img.colorspace_ref !== 0 ? `${img.colorspace_ref} 0 R\n` : png.ct === 0 ? '/DeviceGray\n' : '/DeviceRGB\n')
    print(e, ' (PNG copy)')
    // copy_png: the IDAT chunks as one stream (a broken IDAT sequence fails)
    const d = img.data, parts: Uint8Array[] = []
    let idat = 0
    for (let i = 8; i + 8 <= d.length;) {
      const len = u32(d, i), t = tag(d, i + 4)
      if (t === 'IEND') break
      if (t === 'IDAT') { if (idat === 2) pdftex_fail(e, img.name, 'writepng: IDAT chunk sequence broken'); idat = 1; parts.push(d.subarray(i + 8, i + 8 + len)) }
      else if (idat === 1) idat = 2
      i += 12 + len
    }
    const length = parts.reduce((a, p) => a + p.length, 0)
    pdf_print(e, `/Length ${length}\n/Filter/FlateDecode\n/DecodeParms<</Colors ${png.ct === 2 ? 3 : 1}/Columns ${img.width}/BitsPerComponent ${png.bd}/Predictor 10>>\n>>\nstream\n`)
    for (const p of parts) pdf_print(e, Array.from(p))
    pdf_end_stream(e)
    return
  }
  // the palette (png_ptr's, shared with the info struct): png_init_read_transformations gamma-corrects it in place
  const pal = new Uint8Array(768)
  pal.set(png.palette.subarray(0, 3 * Math.min(n_pal, 256)))
  if (g !== null && png.ct === 3) for (let i = 0; i < n_pal; i++) for (let k = 0; k < 3; k++) pal[3 * i + k] = g.t8![pal[3 * i + k]!]!
  // write_png_palette makes the palette object even when an explicit colorspace leaves it unreferenced
  let palette_objnum = 0
  if (ct === 3) { pdf_create_obj(e, 0, 0); palette_objnum = ps.obj_ptr }
  if (img.colorspace_ref !== 0) pdf_print(e, `${img.colorspace_ref} 0 R\n`)
  else if (ct === 3) pdf_print(e, `[/Indexed /DeviceRGB ${n_pal - 1} ${palette_objnum} 0 R]\n`)
  else pdf_print_ln(e, ct === 0 || ct === 4 ? '/DeviceGray' : '/DeviceRGB')
  // gray+alpha and RGB+alpha from PDF 1.4 on: the alpha samples become an /SMask
  const smask = (ct === 4 || ct === 6) && (ps.fixed_minor >= 4 || ps.fixed_major > 1)
  let smask_objnum = 0
  if (smask) { pdf_create_obj(e, 0, 0); smask_objnum = ps.obj_ptr; pdf_print(e, `/SMask ${smask_objnum} 0 R\n`) }
  const rows = png_decode(e, img, trns, strip_alpha, g, strip16, pal), color: number[] = [], mask: number[] = []
  if (png.il !== 0 && img.height * Math.ceil(img.width * [1, 0, 3, 1, 2, 0, 4][ct]! * bd / 8) >= 10240000)
    pdftex_warn(e, null, 'large interlaced PNG might cause out of memory (use non-interlaced PNG to fix this)')
  if (smask) {
    const n = ct === 4 ? 1 : 3, sample = bd >> 3 // write_gray/rgb_pixel_8 or _16
    for (let j = 0; j < rows.length; j++) ((j / sample | 0) % (n + 1) < n ? color : mask).push(rows[j]!)
  }
  pdf_begin_stream(e)
  pdf_print(e, smask ? color : Array.from(rows))
  pdf_end_stream(e)
  if (smask_objnum > 0) {
    pdf_begin_dict(e, smask_objnum, 0)
    pdf_print(e, `/Type /XObject\n/Subtype /Image\n/Width ${img.width}\n/Height ${img.height}\n/BitsPerComponent ${bd === 16 ? 8 : bd}\n`)
    pdf_print(e, '/ColorSpace /DeviceGray\n')
    pdf_begin_stream(e)
    pdf_print(e, bd === 16 ? mask.filter((_, i) => i % 2 === 0) : mask)
    pdf_end_stream(e)
  }
  if (palette_objnum > 0) {
    pdf_begin_dict(e, palette_objnum, 0)
    pdf_begin_stream(e)
    pdf_print(e, Array.from(pal.subarray(0, 3 * n_pal)))
    pdf_end_stream(e)
  }
  if (smask && ps.transparent_page_group > 0 && !ps.transparent_page_group_written) { // write_additional_png_objects
    ps.transparent_page_group_written = true
    pdf_begin_obj(e, ps.transparent_page_group, 2)
    if (e.equiv[int_base + 66] === 0) pdf_print(e, '%PTEX Group needed for transparent pngs\n')
    pdf_print(e, '<</Type/Group /S/Transparency /CS/DeviceRGB /I true>>\n')
    pdf_end_obj(e)
  }
}

// libpng's gamma tables (png_build_gamma_table, floating-point arithmetic): an 8-bit table for files up to 8 bits; for 16-bit
// files png_build_16bit_table, or png_build_16to8_table when they are stripped to 8 bits, indexed [low >> shift][high]. The
// 16-to-8 table's exponent is the reciprocal of the 8-bit one (1/(1/(file·screen)), rounded twice), not png_product2:
// that is what pdfTeX's libpng produces (measured: \pdfgamma=2200 on a 16-bit ramp needs 219998, not 220000)
type Gamma = { t8: Uint8Array | null, t16: Uint16Array[] | null, shift: number }
const significant = (g: number) => g < 100000 - 5000 || g > 100000 + 5000 // png_gamma_significant
const fixed = (r: number) => r <= 2147483647 && r >= -2147483648 ? r : 0
function gamma_tables(png: Png, screen: number, file: number, strip16: boolean): Gamma {
  const gv = fixed(Math.floor(1e15 / file / screen + .5)) // png_reciprocal2
  if (png.bd <= 8) {
    const t8 = new Uint8Array(256)
    for (let i = 0; i < 256; i++) t8[i] = significant(gv) && i > 0 && i < 255 ? Math.floor(255 * Math.pow(i / 255, gv * .00001) + .5) : i
    return { t8, t16: null, shift: 0 }
  }
  const sig_bit = png.ct & 2 ? Math.max(png.sbit[0] ?? 0, png.sbit[1] ?? 0, png.sbit[2] ?? 0) : png.sbit[0] ?? 0
  let shift = sig_bit > 0 && sig_bit < 16 ? 16 - sig_bit : 0
  if (strip16 && shift < 16 - 11) shift = 16 - 11 // PNG_MAX_GAMMA_8
  if (shift > 8) shift = 8
  const num = 1 << (8 - shift), max = (1 << (16 - shift)) - 1
  const t16 = Array.from({ length: num }, () => new Uint16Array(256))
  if (strip16) { // png_build_16to8_table
    const inv = gv === 0 ? 0 : fixed(Math.floor(1e10 / gv + .5)) // png_reciprocal
    const correct = (v: number) => v > 0 && v < 65535 ? Math.floor(65535 * Math.pow(v / 65535, inv * .00001) + .5) : v // png_gamma_16bit_correct
    let last = 0
    for (let i = 0; i < 255; i++) {
      const out = i * 257, bound = Math.floor((correct(out + 128) * max + 32768) / 65535) + 1
      for (; last < bound; last++) t16[last & (0xff >> shift)]![last >> (8 - shift)] = out
    }
    for (; last < num << 8; last++) t16[last & (0xff >> shift)]![last >> (8 - shift)] = 65535
  } else { // png_build_16bit_table
    const fmax = 1.0 / max
    for (let i = 0; i < num; i++) for (let j = 0; j < 256; j++) {
      const ig = (j << (8 - shift)) + i
      t16[i]![j] = significant(gv) ? Math.floor(65535 * Math.pow(ig * fmax, gv * .00001) + .5) : shift !== 0 ? Math.floor((ig * 65535 + (1 << (15 - shift))) / max) : ig
    }
  }
  return { t8: null, t16, shift }
}

// libpng png_read_row/png_read_image: inflate the IDAT data, undo the per-row filters (per Adam7 pass, then deinterlace),
// then the transformations write_png asked for; returns the rows as pdfTeX writes them
function png_decode(e: Engine, img: Img, trns: boolean, strip_alpha: boolean, g: Gamma | null, strip16: boolean, pal: Uint8Array): Uint8Array {
  const png = img.png!, d = img.data, W = img.width, H = img.height
  const pd = [1, 0, 3, 1, 2, 0, 4][png.ct]! * png.bd, bpp = Math.max(1, pd >> 3), rowbytes = (w: number) => Math.ceil(w * pd / 8)
  const passes = png.il === 0 ? [[0, 0, 1, 1]] : [[0, 0, 8, 8], [0, 4, 8, 8], [4, 0, 8, 4], [0, 2, 4, 4], [2, 0, 4, 2], [0, 1, 2, 2], [1, 0, 2, 1]]
  const dims = passes.map(([r0, c0, ri, ci]) => W > c0! && H > r0! ? [Math.ceil((W - c0!) / ci!), Math.ceil((H - r0!) / ri!)] : [0, 0])
  const size = dims.reduce((s, [pw, ph]) => s + (rowbytes(pw!) + 1) * ph!, 0), z = new Uint8Array(d.length)
  let n = 0
  for (let i = 8; i + 8 <= d.length;) {
    const len = u32(d, i), t = tag(d, i + 4)
    if (t === 'IDAT') { z.set(d.subarray(i + 8, i + 8 + len), n); n += len }
    i += 12 + len
  }
  if (e.fs.inflate === undefined) fatal_error(e, 'unsupported: PNG decoding without an inflater')
  const raw = e.fs.inflate(z.subarray(0, n), size)
  if (raw.length < size) pdftex_fail(e, img.name, 'libpng: internal error')
  const RB = rowbytes(W)
  let out = new Uint8Array(RB * H), src = 0
  passes.forEach(([r0, c0, ri, ci], p) => {
    const [pw, ph] = dims[p]!, rb = rowbytes(pw!)
    let prev = new Uint8Array(rb)
    for (let y = 0; y < ph!; y++, src += rb + 1) {
      const f = raw[src]!, cur = new Uint8Array(rb)
      for (let x = 0; x < rb; x++) {
        const a = x >= bpp ? cur[x - bpp]! : 0, b = prev[x]!, c = x >= bpp ? prev[x - bpp]! : 0
        let v = raw[src + 1 + x]!
        if (f === 1) v += a
        else if (f === 2) v += b
        else if (f === 3) v += (a + b) >> 1
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
        else if (f !== 0) pdftex_fail(e, img.name, 'libpng: internal error')
        cur[x] = v & 255
      }
      prev = cur
      const Y = r0! + y * ri!
      if (png.il === 0) out.set(cur, Y * RB)
      else for (let x = 0; x < pw!; x++) { // png_combine_row: each pass writes only its own pixels
        const X = c0! + x * ci!
        if (pd >= 8) out.set(cur.subarray(x * bpp, x * bpp + bpp), Y * RB + X * bpp)
        else { const v = (cur[(x * pd) >> 3]! >> (8 - pd - ((x * pd) & 7))) & ((1 << pd) - 1); out[Y * RB + ((X * pd) >> 3)]! |= v << (8 - pd - ((X * pd) & 7)) }
      }
    }
  })
  // png_combine_row restores the destination's padding bits after the last pixel: zero in pdfTeX's fresh row buffers (the
  // filters saw the file's bits)
  const used = (W * pd) % 8
  if (used !== 0) for (let o = RB - 1; o < out.length; o += RB) out[o]! &= 0xff00 >> used
  const px = W * H
  let ct = png.ct, bd = png.bd
  const sample = (y: number, x: number) => (out[y * RB + ((x * bd) >> 3)]! >> (8 - bd - ((x * bd) & 7))) & ((1 << bd) - 1) // a packed sample
  if (trns) { // png_do_expand_palette / png_do_expand
    const t = png.trns!
    if (ct === 3) {
      const r = new Uint8Array(px * 4)
      for (let y = 0, o = 0; y < H; y++) for (let x = 0; x < W; x++, o += 4) {
        const i = bd === 8 ? out[y * RB + x]! : sample(y, x)
        r[o] = pal[3 * i]!; r[o + 1] = pal[3 * i + 1]!; r[o + 2] = pal[3 * i + 2]!; r[o + 3] = i < t.length ? t[i]! : 255
      }
      out = r; ct = 6; bd = 8
    } else if (ct === 0) {
      let gray = u16(t, 0)
      if (bd < 8) gray = (gray & ((1 << bd) - 1)) * (255 / ((1 << bd) - 1))
      const k = bd === 16 ? 2 : 1, r = new Uint8Array(px * 2 * k)
      for (let y = 0, o = 0; y < H; y++) for (let x = 0; x < W; x++, o += 2 * k) {
        if (k === 1) { const v = bd === 8 ? out[y * RB + x]! : sample(y, x) * (255 / ((1 << bd) - 1)); r[o] = v; r[o + 1] = v === (gray & 255) ? 0 : 255 }
        else { const s = y * RB + 2 * x; r[o] = out[s]!; r[o + 1] = out[s + 1]!; r[o + 2] = r[o + 3] = out[s]! === gray >> 8 && out[s + 1]! === (gray & 255) ? 0 : 255 }
      }
      out = r; ct = 4; if (bd < 8) bd = 8
    } else {
      const k = bd >> 3, r = new Uint8Array(px * 4 * k)
      for (let s = 0, o = 0; s < out.length; s += 3 * k, o += 4 * k) {
        r.set(out.subarray(s, s + 3 * k), o)
        const hit = k === 1 ? out[s] === t[1] && out[s + 1] === t[3] && out[s + 2] === t[5] : [0, 1, 2, 3, 4, 5].every(i => out[s + i] === t[i])
        r.fill(hit ? 0 : 255, o + 3 * k, o + 4 * k)
      }
      out = r; ct = 6
    }
  }
  const k = bd >> 3, ch = [1, 0, 3, 1, 2, 0, 4][ct]!
  if (strip_alpha) { // png_do_strip_channel: drop the last sample of each pixel
    const r = new Uint8Array(out.length / ch * (ch - 1))
    for (let s = 0, o = 0; s < out.length; s += ch * k, o += (ch - 1) * k) r.set(out.subarray(s, s + (ch - 1) * k), o)
    out = r; ct &= 3
  }
  if (g !== null && png.ct !== 3) { // png_do_gamma (a palette was corrected instead); alpha samples are left alone
    const n = [1, 0, 3, 1, 2, 0, 4][ct]!, colors = ct & 2 ? 3 : 1
    if (bd === 8) { for (let i = 0; i < out.length; i++) if (i % n < colors) out[i] = g.t8![out[i]!]! }
    else if (bd === 16) { for (let i = 0; i < out.length; i += 2) if ((i >> 1) % n < colors) { const v = g.t16![out[i + 1]! >> g.shift]![out[i]!]!; out[i] = v >> 8; out[i + 1] = v & 255 } }
    else if (bd === 4) for (let i = 0; i < out.length; i++) { const m = out[i]! & 0xf0, l = out[i]! & 0x0f; out[i] = (g.t8![m | (m >> 4)]! & 0xf0) | (g.t8![(l << 4) | l]! >> 4) }
    else if (bd === 2) for (let i = 0; i < out.length; i++) {
      const a = out[i]! & 0xc0, b = out[i]! & 0x30, c = out[i]! & 0x0c, dd = out[i]! & 0x03, t = g.t8!
      out[i] = (t[a | (a >> 2) | (a >> 4) | (a >> 6)]! & 0xc0) | ((t[(b << 2) | b | (b >> 2) | (b >> 4)]! >> 2) & 0x30)
        | ((t[(c << 4) | (c << 2) | c | (c >> 2)]! >> 4) & 0x0c) | (t[(dd << 6) | (dd << 4) | (dd << 2) | dd]! >> 6)
    }
  }
  if (strip16 && bd === 16) out = out.filter((_, i) => i % 2 === 0) // png_do_chop
  return out
}
