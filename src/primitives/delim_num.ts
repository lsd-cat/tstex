// §1160 \delimiter; mmode+delim_num (§1154)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_twenty_seven_bit_int } from '../scan.ts'
import { set_math_char } from '../main.ts'

export const cmd = Cmd.delim_num
export const primitives: [string, number][] = [['delimiter', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'delimiter') }
export function run(e: Engine, _chr: number): void { scan_twenty_seven_bit_int(e); set_math_char(e, Math.trunc(e.cur_val / 0o10000)) }
