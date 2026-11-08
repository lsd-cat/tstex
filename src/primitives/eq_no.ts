// §1140–1143 \eqno \leqno; mmode+eq_no (other modes: §1048 forbidden)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { privileged, start_eq_no, off_save, math_shift_group } from '../main.ts'

export const cmd = Cmd.eq_no
export const primitives: [string, number][] = [['eqno', 0], ['leqno', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 1 ? 'leqno' : 'eqno') }
export function run(e: Engine, _chr: number): void {
  if (privileged(e)) { if (e.cur_group === math_shift_group) start_eq_no(e); else off_save(e) }
}
