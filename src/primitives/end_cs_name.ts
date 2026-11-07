// §265 \endcsname; §1135 any_mode(end_cs_name): cs_error
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { error, print_err, help } from '../error.ts'

export const cmd = Cmd.end_cs_name
export const primitives: [string, number][] = [['endcsname', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'endcsname') }
export function run(e: Engine, _chr: number): void {
  print_err(e, 'Extra '); print_esc(e, 'endcsname')
  help(e, "I'm ignoring this, since I wasn't doing a \\csname."); error(e)
}
