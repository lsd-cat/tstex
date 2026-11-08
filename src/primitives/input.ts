// §376–378 \input \endinput (e-TeX \scantokens)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { insert_relax } from '../expand.ts'
import { start_input } from '../files.ts'
import { pseudo_start } from '../etex.ts'

export const cmd = Cmd.input
export const primitives: [string, number][] = [['input', 0], ['endinput', 1]]
export const etex_primitives: [string, number][] = [['scantokens', 2]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'input' : chr === 1 ? 'endinput' : 'scantokens') }
// §378 Initiate or terminate input from a file
export function run(e: Engine, chr: number): void {
  if (chr === 1) e.force_eof = true
  else if (chr === 2) pseudo_start(e) // etex.ch
  else if (e.name_in_progress) insert_relax(e)
  else start_input(e)
}
