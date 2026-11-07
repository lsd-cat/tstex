// §1114–1121 \- \discretionary; hmode+discretionary: append_discretionary
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { append_discretionary } from '../main.ts'

export const cmd = Cmd.discretionary
export const primitives: [string, number][] = [['-', 1], ['discretionary', 0]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 1 ? '-' : 'discretionary') }
export function run(e: Engine, _chr: number): void { append_discretionary(e) }
