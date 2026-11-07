// §1071–1073 \box \copy \lastbox \vsplit \vtop \vbox \hbox; any_mode(make_box): begin_box(0)
import type { Engine } from '../engine.ts'
import { Cmd, vmode, hmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { begin_box, vtop_code } from '../main.ts'

const names: Record<number, string> = { 0: 'box', 1: 'copy', 2: 'lastbox', 3: 'vsplit', 4: 'vtop', [vtop_code + vmode]: 'vbox', [vtop_code + hmode]: 'hbox' }
export const cmd = Cmd.make_box
export const primitives: [string, number][] = Object.entries(names).map(([k, n]) => [n, +k])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'hbox') }
export function run(e: Engine, _chr: number): void { begin_box(e, 0) }
