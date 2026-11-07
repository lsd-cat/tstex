// §334–335 \par, §1094 vmode+par_end, hmode+par_end
import type { Engine } from '../engine.ts'
import { Cmd, vmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { normal_paragraph, build_page, end_graf, off_save } from '../main.ts'

export const cmd = Cmd.par_end
export const primitives: [string, number][] = [['par', 256]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'par') }
export function run(e: Engine, _chr: number): void {
  if (Math.abs(e.mode) === vmode) { normal_paragraph(e); if (e.mode > 0) build_page(e); return }
  // §1094 hmode+par_end
  if (e.align_state < 0) off_save(e)
  end_graf(e)
  if (e.mode === vmode) build_page(e)
}
