// §780 \cr \crcr (car_ret); frozen_cr copies \cr; print_cmd_chr and main_control's align_error handle the command
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.car_ret
export const primitives: [string, number][] = [['cr', 257], ['crcr', 258]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 257 ? 'cr' : 'crcr') }
