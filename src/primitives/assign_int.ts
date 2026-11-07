// §238–239 integer parameters, §1228 assign_int
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc, print_int } from '../print.ts'
import { int_base, count_base, int_par_names, print_param } from '../eqtb.ts'
import { word_define } from '../main.ts'
import { scan_optional_equals, scan_int } from '../scan.ts'

export const cmd = Cmd.assign_int
export const primitives: [string, number][] = int_par_names.map((n, i) => [n, int_base + i])
export function print(e: Engine, chr: number): void {
  if (chr < count_base) print_param(e, chr - int_base)
  else { print_esc(e, 'count'); print_int(e, chr - count_base) }
}
export function assign(e: Engine, a: number): void {
  const p = e.cur_chr; scan_optional_equals(e); scan_int(e)
  word_define(e, a, p, e.cur_val)
}
