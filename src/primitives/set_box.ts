// §1241 \setbox
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { error, print_err, help } from '../error.ts'
import { scan_eight_bit_int, scan_optional_equals } from '../scan.ts'
import { scan_box, box_flag, global_box_flag } from '../main.ts'

export const cmd = Cmd.set_box
export const primitives: [string, number][] = [['setbox', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'setbox') }
export function assign(e: Engine, a: number): void {
  scan_eight_bit_int(e) // scan_register_num outside e-TeX mode
  const n = (a >= 4 ? global_box_flag : box_flag) + e.cur_val
  scan_optional_equals(e)
  if (e.set_box_allowed) scan_box(e, n)
  else {
    print_err(e, 'Improper '); print_esc(e, 'setbox')
    help(e, 'Sorry, \\setbox is not allowed after \\halign in a display,', 'or between \\accent and an accented character.'); error(e)
  }
}
