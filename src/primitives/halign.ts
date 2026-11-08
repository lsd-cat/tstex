// §1130 \halign: vmode+halign init_align, hmode+halign head_for_vmode (§1094), mmode+halign in a display only
import type { Engine } from '../engine.ts'
import { Cmd, vmode, hmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { init_align } from '../align.ts'
import { head_for_vmode, privileged, off_save, math_shift_group } from '../main.ts'

export const cmd = Cmd.halign
export const primitives: [string, number][] = [['halign', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'halign') }
export function run(e: Engine, _chr: number): void {
  const m = Math.abs(e.mode)
  if (m === vmode) init_align(e)
  else if (m === hmode) head_for_vmode(e)
  else if (privileged(e)) { if (e.cur_group === math_shift_group) init_align(e); else off_save(e) }
}
