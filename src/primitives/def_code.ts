// §1230–1233 \catcode \mathcode \lccode \uccode \sfcode \delcode
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print as print_str, print_esc, print_int } from '../print.ts'
import { error, print_err, help } from '../error.ts'
import { cat_code_base, math_code_base, lc_code_base, uc_code_base, sf_code_base, del_code_base } from '../eqtb.ts'
import { define, word_define } from '../main.ts'
import { scan_char_num, scan_optional_equals, scan_int } from '../scan.ts'

export const cmd = Cmd.def_code
export const primitives: [string, number][] = [['catcode', cat_code_base], ['mathcode', math_code_base],
  ['lccode', lc_code_base], ['uccode', uc_code_base], ['sfcode', sf_code_base], ['delcode', del_code_base]]
export function print(e: Engine, chr: number): void {
  print_esc(e, chr === cat_code_base ? 'catcode' : chr === math_code_base ? 'mathcode' : chr === lc_code_base ? 'lccode'
    : chr === uc_code_base ? 'uccode' : chr === sf_code_base ? 'sfcode' : 'delcode')
}
export function assign(e: Engine, a: number): void {
  // §1233 Let n be the largest legal code value, based on cur_chr
  const n = e.cur_chr === cat_code_base ? Cmd.max_char_code : e.cur_chr === math_code_base ? 0o100000
    : e.cur_chr === sf_code_base ? 0o77777 : e.cur_chr === del_code_base ? 0o77777777 : 255
  let p = e.cur_chr; scan_char_num(e); p += e.cur_val; scan_optional_equals(e)
  scan_int(e)
  if ((e.cur_val < 0 && p < del_code_base) || e.cur_val > n) {
    print_err(e, 'Invalid code ('); print_int(e, e.cur_val)
    if (p < del_code_base) print_str(e, '), should be in the range 0..')
    else print_str(e, '), should be at most ')
    print_int(e, n)
    help(e, "I'm going to use 0 instead of that illegal code value.")
    error(e); e.cur_val = 0
  }
  if (p < del_code_base) define(e, a, p, Cmd.data, e.cur_val)
  else word_define(e, a, p, e.cur_val)
}
