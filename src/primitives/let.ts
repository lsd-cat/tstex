// §1219–1221 \let \futurelet
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { add_token_ref } from '../nodes.ts'
import { other_token } from '../tokens.ts'
import { get_token, back_input } from '../input.ts'
import { get_r_token, define } from '../main.ts'

export const cmd = Cmd.let
export const primitives: [string, number][] = [['let', 0], ['futurelet', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr !== 0 ? 'futurelet' : 'let') }
export function assign(e: Engine, a: number): void {
  const n = e.cur_chr
  get_r_token(e); const p = e.cur_cs
  if (n === 0) {
    do get_token(e); while (e.cur_cmd === Cmd.spacer)
    if (e.cur_tok === other_token + 61) { get_token(e); if (e.cur_cmd === Cmd.spacer) get_token(e) }
  } else {
    get_token(e); const q = e.cur_tok; get_token(e); back_input(e)
    e.cur_tok = q; back_input(e) // look ahead, then back up; back_input doesn't affect cur_cmd, cur_chr
  }
  if (e.cur_cmd >= Cmd.call) add_token_ref(e, e.cur_chr)
  define(e, a, p, e.cur_cmd, e.cur_chr)
}
