// §1171–1174 \mathchoice; mmode+math_choice: append_choices
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { append_choices } from '../main.ts'

export const cmd = Cmd.math_choice
export const primitives: [string, number][] = [['mathchoice', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'mathchoice') }
export function run(e: Engine, _chr: number): void { append_choices(e) }
