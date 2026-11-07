// §416 \spacefactor \prevdepth, §1243 alter_aux
import type { Engine } from '../engine.ts'
import { Cmd, vmode, hmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { print_err, help, int_error } from '../error.ts'
import { scan_optional_equals, scan_normal_dimen, scan_int } from '../scan.ts'
import { report_illegal_case } from '../main.ts'

export const cmd = Cmd.set_aux
export const primitives: [string, number][] = [['spacefactor', hmode], ['prevdepth', vmode]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === vmode ? 'prevdepth' : 'spacefactor') }
export function assign(e: Engine, _a: number): void {
  if (e.cur_chr !== Math.abs(e.mode)) { report_illegal_case(e); return }
  const c = e.cur_chr
  scan_optional_equals(e)
  if (c === vmode) { scan_normal_dimen(e); e.prev_depth = e.cur_val }
  else {
    scan_int(e)
    if (e.cur_val <= 0 || e.cur_val > 32767) {
      print_err(e, 'Bad space factor'); help(e, 'I allow only values in the range 1..32767 here.'); int_error(e, e.cur_val)
    } else e.space_factor = e.cur_val
  }
}
