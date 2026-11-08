// §265 \noexpand (pdfTeX \pdfprimitive), §369 Suppress expansion of the next token
import type { Engine } from '../engine.ts'
import { Cmd, prim_eqtb_base, frozen_primitive } from '../types.ts'
import { print_esc } from '../print.ts'
import { frozen_dont_expand, end_write } from '../eqtb.ts'
import { get_avail } from '../nodes.ts'
import { cs_token_flag } from '../tokens.ts'
import { get_token, back_input, normal } from '../input.ts'
import { prim_lookup_cs } from '../hash.ts'

export const cmd = Cmd.no_expand
export const primitives: [string, number][] = [['noexpand', 0], ['pdfprimitive', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'noexpand' : 'pdfprimitive') }
// returns true for expand's goto reswitch
export function run(e: Engine, chr: number): boolean | void {
  const save_scanner_status = e.scanner_status; e.scanner_status = normal
  get_token(e); e.scanner_status = save_scanner_status
  if (chr !== 0) { // pdftex.web Implement \pdfprimitive
    const p = prim_lookup_cs(e, e.cur_cs)
    if (p === 0) return
    const t = e.eq_type[prim_eqtb_base + p]!
    if (t > Cmd.max_command) {
      e.cur_cmd = t; e.cur_chr = e.equiv[prim_eqtb_base + p]!; e.cur_tok = t * 0o400 + e.cur_chr; e.cur_cs = 0
      return true
    }
    back_input(e) // now loc and start point to a one-item list
    const q = get_avail(e); e.info[q] = cs_token_flag + frozen_primitive
    e.link[q] = e.cur_input.loc; e.cur_input.loc = q; e.cur_input.start = q
    return
  }
  const t = e.cur_tok
  back_input(e) // now start and loc point to the backed-up token t
  if (t >= cs_token_flag && t !== cs_token_flag + end_write) { // tex.ch: \noexpand\endwrite stays expandable
    const p = get_avail(e); e.info[p] = cs_token_flag + frozen_dont_expand
    e.link[p] = e.cur_input.loc; e.cur_input.start = p; e.cur_input.loc = p
  }
}
