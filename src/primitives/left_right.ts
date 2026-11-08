// §1188–1192 \left \right (and e-TeX's \middle); mmode+left_right: math_left_right
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { left_noad, right_noad } from '../nodes.ts'
import { math_left_right } from '../main.ts'

export const cmd = Cmd.left_right
export const primitives: [string, number][] = [['left', left_noad], ['right', right_noad]]
export const etex_primitives: [string, number][] = [['middle', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === left_noad ? 'left' : chr === 1 ? 'middle' : 'right') }
export function run(e: Engine, _chr: number): void { math_left_right(e) }
