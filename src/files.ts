// §511–538 file names, the log file, \input
import type { Engine } from './engine.ts'
import { log_only, Cmd, scroll_mode } from './types.ts'
import type { InputFile } from './input.ts'
import { fatal_error, print_err, show_context, token_list } from './error.ts'
import { get_x_token } from './expand.ts'
import { print, print_char, print_nl, print_ln, print_int, print_two, slow_print } from './print.ts'
import { int_par, end_line_char_code } from './eqtb.ts'
import { begin_file_reading, end_file_reading, back_input, input_ln, firm_up_the_line, new_line } from './input.ts'
import { max_print_line } from './types.ts'

// §480 read_open states
export const just_open = 1, closed = 2

// §534 open_log_file; the log lives in Engine.log
export function open_log_file(e: Engine): void {
  const old_setting = e.selector
  if (e.job_name === '') e.job_name = 'texput'
  e.selector = log_only; e.log_opened = true
  // §536 Print the banner line, including the date and time
  e.log += 'This is tstex, Version 3.141592653'
  slow_print(e, e.format_ident); print(e, '  ')
  print_int(e, e.sys_day); print_char(e, 32)
  e.log += 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'.slice(3 * e.sys_month - 3, 3 * e.sys_month)
  print_char(e, 32); print_int(e, e.sys_year); print_char(e, 32)
  print_two(e, Math.trunc(e.sys_time / 60)); print_char(e, 58); print_two(e, e.sys_time % 60)
  e.input_stack[e.input_ptr] = e.cur_input
  print_nl(e, '**')
  let l = e.input_stack[0]!.limit
  if (e.buffer[l] === int_par(e, end_line_char_code)) l--
  for (let k = 1; k <= l; k++) print(e, e.buffer[k]!)
  print_ln(e)
  e.selector = old_setting + 2
}

// §515 begin_name (tex.ch: quoted names)
function begin_name(e: Engine): void {
  e.name_chars = []; e.area_delimiter = 0; e.ext_delimiter = 0; e.quoted_filename = false
}

// §516 more_name (tex.ch: quotes, '/' separates the area, the last '.' starts the extension)
export function more_name(e: Engine, c: number): boolean {
  if (c === 32 && !e.quoted_filename) return false // stop_at_space is always true here
  if (c === 34) { e.quoted_filename = !e.quoted_filename; return true }
  e.name_chars.push(c)
  if (c === 47) { e.area_delimiter = e.name_chars.length; e.ext_delimiter = 0 }
  else if (c === 46) e.ext_delimiter = e.name_chars.length
  return true
}

// §517 end_name
function end_name(e: Engine): void {
  const s = String.fromCharCode(...e.name_chars)
  e.cur_area = s.slice(0, e.area_delimiter)
  if (e.ext_delimiter === 0) { e.cur_ext = ''; e.cur_name = s.slice(e.area_delimiter) }
  else { e.cur_name = s.slice(e.area_delimiter, e.ext_delimiter - 1); e.cur_ext = s.slice(e.ext_delimiter - 1) }
}

// §526 scan_file_name (tex.ch: look for a braced name, stop at the end of a line)
export function scan_file_name(e: Engine): void {
  e.name_in_progress = true
  const save_warning_index = e.warning_index; e.warning_index = e.cur_cs
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer) // §406
  back_input(e)
  if (e.cur_cmd === Cmd.left_brace) fatal_error(e, 'unsupported: braced file name') // shortcut: scan_file_name_braced, port it when a test needs \input{...}
  begin_name(e)
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer)
  for (;;) {
    if (e.cur_cmd > Cmd.other_char || e.cur_chr > 255) { back_input(e); break }
    if (e.cur_chr === 32 && e.cur_input.state !== token_list && e.cur_input.loc > e.cur_input.limit) break
    if (!more_name(e, e.cur_chr)) break
    get_x_token(e)
  }
  end_name(e); e.name_in_progress = false
  e.warning_index = save_warning_index
}

// §519 pack_file_name and web2c's a_open_in with kpse_tex_format: try `name.tex' before `name'; returns the name found
export function open_tex_file(e: Engine): { name: string, file: InputFile } | null {
  const full = e.cur_area + e.cur_name + e.cur_ext
  for (const name of e.cur_ext === '.tex' ? [full] : [full + '.tex', full]) {
    const data = e.fs.find(name, 'tex')
    if (data !== null) return { name, file: { data, pos: 0 } }
  }
  return null
}

// §518 print_file_name (tex.ch: quoted when a component contains a space; quotes inside are dropped)
function print_file_name(e: Engine, n: string, a: string, x: string): void {
  const s = a + n + x, must_quote = s.includes(' ')
  if (must_quote) print_char(e, 34)
  for (let j = 0; j < s.length; j++) if (s.charCodeAt(j) !== 34) print(e, s.charCodeAt(j))
  if (must_quote) print_char(e, 34)
}

// §530 prompt_file_name (tex.ch wording); no terminal, so every interaction mode ends here
function prompt_file_name(e: Engine, s: string, ext: string): never {
  if (s === 'input file name') print_err(e, "I can't find file `")
  else print_err(e, "I can't write on file `")
  print_file_name(e, e.cur_name, e.cur_area, e.cur_ext); print(e, "'.")
  if (ext === '.tex' || ext === '') show_context(e)
  print_ln(e); print(e, '(Press Enter to retry, or Control-D to exit')
  if (ext !== '') { print(e, "; default file extension is `"); print(e, ext); print(e, "'") }
  print(e, ')'); print_ln(e)
  print_nl(e, 'Please type another '); print(e, s)
  if (e.interaction < scroll_mode) fatal_error(e, '*** (job aborted, file error in nonstop mode)')
  fatal_error(e, 'unsupported: terminal input')
}

// §537 start_input (tex.ch: no forced `.tex', print the name as found)
export function start_input(e: Engine): void {
  scan_file_name(e)
  let found
  for (;;) {
    begin_file_reading(e)
    if ((found = open_tex_file(e)) !== null) break
    end_file_reading(e)
    prompt_file_name(e, 'input file name', '')
  }
  e.input_file[e.cur_input.index] = found.file
  e.cur_input.name = 20 // any string number >19 marks a file level
  if (e.job_name === '') { e.job_name = e.cur_name; open_log_file(e) }
  if (e.term_offset + found.name.length > max_print_line - 2) print_ln(e)
  else if (e.term_offset > 0 || e.file_offset > 0) print_char(e, 32)
  print_char(e, 40); e.open_parens++; slow_print(e, found.name)
  e.cur_input.state = new_line
  // §538 Read the first line of the new file
  e.line = 1
  input_ln(e, found.file)
  firm_up_the_line(e)
  if (int_par(e, end_line_char_code) < 0 || int_par(e, end_line_char_code) > 255) e.cur_input.limit--
  else e.buffer[e.cur_input.limit] = int_par(e, end_line_char_code)
  e.first = e.cur_input.limit + 1; e.cur_input.loc = e.cur_input.start
}
