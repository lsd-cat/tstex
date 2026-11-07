// §265 \expandafter (e-TeX \unless), §368
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { get_token, back_input } from '../input.ts'
import { expand } from '../expand.ts'
import { unsupported } from '../main.ts'

export const cmd = Cmd.expand_after
export const primitives: [string, number][] = [['expandafter', 0]]
export const etex_primitives: [string, number][] = [['unless', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'expandafter' : 'unless') }
export function run(e: Engine, chr: number): void {
  if (chr !== 0) unsupported(e)
  // §368 Expand the token after the next token
  get_token(e); const t = e.cur_tok; get_token(e)
  if (e.cur_cmd > Cmd.max_command) expand(e); else back_input(e)
  e.cur_tok = t; back_input(e)
}
