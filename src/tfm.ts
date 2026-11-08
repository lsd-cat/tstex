// §539–582 font metric data: TFM loading into font_info, character metrics, \fontdimen
// font_info is one global array of words as in tex.web; four-quarter words are packed as b0<<24|b1<<16|b2<<8|b3.
import type { Engine } from './engine.ts'
import { Cmd, cur_font_loc } from './types.ts'
import { print, print_char, print_int, print_nl, print_esc, print_hex, slow_print, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_scaled, xn_over_d, unity } from './arith.ts'
import { error, print_err, help, overflow } from './error.ts'
import { int_par, font_id_base } from './eqtb.ts'
import { sprint_cs } from './hash.ts'
import { print_file_name } from './files.ts'
import { delete_glue_ref, new_char } from './nodes.ts'
import type { CharNode } from './nodes.ts'
import { get_x_token } from './expand.ts'
import { back_error } from './input.ts'
import { scan_int, scan_four_bit_int } from './scan.ts'

export const null_font = 0, non_char = 256, non_address = 0
export const no_tag = 0, lig_tag = 1, list_tag = 2, ext_tag = 3 // §544
export const stop_flag = 128, kern_flag = 128 // §545
const kern_base_offset = 256 * 128
export const slant_code = 1, space_code = 2, space_stretch_code = 3, space_shrink_code = 4, x_height_code = 5, quad_code = 6,
  extra_space_code = 7 // §547
const tracing_lost_chars_code = 35, default_hyphen_char_code = 46, default_skew_char_code = 47

// §554 the four quarters of a word
export const b0 = (w: number) => (w >>> 24) & 255
export const b1 = (w: number) => (w >>> 16) & 255
export const b2 = (w: number) => (w >>> 8) & 255
export const b3 = (w: number) => w & 255
export const skip_byte = b0, next_char = b1, op_byte = b2, rem_byte = b3

// §554 char_info and friends
export const char_info = (e: Engine, f: number, c: number): number => e.font_info[e.char_base[f]! + c] ?? 0
export const char_exists = (i: number) => b0(i) > 0
export const char_width = (e: Engine, f: number, i: number): number => e.font_info[e.width_base[f]! + b0(i)]!
export const char_italic = (e: Engine, f: number, i: number): number => e.font_info[e.italic_base[f]! + (b2(i) >> 2)]!
export const height_depth = b1
export const char_height = (e: Engine, f: number, hd: number): number => e.font_info[e.height_base[f]! + (hd >> 4)]!
export const char_depth = (e: Engine, f: number, hd: number): number => e.font_info[e.depth_base[f]! + (hd & 15)]!
export const char_tag = (i: number) => b2(i) & 3
// §557
export const char_kern = (e: Engine, f: number, j: number): number => e.font_info[e.kern_base[f]! + 256 * op_byte(j) + rem_byte(j)]!
export const lig_kern_start = (e: Engine, f: number, i: number): number => e.lig_kern_base[f]! + rem_byte(i)
export const lig_kern_restart = (e: Engine, f: number, j: number): number =>
  e.lig_kern_base[f]! + 256 * op_byte(j) + rem_byte(j) + 32768 - kern_base_offset
// §558
export const param = (e: Engine, n: number, f: number): number => e.font_info[n + e.param_base[f]!]!

// §552 Initialize table entries: the null font
export function init_fonts(e: Engine): void {
  e.font_ptr = null_font; e.fmem_ptr = 7; e.font_info = [0, 0, 0, 0, 0, 0, 0]
  e.font_name[0] = 'nullfont'; e.font_area[0] = ''; e.hyphen_char[0] = 45; e.skew_char[0] = -1
  e.bchar_label[0] = non_address; e.font_bchar[0] = non_char; e.font_false_bchar[0] = non_char
  e.font_bc[0] = 1; e.font_ec[0] = 0; e.font_size[0] = 0; e.font_dsize[0] = 0
  e.char_base[0] = 0; e.width_base[0] = 0; e.height_base[0] = 0; e.depth_base[0] = 0; e.italic_base[0] = 0
  e.lig_kern_base[0] = 0; e.kern_base[0] = 0; e.exten_base[0] = 0; e.font_glue[0] = 0; e.font_params[0] = 7
  e.param_base[0] = -1; e.font_check[0] = 0; e.font_used[0] = false
}

// §560 read_font_info; returns the internal font number, null_font on failure
export function read_font_info(e: Engine, u: number, nom: string, aire: string, s: number): number {
  const fi = e.font_info
  let file_opened = false, g = null_font
  // §561 start_font_error_message
  const start_font_error_message = () => {
    print_err(e, 'Font '); sprint_cs(e, u); print_char(e, 61); print_file_name(e, nom, aire, '')
    if (s >= 0) { print(e, ' at '); print_scaled(e, s); print(e, 'pt') }
    else if (s !== -1000) { print(e, ' scaled '); print_int(e, -s) }
  }
  done: {
    bad_tfm: {
      // §563 Open tfm_file for input (tex.ch: kpathsea appends .tfm to area+name; the extension is dropped)
      if (nom.length > 255 || aire.length > 255) break bad_tfm
      const data = e.fs.find(aire + nom + '.tfm', 'tfm')
      if (data === null) break bad_tfm
      file_opened = true
      // §564 fget/fbyte (tex.ch: the first byte is read at open; reading past the end sets eof)
      let pos = 0, eof = data.length === 0, fbyte = eof ? -1 : data[0]!
      const fget = () => { pos++; if (pos < data.length) fbyte = data[pos]!; else { fbyte = -1; eof = true } }
      const read_sixteen = (): number => {
        let x = fbyte
        if (x > 127) throw bad
        fget(); x = x * 256 + fbyte
        return x
      }
      let a = 0, b = 0, c = 0, d = 0
      const store_four_quarters = (): number => {
        fget(); a = fbyte; fget(); b = fbyte; fget(); c = fbyte; fget(); d = fbyte
        return ((a & 255) << 24 | (b & 255) << 16 | (c & 255) << 8 | (d & 255)) | 0
      }
      const bad = {}
      try {
        // §565 Read the TFM size fields
        let lf = read_sixteen(); fget(); let lh = read_sixteen(); fget(); let bc = read_sixteen(); fget(); let ec = read_sixteen()
        if (bc > ec + 1 || ec > 255) throw bad
        if (bc > 255) { bc = 1; ec = 0 }
        fget(); const nw = read_sixteen(); fget(); const nh = read_sixteen(); fget(); const nd = read_sixteen()
        fget(); const ni = read_sixteen(); fget(); const nl = read_sixteen(); fget(); const nk = read_sixteen()
        fget(); const ne = read_sixteen(); fget(); const np = read_sixteen()
        if (lf !== 6 + lh + (ec - bc + 1) + nw + nh + nd + ni + nl + nk + ne + np) throw bad
        if (nw === 0 || nh === 0 || nd === 0 || ni === 0) throw bad
        // §566 Use size fields to allocate font information
        lf = lf - 6 - lh
        if (np < 7) lf = lf + 7 - np
        if (e.font_ptr === e.lim.font_max || e.fmem_ptr + lf > e.lim.font_mem_size) { // §567
          start_font_error_message(); print(e, ' not loaded: Not enough room left')
          help(e, "I'm afraid I won't be able to make use of this font,", 'because my memory for character-size data is too small.',
            "If you're really stuck, ask a wizard to enlarge me.", "Or maybe try `I\\font<same font id>=<name of loaded font>'.")
          error(e); break done
        }
        const f = e.font_ptr + 1
        e.char_base[f] = e.fmem_ptr - bc
        e.width_base[f] = e.char_base[f]! + ec + 1
        e.height_base[f] = e.width_base[f]! + nw
        e.depth_base[f] = e.height_base[f]! + nh
        e.italic_base[f] = e.depth_base[f]! + nd
        e.lig_kern_base[f] = e.italic_base[f]! + ni
        e.kern_base[f] = e.lig_kern_base[f]! + nl - kern_base_offset
        e.exten_base[f] = e.kern_base[f]! + kern_base_offset + nk
        e.param_base[f] = e.exten_base[f]! + ne
        // §568 Read the TFM header
        if (lh < 2) throw bad
        e.font_check[f] = store_four_quarters()
        fget(); let z = read_sixteen()
        fget(); z = z * 256 + fbyte; fget(); z = z * 16 + (fbyte >> 4)
        if (z < unity) throw bad
        while (lh > 2) { fget(); fget(); fget(); fget(); lh-- }
        e.font_dsize[f] = z
        if (s !== -1000) {
          if (s >= 0) z = s
          else { // tex.ch [30.568] Avoid scaling fonts to 2048pt or more
            const save_arith_error = e.arith_error, sw = z
            z = xn_over_d(e, z, -s, 1000)
            if (e.arith_error || z >= 0o1000000000) {
              start_font_error_message(); print(e, ' scaled to 2048pt or higher')
              help(e, 'I will ignore the scaling factor.'); error(e); z = sw
            }
            e.arith_error = save_arith_error
          }
        }
        e.font_size[f] = z
        // §569 Read character data
        for (let k = e.fmem_ptr; k <= e.width_base[f]! - 1; k++) {
          fi[k] = store_four_quarters()
          if (a >= nw || (b >> 4) >= nh || (b & 15) >= nd || (c >> 2) >= ni) throw bad
          switch (c & 3) {
            case lig_tag: if (d >= nl) throw bad; break
            case ext_tag: if (d >= ne) throw bad; break
            case list_tag: { // §570 Check for charlist cycle
              if (d < bc || d > ec) throw bad
              const current = k + bc - e.fmem_ptr
              while (d < current) {
                const qw = fi[e.char_base[f]! + d]!
                if (char_tag(qw) !== list_tag) break
                d = rem_byte(qw)
              }
              if (d === current) throw bad
            }
          }
        }
        // §571 Read box dimensions; §572 Replace z by z' and compute alpha, beta
        let alpha = 16
        while (z >= 0o40000000) { z = z >> 1; alpha = alpha + alpha }
        const beta = 256 / alpha; alpha = alpha * z
        const store_scaled = (): number => {
          fget(); a = fbyte; fget(); b = fbyte; fget(); c = fbyte; fget(); d = fbyte
          const sw = Math.trunc((Math.trunc((Math.trunc((d * z) / 256) + c * z) / 256) + b * z) / beta)
          if (a === 0) return sw
          if (a === 255) return sw - alpha
          throw bad
        }
        for (let k = e.width_base[f]!; k <= e.lig_kern_base[f]! - 1; k++) fi[k] = store_scaled()
        if (fi[e.width_base[f]!] !== 0 || fi[e.height_base[f]!] !== 0 || fi[e.depth_base[f]!] !== 0 || fi[e.italic_base[f]!] !== 0) throw bad
        // §573 Read ligature/kern program
        const check_existence = (ch: number) => {
          if (ch < bc || ch > ec) throw bad
          if (!char_exists(fi[e.char_base[f]! + ch]!)) throw bad
        }
        let bch_label = 0o77777, bchar = 256
        if (nl > 0) {
          for (let k = e.lig_kern_base[f]!; k <= e.kern_base[f]! + kern_base_offset - 1; k++) {
            fi[k] = store_four_quarters()
            if (a > 128) {
              if (256 * c + d >= nl) throw bad
              if (a === 255 && k === e.lig_kern_base[f]) bchar = b
            } else {
              if (b !== bchar) check_existence(b)
              if (c < 128) check_existence(d)
              else if (256 * (c - 128) + d >= nk) throw bad
              if (a < 128 && k - e.lig_kern_base[f]! + a + 1 >= nl) throw bad
            }
          }
          if (a === 255) bch_label = 256 * c + d
        }
        for (let k = e.kern_base[f]! + kern_base_offset; k <= e.exten_base[f]! - 1; k++) fi[k] = store_scaled()
        // §574 Read extensible character recipes
        for (let k = e.exten_base[f]!; k <= e.param_base[f]! - 1; k++) {
          fi[k] = store_four_quarters()
          if (a !== 0) check_existence(a)
          if (b !== 0) check_existence(b)
          if (c !== 0) check_existence(c)
          check_existence(d)
        }
        // §575 Read font parameters
        for (let k = 1; k <= np; k++) {
          if (k === 1) {
            fget(); let sw = fbyte; if (sw > 127) sw = sw - 256
            fget(); sw = sw * 256 + fbyte; fget(); sw = sw * 256 + fbyte
            fget(); fi[e.param_base[f]!] = (sw * 16 + (fbyte >> 4)) | 0
          } else fi[e.param_base[f]! + k - 1] = store_scaled()
        }
        if (eof) throw bad
        for (let k = np + 1; k <= 7; k++) fi[e.param_base[f]! + k - 1] = 0
        // §576 Make final adjustments and goto done
        e.font_params[f] = np >= 7 ? np : 7
        e.hyphen_char[f] = int_par(e, default_hyphen_char_code); e.skew_char[f] = int_par(e, default_skew_char_code)
        e.bchar_label[f] = bch_label < nl ? bch_label + e.lig_kern_base[f]! : non_address
        e.font_bchar[f] = bchar; e.font_false_bchar[f] = bchar
        if (bchar <= ec && bchar >= bc && char_exists(fi[e.char_base[f]! + bchar]!)) e.font_false_bchar[f] = non_char
        e.font_name[f] = nom; e.font_area[f] = aire
        e.font_bc[f] = bc; e.font_ec[f] = ec; e.font_glue[f] = 0; e.font_used[f] = false
        e.param_base[f]!--
        e.fmem_ptr += lf; e.font_ptr = f; g = f
        break done
      } catch (x) { if (x !== bad) throw x }
    }
    // §561 Report that the font won't be loaded
    start_font_error_message()
    if (file_opened) print(e, ' not loadable: Bad metric (TFM) file')
    else if (nom.length > 255 || aire.length > 255) print(e, ' not loadable: Metric (TFM) file name too long')
    else print(e, ' not loadable: Metric (TFM) file not found')
    help(e, "I wasn't able to read the size data for this font,", 'so I will ignore the font specification.',
      '[Wizards can fix TFM files using TFtoPL/PLtoTF.]', 'You might try inserting a different font spec;',
      "e.g., type `I\\font<same font id>=<substitute font name>'.")
    error(e)
  }
  return g
}

// §577 scan_font_ident
export function scan_font_ident(e: Engine): void {
  let f: number
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer) // §406
  if (e.cur_cmd === Cmd.def_font || e.cur_cmd === Cmd.letterspace_font || e.cur_cmd === Cmd.pdf_copy_font) f = e.equiv[cur_font_loc]!
  else if (e.cur_cmd === Cmd.set_font) f = e.cur_chr
  else if (e.cur_cmd === Cmd.def_family) { const m = e.cur_chr; scan_four_bit_int(e); f = e.equiv[m + e.cur_val]! }
  else {
    print_err(e, 'Missing font identifier')
    help(e, 'I was looking for a control sequence whose', 'current meaning has been defined by \\font.')
    back_error(e); f = null_font
  }
  e.cur_val = f
}

// §578 find_font_dimen; sets cur_val to a font_info location
export function find_font_dimen(e: Engine, writing: boolean): void {
  scan_int(e); const n = e.cur_val; scan_font_ident(e); const f = e.cur_val
  if (n <= 0) e.cur_val = e.fmem_ptr
  else {
    if (writing && n <= space_shrink_code && n >= space_code && e.font_glue[f] !== 0) {
      delete_glue_ref(e, e.font_glue[f]!); e.font_glue[f] = 0
    }
    if (n > e.font_params[f]!) {
      if (f < e.font_ptr) e.cur_val = e.fmem_ptr
      else { // §580 Increase the number of parameters in the last font
        do {
          if (e.fmem_ptr === e.lim.font_mem_size) overflow(e, 'font memory', e.lim.font_mem_size)
          e.font_info[e.fmem_ptr] = 0; e.fmem_ptr++; e.font_params[f]!++
        } while (n !== e.font_params[f])
        e.cur_val = e.fmem_ptr - 1
      }
    } else e.cur_val = n + e.param_base[f]!
  }
  if (e.cur_val === e.fmem_ptr) { // §579
    print_err(e, 'Font '); print_esc(e, e.text.get(font_id_base + f) ?? 0)
    print(e, ' has only '); print_int(e, e.font_params[f]!); print(e, ' fontdimen parameters')
    help(e, 'To increase the number of font parameters, you must', 'use \\fontdimen immediately after the \\font is loaded.')
    error(e)
  }
}

// §581 char_warning (TeX Live: \tracinglostchars>2 makes it an error with the hex code)
export function char_warning(e: Engine, f: number, c: number): void {
  const t = int_par(e, tracing_lost_chars_code)
  if (t <= 0) return
  if (t > 2) print_err(e, 'Missing character: There is no ')
  else { begin_diagnostic(e); print_nl(e, 'Missing character: There is no ') }
  print(e, c)
  if (t > 2) { print(e, ' ('); print_hex(e, c); print(e, ')') }
  print(e, ' in font '); slow_print(e, e.font_name[f]!)
  if (t < 3) print_char(e, 33)
  if (t > 2) { help(e); error(e) } else end_diagnostic(e, false)
}

// §582 new_character
export function new_character(e: Engine, f: number, c: number): CharNode | null {
  if (e.font_bc[f]! <= c && e.font_ec[f]! >= c && char_exists(char_info(e, f, c))) return new_char(f, c)
  char_warning(e, f, c)
  return null
}
