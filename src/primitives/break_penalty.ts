// §1102–1103 \penalty; any_mode(break_penalty): append_penalty
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { append_penalty } from '../main.ts'

export const cmd = Cmd.break_penalty
export const primitives: [string, number][] = [['penalty', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'penalty') }
export function run(e: Engine, _chr: number): void { append_penalty(e) }
