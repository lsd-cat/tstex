// §1246 \deadcycles \insertpenalties, alter_integer (fetched by §419 in scan.ts; e-TeX's \interactionmode is unsupported)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_optional_equals, scan_int } from '../scan.ts'
import { unsupported } from '../main.ts'

export const cmd = Cmd.set_page_int
export const primitives: [string, number][] = [['deadcycles', 0], ['insertpenalties', 1]]
export const etex_primitives: [string, number][] = [['interactionmode', 2]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'deadcycles' : chr === 2 ? 'interactionmode' : 'insertpenalties') }
export function assign(e: Engine, _a: number): void {
  const c = e.cur_chr
  if (c === 2) unsupported(e)
  scan_optional_equals(e); scan_int(e)
  if (c === 0) e.dead_cycles = e.cur_val; else e.insert_penalties = e.cur_val
}
