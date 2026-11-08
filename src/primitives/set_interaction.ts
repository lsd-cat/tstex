// §1262–1265 \batchmode \nonstopmode \scrollmode \errorstopmode; prefixed_command calls new_interaction
import type { Engine } from '../engine.ts'
import { Cmd, batch_mode, no_print, term_only } from '../types.ts'
import { print_esc, print_ln } from '../print.ts'

const names = ['batchmode', 'nonstopmode', 'scrollmode', 'errorstopmode']
export const cmd = Cmd.set_interaction
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'errorstopmode') }
// §1265 new_interaction
export function assign(e: Engine, _a: number): void {
  print_ln(e)
  e.interaction = e.cur_chr
  e.selector = e.interaction === batch_mode ? no_print : term_only // §75
  if (e.log_opened) e.selector += 2
}
