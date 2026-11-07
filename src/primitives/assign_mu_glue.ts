// §226–227 math glue parameters, §1228 assign_mu_glue
import type { Engine } from '../engine.ts'
import { Cmd, mu_val } from '../types.ts'
import { glue_base, print_glue_loc } from '../eqtb.ts'
import { define, trap_zero_glue } from '../main.ts'
import { scan_optional_equals, scan_glue } from '../scan.ts'

export const cmd = Cmd.assign_mu_glue
export const primitives: [string, number][] = [
  ['thinmuskip', glue_base + 15], ['medmuskip', glue_base + 16], ['thickmuskip', glue_base + 17],
]
export function print(e: Engine, chr: number): void { print_glue_loc(e, chr) }
export function assign(e: Engine, a: number): void {
  const p = e.cur_chr; scan_optional_equals(e); scan_glue(e, mu_val)
  trap_zero_glue(e); define(e, a, p, Cmd.glue_ref, e.cur_val)
}
