// writeimg.c readimage/writeimage, pdftoepdf.cc read_pdf_info (page count, boxes, rotation; copying the page is unsupported),
// writepng.c (read_png_info, write_png: the copy path and the decoded write_png_gray/rgb/palette/gray_alpha/rgb_alpha
// paths), writejpg.c (read_jpg_info incl. JFIF/Exif resolution, write_jpg). libpng's work is done here: chunks are parsed and
// CRC-checked, IDAT is inflated by the platform (TexFS.inflate), the rows unfiltered, alpha stripped below PDF 1.4.
// PDF/JBIG2 inclusion, interlaced, tRNS, gamma-applied and 16-to-8-bit PNGs are unsupported.
import type { Engine } from '../engine.ts'
import { print } from '../print.ts'
import { fatal_error } from '../error.ts'
import { int_base } from '../types.ts'
import { pdftex_fail, pdftex_warn, pdf_print, pdf_print_ln, pdf_begin_stream, pdf_end_stream, pdf_create_obj, pdf_begin_dict, pdf_begin_obj, pdf_end_obj,
  pdf_new_objnum } from '../pdf.ts'

export const IMAGE_COLOR_B = 1, IMAGE_COLOR_C = 2, IMAGE_COLOR_I = 4
type Png = { ct: number, bd: number, il: number, palette: Uint8Array, chunks: Set<string>, gamma: number }
export type Img = { name: string, data: Uint8Array, type: 'png' | 'jpg' | 'pdf', orig_x: number, orig_y: number, color: number, width: number, height: number, xres: number, yres: number,
  pages: number, colorspace_ref: number, group_ref: number, rotate: number, bpc: number, jpg_color_space: number, png: Png | null }

const u16 = (d: Uint8Array, i: number) => (d[i]! << 8) | d[i + 1]!
const u32 = (d: Uint8Array, i: number) => ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0
const tag = (d: Uint8Array, i: number) => String.fromCharCode(d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!)
const cround = (x: number) => x < 0 ? -Math.round(-x) : Math.round(x) // C round(): halves away from zero

// writeimg.c readimage (checktypebyheader, then checktypebyextension)
export function read_image(e: Engine, s: string, page: number, named: boolean, colorspace: number, pagebox: number): Img {
  const data = e.fs.find(s, 'tex'), name = e.fs.path?.(s, 'tex') ?? s
  if (data === null) pdftex_fail(e, null, `cannot find image file ${s}`)
  const img: Img = { name, data, type: 'png', orig_x: 0, orig_y: 0, color: 0, width: 0, height: 0, xres: 0, yres: 0, pages: 1, colorspace_ref: colorspace,
    group_ref: 0, rotate: 0, bpc: 0, jpg_color_space: 0, png: null }
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

// pdftoepdf.cc read_pdf_info with the little of xpdf it needs: objects are found by scanning for `n g obj' and inside object
// streams (shortcut: no xref parsing, the last definition of a number wins; a damaged or encrypted file may be read where xpdf fails)
type PdfVal = number | string | boolean | null | PdfVal[] | { [k: string]: PdfVal } | { ref: number }
function read_pdf_info(e: Engine, img: Img, page_num: number, pagebox: number): void {
  const d = img.data, src = String.fromCharCode(...d.subarray(0, Math.min(d.length, 1024)))
  const fail = () => pdftex_fail(e, img.name, 'xpdf: reading PDF image failed')
  const hv = /%PDF-(\d+)\.(\d+)/.exec(src)
  if (hv === null) fail()
  const text = Array.from(d, c => String.fromCharCode(c)).join('')
  const offs = new Map<number, number | PdfVal>()
  for (const m of text.matchAll(/(?<![0-9])(\d+)\s+\d+\s+obj\b/g)) offs.set(+m[1]!, m.index! + m[0].length)
  const parse = (t: string, i: number): [PdfVal, number] => {
    const ws = () => { for (;;) { while (i < t.length && /[\0\t\n\f\r ]/.test(t[i]!)) i++; if (t[i] === '%') { while (i < t.length && t[i] !== '\n' && t[i] !== '\r') i++ } else return } }
    const val = (): PdfVal => {
      ws()
      const c = t[i]
      if (c === '<' && t[i + 1] === '<') {
        i += 2; const o: { [k: string]: PdfVal } = {}
        for (;;) { ws(); if (t[i] === '>' || i >= t.length) { i += 2; return o } const k = val(); o[String(k)] = val() }
      }
      if (c === '[') { i++; const a: PdfVal[] = []; for (;;) { ws(); if (t[i] === ']' || i >= t.length) { i++; return a } a.push(val()) } }
      if (c === '/') { const m = /^\/[^\0\t\n\f\r ()<>\[\]{}/%]*/.exec(t.slice(i, i + 256))!; i += m[0].length; return m[0].slice(1) }
      if (c === '(') { let n = 0; do { if (t[i] === '\\') i++; else if (t[i] === '(') n++; else if (t[i] === ')') n--; i++ } while (n > 0 && i < t.length); return '' }
      if (c === '<') { i = t.indexOf('>', i) + 1 || t.length; return '' }
      const m = /^(?:([+-]?\d+)\s+(\d+)\s+R\b|[+-]?(?:\d+\.?\d*|\.\d+)|true|false|null)/.exec(t.slice(i, i + 64))
      if (m === null) { i = t.length; return null }
      i += m[0].length
      return m[1] !== undefined ? { ref: +m[1] } : m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : +m[0]
    }
    const v = val(); return [v, i]
  }
  const obj = (n: number, depth = 0): PdfVal => {
    const o = offs.get(n)
    if (o === undefined || depth > 32) return null
    if (typeof o !== 'number') return o
    return parse(text, o)[0]
  }
  const deref = (v: PdfVal | undefined, depth = 0): PdfVal => v !== null && typeof v === 'object' && 'ref' in v && depth < 32 ? deref(obj(v.ref as number), depth + 1) : v ?? null
  const dict = (v: PdfVal | undefined) => { const r = deref(v); return r !== null && typeof r === 'object' && !Array.isArray(r) && !('ref' in r) ? r as { [k: string]: PdfVal } : null }
  // object streams: the objects inside a /Type /ObjStm stream
  for (const [, o] of [...offs]) {
    if (typeof o !== 'number') continue
    const [h, j] = parse(text, o), hd = dict(h)
    if (hd === null || hd.Type !== 'ObjStm') continue
    const k = text.indexOf('stream', j), start = k + 6 + (text[k + 6] === '\r' ? 2 : 1), len = deref(hd.Length)
    if (k < 0 || typeof len !== 'number' || e.fs.inflate === undefined) continue
    const body = e.fs.inflate(d.subarray(start, start + len), 1 << 24), bt = Array.from(body, c => String.fromCharCode(c)).join('')
    const first = deref(hd.First), nums = bt.slice(0, typeof first === 'number' ? first : 0).trim().split(/\s+/).map(Number)
    for (let q = 0; q + 1 < nums.length; q += 2) if (!offs.has(nums[q]!) || typeof offs.get(nums[q]!) === 'number')
      offs.set(nums[q]!, parse(bt, (first as number) + nums[q + 1]!)[0])
  }
  const roots = [...text.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)], root = dict(roots.length > 0 ? { ref: +roots[roots.length - 1]![1]! } : null)
  const pages = dict(root?.Pages)
  if (pages === null) fail()
  // PDF version check (xpdf getPDFVersion: the header's)
  const found = +hv![1]! + +hv![2]! * 0.1, wanted = e.ps.fixed_major + e.ps.fixed_minor * 0.1, level = e.equiv[int_base + 78]!
  if (Math.fround(found) > Math.fround(wanted) + 0.01) {
    const msg = `PDF inclusion: found PDF version <${found.toFixed(1)}>, but at most version <${wanted.toFixed(1)}> allowed`
    if (level > 0) pdftex_fail(e, img.name, msg); else if (level === 0) pdftex_warn(e, img.name, msg)
  }
  const count = deref(pages!.Count)
  img.pages = typeof count === 'number' ? count : 0
  if (page_num <= 0 || page_num > img.pages) pdftex_fail(e, img.name, `PDF inclusion: required page does not exist <${img.pages}>`)
  // find the page, collecting the inherited attributes (xpdf PageAttrs)
  let node = pages!, n = page_num, inh: { [k: string]: PdfVal } = {}
  for (let guard = 0; ; guard++) {
    for (const k of ['MediaBox', 'CropBox', 'Rotate']) if (node[k] !== undefined) inh[k] = deref(node[k])
    if (node.Type === 'Page' || guard > 64) break
    const kids = deref(node.Kids)
    if (!Array.isArray(kids)) fail()
    let next: { [k: string]: PdfVal } | null = null
    for (const kid of kids as PdfVal[]) {
      const kd = dict(kid)
      if (kd === null) continue
      const c = kd.Type === 'Pages' ? deref(kd.Count) as number : 1
      if (n <= c) { next = kd; break }
      n -= c
    }
    if (next === null) fail()
    node = next!
  }
  const box = (v: PdfVal | undefined): number[] | null => {
    const a = deref(v)
    if (!Array.isArray(a) || a.length !== 4) return null
    const [x1, y1, x2, y2] = a.map(x => Number(deref(x)))
    return [Math.min(x1!, x2!), Math.min(y1!, y2!), Math.max(x1!, x2!), Math.max(y1!, y2!)]
  }
  const media = box(inh.MediaBox) ?? [0, 0, 612, 792]
  const crop = box(inh.CropBox) ?? media.slice() // xpdf only clips it to the MediaBox (clipBoxes), no poppler-style widening
  const other = (k: string) => box(node[k]) ?? crop!.slice()
  const clip = (b: number[]) => [Math.max(b[0]!, media[0]!), Math.max(b[1]!, media[1]!), Math.min(b[2]!, media[2]!), Math.min(b[3]!, media[3]!)]
  const b = pagebox === 1 ? media : clip(pagebox === 2 ? crop : pagebox === 3 ? other('BleedBox') : pagebox === 4 ? other('TrimBox') : other('ArtBox'))
  const f = Math.fround, bp2int = (p: number) => cround(p * (6578176 / 100.0)) // float epdf_* then bp2int
  img.orig_x = bp2int(f(b[0]!)); img.orig_y = bp2int(f(b[1]!))
  img.width = bp2int(f(b[2]! - b[0]!)); img.height = bp2int(f(b[3]! - b[1]!))
  const rot = deref(inh.Rotate)
  img.rotate = typeof rot === 'number' ? ((Math.trunc(rot) % 360) + 360) % 360 : 0
  img.group_ref = node.Group !== undefined ? -1 : 0
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
  if (img.type === 'pdf') fatal_error(e, 'unsupported: PDF image inclusion (write_epdf)')
  if (img.type === 'png') write_png(e, img); else write_jpg(e, img)
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
