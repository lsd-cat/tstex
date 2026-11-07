// §265 \csname, §372 Manufacture a control sequence name
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print as print_str, print_esc } from '../print.ts'
import { print_err, help } from '../error.ts'
import { null_cs, single_base, eq_define } from '../eqtb.ts'
import { id_lookup } from '../hash.ts'
import { get_avail, flush_list } from '../nodes.ts'
import { cs_token_flag } from '../tokens.ts'
import { back_input, back_error } from '../input.ts'
import { get_x_token } from '../expand.ts'

export const cmd = Cmd.cs_name
export const primitives: [string, number][] = [['csname', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'csname') }
export function run(e: Engine, _chr: number): void {
  const r = get_avail(e); let p = r
  do {
    get_x_token(e)
    if (e.cur_cs === 0) { const q = get_avail(e); e.link[p] = q; e.info[q] = e.cur_tok; p = q }
  } while (e.cur_cs === 0)
  if (e.cur_cmd !== Cmd.end_cs_name) { // §373 Complain about missing \endcsname
    print_err(e, 'Missing '); print_esc(e, 'endcsname'); print_str(e, ' inserted')
    help(e, 'The control sequence marked <to be read again> should', 'not appear between \\csname and \\endcsname.')
    back_error(e)
  }
  // §374 Look up the characters of list r in the hash table, and set cur_cs
  let j = e.first
  for (p = e.link[r]!; p !== 0; p = e.link[p]!) e.buffer[j++] = e.info[p]! % 0o400
  if (j > e.first + 1) { e.no_new_control_sequence = false; e.cur_cs = id_lookup(e, e.first, j - e.first); e.no_new_control_sequence = true }
  else if (j === e.first) e.cur_cs = null_cs
  else e.cur_cs = single_base + e.buffer[e.first]!
  flush_list(e, r)
  if (e.eq_type[e.cur_cs] === Cmd.undefined_cs) eq_define(e, e.cur_cs, Cmd.relax, 256)
  e.cur_tok = e.cur_cs + cs_token_flag; back_input(e)
}
