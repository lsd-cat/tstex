// §1285–1288 \lowercase \uppercase
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { lc_code_base, uc_code_base, single_base } from '../eqtb.ts'
import { free_avail } from '../nodes.ts'
import { cs_token_flag } from '../tokens.ts'
import { back_list } from '../input.ts'
import { scan_toks } from '../scan.ts'

export const cmd = Cmd.case_shift
export const primitives: [string, number][] = [['lowercase', lc_code_base], ['uppercase', uc_code_base]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === lc_code_base ? 'lowercase' : 'uppercase') }
// §1288 shift_case
export function run(e: Engine, _chr: number): void {
  const b = e.cur_chr
  scan_toks(e, false, false)
  for (let p = e.link[e.def_ref]!; p !== 0; p = e.link[p]!) {
    const t = e.info[p]! // §1289 Change the case of the token in p, if a change is appropriate
    if (t < cs_token_flag + single_base) {
      const c = t % 256
      if (e.equiv[b + c] !== 0) e.info[p] = t - c + e.equiv[b + c]!
    }
  }
  back_list(e, e.link[e.def_ref]!); free_avail(e, e.def_ref)
}
