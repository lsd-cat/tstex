// §534–538 the log file and \input of the main file
import type { Engine } from './engine.ts'
import { log_only } from './types.ts'
import { print, print_char, print_nl, print_ln, print_int, print_two, slow_print } from './print.ts'
import { int_par, end_line_char_code } from './eqtb.ts'
import { begin_file_reading, input_ln, firm_up_the_line, new_line } from './input.ts'
import { max_print_line } from './types.ts'

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

// §537 start_input, for the file named on the command line; scan_file_name is not ported:
// shortcut: the name comes from Engine.run, \input needs §511–533 and a synchronous TexFS (next M1 slice)
export function start_input(e: Engine, name: string, data: Uint8Array): void {
  begin_file_reading(e)
  e.input_file[e.cur_input.index] = { data, pos: 0 }
  e.cur_input.name = 20 // any string number >19 marks a file level
  if (e.job_name === '') { e.job_name = name.replace(/\.tex$/, ''); open_log_file(e) }
  if (e.term_offset + name.length > max_print_line - 2) print_ln(e)
  else if (e.term_offset > 0 || e.file_offset > 0) print_char(e, 32)
  print_char(e, 40); e.open_parens++; slow_print(e, name)
  e.cur_input.state = new_line
  // §538 Read the first line of the new file
  e.line = 1
  input_ln(e, e.input_file[e.cur_input.index]!)
  firm_up_the_line(e)
  if (int_par(e, end_line_char_code) < 0 || int_par(e, end_line_char_code) > 255) e.cur_input.limit--
  else e.buffer[e.cur_input.limit] = int_par(e, end_line_char_code)
  e.first = e.cur_input.limit + 1; e.cur_input.loc = e.cur_input.start
}
