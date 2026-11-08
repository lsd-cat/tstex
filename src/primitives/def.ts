// §1208–1209 \def \gdef \edef \xdef, §1218 the def assignment
import type { Engine } from '../engine.ts'
import { Cmd, protected_token } from '../types.ts'
import { get_avail } from '../nodes.ts'
import { print_esc } from '../print.ts'
import { int_par, global_defs_code } from '../eqtb.ts'
import { get_r_token, define } from '../main.ts'
import { scan_toks } from '../scan.ts'

export const cmd = Cmd.def
export const primitives: [string, number][] = [['def', 0], ['gdef', 1], ['edef', 2], ['xdef', 3]]
export function print(e: Engine, chr: number): void { print_esc(e, ['def', 'gdef', 'edef', 'xdef'][chr] ?? 'xdef') }
export function assign(e: Engine, a: number): void {
  const j = a >= 8 ? protected_token : 0; a &= 7 // etex.ch
  if ((e.cur_chr & 1) === 1 && a < 4 && int_par(e, global_defs_code) >= 0) a += 4
  const xpand = e.cur_chr >= 2
  get_r_token(e); const p = e.cur_cs
  scan_toks(e, true, xpand)
  if (j !== 0) { const q = get_avail(e); e.info[q] = j; e.link[q] = e.link[e.def_ref]!; e.link[e.def_ref] = q }
  define(e, a, p, Cmd.call + (a % 4), e.def_ref)
}
