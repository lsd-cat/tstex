// §416 \wd \ht \dp, §1247 alter_box_dimen
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_register_num, scan_optional_equals, scan_normal_dimen } from '../scan.ts'
import { box } from '../nodes.ts'

const width_offset = 1, depth_offset = 2
export const cmd = Cmd.set_box_dimen
export const primitives: [string, number][] = [['wd', 1], ['ht', 3], ['dp', 2]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === width_offset ? 'wd' : chr === depth_offset ? 'dp' : 'ht') }
export function assign(e: Engine, _a: number): void {
  const c = e.cur_chr
  scan_register_num(e); const b = box(e, e.cur_val)
  scan_optional_equals(e); scan_normal_dimen(e)
  if (b !== null) { if (c === width_offset) b.width = e.cur_val; else if (c === depth_offset) b.depth = e.cur_val; else b.height = e.cur_val }
}
