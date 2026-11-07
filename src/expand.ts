// §366–401 expanding the next token
import type { Engine } from './engine.ts'
import { Cmd } from './types.ts'
import { print, print_ln, print_nl, print_int, begin_diagnostic, end_diagnostic } from './print.ts'
import { error, print_err, help, overflow, token_list, v_template, macro, inserted } from './error.ts'
import { int_par, tracing_macros_code, tracing_commands_code, frozen_endv, frozen_relax } from './eqtb.ts'
import { print_cs, sprint_cs } from './hash.ts'
import { get_avail, free_avail, flush_list, temp_head, backup_head } from './nodes.ts'
import { cs_token_flag, left_brace_limit, right_brace_limit, match_token, end_match_token, space_token, show_token_list, token_show, show_cur_cmd_chr } from './tokens.ts'
import { get_next, get_token, back_input, back_error, ins_error, end_token_list, begin_token_list, runaway, matching } from './input.ts'
import { registry } from './primitives/index.ts'

const expand_depth = 10000, param_size = 10000 // TeX Live defaults

// §366 expand (with tex.ch's expansion depth check)
export function expand(e: Engine): void {
  if (++e.expand_depth_count >= expand_depth) overflow(e, 'expansion depth', expand_depth)
  const cv_backup = e.cur_val, cvl_backup = e.cur_val_level, radix_backup = e.radix
  const co_backup = e.cur_order, backup_backup = e.link[backup_head]!
  if (e.cur_cmd < Cmd.call) {
    // §367 Expand a nonmacro
    if (int_par(e, tracing_commands_code) > 1) show_cur_cmd_chr(e)
    const prim = registry.get(e.cur_cmd)
    if (prim?.run) prim.run(e, e.cur_chr)
    else { // §370 Complain about an undefined macro
      print_err(e, 'Undefined control sequence')
      help(e, 'The control sequence at the end of the top line', "of your error message was never \\def'ed. If you have",
        "misspelled it (e.g., `\\hobx'), type `I' and the correct", "spelling (e.g., `I\\hbox'). Otherwise just continue,",
        "and I'll forget about whatever was undefined.")
      error(e)
    }
  } else if (e.cur_cmd < Cmd.end_template) macro_call(e)
  else { e.cur_tok = cs_token_flag + frozen_endv; back_input(e) } // §375
  e.cur_val = cv_backup; e.cur_val_level = cvl_backup; e.radix = radix_backup
  e.cur_order = co_backup; e.link[backup_head] = backup_backup
  e.expand_depth_count--
}

// §379 insert_relax
export function insert_relax(e: Engine): void {
  e.cur_tok = cs_token_flag + e.cur_cs; back_input(e)
  e.cur_tok = cs_token_flag + frozen_relax; back_input(e); e.cur_input.index = inserted
}

// §380 get_x_token
export function get_x_token(e: Engine): void {
  for (;;) {
    get_next(e)
    if (e.cur_cmd <= Cmd.max_command) break
    if (e.cur_cmd >= Cmd.call) {
      if (e.cur_cmd < Cmd.end_template) macro_call(e)
      else { e.cur_cs = frozen_endv; e.cur_cmd = Cmd.endv; break }
    } else expand(e)
  }
  e.cur_tok = e.cur_cs === 0 ? e.cur_cmd * 0o400 + e.cur_chr : cs_token_flag + e.cur_cs
}

// §381 x_token
export function x_token(e: Engine): void {
  while (e.cur_cmd > Cmd.max_command) { expand(e); get_next(e) }
  e.cur_tok = e.cur_cs === 0 ? e.cur_cmd * 0o400 + e.cur_chr : cs_token_flag + e.cur_cs
}

// §389 macro_call
export function macro_call(e: Engine): void {
  const save_scanner_status = e.scanner_status, save_warning_index = e.warning_index
  e.warning_index = e.cur_cs
  const ref_count = e.cur_chr
  let r = e.link[ref_count]!, n = 0
  let p = 0, s = 0, m = 0, rbrace_ptr = 0, unbalance = 0, match_chr = 0
  const store_new_token = (x: number) => { const q = get_avail(e); e.link[p] = q; e.info[q] = x; p = q }
  if (int_par(e, tracing_macros_code) > 0) { // §401
    begin_diagnostic(e); print_ln(e); print_cs(e, e.warning_index)
    token_show(e, ref_count); end_diagnostic(e, false)
  }
  exit: {
    if (e.info[r] !== end_match_token) {
      // §391 Scan the parameters and make link(r) point to the macro body
      e.scanner_status = matching; unbalance = 0
      e.long_state = e.eq_type[e.cur_cs]!
      if (e.long_state >= Cmd.outer_call) e.long_state -= 2
      // §396 Report a runaway argument and abort
      const runaway_abort = () => {
        if (e.long_state === Cmd.call) {
          runaway(e); print_err(e, 'Paragraph ended before '); sprint_cs(e, e.warning_index); print(e, ' was complete')
          help(e, "I suspect you've forgotten a `}', causing me to apply this",
            'control sequence to too much text. How can we recover?', 'My plan is to forget the whole thing and hope for the best.')
          back_error(e)
        }
        e.pstack[n] = e.link[temp_head]!; e.align_state -= unbalance
        for (let k = 0; k <= n; k++) flush_list(e, e.pstack[k]!)
      }
      do {
        e.link[temp_head] = 0
        if (e.info[r]! > match_token + 255 || e.info[r]! < match_token) s = 0
        else { match_chr = e.info[r]! - match_token; s = e.link[r]!; r = s; p = temp_head; m = 0 }
        // §392 Scan a parameter until its delimiter string has been found; or, if s=null, simply scan the delimiter string
        cont: for (;;) {
          get_token(e)
          if (e.cur_tok === e.info[r]) { // §394
            r = e.link[r]!
            if (e.info[r]! >= match_token && e.info[r]! <= end_match_token) {
              if (e.cur_tok < left_brace_limit) e.align_state--
              break cont
            }
            continue cont
          }
          // §397 Contribute the recently matched tokens to the current parameter
          if (s !== r) {
            if (s === 0) { // §398 Report an improper use of the macro and abort
              print_err(e, 'Use of '); sprint_cs(e, e.warning_index); print(e, " doesn't match its definition")
              help(e, "If you say, e.g., `\\def\\a1{...}', then you must always", "put `1' after `\\a', since control sequence names are",
                'made up of letters only. The macro here has not been', "followed by the required stuff, so I'm ignoring it.")
              error(e); break exit
            }
            let t = s
            do {
              store_new_token(e.info[t]!); m++
              let u = e.link[t]!, v = s
              for (;;) {
                if (u === r) {
                  if (e.cur_tok !== e.info[v]) break
                  r = e.link[v]!; continue cont
                }
                if (e.info[u] !== e.info[v]) break
                u = e.link[u]!; v = e.link[v]!
              }
              t = e.link[t]!
            } while (t !== r)
            r = s
          }
          if (e.cur_tok === e.par_token && e.long_state !== Cmd.long_call) { runaway_abort(); break exit }
          if (e.cur_tok < right_brace_limit) {
            if (e.cur_tok < left_brace_limit) { // §399 Contribute an entire group to the current parameter
              unbalance = 1
              for (;;) {
                store_new_token(e.cur_tok); get_token(e)
                if (e.cur_tok === e.par_token && e.long_state !== Cmd.long_call) { runaway_abort(); break exit }
                if (e.cur_tok < right_brace_limit) {
                  if (e.cur_tok < left_brace_limit) unbalance++
                  else { unbalance--; if (unbalance === 0) break }
                }
              }
              rbrace_ptr = p; store_new_token(e.cur_tok)
            } else { // §395 Report an extra right brace and goto continue
              back_input(e); print_err(e, 'Argument of '); sprint_cs(e, e.warning_index); print(e, ' has an extra }')
              help(e, "I've run across a `}' that doesn't seem to match anything.", "For example, `\\def\\a#1{...}' and `\\a}' would produce",
                "this error. If you simply proceed now, the `\\par' that", "I've just inserted will cause me to report a runaway",
                'argument that might be the root of the problem. But if', "your `}' was spurious, just type `2' and it will go away.")
              e.align_state++; e.long_state = Cmd.call; e.cur_tok = e.par_token; ins_error(e)
              continue cont
            }
          } else { // §393 Store the current token, but goto continue if it is a blank space that would become an undelimited parameter
            if (e.cur_tok === space_token && e.info[r]! <= end_match_token && e.info[r]! >= match_token) continue cont
            store_new_token(e.cur_tok)
          }
          m++
          if (e.info[r]! > end_match_token) continue cont
          if (e.info[r]! < match_token) continue cont
          break
        }
        // found:
        if (s !== 0) { // §400 Tidy up the parameter just scanned, and tuck it away
          if (m === 1 && e.info[p]! < right_brace_limit) {
            e.link[rbrace_ptr] = 0; free_avail(e, p)
            p = e.link[temp_head]!; e.pstack[n] = e.link[p]!; free_avail(e, p)
          } else e.pstack[n] = e.link[temp_head]!
          n++
          if (int_par(e, tracing_macros_code) > 0) {
            begin_diagnostic(e); print_nl(e, match_chr); print_int(e, n)
            print(e, '<-'); show_token_list(e, e.pstack[n - 1]!, 0, 1000)
            end_diagnostic(e, false)
          }
        }
      } while (e.info[r] !== end_match_token)
    }
    // §390 Feed the macro body and its parameters to the scanner
    while (e.cur_input.state === token_list && e.cur_input.loc === 0 && e.cur_input.index !== v_template) end_token_list(e)
    begin_token_list(e, ref_count, macro); e.cur_input.name = e.warning_index; e.cur_input.loc = e.link[r]!
    if (n > 0) {
      if (e.param_ptr + n > e.max_param_stack) {
        e.max_param_stack = e.param_ptr + n
        if (e.max_param_stack > param_size) overflow(e, 'parameter stack size', param_size)
      }
      for (let k = 0; k < n; k++) e.param_stack[e.param_ptr + k] = e.pstack[k]!
      e.param_ptr += n
    }
  }
  e.scanner_status = save_scanner_status; e.warning_index = save_warning_index
}
