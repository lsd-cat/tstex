// §265 \char; main_control's main loop handles it (§1038)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.char_num
export const primitives: [string, number][] = [['char', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'char') }
