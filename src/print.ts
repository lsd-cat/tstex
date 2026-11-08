// §54–71 on-line and off-line printing; §245 begin/end_diagnostic; §211 print_mode
import type { Engine } from './engine.ts'
import { no_print, term_only, log_only, term_and_log, pseudo, new_string, Cmd, spotless, warning_issued } from './types.ts'
import { int_base, new_line_char_code, escape_char_code, tracing_online_code } from './eqtb.ts'

// §48–49 the str_pool representation of character k (TeX Live -ini: printable is 32..126)
function char_rep(k: number): string {
  if (k >= 32 && k < 127) return String.fromCharCode(k)
  if (k < 64) return '^^' + String.fromCharCode(k + 64)
  if (k < 128) return '^^' + String.fromCharCode(k - 64)
  return '^^' + k.toString(16).padStart(2, '0')
}

// §57 print_ln
export function print_ln(e: Engine): void {
  switch (e.selector) {
    case term_and_log: e.log += '\n'; e.terminal += '\n'; e.term_offset = 0; e.file_offset = 0; break
    case log_only: e.log += '\n'; e.file_offset = 0; break
    case term_only: e.terminal += '\n'; e.term_offset = 0; break
    default: if (e.selector < 16) write_file_out(e, '\n') // §57 write_ln(write_file[selector])
  }
}

// §57–58 output to an open \write file, collected in Engine.outputFiles
function write_file_out(e: Engine, s: string): void {
  const n = e.write_name[e.selector]!
  e.outputFiles.set(n, e.outputFiles.get(n)! + s)
}

// §58 print_char; terminal output is collected in Engine.terminal
export function print_char(e: Engine, s: number): void {
  if (s === e.equiv[int_base + new_line_char_code] && e.selector < pseudo) { print_ln(e); return }
  switch (e.selector) {
    case term_and_log:
      e.log += String.fromCharCode(s); e.terminal += String.fromCharCode(s); e.term_offset++; e.file_offset++
      if (e.term_offset === e.lim.max_print_line) { e.terminal += '\n'; e.term_offset = 0 }
      if (e.file_offset === e.lim.max_print_line) { e.log += '\n'; e.file_offset = 0 }
      break
    case log_only:
      e.log += String.fromCharCode(s); e.file_offset++
      if (e.file_offset === e.lim.max_print_line) print_ln(e)
      break
    case term_only:
      e.terminal += String.fromCharCode(s); e.term_offset++
      if (e.term_offset === e.lim.max_print_line) print_ln(e)
      break
    case no_print: break
    case pseudo: if (e.tally < e.trick_count) e.trick_buf[e.tally % e.lim.error_line] = s; break
    case new_string: e.cur_str.push(s); break
    default: write_file_out(e, String.fromCharCode(s)) // a \write stream 0..15
  }
  e.tally++
}

// §59 print; a number or a one-character string is TeX's single-character string
export function print(e: Engine, s: string | number): void {
  if (typeof s === 'string' && s.length === 1) s = s.charCodeAt(0)
  if (typeof s === 'number') {
    if (e.selector > pseudo && !e.message_printing) { print_char(e, s); return } // enctex1.ch: \message strings get the ^^ form
    if (s === e.equiv[int_base + new_line_char_code]) {
      if (e.selector < pseudo) { print_ln(e); return }
      if (e.message_printing) { print_char(e, s); return }
    }
    const nl = e.equiv[int_base + new_line_char_code]!; e.equiv[int_base + new_line_char_code] = -1
    const r = char_rep(s)
    for (let j = 0; j < r.length; j++) print_char(e, r.charCodeAt(j))
    e.equiv[int_base + new_line_char_code] = nl
    return
  }
  for (let j = 0; j < s.length; j++) print_char(e, s.charCodeAt(j))
}

// §60 slow_print
export function slow_print(e: Engine, s: string): void {
  for (let j = 0; j < s.length; j++) print(e, s.charCodeAt(j))
}

// §62 print_nl (showstream.ch: always a new line on a \write stream)
export function print_nl(e: Engine, s: string | number): void {
  if (e.selector < no_print || (e.term_offset > 0 && (e.selector & 1) === 1) || (e.file_offset > 0 && e.selector >= log_only)) print_ln(e)
  print(e, s)
}

// §63 print_esc
export function print_esc(e: Engine, s: string | number): void {
  const c = e.equiv[int_base + escape_char_code]!
  if (c >= 0 && c < 256) print(e, c)
  if (typeof s === 'number') print(e, s); else slow_print(e, s)
}

// §64 print_the_digs
export function print_the_digs(e: Engine, k: number): void {
  while (k > 0) {
    k--
    if (e.dig[k]! < 10) print_char(e, 48 + e.dig[k]!)
    else print_char(e, 55 + e.dig[k]!)
  }
}

// §65 print_int
export function print_int(e: Engine, n: number): void {
  let k = 0
  if (n < 0) {
    print_char(e, 45)
    if (n > -100000000) n = -n
    else {
      let m = -1 - n; n = Math.trunc(m / 10); m = (m % 10) + 1; k = 1
      if (m < 10) e.dig[0] = m
      else { e.dig[0] = 0; n++ }
    }
  }
  do { e.dig[k] = n % 10; n = Math.trunc(n / 10); k++ } while (n !== 0)
  print_the_digs(e, k)
}

// §66 print_two
export function print_two(e: Engine, n: number): void {
  n = Math.abs(n) % 100
  print_char(e, 48 + Math.trunc(n / 10)); print_char(e, 48 + (n % 10))
}

// §67 print_hex
export function print_hex(e: Engine, n: number): void {
  let k = 0
  print_char(e, 34)
  do { e.dig[k] = n % 16; n = Math.trunc(n / 16); k++ } while (n !== 0)
  print_the_digs(e, k)
}

// §69 print_roman_int
export function print_roman_int(e: Engine, n: number): void {
  const s = 'm2d5c2l5x2v5i'
  let j = 0, v = 1000
  for (;;) {
    while (n >= v) { print_char(e, s.charCodeAt(j)); n -= v }
    if (n <= 0) return
    let k = j + 2, u = Math.trunc(v / (s.charCodeAt(k - 1) - 48))
    if (s[k - 1] === '2') { k += 2; u = Math.trunc(u / (s.charCodeAt(k - 1) - 48)) }
    if (n + u >= v) { print_char(e, s.charCodeAt(k)); n += u }
    else { j += 2; v = Math.trunc(v / (s.charCodeAt(j - 1) - 48)) }
  }
}

// §70 print_current_string
export function print_current_string(e: Engine): void {
  for (const c of e.cur_str) print_char(e, c)
}

// §211 print_mode
export function print_mode(e: Engine, m: number): void {
  if (m > 0) print(e, ['vertical', 'horizontal', 'display math'][Math.trunc(m / (Cmd.max_command + 1))]!)
  else if (m === 0) print(e, 'no')
  else print(e, ['internal vertical', 'restricted horizontal', 'math'][Math.trunc(-m / (Cmd.max_command + 1))]!)
  print(e, ' mode')
}

// §245 begin_diagnostic
export function begin_diagnostic(e: Engine): void {
  e.old_setting = e.selector
  if (e.equiv[int_base + tracing_online_code]! <= 0 && e.selector === term_and_log) {
    e.selector--
    if (e.history === spotless) e.history = warning_issued
  }
}

// §245 end_diagnostic
export function end_diagnostic(e: Engine, blank_line: boolean): void {
  print_nl(e, '')
  if (blank_line) print_ln(e)
  e.selector = e.old_setting
}
