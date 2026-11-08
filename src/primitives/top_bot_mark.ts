// §384–386 \topmark \firstmark \botmark \splitfirstmark \splitbotmark (etex.ch: \topmarks etc.)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc, print_char } from '../print.ts'
import { begin_token_list } from '../input.ts'
import { mark_text } from '../error.ts'
import { scan_register_num } from '../scan.ts'
import { find_sa_element, sa, mark_val } from '../etex.ts'

const names = ['topmark', 'firstmark', 'botmark', 'splitfirstmark', 'splitbotmark']
export const cmd = Cmd.top_bot_mark
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export const etex_primitives: [string, number][] = names.map((n, i) => [n + 's', i + 5])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr % 5] ?? 'topmark'); if (chr >= 5) print_char(e, 115) }
export function run(e: Engine, chr: number): void {
  const t = chr % 5
  if (chr >= 5) scan_register_num(e); else e.cur_val = 0
  let p = e.cur_mark[t]!
  if (e.cur_val !== 0) { // etex.ch Compute the mark pointer for mark type t and class cur_val
    const q = find_sa_element(e, mark_val, e.cur_val, false)
    p = q === 0 ? 0 : sa(e, q).mark[t]!
  }
  if (p !== 0) begin_token_list(e, p, mark_text)
}
