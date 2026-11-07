// §1088–1093 \indent \noindent \quitvmode
import type { Engine } from '../engine.ts'
import { Cmd, vmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_graf, indent_in_hmode } from '../main.ts'

export const cmd = Cmd.start_par
export const primitives: [string, number][] = [['indent', 1], ['noindent', 0], ['quitvmode', 2]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'noindent' : chr === 1 ? 'indent' : 'quitvmode') }
export function run(e: Engine, chr: number): void {
  if (Math.abs(e.mode) === vmode) new_graf(e, chr > 0)
  else if (chr !== 2) indent_in_hmode(e)
}
