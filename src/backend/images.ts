// writeimg.c readimage/writeimage, writepng.c (read_png_info, write_png: the copy path and the decoded write_png_gray/rgb/palette
// paths), writejpg.c (read_jpg_info incl. JFIF/Exif resolution, write_jpg). libpng's work is done here: chunks are parsed,
// IDAT is inflated by the platform (TexFS.inflate) and the rows unfiltered. PDF/JBIG2 inclusion, interlaced, alpha, tRNS,
// gamma-applied and 16-to-8-bit PNGs are unsupported.
import type { Engine } from '../engine.ts'
import { print } from '../print.ts'
import { fatal_error } from '../error.ts'
import { pdftex_fail, pdf_print, pdf_print_ln, pdf_begin_stream, pdf_end_stream, pdf_create_obj, pdf_begin_dict } from '../pdf.ts'

export const IMAGE_COLOR_B = 1, IMAGE_COLOR_C = 2, IMAGE_COLOR_I = 4
type Png = { ct: number, bd: number, il: number, palette: Uint8Array, chunks: Set<string>, gamma: number }
export type Img = { name: string, data: Uint8Array, type: 'png' | 'jpg', color: number, width: number, height: number, xres: number, yres: number,
  pages: number, colorspace_ref: number, group_ref: number, rotate: number, bpc: number, jpg_color_space: number, png: Png | null }

const u16 = (d: Uint8Array, i: number) => (d[i]! << 8) | d[i + 1]!
const u32 = (d: Uint8Array, i: number) => ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0
const tag = (d: Uint8Array, i: number) => String.fromCharCode(d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!)
const cround = (x: number) => x < 0 ? -Math.round(-x) : Math.round(x) // C round(): halves away from zero

// writeimg.c readimage (checktypebyheader, then checktypebyextension)
export function read_image(e: Engine, s: string, colorspace: number): Img {
  const data = e.fs.find(s, 'tex'), name = e.fs.path?.(s, 'tex') ?? s
  if (data === null) pdftex_fail(e, null, `cannot find image file ${s}`)
  const img: Img = { name, data, type: 'png', color: 0, width: 0, height: 0, xres: 0, yres: 0, pages: 1, colorspace_ref: colorspace,
    group_ref: 0, rotate: 0, bpc: 0, jpg_color_space: 0, png: null }
  if (data.length < 8) pdftex_fail(e, name, 'reading image file failed')
  const head = String.fromCharCode(...data.subarray(0, 8)), ext = /\.[^.]*$/.exec(s)?.[0].toLowerCase()
  const type = head.startsWith('\xFF\xD8') ? 'jpg' : head === '\x89PNG\r\n\x1A\n' ? 'png' : head === '\x97JB2\r\n\x1A\n' ? 'jbig2'
    : head.startsWith('%PDF-1.') ? 'pdf' : ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpg'
    : ext === '.jbig2' || ext === '.jb2' ? 'jbig2' : ext === '.pdf' ? 'pdf' : 'none'
  if (type === 'pdf') fatal_error(e, 'unsupported: PDF image inclusion')
  if (type === 'jbig2') fatal_error(e, 'unsupported: JBIG2 image inclusion')
  if (type === 'none') pdftex_fail(e, name, 'unknown type of image')
  img.type = type
  if (type === 'png') read_png_info(e, img); else read_jpg_info(e, img)
  return img
}

// writepng.c read_png_info (libpng's png_read_info: the chunks before IDAT)
function read_png_info(e: Engine, img: Img): void {
  const d = img.data, png: Png = { ct: 0, bd: 0, il: 0, palette: new Uint8Array(0), chunks: new Set(), gamma: 0 }
  img.png = png
  for (let i = 8; i + 8 <= d.length;) {
    const len = u32(d, i), t = tag(d, i + 4), b = i + 8
    if (b + len > d.length) pdftex_fail(e, img.name, 'libpng: internal error')
    png.chunks.add(t)
    if (t === 'IHDR') { img.width = u32(d, b); img.height = u32(d, b + 4); png.bd = d[b + 8]!; png.ct = d[b + 9]!; png.il = d[b + 12]! }
    else if (t === 'pHYs' && d[b + 8] === 1) { img.xres = cround(0.0254 * u32(d, b)); img.yres = cround(0.0254 * u32(d, b + 4)) } // png_get_x_pixels_per_meter is 0 unless the unit is the metre
    else if (t === 'PLTE') png.palette = d.subarray(b, b + len)
    else if (t === 'gAMA') png.gamma = u32(d, b)
    else if (t === 'IEND') break
    i = b + len + 4
  }
  switch (png.ct) {
    case 3: img.color = IMAGE_COLOR_C | IMAGE_COLOR_I; break
    case 0: case 4: img.color = IMAGE_COLOR_B; break
    case 2: case 6: img.color = IMAGE_COLOR_C; break
    default: pdftex_fail(e, img.name, `unsupported type of color_type <${png.ct}>`)
  }
  if ((e.ps.fixed_major > 1 || e.ps.fixed_minor >= 4) && (png.ct === 4 || png.ct === 6)) fatal_error(e, `unsupported: PNG with alpha channel ${img.name}`)
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
  for (let i = 0; ;) {
    if (!(i < d.length)) pdftex_fail(e, img.name, 'reading JPEG image failed (premature file end)')
    if (d[i++] !== 0xFF) pdftex_fail(e, img.name, 'reading JPEG image failed (no marker found)')
    const m = d[i++]!
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
    i += u16(d, i)
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
  let palette_objnum = 0
  if (img.colorspace_ref !== 0) pdf_print(e, `${img.colorspace_ref} 0 R\n`)
  else if (png.ct === 3) { pdf_create_obj(e, 0, 0); palette_objnum = ps.obj_ptr; pdf_print(e, `[/Indexed /DeviceRGB ${n_pal - 1} ${palette_objnum} 0 R]\n`) }
  else pdf_print_ln(e, png.ct === 0 ? '/DeviceGray' : '/DeviceRGB')
  pdf_begin_stream(e)
  pdf_print(e, Array.from(png_rows(e, img)))
  pdf_end_stream(e)
  if (palette_objnum > 0) {
    pdf_begin_dict(e, palette_objnum, 0)
    pdf_begin_stream(e)
    pdf_print(e, Array.from(png.palette.subarray(0, 3 * n_pal)))
    pdf_end_stream(e)
  }
}

// libpng png_read_row for a non-interlaced image: inflate the IDAT data and undo the per-row filters
function png_rows(e: Engine, img: Img): Uint8Array {
  const png = img.png!, d = img.data
  const channels = png.ct === 2 ? 3 : 1, bpp = Math.max(1, (channels * png.bd) >> 3), rowbytes = Math.ceil(img.width * channels * png.bd / 8)
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
  return out
}
