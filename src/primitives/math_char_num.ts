// §1154 \mathchar; mmode+math_char_num
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_fifteen_bit_int } from '../scan.ts'
import { set_math_char } from '../main.ts'

export const cmd = Cmd.math_char_num
export const primitives: [string, number][] = [['mathchar', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'mathchar') }
export function run(e: Engine, _chr: number): void { scan_fifteen_bit_int(e); set_math_char(e, e.cur_val) }
