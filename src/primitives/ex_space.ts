// §265 \  (control space); main_control appends a normal space (§1041)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.ex_space
export const primitives: [string, number][] = [[' ', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, ' ') }
