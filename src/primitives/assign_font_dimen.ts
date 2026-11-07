// §1253 \fontdimen
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_optional_equals, scan_normal_dimen } from '../scan.ts'
import { find_font_dimen } from '../tfm.ts'

export const cmd = Cmd.assign_font_dimen
export const primitives: [string, number][] = [['fontdimen', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'fontdimen') }
export function assign(e: Engine, _a: number): void {
  find_font_dimen(e, true); const k = e.cur_val
  scan_optional_equals(e); scan_normal_dimen(e); e.font_info[k] = e.cur_val
}
