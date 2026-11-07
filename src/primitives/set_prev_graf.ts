// §416 \prevgraf, §1244 alter_prev_graf
import type { Engine } from '../engine.ts'
import { Cmd, vmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { print_err, help, int_error } from '../error.ts'
import { scan_optional_equals, scan_int } from '../scan.ts'

export const cmd = Cmd.set_prev_graf
export const primitives: [string, number][] = [['prevgraf', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'prevgraf') }
export function assign(e: Engine, _a: number): void {
  let p = e.nest_ptr
  while (p < e.nest_ptr ? Math.abs(e.nest[p]!.mode) !== vmode : Math.abs(e.mode) !== vmode) p--
  scan_optional_equals(e); scan_int(e)
  if (e.cur_val < 0) {
    print_err(e, 'Bad '); print_esc(e, 'prevgraf'); help(e, 'I allow only nonnegative values here.'); int_error(e, e.cur_val)
  } else if (p === e.nest_ptr) e.prev_graf = e.cur_val
  else e.nest[p]!.prev_graf = e.cur_val
}
