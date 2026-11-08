// §1164–1166 \mathaccent; mmode+math_accent: math_ac
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { math_ac } from '../main.ts'

export const cmd = Cmd.math_accent
export const primitives: [string, number][] = [['mathaccent', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'mathaccent') }
export function run(e: Engine, _chr: number): void { math_ac(e) }
