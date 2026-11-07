// §1256–1260 \font: new_font
import type { Engine } from '../engine.ts'
import { Cmd, new_string } from '../types.ts'
import { print, print_esc } from '../print.ts'
import { print_scaled, xn_over_d, unity } from '../arith.ts'
import { error, print_err, help, int_error } from '../error.ts'
import { hash_base, single_base, null_cs, active_base, font_id_base } from '../eqtb.ts'
import { open_log_file, scan_file_name } from '../files.ts'
import { get_r_token, define } from '../main.ts'
import { scan_optional_equals, scan_keyword, scan_normal_dimen, scan_int } from '../scan.ts'
import { read_font_info, null_font } from '../tfm.ts'

export const cmd = Cmd.def_font
export const primitives: [string, number][] = [['font', 0]]
export function print_(e: Engine, _chr: number): void { print_esc(e, 'font') }
export { print_ as print }
// §1257 new_font
export function assign(e: Engine, a: number): void {
  if (e.job_name === '') open_log_file(e)
  get_r_token(e); const u = e.cur_cs
  let t: string
  if (u >= hash_base) t = e.text.get(u) ?? ''
  else if (u >= single_base) t = u === null_cs ? 'FONT' : String.fromCharCode(u - single_base)
  else {
    const old_setting = e.selector, b = e.cur_str.length
    e.selector = new_string; print(e, 'FONT'); print(e, u - active_base); e.selector = old_setting
    t = String.fromCharCode(...e.cur_str.splice(b))
  }
  define(e, a, u, Cmd.set_font, null_font); scan_optional_equals(e); scan_file_name(e)
  // §1258 Scan the font size specification
  e.name_in_progress = true
  let s: number
  if (scan_keyword(e, 'at')) { // §1259 Put the (positive) `at' size into s
    scan_normal_dimen(e); s = e.cur_val
    if (s <= 0 || s >= 0o1000000000) {
      print_err(e, "Improper `at' size ("); print_scaled(e, s); print(e, 'pt), replaced by 10pt')
      help(e, 'I can only handle fonts at positive sizes that are', "less than 2048pt, so I've changed what you said to 10pt.")
      error(e); s = 10 * unity
    }
  } else if (scan_keyword(e, 'scaled')) {
    scan_int(e); s = -e.cur_val
    if (e.cur_val <= 0 || e.cur_val > 32768) {
      print_err(e, 'Illegal magnification has been changed to 1000')
      help(e, 'The magnification ratio must be between 1 and 32768.'); int_error(e, e.cur_val); s = -1000
    }
  } else s = -1000
  e.name_in_progress = false
  // §1260 If this font has already been loaded, set f to the internal font number and goto common_ending
  let f = -1
  for (let g = 1; g <= e.font_ptr && f < 0; g++) {
    if (e.font_name[g] === e.cur_name && e.font_area[g] === e.cur_area) {
      if (s > 0 ? s === e.font_size[g] : e.font_size[g] === xn_over_d(e, e.font_dsize[g]!, -s, 1000)) f = g
    }
  }
  if (f < 0) f = read_font_info(e, u, e.cur_name, e.cur_area, s)
  define(e, a, u, Cmd.set_font, f)
  e.eq_type[font_id_base + f] = e.eq_type[u]!; e.eq_level[font_id_base + f] = e.eq_level[u]!; e.equiv[font_id_base + f] = e.equiv[u]!
  e.text.set(font_id_base + f, t)
}
