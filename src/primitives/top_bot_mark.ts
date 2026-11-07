// §384–386 \topmark \firstmark \botmark \splitfirstmark \splitbotmark (e-TeX's \marks classes are unsupported)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc, print_char } from '../print.ts'
import { begin_token_list } from '../input.ts'
import { mark_text } from '../error.ts'
import { unsupported } from '../main.ts'

const names = ['topmark', 'firstmark', 'botmark', 'splitfirstmark', 'splitbotmark']
export const cmd = Cmd.top_bot_mark
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export const etex_primitives: [string, number][] = names.map((n, i) => [n + 's', i + 5])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr % 5] ?? 'topmark'); if (chr >= 5) print_char(e, 115) }
export function run(e: Engine, chr: number): void {
  if (chr >= 5) unsupported(e)
  const p = e.cur_mark[chr]!
  if (p !== 0) begin_token_list(e, p, mark_text)
}
