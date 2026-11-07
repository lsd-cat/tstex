// §226–227 glue parameters, §1228 assign_glue
import type { Engine } from '../engine.ts'
import { Cmd, glue_val } from '../types.ts'
import { glue_base, print_glue_loc } from '../eqtb.ts'
import { define, trap_zero_glue } from '../main.ts'
import { scan_optional_equals, scan_glue } from '../scan.ts'

export const cmd = Cmd.assign_glue
export const primitives: [string, number][] = [
  ['lineskip', glue_base], ['baselineskip', glue_base + 1], ['parskip', glue_base + 2],
  ['abovedisplayskip', glue_base + 3], ['belowdisplayskip', glue_base + 4],
  ['abovedisplayshortskip', glue_base + 5], ['belowdisplayshortskip', glue_base + 6],
  ['leftskip', glue_base + 7], ['rightskip', glue_base + 8], ['topskip', glue_base + 9],
  ['splittopskip', glue_base + 10], ['tabskip', glue_base + 11], ['spaceskip', glue_base + 12],
  ['xspaceskip', glue_base + 13], ['parfillskip', glue_base + 14],
]
export function print(e: Engine, chr: number): void { print_glue_loc(e, chr) }
export function assign(e: Engine, a: number): void {
  const p = e.cur_chr; scan_optional_equals(e); scan_glue(e, glue_val)
  trap_zero_glue(e); define(e, a, p, Cmd.glue_ref, e.cur_val)
}
