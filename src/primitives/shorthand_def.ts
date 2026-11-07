// §1222–1224 \chardef \mathchardef \countdef \dimendef \skipdef \muskipdef \toksdef
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { count_base, scaled_base, skip_base, mu_skip_base, toks_base } from '../eqtb.ts'
import { get_r_token, define } from '../main.ts'
import { scan_optional_equals, scan_char_num, scan_fifteen_bit_int, scan_eight_bit_int } from '../scan.ts'

const char_def_code = 0, math_char_def_code = 1, count_def_code = 2, dimen_def_code = 3, skip_def_code = 4, mu_skip_def_code = 5
const names = ['chardef', 'mathchardef', 'countdef', 'dimendef', 'skipdef', 'muskipdef', 'toksdef']
export const cmd = Cmd.shorthand_def
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'toksdef') }
// §1224
export function assign(e: Engine, a: number): void {
  const n = e.cur_chr
  get_r_token(e); const p = e.cur_cs; define(e, a, p, Cmd.relax, 256)
  scan_optional_equals(e)
  if (n === char_def_code) { scan_char_num(e); define(e, a, p, Cmd.char_given, e.cur_val) }
  else if (n === math_char_def_code) { scan_fifteen_bit_int(e); define(e, a, p, Cmd.math_given, e.cur_val) }
  else {
    scan_eight_bit_int(e) // scan_register_num outside e-TeX mode
    if (n === count_def_code) define(e, a, p, Cmd.assign_int, count_base + e.cur_val)
    else if (n === dimen_def_code) define(e, a, p, Cmd.assign_dimen, scaled_base + e.cur_val)
    else if (n === skip_def_code) define(e, a, p, Cmd.assign_glue, skip_base + e.cur_val)
    else if (n === mu_skip_def_code) define(e, a, p, Cmd.assign_mu_glue, mu_skip_base + e.cur_val)
    else define(e, a, p, Cmd.assign_toks, toks_base + e.cur_val)
  }
}
