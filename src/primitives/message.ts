// §1277–1280 \message (\errmessage needs \errhelp: next M1 slice)
import type { Engine } from '../engine.ts'
import { Cmd, new_string, max_print_line } from '../types.ts'
import { print_esc, print_ln, print_char, slow_print } from '../print.ts'
import { token_show } from '../tokens.ts'
import { flush_list } from '../nodes.ts'
import { scan_toks } from '../scan.ts'

export const cmd = Cmd.message
export const primitives: [string, number][] = [['message', 0]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'message' : 'errmessage') }
// §1279 issue_message
export function run(e: Engine, _chr: number): void {
  scan_toks(e, false, true)
  const old_setting = e.selector; e.selector = new_string
  const b = e.cur_str.length
  token_show(e, e.def_ref); e.selector = old_setting
  flush_list(e, e.def_ref)
  const s = String.fromCharCode(...e.cur_str.splice(b))
  // §1280 Print string s on the terminal
  if (e.term_offset + s.length > max_print_line - 2) print_ln(e)
  else if (e.term_offset > 0 || e.file_offset > 0) print_char(e, 32)
  slow_print(e, s)
}
