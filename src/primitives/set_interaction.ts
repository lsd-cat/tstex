// §1262–1265 \batchmode \nonstopmode \scrollmode \errorstopmode; prefixed_command calls new_interaction
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_interaction } from '../main.ts'

const names = ['batchmode', 'nonstopmode', 'scrollmode', 'errorstopmode']
export const cmd = Cmd.set_interaction
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'errorstopmode') }
export function assign(e: Engine, _a: number): void { new_interaction(e) }
