// §1230 \textfont \scriptfont \scriptscriptfont, §1231 print_size, §1234 def_family
import type { Engine } from '../engine.ts'
import { Cmd, math_font_base } from '../types.ts'
import { print_esc } from '../print.ts'
import { define } from '../main.ts'
import { scan_four_bit_int, scan_optional_equals } from '../scan.ts'
import { scan_font_ident } from '../tfm.ts'

export const cmd = Cmd.def_family
export const primitives: [string, number][] = [['textfont', math_font_base], ['scriptfont', math_font_base + 16],
  ['scriptscriptfont', math_font_base + 32]]
export function print(e: Engine, chr: number): void {
  const s = chr - math_font_base
  print_esc(e, s === 0 ? 'textfont' : s === 16 ? 'scriptfont' : 'scriptscriptfont')
}
export function assign(e: Engine, a: number): void {
  let p = e.cur_chr; scan_four_bit_int(e); p += e.cur_val
  scan_optional_equals(e); scan_font_ident(e); define(e, a, p, Cmd.data, e.cur_val)
}
