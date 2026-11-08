// §1246 \deadcycles \insertpenalties (etex.ch \interactionmode), alter_integer (fetched by §419 in scan.ts)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_optional_equals, scan_int } from '../scan.ts'
import { new_interaction } from '../main.ts'
import { print_err, help, int_error } from '../error.ts'
import { batch_mode, error_stop_mode } from '../types.ts'

export const cmd = Cmd.set_page_int
export const primitives: [string, number][] = [['deadcycles', 0], ['insertpenalties', 1]]
export const etex_primitives: [string, number][] = [['interactionmode', 2]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'deadcycles' : chr === 2 ? 'interactionmode' : 'insertpenalties') }
export function assign(e: Engine, _a: number): void {
  const c = e.cur_chr
  scan_optional_equals(e); scan_int(e)
  if (c === 0) e.dead_cycles = e.cur_val
  else if (c === 2) { // etex.ch Cases for alter_integer
    if (e.cur_val < batch_mode || e.cur_val > error_stop_mode) {
      print_err(e, 'Bad interaction mode')
      help(e, 'Modes are 0=batch, 1=nonstop, 2=scroll, and', "3=errorstop. Proceed, and I'll ignore this case.")
      int_error(e, e.cur_val)
    } else { e.cur_chr = e.cur_val; new_interaction(e) }
  } else e.insert_penalties = e.cur_val
}
