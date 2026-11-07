// §1097, §1101 \mark (e-TeX: \marks); any_mode(mark): make_mark
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { make_mark } from '../main.ts'

export const cmd = Cmd.mark
export const primitives: [string, number][] = [['mark', 0]]
export const etex_primitives: [string, number][] = [['marks', 5]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'mark' : 'marks') }
export function run(e: Engine, _chr: number): void { make_mark(e) }
