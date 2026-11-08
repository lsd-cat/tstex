// §1178–1183 \above \over \atop and the withdelims variants; mmode+above: math_fraction
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { math_fraction } from '../main.ts'

const names = ['above', 'over', 'atop', 'abovewithdelims', 'overwithdelims', 'atopwithdelims']
export const cmd = Cmd.above
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'above') }
export function run(e: Engine, _chr: number): void { math_fraction(e) }
