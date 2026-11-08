// §411–412 \count \dimen \skip \muskip, §1235 register assignment
import type { Engine } from '../engine.ts'
import { Cmd, int_val, dimen_val, glue_val, mu_val } from '../types.ts'
import { print_esc } from '../print.ts'
import { do_register_command } from '../main.ts'
import { sa, print_sa_num } from '../etex.ts'

export const cmd = Cmd.register
export const primitives: [string, number][] = [['count', int_val], ['dimen', dimen_val], ['skip', glue_val], ['muskip', mu_val]]
export function print(e: Engine, chr: number): void { // etex.ch Cases of register for print_cmd_chr
  const c = chr > mu_val ? sa(e, chr).t : chr
  print_esc(e, c === int_val ? 'count' : c === dimen_val ? 'dimen' : c === glue_val ? 'skip' : 'muskip')
  if (chr > mu_val) print_sa_num(e, chr)
}
export function assign(e: Engine, a: number): void { do_register_command(e, a) }
