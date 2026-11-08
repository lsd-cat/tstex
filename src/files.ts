// §511–538 file names, the log file, \input
import { synctex_start_input } from './synctex.ts'
import type { Engine } from './engine.ts'
import { log_only, Cmd, scroll_mode } from './types.ts'
import type { InputFile } from './input.ts'
import { fatal_error, print_err, show_context, token_list } from './error.ts'
import { get_x_token } from './expand.ts'
import { print, print_char, print_nl, print_ln, print_int, print_two, slow_print, begin_diagnostic, end_diagnostic } from './print.ts'
import { int_par, end_line_char_code, tracing_stack_levels_code } from './eqtb.ts'
import { scan_toks } from './scan.ts'
import { prompt_input } from './input.ts'
import { tokens_to_string } from './tokens.ts'
import { delete_token_ref } from './nodes.ts'
import { candidates } from './platform/lookup.ts'
import { begin_file_reading, end_file_reading, back_input, input_ln, firm_up_the_line, new_line } from './input.ts'

// §480 read_open states
export const just_open = 1, closed = 2

// §534 open_log_file; the log lives in Engine.log
export function open_log_file(e: Engine): void {
  const old_setting = e.selector
  if (e.job_name === '') e.job_name = e.c_job_name || 'texput' // tex.ch get_job_name
  e.selector = log_only; e.log_opened = true
  // §536 Print the banner line, including the date and time
  e.log += 'This is tstex, Version 3.141592653'
  slow_print(e, e.format_ident); print(e, '  ')
  print_int(e, e.sys_day); print_char(e, 32)
  e.log += 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'.slice(3 * e.sys_month - 3, 3 * e.sys_month)
  print_char(e, 32); print_int(e, e.sys_year); print_char(e, 32)
  print_two(e, Math.trunc(e.sys_time / 60)); print_char(e, 58); print_two(e, e.sys_time % 60)
  if (e.eTeX_ex) e.log += '\nentering extended mode' // etex.ch: wlog_cr, wlog (file_offset unchanged)
  if (e.translate_filename !== '') e.log += '\n (' + e.translate_filename + ')' // tex.ch
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
  if (c === 32 && e.stop_at_space && !e.quoted_filename) return false
  if (c === 34) { e.quoted_filename = !e.quoted_filename; return true }
  e.name_chars.push(c)
  if (c === 47) { e.area_delimiter = e.name_chars.length; e.ext_delimiter = 0 }
  else if (c === 46) e.ext_delimiter = e.name_chars.length
  return true
}

// §517 end_name
function end_name(e: Engine): void {
  const s = e.name_chars.map(c => String.fromCharCode(c)).join('') // no spread: a name may exceed the argument limit
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
  if (e.cur_cmd === Cmd.left_brace) scan_file_name_braced(e)
  else {
    begin_name(e)
    do get_x_token(e); while (e.cur_cmd === Cmd.spacer)
    for (;;) {
      if (e.cur_cmd > Cmd.other_char || e.cur_chr > 255) { back_input(e); break }
      if (e.cur_chr === 32 && e.cur_input.state !== token_list && e.cur_input.loc > e.cur_input.limit) break
      if (!more_name(e, e.cur_chr)) break
      get_x_token(e)
    }
  }
  end_name(e); e.name_in_progress = false
  e.warning_index = save_warning_index
}

// tex.ch scan_file_name_braced: the balanced text, expanded, as a string fed to more_name with spaces allowed
function scan_file_name_braced(e: Engine): void {
  const save_scanner_status = e.scanner_status, save_def_ref = e.def_ref, save_cur_cs = e.cur_cs
  e.cur_cs = e.warning_index
  scan_toks(e, false, true)
  const s = tokens_to_string(e, e.def_ref)
  delete_token_ref(e, e.def_ref)
  e.def_ref = save_def_ref; e.cur_cs = save_cur_cs; e.scanner_status = save_scanner_status
  const save_stop_at_space = e.stop_at_space; e.stop_at_space = false
  begin_name(e)
  for (const c of s) more_name(e, c)
  e.stop_at_space = save_stop_at_space
}

// §519 pack_file_name and web2c's a_open_in with kpse_tex_format (the TexFS applies kpathsea's name.tex-first rule); a file
// this run has written (and flushed) is read back first.
// shortcut: a written `name' wins over a `name.tex' already in the cwd (kpathsea would take the latter), never seen in practice
function written(e: Engine, name: string): { name: string, data: Uint8Array } | null {
  for (const n of candidates(name, 'tex')) {
    const out = e.outputFiles.get(n.replace(/^(\.\/)+/, ''))
    if (out !== undefined) return { name: n, data: Uint8Array.from(out, c => c.charCodeAt(0)) }
  }
  return null
}
// returns the name as kpathsea prints it: `./name' for a hit in the current directory, else the path in the texmf tree
export function open_tex_file(e: Engine): { name: string, file: InputFile } | null {
  const full = e.cur_area + e.cur_name + e.cur_ext, w = written(e, full)
  if (w !== null) return { name: /^\.?\//.test(w.name) ? w.name : './' + w.name, file: { data: w.data, pos: 0 } }
  const data = e.fs.find(full, 'tex')
  return data && { name: e.fs.path?.(full, 'tex') ?? (/^\.?\//.test(full) ? full : './' + full), file: { data, pos: 0 } }
}

// utils.c kpse_find_tex for \pdffilesize, \pdfmdfivesum file, \pdffilemoddate: files this run wrote come first, as on disk
export const find_tex_file = (e: Engine, name: string): Uint8Array | null => written(e, name)?.data ?? e.fs.find(name, 'tex')

// kpse_find_file for the back end's .map and .enc files: one this run has written is found first, in the cwd; kpathsea's
// open_input names such a file without the `./' that \input shows
export function find_backend_file(e: Engine, name: string, kind: string): { data: Uint8Array, path: string } | null {
  for (const n of candidates(name, kind)) {
    const out = e.outputFiles.get(n.replace(/^(\.\/)+/, ''))
    if (out !== undefined) return { data: Uint8Array.from(out, c => c.charCodeAt(0)), path: n }
  }
  const data = e.fs.find(name, kind)
  return data && { data, path: e.fs.path?.(name, kind)?.replace(/^\.\//, '') ?? name }
}

// §518 print_file_name (tex.ch: quoted when a component contains a space; quotes inside are dropped)
export function print_file_name(e: Engine, n: string, a: string, x: string): void {
  const s = a + n + x, must_quote = s.includes(' ')
  if (must_quote) print_char(e, 34)
  for (let j = 0; j < s.length; j++) if (s.charCodeAt(j) !== 34) print(e, s.charCodeAt(j))
  if (must_quote) print_char(e, 34)
}

// §530 prompt_file_name (tex.ch wording); no terminal, so every interaction mode ends here
export function prompt_file_name(e: Engine, s: string, ext: string): never {
  if (s === 'input file name') print_err(e, "I can't find file `")
  else print_err(e, "I can't write on file `")
  print_file_name(e, e.cur_name, e.cur_area, e.cur_ext); print(e, "'.")
  if (ext === '.tex' || ext === '') show_context(e)
  print_ln(e); print(e, '(Press Enter to retry, or Control-D to exit')
  if (ext !== '') { print(e, "; default file extension is `"); print(e, ext); print(e, "'") }
  print(e, ')'); print_ln(e)
  print_nl(e, 'Please type another '); print(e, s)
  if (e.interaction < scroll_mode) fatal_error(e, '*** (job aborted, file error in nonstop mode)')
  prompt_input(e, ': ') // clear_terminal; with no terminal lines left this is `End of file on the terminal!'
  fatal_error(e, 'unsupported: terminal input') // shortcut: §531 Scan file name in the buffer is not ported
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
  // tex.ch make_name_string: cur_area/cur_name/cur_ext now describe the file found
  const sl = found.name.lastIndexOf('/') + 1, dot = found.name.lastIndexOf('.')
  e.cur_area = found.name.slice(0, sl)
  e.cur_name = found.name.slice(sl, dot >= sl ? dot : undefined); e.cur_ext = dot >= sl ? found.name.slice(dot) : ''
  e.cur_input.name = 20 // any string number >19 marks a file level
  if (e.job_name === '') { e.job_name = e.c_job_name || e.cur_name; open_log_file(e) } // tex.ch get_job_name: -jobname wins
  if (e.term_offset + found.name.length > e.lim.max_print_line - 2) print_ln(e)
  else if (e.term_offset > 0 || e.file_offset > 0) print_char(e, 32)
  print_char(e, 40); e.open_parens++; slow_print(e, found.name)
  if (int_par(e, tracing_stack_levels_code) > 0) { // tracingstacklevels.ch
    begin_diagnostic(e); print_ln(e); print_char(e, 126)
    let v = e.input_ptr - 1
    if (v < int_par(e, tracing_stack_levels_code)) while (v > 0) { print_char(e, 46); v-- }
    else print_char(e, 126)
    slow_print(e, 'INPUT '); slow_print(e, e.cur_name); slow_print(e, e.cur_ext); print_ln(e)
    end_diagnostic(e, false)
  }
  e.cur_input.state = new_line
  synctex_start_input(e, found.name) // synctex-rec.ch0 Prepare new file SyncTeX information
  // §538 Read the first line of the new file
  e.line = 1
  input_ln(e, found.file)
  firm_up_the_line(e)
  if (int_par(e, end_line_char_code) < 0 || int_par(e, end_line_char_code) > 255) e.cur_input.limit--
  else e.buffer[e.cur_input.limit] = int_par(e, end_line_char_code)
  e.first = e.cur_input.limit + 1; e.cur_input.loc = e.cur_input.start
}
