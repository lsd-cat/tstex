// §72–98 reporting errors (no interactive dialog: error_stop_mode's prompt is a fatal error), §311–320 show_context
import type { Engine } from './engine.ts'
import { batch_mode, error_stop_mode, scroll_mode, error_message_issued, fatal_error_stop, term_and_log, term_only, pseudo } from './types.ts'
import { print, print_char, print_nl, print_ln, print_int } from './print.ts'
import { int_par, error_context_lines_code, end_line_char_code, err_help_loc } from './eqtb.ts'
import { print_cs } from './hash.ts'
import { show_token_list, set_trick_count, token_show } from './tokens.ts'
import { open_log_file } from './files.ts'
import { end_file_reading, prompt_input } from './input.ts'

// §81 jump_out unwinds to Engine.run, which calls close_files_and_terminate (tex.ch)
export class JumpOut { }

// §73 print_err
export function print_err(e: Engine, s: string): void {
  print_nl(e, '! '); print(e, s)
}

// §79 help0..help6: lines are given in reading order
export function help(e: Engine, ...lines: string[]): void {
  e.help_line = lines.reverse(); e.help_ptr = lines.length
}

// §82 error
export function error(e: Engine): void {
  if (e.history < error_message_issued) e.history = error_message_issued
  print_char(e, 46); show_context(e)
  if (e.interaction === error_stop_mode) { // §83 Get user's advice and return; only the empty answer is ported
    clear_for_error_prompt(e); prompt_input(e, '? ')
    if (e.last === e.first) return
    fatal_error(e, 'unsupported: terminal dialogue response ' + String.fromCharCode(e.buffer[e.first]!))
  }
  e.error_count++
  if (e.error_count === 100) {
    print_nl(e, '(That makes 100 errors; please try again.)')
    e.history = fatal_error_stop; throw new JumpOut()
  }
  // §90 Put help message on the transcript file
  if (e.interaction > batch_mode) e.selector--
  if (e.use_err_help) { print_ln(e); token_show(e, e.equiv[err_help_loc]!) } // §1284 give_err_help
  else while (e.help_ptr > 0) { e.help_ptr--; print_nl(e, e.help_line[e.help_ptr]!) }
  print_ln(e)
  if (e.interaction > batch_mode) e.selector++
  print_ln(e)
}

// §330 clear_for_error_prompt
function clear_for_error_prompt(e: Engine): void {
  while (e.cur_input.state !== token_list && e.cur_input.name === 0 && e.input_ptr > 0 && e.cur_input.loc > e.cur_input.limit) end_file_reading(e)
  print_ln(e)
}

// §91 int_error
export function int_error(e: Engine, n: number): void {
  print(e, ' ('); print_int(e, n); print_char(e, 41); error(e)
}

// §92 normalize_selector
export function normalize_selector(e: Engine): void {
  e.selector = e.log_opened ? term_and_log : term_only
  if (e.job_name === '') open_log_file(e)
  if (e.interaction === batch_mode) e.selector--
}

// §93 succumb
export function succumb(e: Engine): never {
  if (e.interaction === error_stop_mode) e.interaction = scroll_mode
  if (e.log_opened) error(e)
  e.history = fatal_error_stop; throw new JumpOut()
}

// §93 fatal_error
export function fatal_error(e: Engine, s: string): never {
  normalize_selector(e)
  print_err(e, 'Emergency stop'); help(e, s); succumb(e)
}

// §94 overflow
export function overflow(e: Engine, s: string, n: number): never {
  normalize_selector(e)
  print_err(e, 'TeX capacity exceeded, sorry [')
  print(e, s); print_char(e, 61); print_int(e, n); print_char(e, 93)
  help(e, 'If you really absolutely need more capacity,', 'you can ask a wizard to enlarge me.')
  succumb(e)
}

// §95 confusion
export function confusion(e: Engine, s: string): never {
  normalize_selector(e)
  if (e.history < error_message_issued) {
    print_err(e, "This can't happen ("); print(e, s); print_char(e, 41)
    help(e, "I'm broken. Please show this to someone who can fix can fix")
  } else {
    print_err(e, "I can't go on meeting you like this")
    help(e, 'One of your faux pas seems to have wounded me deeply...',
      'in fact, I\'m barely conscious. Please fix it and try again.')
  }
  succumb(e)
}

// §307 token_type codes
export const token_list = 0
export const parameter = 0, u_template = 1, v_template = 2, backed_up = 3, inserted = 4, macro = 5,
  output_text = 6, every_par_text = 7, every_job_text = 12, mark_text = 14,
  every_eof_text = 19, write_text = 20 // pdftex: loc - eTeX_text_offset, past the four pdftex token lists
const token_type_names = ['<argument> ', '<template> ', '<template> ', '', '<inserted text> ', '',
  '<output> ', '<everypar> ', '<everymath> ', '<everydisplay> ', '<everyhbox> ', '<everyvbox> ',
  '<everyjob> ', '<everycr> ', '<mark> ', '?', '?', '?', '?', '<everyeof> ', '<write> ']

// §311 show_context
export function show_context(e: Engine): void {
  e.base_ptr = e.input_ptr; e.input_stack[e.base_ptr] = e.cur_input
  let nn = -1, bottom_line = false
  for (;;) {
    e.cur_input = e.input_stack[e.base_ptr]!
    const ci = e.cur_input
    if (ci.state !== token_list && (ci.name > 19 || e.base_ptr === 0)) bottom_line = true
    if (e.base_ptr === e.input_ptr || bottom_line || nn < int_par(e, error_context_lines_code)) {
      // §312 Display the current context
      if (e.base_ptr === e.input_ptr || ci.state !== token_list || ci.index !== backed_up || ci.loc !== 0) {
        e.tally = 0
        const old_setting = e.selector
        let l: number
        if (ci.state !== token_list) {
          // §313 Print location of current line
          if (ci.name <= 17) {
            if (ci.name === 0) print_nl(e, e.base_ptr === 0 ? '<*>' : '<insert> ')
            else { print_nl(e, '<read '); if (ci.name === 17) print_char(e, 42); else print_int(e, ci.name - 1); print_char(e, 62) }
          } else {
            print_nl(e, 'l.')
            print_int(e, ci.index === e.in_open ? e.line : e.line_stack[ci.index + 1]!)
          }
          print_char(e, 32)
          // §318 Pseudoprint the line
          l = e.tally; e.tally = 0; e.selector = pseudo; e.trick_count = 1000000
          const j = e.buffer[ci.limit] === int_par(e, end_line_char_code) ? ci.limit : ci.limit + 1
          if (j > 0) for (let i = ci.start; i < j; i++) {
            if (i === ci.loc) set_trick_count(e)
            print(e, e.buffer[i]!)
          }
        } else {
          // §314 Print type of token list
          if (ci.index === backed_up) print_nl(e, ci.loc === 0 ? '<recently read> ' : '<to be read again> ')
          else if (ci.index === macro) { print_ln(e); print_cs(e, ci.name) }
          else print_nl(e, token_type_names[ci.index] ?? '?')
          // §319 Pseudoprint the token list
          l = e.tally; e.tally = 0; e.selector = pseudo; e.trick_count = 1000000
          if (ci.index < macro) show_token_list(e, ci.start, ci.loc, 100000)
          else show_token_list(e, e.link[ci.start]!, ci.loc, 100000)
        }
        e.selector = old_setting
        // §317 Print two lines using the tricky pseudoprinted information
        if (e.trick_count === 1000000) set_trick_count(e)
        const m = e.tally < e.trick_count ? e.tally - e.first_count : e.trick_count - e.first_count
        let p: number, n: number
        if (l + e.first_count <= e.lim.half_error_line) { p = 0; n = l + e.first_count }
        else { print(e, '...'); p = l + e.first_count - e.lim.half_error_line + 3; n = e.lim.half_error_line }
        for (let q = p; q < e.first_count; q++) print_char(e, e.trick_buf[q % e.lim.error_line]!)
        print_ln(e)
        for (let q = 1; q <= n; q++) print_char(e, 32)
        p = m + n <= e.lim.error_line ? e.first_count + m : e.first_count + (e.lim.error_line - n - 3)
        for (let q = e.first_count; q < p; q++) print_char(e, e.trick_buf[q % e.lim.error_line]!)
        if (m + n > e.lim.error_line) print(e, '...')
        nn++
      }
    } else if (nn === int_par(e, error_context_lines_code)) { print_nl(e, '...'); nn++ }
    if (bottom_line) break
    e.base_ptr--
  }
  e.cur_input = e.input_stack[e.input_ptr]!
}
