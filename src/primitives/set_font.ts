// §553 \nullfont, §1217 set_font, §1261 print_cmd_chr for set_font
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print, slow_print } from '../print.ts'
import { print_scaled } from '../arith.ts'
import { cur_font_loc } from '../eqtb.ts'
import { define } from '../main.ts'

export const cmd = Cmd.set_font
export const primitives: [string, number][] = [['nullfont', 0]]
export function print_(e: Engine, chr: number): void {
  print(e, 'select font '); slow_print(e, e.font_name[chr]!)
  if (e.font_size[chr] !== e.font_dsize[chr]) { print(e, ' at '); print_scaled(e, e.font_size[chr]!); print(e, 'pt') }
}
export { print_ as print }
export function assign(e: Engine, a: number): void { define(e, a, cur_font_loc, Cmd.data, e.cur_chr) }
