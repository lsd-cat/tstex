// §411–412 \count (\dimen \skip \muskip need scan_dimen/scan_glue: M2), §1235 register assignment
import type { Engine } from '../engine.ts'
import { Cmd, int_val, dimen_val, glue_val } from '../types.ts'
import { print_esc } from '../print.ts'
import { do_register_command } from '../main.ts'

export const cmd = Cmd.register
export const primitives: [string, number][] = [['count', int_val]]
export function print(e: Engine, chr: number): void {
  print_esc(e, chr === int_val ? 'count' : chr === dimen_val ? 'dimen' : chr === glue_val ? 'skip' : 'muskip')
}
export function assign(e: Engine, a: number): void { do_register_command(e, a) }
