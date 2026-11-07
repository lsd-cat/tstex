// §265 \noexpand (pdfTeX \pdfprimitive), §369 Suppress expansion of the next token
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { frozen_dont_expand, end_write } from '../eqtb.ts'
import { get_avail } from '../nodes.ts'
import { cs_token_flag } from '../tokens.ts'
import { get_token, back_input, normal } from '../input.ts'
import { unsupported } from '../main.ts'

export const cmd = Cmd.no_expand
export const primitives: [string, number][] = [['noexpand', 0], ['pdfprimitive', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'noexpand' : 'pdfprimitive') }
export function run(e: Engine, chr: number): void {
  if (chr !== 0) unsupported(e)
  const save_scanner_status = e.scanner_status; e.scanner_status = normal
  get_token(e); e.scanner_status = save_scanner_status; const t = e.cur_tok
  back_input(e) // now start and loc point to the backed-up token t
  if (t >= cs_token_flag && t !== cs_token_flag + end_write) { // tex.ch: \noexpand\endwrite stays expandable
    const p = get_avail(e); e.info[p] = cs_token_flag + frozen_dont_expand
    e.link[p] = e.cur_input.loc; e.cur_input.start = p; e.cur_input.loc = p
  }
}
