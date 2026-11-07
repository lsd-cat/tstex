// §334–335 \par, §1094 vmode+par_end
import type { Engine } from '../engine.ts'
import { Cmd, vmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { normal_paragraph, unsupported } from '../main.ts'

export const cmd = Cmd.par_end
export const primitives: [string, number][] = [['par', 256]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'par') }
export function run(e: Engine, _chr: number): void {
  if (Math.abs(e.mode) !== vmode) unsupported(e)
  normal_paragraph(e)
  // shortcut: build_page returns at once while the contribution list is empty, which it is until M2
}
