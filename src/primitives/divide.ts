// §265 \divide, §1235 do_register_command
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { do_register_command } from '../main.ts'

export const cmd = Cmd.divide
export const primitives: [string, number][] = [['divide', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'divide') }
export function assign(e: Engine, a: number): void { do_register_command(e, a) }
