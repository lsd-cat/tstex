// §265 \expandafter (e-TeX \unless), §368
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { get_token, back_input } from '../input.ts'
import { expand } from '../expand.ts'
import { print as print_str, print_char } from '../print.ts'
import { print_err, help } from '../error.ts'
import { back_error } from '../input.ts'
import { print_cmd_chr } from '../tokens.ts'

export const cmd = Cmd.expand_after
export const primitives: [string, number][] = [['expandafter', 0]]
export const etex_primitives: [string, number][] = [['unless', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'expandafter' : 'unless') }
export function run(e: Engine, chr: number): boolean | void {
  if (chr !== 0) { // etex.ch Negate a boolean conditional and goto reswitch
    get_token(e)
    if (e.cur_cmd === Cmd.if_test && e.cur_chr !== 16) { e.cur_chr += 32; return true }
    print_err(e, "You can't use `"); print_esc(e, 'unless'); print_str(e, "' before `")
    print_cmd_chr(e, e.cur_cmd, e.cur_chr); print_char(e, 39)
    help(e, "Continue, and I'll forget that it ever happened."); back_error(e)
    return
  }
  // §368 Expand the token after the next token
  get_token(e); const t = e.cur_tok; get_token(e)
  if (e.cur_cmd > Cmd.max_command) expand(e); else back_input(e)
  e.cur_tok = t; back_input(e)
}
