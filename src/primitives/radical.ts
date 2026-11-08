// §1162–1164 \radical; mmode+radical: math_radical
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { math_radical } from '../main.ts'

export const cmd = Cmd.radical
export const primitives: [string, number][] = [['radical', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'radical') }
export function run(e: Engine, _chr: number): void { math_radical(e) }
