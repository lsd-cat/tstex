// writeimg.c readimage/writeimage/deleteimage, pdftoepdf.cc (read_pdf_info, write_epdf: PDF pages as form XObjects),
// writepng.c (read_png_info, write_png: the copy path and the decoded write_png_gray/rgb/palette/gray_alpha/rgb_alpha
// paths), writejpg.c (read_jpg_info incl. JFIF/Exif resolution, write_jpg). libpng's work is done here: chunks are parsed and
// CRC-checked, IDAT is inflated by the platform (TexFS.inflate), the rows unfiltered, alpha stripped below PDF 1.4.
// JBIG2 inclusion, interlaced, tRNS, gamma-applied and 16-to-8-bit PNGs are unsupported.
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
import { lookup_fontmap, epdf_create_fontdescriptor, get_fn_objnum, epdf_write_enc } from './fonts.ts'
import type { FdEntry, FmEntry } from './fonts.ts'
import { standard_glyph_names } from './type1.ts'

export const IMAGE_COLOR_B = 1, IMAGE_COLOR_C = 2, IMAGE_COLOR_I = 4
type Png = { ct: number, bd: number, il: number, palette: Uint8Array, chunks: Set<string>, gamma: number }
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
export type EpdfDoc = { pdf: PdfDoc, objs: InObj[], occurences: number, released: boolean }

// find_add_document (an unchanged released document is reused; we cannot see a file change)
function find_add_document(e: Engine, img: Img): EpdfDoc {
  let p = e.ps.epdf_docs.get(img.name)
  if (p !== undefined) { p.released = false; p.occurences++; return p }
  const pdf = pdf_open(e, img.data)
  if (pdf === null) pdftex_fail(e, img.name, 'xpdf: reading PDF image failed')
  p = { pdf, objs: [], occurences: 0, released: false }
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
const c_int = (v: number) => v >= 2 ** 31 || v < -(2 ** 31) || Number.isNaN(v) ? -2147483648 : Math.trunc(v) // x86 cvttsd2si
function num_to_pdf(n: number): string {
  if (Math.abs(n) < 0.5e-6) return '0'
  let s = ''
  if (n < 0) { s = '-'; n = -n }
  n += 0.5e-6
  const ival = c_int(Math.floor(n))
  n -= ival
  s += String(ival)
  const fval = c_int(Math.floor(n * 1e6))
  return fval !== 0 ? s + '.' + String(fval).padStart(6, '0').replace(/0+$/, '') : s
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
      const d = decode_stream(s), head = String.fromCharCode(...d.subarray(d[0] === 0x80 ? 6 : 0, (d[0] === 0x80 ? 6 : 0) + 16))
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
  const objs = doc.objs, encodings: { names: (string | null)[], objnum: number }[] = []
  let last = 0 // pdflastbyte: the last byte of a pdf_puts (pdfout does not set it), for pdf_newline
  const puts = (s: string) => { pdf_print(e, s); if (s.length > 0) last = s.charCodeAt(s.length - 1) }
  const newline = () => { if (last !== 10) puts('\n') }
  const add = (type: number, r: PRef, fd: FdEntry | null, enc: number): number => { // addInObj
    if (r.num === 0) fail('PDF inclusion: invalid reference')
    const o = objs.find(p => p.num === r.num && p.gen === r.gen)
    if (o !== undefined) return o.newnum
    const n: InObj = { num: r.num, gen: r.gen, type, newnum: 0, fd, enc_objnum: enc, written: false }
    objs.push(n)
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
    const p = objs.find(q => q.num === r.num && q.gen === r.gen)
    if (p !== undefined) { copy_name(tag); puts(` ${p.newnum} 0 R `); return }
    // only included Type1 (and Type1C) fonts named in the font map are replaced; anything else is copied
    let fontdict: PObj = null, basefont: PObj = null, descref: PObj = null, desc: PObj = null, ff: PObj, fm: FmEntry | null = null
    if (ps.fixed_inclusion_copy_font === 0 && is_dict(fontdict = deref(x, r)) && is_name(lookup(fontdict, 'Subtype'), 'Type1')
      && is_name(basefont = lookup(fontdict, 'BaseFont')) && is_ref(descref = lookup_nf(fontdict, 'FontDescriptor')) && is_dict(desc = deref(x, descref))
      && (is_stream(lookup(desc, 'FontFile')) || (is_stream(ff = lookup(desc, 'FontFile3')) && is_name(lookup(ff.d, 'Subtype'), 'Type1C')))
      && (fm = lookup_fontmap(e, basefont.v)) !== null) {
      const stemv = lookup(desc, 'StemV')
      const fd = epdf_create_fontdescriptor(e, fm, cround(num(stemv))) // zround: the PDF's /StemV may be a real
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
      copy_stream(decode_stream(s as PStream))
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
  if (doc.occurences < 0 && !doc.released) { doc.objs = []; doc.released = true }
}

// writepng.c read_png_info (libpng's png_read_info: the chunks before IDAT)
function read_png_info(e: Engine, img: Img): void {
  const d = img.data, png: Png = { ct: 0, bd: 0, il: 0, palette: new Uint8Array(0), chunks: new Set(), gamma: 0 }
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
    png.chunks.add(t)
    if (t === 'IHDR') { img.width = u32(d, b); img.height = u32(d, b + 4); png.bd = d[b + 8]!; png.ct = d[b + 9]!; png.il = d[b + 12]! }
    else if (t === 'pHYs' && d[b + 8] === 1) { img.xres = cround(0.0254 * u32(d, b)); img.yres = cround(0.0254 * u32(d, b + 4)) } // png_get_x_pixels_per_meter is 0 unless the unit is the metre
    else if (t === 'PLTE') png.palette = d.subarray(b, b + len)
    else if (t === 'gAMA') png.gamma = u32(d, b)
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

// writepng.c write_png
function write_png(e: Engine, img: Img): void {
  const png = img.png!, ps = e.ps
  pdf_print(e, '/Type /XObject\n/Subtype /Image\n')
  if (png.chunks.has('tRNS')) fatal_error(e, `unsupported: PNG with tRNS ${img.name}`)
  const hicolor = ps.fixed_major === 1 && ps.fixed_minor < 5 ? 0 : ps.fixed_image_hicolor
  if (png.bd === 16 && hicolor === 0) fatal_error(e, `unsupported: 16-bit PNG without \\pdfimagehicolor ${img.name}`)
  if (ps.fixed_image_apply_gamma) fatal_error(e, `unsupported: \\pdfimageapplygamma with PNG ${img.name}`)
  if (png.il !== 0) fatal_error(e, `unsupported: interlaced PNG ${img.name}`)
  pdf_print(e, `/Width ${img.width}\n/Height ${img.height}\n/BitsPerComponent ${png.bd}\n`)
  pdf_print(e, '/ColorSpace ')
  const n_pal = Math.trunc(png.palette.length / 3)
  if ((ps.fixed_major > 1 || ps.fixed_minor > 1) && (png.ct === 0 || png.ct === 2) && (!png.chunks.has('gAMA') || png.gamma === 100000)
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
  // write_png_palette makes the palette object even when an explicit colorspace leaves it unreferenced
  let palette_objnum = 0
  if (png.ct === 3) { pdf_create_obj(e, 0, 0); palette_objnum = ps.obj_ptr }
  if (img.colorspace_ref !== 0) pdf_print(e, `${img.colorspace_ref} 0 R\n`)
  else if (png.ct === 3) pdf_print(e, `[/Indexed /DeviceRGB ${n_pal - 1} ${palette_objnum} 0 R]\n`)
  else pdf_print_ln(e, png.ct === 0 || png.ct === 4 ? '/DeviceGray' : '/DeviceRGB')
  // gray+alpha and RGB+alpha: below PDF 1.4 png_set_strip_alpha drops the alpha samples, from 1.4 on they become an /SMask
  const alpha = png.ct === 4 || png.ct === 6, smask = alpha && (ps.fixed_major > 1 || ps.fixed_minor >= 4)
  let smask_objnum = 0
  if (smask) { pdf_create_obj(e, 0, 0); smask_objnum = ps.obj_ptr; pdf_print(e, `/SMask ${smask_objnum} 0 R\n`) }
  const rows = png_rows(e, img), color: number[] = [], mask: number[] = []
  if (alpha) {
    const n = png.ct === 4 ? 1 : 3, sample = png.bd >> 3 // 8 or 16 bits (16 only with \pdfimagehicolor, PDF >= 1.5)
    for (let j = 0; j < rows.length; j++) ((j / sample | 0) % (n + 1) < n ? color : mask).push(rows[j]!)
  }
  pdf_begin_stream(e)
  pdf_print(e, alpha ? color : Array.from(rows))
  pdf_end_stream(e)
  if (smask_objnum > 0) {
    pdf_begin_dict(e, smask_objnum, 0)
    pdf_print(e, `/Type /XObject\n/Subtype /Image\n/Width ${img.width}\n/Height ${img.height}\n/BitsPerComponent ${png.bd === 16 ? 8 : png.bd}\n`)
    pdf_print(e, '/ColorSpace /DeviceGray\n')
    pdf_begin_stream(e)
    pdf_print(e, png.bd === 16 ? mask.filter((_, i) => i % 2 === 0) : mask)
    pdf_end_stream(e)
  }
  if (palette_objnum > 0) {
    pdf_begin_dict(e, palette_objnum, 0)
    pdf_begin_stream(e)
    pdf_print(e, Array.from(png.palette.subarray(0, 3 * n_pal)))
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

// libpng png_read_row for a non-interlaced image: inflate the IDAT data and undo the per-row filters
function png_rows(e: Engine, img: Img): Uint8Array {
  const png = img.png!, d = img.data
  const channels = [1, 0, 3, 1, 2, 0, 4][png.ct]!, bpp = Math.max(1, (channels * png.bd) >> 3), rowbytes = Math.ceil(img.width * channels * png.bd / 8)
  const size = (rowbytes + 1) * img.height, z = new Uint8Array(d.length)
  let n = 0
  for (let i = 8; i + 8 <= d.length;) {
    const len = u32(d, i), t = tag(d, i + 4)
    if (t === 'IDAT') { z.set(d.subarray(i + 8, i + 8 + len), n); n += len }
    i += 12 + len
  }
  if (e.fs.inflate === undefined) fatal_error(e, 'unsupported: PNG decoding without an inflater')
  const raw = e.fs.inflate(z.subarray(0, n), size)
  if (raw.length < size) pdftex_fail(e, img.name, 'libpng: internal error')
  const out = new Uint8Array(rowbytes * img.height)
  for (let y = 0; y < img.height; y++) {
    const f = raw[y * (rowbytes + 1)]!, src = y * (rowbytes + 1) + 1, o = y * rowbytes, up = o - rowbytes
    for (let x = 0; x < rowbytes; x++) {
      const a = x >= bpp ? out[o + x - bpp]! : 0, b = y > 0 ? out[up + x]! : 0, c = x >= bpp && y > 0 ? out[up + x - bpp]! : 0
      let v = raw[src + x]!
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      else if (f !== 0) pdftex_fail(e, img.name, 'libpng: internal error')
      out[o + x] = v & 255
    }
  }
  // png_combine_row copies a row into a fresh buffer: the padding bits are zero there (the filters saw the file's bits)
  const used = (img.width * channels * png.bd) % 8
  if (used !== 0) for (let o = rowbytes - 1; o < out.length; o += rowbytes) out[o]! &= 0xff00 >> used
  return out
}
