// §1291–1298 \show \showbox \showthe \showlists
import type { Engine } from '../engine.ts'
import { Cmd, error_stop_mode, term_and_log, term_only } from '../types.ts'
import { print as print_str, print_esc, print_nl, print_char, print_int, begin_diagnostic, end_diagnostic } from '../print.ts'
import { error, help, print_err } from '../error.ts'
import { sprint_cs } from '../hash.ts'
import { token_show, print_meaning } from '../tokens.ts'
import { flush_list, temp_head } from '../nodes.ts'
import { get_token } from '../input.ts'
import { the_toks } from '../scan.ts'
import { int_par, tracing_online_code } from '../eqtb.ts'
import { unsupported, show_activities } from '../main.ts'
import { box, show_box } from '../nodes.ts'
import { scan_eight_bit_int } from '../scan.ts'

const show_code = 0, show_box_code = 1, show_the_code = 2, show_lists_code = 3
export const cmd = Cmd.xray
export const primitives: [string, number][] = [['show', show_code], ['showbox', show_box_code], ['showthe', show_the_code],
  ['showlists', show_lists_code]]
export const etex_primitives: [string, number][] = [['showgroups', 4], ['showtokens', 5], ['showifs', 6]]
export function print(e: Engine, chr: number): void {
  print_esc(e, ['show', 'showbox', 'showthe', 'showlists', 'showgroups', 'showtokens', 'showifs'][chr] ?? 'show')
}
// §1293 show_whatever
export function run(e: Engine, chr: number): void {
  if (chr === show_lists_code || chr === show_box_code) {
    if (chr === show_lists_code) { begin_diagnostic(e); show_activities(e) }
    else { // §1296 Show the current contents of a box
      scan_eight_bit_int(e); const p = box(e, e.cur_val); begin_diagnostic(e)
      print_nl(e, '> \\box'); print_int(e, e.cur_val); print_char(e, 61)
      if (p === null) print_str(e, 'void'); else show_box(e, p)
    }
    // §1298 Complete a potentially long \show command
    end_diagnostic(e, true); print_err(e, 'OK')
    if (e.selector === term_and_log && int_par(e, tracing_online_code) <= 0) {
      e.selector = term_only; print_str(e, ' (see the transcript file)'); e.selector = term_and_log
    }
  } else if (chr !== show_code && chr !== show_the_code) unsupported(e)
  else if (chr === show_code) { // §1294 Show the current meaning of a token
    get_token(e)
    print_nl(e, '> ')
    if (e.cur_cs !== 0) { sprint_cs(e, e.cur_cs); print_char(e, 61) }
    print_meaning(e)
  } else { // §1297 Show the current value of some parameter or register
    the_toks(e)
    print_nl(e, '> '); token_show(e, temp_head)
    flush_list(e, e.link[temp_head]!)
  }
  // common_ending:
  if (e.interaction < error_stop_mode) { help(e); e.error_count-- }
  else if (int_par(e, tracing_online_code) > 0) {
    help(e, "This isn't an error message; I'm just \\showing something.", "Type `I\\show...' to show more (e.g., \\show\\cs,",
      '\\showthe\\count10, \\showbox255, \\showlists).')
  } else {
    help(e, "This isn't an error message; I'm just \\showing something.", "Type `I\\show...' to show more (e.g., \\show\\cs,",
      '\\showthe\\count10, \\showbox255, \\showlists).', "And type `I\\tracingonline=1\\show...' to show boxes and",
      'lists on your terminal as well as in the transcript file.')
  }
  error(e)
}
