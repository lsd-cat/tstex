// §31 input_ln, §300–365 input stacks and get_next
import type { Engine } from './engine.ts'
import { Cmd, log_only, nonstop_mode } from './types.ts'
import type { InState } from './types.ts'
import { print, print_char, print_nl, print_ln, print_esc, print_int, begin_diagnostic, end_diagnostic } from './print.ts'
import { every_eof_text } from './error.ts'
import { error, print_err, help, fatal_error, overflow, token_list, parameter, u_template, v_template, backed_up, inserted, macro, output_text, mark_text, write_text } from './error.ts'
import { int_par, tracing_macros_code, end_line_char_code, cat_code_base, null_cs, single_base, active_base, output_routine_loc, frozen_fi, frozen_cr, end_write } from './eqtb.ts'
import { id_lookup, sprint_cs } from './hash.ts'
import { get_avail, flush_list, add_token_ref, delete_token_ref, temp_head, hold_head } from './nodes.ts'
import { insert_v_template } from './align.ts'
import { cs_token_flag, right_brace_token, right_brace_limit, left_brace_limit, show_token_list, token_show, print_cmd_chr } from './tokens.ts'
import { open_log_file } from './files.ts'
import { pseudo_close, pseudo_input, file_warning, tracing_nesting_code } from './etex.ts'
import { every_eof_loc } from './types.ts'

// §303
export const mid_line = 1, skip_blanks = 2 + Cmd.max_char_code, new_line = 3 + 2 * Cmd.max_char_code
// §305
export const normal = 0, skipping = 1, defining = 2, matching = 3, aligning = 4, absorbing = 5

// §31 input_ln: web2c ends a line at LF, CR or CR LF and drops trailing spaces
export type InputFile = { data: Uint8Array, pos: number }
export function input_ln(e: Engine, f: InputFile): boolean {
  e.last = e.first
  if (f.pos >= f.data.length) return false
  while (f.pos < f.data.length) {
    const c = f.data[f.pos++]!
    if (c === 10) break
    if (c === 13) { if (f.data[f.pos] === 10) f.pos++; break }
    if (e.last >= e.lim.buf_size - 1) overflow(e, 'buffer size', e.lim.buf_size)
    e.buffer[e.last++] = e.xord[c]!
  }
  if (e.last >= e.max_buf_stack) e.max_buf_stack = e.last // texmfmp.c input_line, before trailing spaces go
  while (e.last > e.first && e.buffer[e.last - 1] === 32) e.last--
  return true
}

// The terminal: Engine.term_in holds the lines still to be typed (run's `terminal` option); the typed text is
// appended to Engine.terminal as a terminal would echo it. Without the option the terminal is at end of file
// (pdftex with stdin </dev/null: `End of file on the terminal!').
export function term_line(e: Engine): boolean {
  const s = e.term_in.shift()
  if (s === undefined) return false
  e.terminal += s + '\n'
  e.last = e.first
  for (let k = 0; k < s.length; k++) {
    if (e.last >= e.lim.buf_size - 1) overflow(e, 'buffer size', e.lim.buf_size)
    e.buffer[e.last++] = e.xord[s.charCodeAt(k) & 255]!
  }
  if (e.last >= e.max_buf_stack) e.max_buf_stack = e.last
  while (e.last > e.first && e.buffer[e.last - 1] === 32) e.last--
  return true
}

// §71 term_input
export function term_input(e: Engine): void {
  if (!term_line(e)) fatal_error(e, 'End of file on the terminal!')
  e.term_offset = 0; e.selector--
  for (let k = e.first; k < e.last; k++) print(e, e.buffer[k]!)
  print_ln(e); e.selector++
}

// §71 prompt_input
export function prompt_input(e: Engine, s: string): void {
  print(e, s); term_input(e)
}

// §321 push_input
export function push_input(e: Engine): void {
  if (e.input_ptr > e.max_in_stack) {
    e.max_in_stack = e.input_ptr
    if (e.input_ptr === e.lim.stack_size) overflow(e, 'input stack size', e.lim.stack_size)
  }
  e.input_stack[e.input_ptr] = e.cur_input
  const c = e.cur_input // a literal, not a spread: V8 builds it with no generic clone
  e.cur_input = { state: c.state, index: c.index, start: c.start, loc: c.loc, limit: c.limit, name: c.name, synctex_tag: c.synctex_tag }
  e.input_ptr++
}

// §322 pop_input
export function pop_input(e: Engine): void {
  e.input_ptr--; e.cur_input = e.input_stack[e.input_ptr]!
}

// §323 begin_token_list
export function begin_token_list(e: Engine, p: number, t: number): void {
  push_input(e)
  const ci = e.cur_input
  ci.state = token_list; ci.start = p; ci.index = t
  if (t >= macro) {
    add_token_ref(e, p)
    if (t === macro) ci.limit = e.param_ptr
    else {
      ci.loc = e.link[p]!
      if (int_par(e, tracing_macros_code) > 1) {
        begin_diagnostic(e); print_nl(e, '')
        if (t === mark_text) print_esc(e, 'mark')
        else if (t === write_text) print_esc(e, 'write')
        else print_cmd_chr(e, Cmd.assign_toks, t - output_text + output_routine_loc)
        print(e, '->'); token_show(e, p); end_diagnostic(e, false)
      }
    }
  } else ci.loc = p
}
export const back_list = (e: Engine, p: number) => begin_token_list(e, p, backed_up)
export const ins_list = (e: Engine, p: number) => begin_token_list(e, p, inserted)

// §324 end_token_list
export function end_token_list(e: Engine): void {
  const ci = e.cur_input
  if (ci.index >= backed_up) {
    if (ci.index <= inserted) flush_list(e, ci.start)
    else {
      delete_token_ref(e, ci.start)
      if (ci.index === macro) while (e.param_ptr > ci.limit) { e.param_ptr--; flush_list(e, e.param_stack[e.param_ptr]!) }
      else if (ci.index === output_text && !e.output_can_end) fatal_error(e, 'Unbalanced output routine') // unbalanced-braces.ch
    }
  } else if (ci.index === u_template) {
    if (e.align_state > 500000) e.align_state = 0
    else fatal_error(e, '(interwoven alignment preambles are not allowed)')
  }
  pop_input(e)
}

// §325 back_input
export function back_input(e: Engine): void {
  // unbalanced-braces.ch (TeX Live, pdftex only): an exhausted \output level is kept
  while (e.cur_input.state === token_list && e.cur_input.loc === 0 && e.cur_input.index !== v_template && e.cur_input.index !== output_text) end_token_list(e)
  const p = get_avail(e); e.info[p] = e.cur_tok
  if (e.cur_tok < right_brace_limit) {
    if (e.cur_tok < left_brace_limit) e.align_state--
    else e.align_state++
  }
  push_input(e)
  const ci = e.cur_input
  ci.state = token_list; ci.start = p; ci.index = backed_up; ci.loc = p
}

// §327 back_error
export function back_error(e: Engine): void {
  e.OK_to_interrupt = false; back_input(e); e.OK_to_interrupt = true; error(e)
}

// §327 ins_error
export function ins_error(e: Engine): void {
  e.OK_to_interrupt = false; back_input(e); e.cur_input.index = inserted; e.OK_to_interrupt = true; error(e)
}

// §328 begin_file_reading
export function begin_file_reading(e: Engine): void {
  if (e.in_open === e.lim.max_in_open) overflow(e, 'text input levels', e.lim.max_in_open)
  if (e.first === e.lim.buf_size) overflow(e, 'buffer size', e.lim.buf_size)
  e.in_open++; push_input(e)
  const ci = e.cur_input
  ci.index = e.in_open
  e.eof_seen[ci.index] = false; e.grp_stack[ci.index] = e.cur_boundary; e.if_stack[ci.index] = e.cond_ptr // etex.ch
  e.line_stack[ci.index] = e.line; ci.start = e.first; ci.state = mid_line
  ci.name = 0; ci.synctex_tag = 0 // synctex-rec.ch0 Prepare terminal input SyncTeX information
}

// §329 end_file_reading
export function end_file_reading(e: Engine): void {
  e.first = e.cur_input.start; e.line = e.line_stack[e.cur_input.index]!
  if (e.cur_input.name === 18 || e.cur_input.name === 19) pseudo_close(e) // etex.ch
  else if (e.cur_input.name > 17) delete e.input_file[e.cur_input.index]
  pop_input(e); e.in_open--
}

// §306 runaway
export function runaway(e: Engine): void {
  if (e.scanner_status > skipping) {
    let p = 0
    switch (e.scanner_status) {
      case defining: print_nl(e, 'Runaway definition'); p = e.def_ref; break
      case matching: print_nl(e, 'Runaway argument'); p = temp_head; break
      case aligning: print_nl(e, 'Runaway preamble'); p = hold_head; break
      case absorbing: print_nl(e, 'Runaway text'); p = e.def_ref; break
    }
    print_char(e, 63); print_ln(e); show_token_list(e, e.link[p]!, 0, e.lim.error_line - 10)
  }
}

// §336 check_outer_validity
export function check_outer_validity(e: Engine): void {
  if (e.scanner_status === normal) return
  e.deletions_allowed = false
  // §337 Back up an outer control sequence so that it can be reread
  if (e.cur_cs !== 0) {
    const ci = e.cur_input
    if (ci.state === token_list || ci.name < 1 || ci.name > 17) {
      const p = get_avail(e); e.info[p] = cs_token_flag + e.cur_cs; back_list(e, p)
    }
    e.cur_cmd = Cmd.spacer; e.cur_chr = 32
  }
  if (e.scanner_status > skipping) {
    // §338 Tell the user what has run away and try to recover
    runaway(e)
    if (e.cur_cs === 0) print_err(e, 'File ended')
    else { e.cur_cs = 0; print_err(e, 'Forbidden control sequence found') }
    // §339 (tex.ch folds " while scanning " into each case)
    let p = get_avail(e)
    switch (e.scanner_status) {
      case defining: print(e, ' while scanning definition'); e.info[p] = right_brace_token + 125; break
      case matching: print(e, ' while scanning use'); e.info[p] = e.par_token; e.long_state = Cmd.outer_call; break
      case aligning: {
        print(e, ' while scanning preamble'); e.info[p] = right_brace_token + 125; const q = p
        p = get_avail(e); e.link[p] = q; e.info[p] = cs_token_flag + frozen_cr
        e.align_state = -1000000; break
      }
      case absorbing: print(e, ' while scanning text'); e.info[p] = right_brace_token + 125; break
    }
    ins_list(e, p)
    print(e, ' of '); sprint_cs(e, e.warning_index)
    help(e, "I suspect you have forgotten a `}', causing me", 'to read past where you wanted me to stop.',
      "I'll try to recover; but if the error is serious,", "you'd better type `E' or `X' now and fix your file.")
    error(e)
  } else {
    print_err(e, 'Incomplete '); print_cmd_chr(e, Cmd.if_test, e.cur_if)
    print(e, '; all text was ignored after line '); print_int(e, e.skip_line)
    help(e, 'A forbidden control sequence occurred in skipped text.', "This kind of error happens when you say `\\if...' and forget",
      "the matching `\\fi'. I've inserted a `\\fi'; this might work.")
    if (e.cur_cs !== 0) e.cur_cs = 0
    else e.help_line[2] = 'The file ended while I was skipping conditional text.'
    e.cur_tok = cs_token_flag + frozen_fi; ins_error(e)
  }
  e.deletions_allowed = true
}

const is_hex = (c: number) => (c >= 48 && c <= 57) || (c >= 97 && c <= 102)
const hex_val = (c: number) => c <= 57 ? c - 48 : c - 87
const cat_code = (e: Engine, c: number) => e.equiv[cat_code_base + c]!
const end_line_char_inactive = (e: Engine) => int_par(e, end_line_char_code) < 0 || int_par(e, end_line_char_code) > 255

// §355 If an expanded code is present, reduce it and goto start_cs (returns true for goto)
function reduce_expanded(e: Engine, k: number, cat: number): boolean {
  const ci = e.cur_input
  if (e.buffer[k] === e.cur_chr && cat === Cmd.sup_mark && k < ci.limit) {
    const c = e.buffer[k + 1]!
    if (c < 0o200) {
      let d = 2
      if (is_hex(c) && k + 2 <= ci.limit) { const cc = e.buffer[k + 2]!; if (is_hex(cc)) d++ }
      if (d > 2) { e.cur_chr = 16 * hex_val(c) + hex_val(e.buffer[k + 2]!); e.buffer[k - 1] = e.cur_chr }
      else e.buffer[k - 1] = c < 0o100 ? c + 0o100 : c - 0o100
      ci.limit -= d; e.first -= d
      while (k <= ci.limit) { e.buffer[k] = e.buffer[k + d]!; k++ }
      return true
    }
  }
  return false
}

// §341 get_next; the token-list case (§357) is inline, a file line (§343) is next_from_file, which keeps get_next small
// enough for V8 to inline into get_token and get_x_token
export function get_next(e: Engine): void {
  restart: for (;;) {
    e.cur_cs = 0
    const ci = e.cur_input
    if (ci.state !== token_list) { if (next_from_file(e, ci)) continue restart }
    else {
      // §357 Input from token list, goto restart if end of list or if a parameter needs to be expanded
      if (ci.loc !== 0) {
        const t = e.info[ci.loc]!; ci.loc = e.link[ci.loc]!
        if (t >= cs_token_flag) {
          e.cur_cs = t - cs_token_flag
          e.cur_cmd = e.eq_type[e.cur_cs]!; e.cur_chr = e.equiv[e.cur_cs]!
          if (e.cur_cmd >= Cmd.outer_call) outer_or_dont_expand(e, ci)
        } else {
          e.cur_cmd = t >> 8; e.cur_chr = t & 0xff
          if (e.cur_cmd === Cmd.left_brace) e.align_state++
          else if (e.cur_cmd === Cmd.right_brace) e.align_state--
          else if (e.cur_cmd === Cmd.out_param) { // §359
            begin_token_list(e, e.param_stack[ci.limit + e.cur_chr - 1]!, parameter)
            continue restart
          }
        }
      } else { end_token_list(e); continue restart }
    }
    // §342 If an alignment entry has just ended, take appropriate action
    if (e.cur_cmd <= Cmd.car_ret && e.cur_cmd >= Cmd.tab_mark && e.align_state === 0) { insert_v_template(e); continue restart }
    return
  }
}

// §357 an outer control sequence or (§358) the frozen \notexpanded: from a token list (out of get_next to keep it small)
function outer_or_dont_expand(e: Engine, ci: InState): void {
  if (e.cur_cmd === Cmd.dont_expand) { // §358 Get the next token, suppressing expansion
    e.cur_cs = e.info[ci.loc]! - cs_token_flag; ci.loc = 0
    e.cur_cmd = e.eq_type[e.cur_cs]!; e.cur_chr = e.equiv[e.cur_cs]!
    if (e.cur_cmd > Cmd.max_command) { e.cur_cmd = Cmd.relax; e.cur_chr = 257 }
  } else {
    if (e.cur_cs === end_write && e.mode === 0) fatal_error(e, 'Unbalanced write command') // unbalanced-braces.ch
    check_outer_validity(e)
  }
}

// §343 Input from external file, goto restart if no input found: true means goto restart
function next_from_file(e: Engine, ci: InState): boolean {
  sw: for (;;) {
    if (ci.loc <= ci.limit) {
      e.cur_chr = e.buffer[ci.loc++]!
      reswitch: for (;;) {
        e.cur_cmd = cat_code(e, e.cur_chr)
        // §344 Change state if necessary, and goto switch if the current character should be ignored
        const c = e.cur_cmd
        if (c === Cmd.ignore || (c === Cmd.spacer && ci.state !== mid_line)) continue sw
        switch (c) {
          case Cmd.escape: { // §354 Scan a control sequence
            if (ci.loc > ci.limit) e.cur_cs = null_cs
            else start_cs: for (;;) {
              let k = ci.loc
              e.cur_chr = e.buffer[k]!; let cat = cat_code(e, e.cur_chr); k++
              ci.state = cat === Cmd.letter || cat === Cmd.spacer ? skip_blanks : mid_line
              if (cat === Cmd.letter && k <= ci.limit) {
                // §356 Scan ahead in the buffer until finding a nonletter
                do { e.cur_chr = e.buffer[k]!; cat = cat_code(e, e.cur_chr); k++ } while (cat === Cmd.letter && k <= ci.limit)
                if (reduce_expanded(e, k, cat)) continue start_cs
                if (cat !== Cmd.letter) k--
                if (k > ci.loc + 1) { e.cur_cs = id_lookup(e, ci.loc, k - ci.loc); ci.loc = k; break }
              } else if (reduce_expanded(e, k, cat)) continue start_cs
              e.cur_cs = single_base + e.buffer[ci.loc]!; ci.loc++
              break
            }
            e.cur_cmd = e.eq_type[e.cur_cs]!; e.cur_chr = e.equiv[e.cur_cs]!
            if (e.cur_cmd >= Cmd.outer_call) check_outer_validity(e)
            break
          }
          case Cmd.active_char: // §353
            e.cur_cs = e.cur_chr + active_base
            e.cur_cmd = e.eq_type[e.cur_cs]!; e.cur_chr = e.equiv[e.cur_cs]!; ci.state = mid_line
            if (e.cur_cmd >= Cmd.outer_call) check_outer_validity(e)
            break
          case Cmd.sup_mark: // §352
            if (e.cur_chr === e.buffer[ci.loc] && ci.loc < ci.limit) {
              const c1 = e.buffer[ci.loc + 1]!
              if (c1 < 0o200) {
                ci.loc += 2
                if (is_hex(c1) && ci.loc <= ci.limit) {
                  const cc = e.buffer[ci.loc]!
                  if (is_hex(cc)) { ci.loc++; e.cur_chr = 16 * hex_val(c1) + hex_val(cc); continue reswitch }
                }
                e.cur_chr = c1 < 0o100 ? c1 + 0o100 : c1 - 0o100
                continue reswitch
              }
            }
            ci.state = mid_line
            break
          case Cmd.invalid_char: // §346
            print_err(e, 'Text line contains an invalid character')
            help(e, "A funny symbol that I can't read has just been input.", "Continue, and I'll forget that it ever happened.")
            e.deletions_allowed = false; error(e); e.deletions_allowed = true
            return true
          case Cmd.spacer: // §349 (mid_line only)
            ci.state = skip_blanks; e.cur_chr = 32
            break
          case Cmd.car_ret:
            if (ci.state === mid_line) { ci.loc = ci.limit + 1; e.cur_cmd = Cmd.spacer; e.cur_chr = 32 } // §348
            else if (ci.state === skip_blanks) { ci.loc = ci.limit + 1; continue sw } // §350
            else { // §351
              ci.loc = ci.limit + 1; e.cur_cs = e.par_loc; e.cur_cmd = e.eq_type[e.cur_cs]!; e.cur_chr = e.equiv[e.cur_cs]!
              if (e.cur_cmd >= Cmd.outer_call) check_outer_validity(e)
            }
            break
          case Cmd.comment: ci.loc = ci.limit + 1; continue sw
          case Cmd.left_brace: ci.state = mid_line; e.align_state++; break
          case Cmd.right_brace: ci.state = mid_line; e.align_state--; break
          case Cmd.math_shift: case Cmd.tab_mark: case Cmd.mac_param: case Cmd.sub_mark:
          case Cmd.letter: case Cmd.other_char:
            ci.state = mid_line; break
        }
        return false
      }
    } else {
      ci.state = new_line
      // §360 Move to next line of file, or goto restart if there is no next line
      if (ci.name > 17) {
        // §362 Read next line of file into buffer, or goto restart if the file has ended
        e.line++; e.first = ci.start
        if (!e.force_eof) { // etex.ch: pseudo files and \everyeof
          if (ci.name <= 19 ? pseudo_input(e) : input_ln(e, e.input_file[ci.index]!)) firm_up_the_line(e)
          else if (e.equiv[every_eof_loc] !== 0 && !e.eof_seen[ci.index]) {
            ci.limit = e.first - 1; e.eof_seen[ci.index] = true // fake one empty line
            begin_token_list(e, e.equiv[every_eof_loc]!, every_eof_text); return true
          } else e.force_eof = true
        }
        if (e.force_eof) {
          if (int_par(e, tracing_nesting_code) > 0 &&
            (e.grp_stack[e.in_open] !== e.cur_boundary || e.if_stack[e.in_open] !== e.cond_ptr)) file_warning(e)
          if (ci.name >= 19) { print_char(e, 41); e.open_parens-- }
          e.force_eof = false
          end_file_reading(e)
          check_outer_validity(e); return true
        }
        if (end_line_char_inactive(e)) ci.limit--
        else e.buffer[ci.limit] = int_par(e, end_line_char_code)
        e.first = ci.limit + 1; ci.loc = ci.start
      } else {
        if (ci.name !== 0) { e.cur_cmd = 0; e.cur_chr = 0; return false } // §342 does not apply to cur_cmd=0
        if (e.input_ptr > 0) { end_file_reading(e); return true }
        if (e.selector < log_only) open_log_file(e)
        if (e.interaction > nonstop_mode) {
          if (end_line_char_inactive(e)) ci.limit++
          if (ci.limit === ci.start) print_nl(e, "(Please type a command or say `\\end')")
          print_ln(e); e.first = ci.start
          prompt_input(e, '*')
          ci.limit = e.last
          if (end_line_char_inactive(e)) ci.limit--
          else e.buffer[ci.limit] = int_par(e, end_line_char_code)
          e.first = ci.limit + 1; ci.loc = ci.start
        } else fatal_error(e, '*** (job aborted, no legal \\end found)')
      }
    }
  }
}

// §363 firm_up_the_line; \pausing needs the terminal, so only limit:=last
export function firm_up_the_line(e: Engine): void {
  e.cur_input.limit = e.last
}

// §365 get_token
export function get_token(e: Engine): void {
  e.no_new_control_sequence = false; get_next(e); e.no_new_control_sequence = true
  e.cur_tok = e.cur_cs === 0 ? e.cur_cmd * 0o400 + e.cur_chr : cs_token_flag + e.cur_cs
}
