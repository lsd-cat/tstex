// §265 \the, §467 ins_the_toks
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { garbage, temp_head } from '../nodes.ts'
import { the_toks } from '../scan.ts'
import { ins_list } from '../input.ts'

export const cmd = Cmd.the
export const primitives: [string, number][] = [['the', 0]]
export const etex_primitives: [string, number][] = [['unexpanded', 1], ['detokenize', 5]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'the' : chr === 1 ? 'unexpanded' : 'detokenize') }
export function run(e: Engine, _chr: number): void {
  e.link[garbage] = the_toks(e); ins_list(e, e.link[temp_head]!)
}
