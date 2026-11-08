// §1156–1158 \mathord … \mathinner \underline \overline; mmode+math_comp
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_noad } from '../nodes.ts'
import type { Noad } from '../nodes.ts'
import { tail_append, scan_math } from '../main.ts'

const names: Record<number, string> = { 16: 'mathord', 17: 'mathop', 18: 'mathbin', 19: 'mathrel', 20: 'mathopen', 21: 'mathclose',
  22: 'mathpunct', 23: 'mathinner', 26: 'underline', 27: 'overline' }
export const cmd = Cmd.math_comp
export const primitives: [string, number][] = Object.entries(names).map(([k, n]) => [n, +k])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'overline') }
export function run(e: Engine, chr: number): void {
  const n = new_noad(); tail_append(e, n); n.type = chr as Noad['type']; scan_math(e, n.nucleus)
}
