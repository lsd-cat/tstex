// §289–299 token lists: representation, show_token_list, print_meaning, print_cmd_chr
import type { Engine } from './engine.ts'
import { Cmd } from './types.ts'
import { print, print_char, print_esc, print_nl, print_ln, print_hex, print_mode, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_cs } from './hash.ts'
import { registry } from './primitives/index.ts'

import { cs_token_flag, protected_token, int_base, new_string } from './types.ts'
import { print_int } from './print.ts'
import { print_if_line, tracing_ifs_code } from './etex.ts'
export * from './types.ts'

// §292 show_token_list
export function show_token_list(e: Engine, p: number, q: number, l: number): void {
  let match_chr = 35, n = 48
  e.tally = 0
  while (p !== 0 && e.tally < l) {
    if (p === q) set_trick_count(e) // §320
    // §293 Display token p, and return if there are problems
    const t = e.info[p]!
    if (t >= cs_token_flag) print_cs(e, t - cs_token_flag)
    else {
      const m = t >> 8, c = t & 0xff
      if (t < 0) print_esc(e, 'BAD.')
      else switch (m) { // §294
        case Cmd.left_brace: case Cmd.right_brace: case Cmd.math_shift: case Cmd.tab_mark:
        case Cmd.sup_mark: case Cmd.sub_mark: case Cmd.spacer: case Cmd.letter: case Cmd.other_char:
          print(e, c); break
        case Cmd.mac_param: print(e, c); print(e, c); break
        case Cmd.out_param:
          print(e, match_chr)
          if (c <= 9) print_char(e, c + 48)
          else { print_char(e, 33); return }
          break
        case Cmd.match:
          match_chr = c; print(e, c); n++; print_char(e, n)
          if (n > 57) return
          break
        case Cmd.end_match: if (c === 0) print(e, '->'); break // etex.ch: protected_token prints nothing
        default: print_esc(e, 'BAD.')
      }
    }
    p = e.link[p]!
  }
  if (p !== 0) print_esc(e, 'ETC.')
}

// §316 set_trick_count
export function set_trick_count(e: Engine): void {
  e.first_count = e.tally
  e.trick_count = e.tally + 1 + e.lim.error_line - e.lim.half_error_line
  if (e.trick_count < e.lim.error_line) e.trick_count = e.lim.error_line
}

// §295 token_show
export function token_show(e: Engine, p: number): void {
  if (p !== 0) show_token_list(e, e.link[p]!, 0, 10000000)
}

// §296 print_meaning
export function print_meaning(e: Engine): void {
  print_cmd_chr(e, e.cur_cmd, e.cur_chr)
  if (e.cur_cmd >= Cmd.call) { print_char(e, 58); print_ln(e); token_show(e, e.cur_chr) }
  else if (e.cur_cmd === Cmd.top_bot_mark && e.cur_chr < 5) { print_char(e, 58); print_ln(e); token_show(e, e.cur_mark[e.cur_chr]!) } // etex.ch: not \topmarks
}

// §298 print_cmd_chr; primitive commands print through their primitives/* file
export function print_cmd_chr(e: Engine, cmd: number, chr_code: number): void {
  const chr_cmd = (s: string) => { print(e, s); print(e, chr_code) }
  switch (cmd) {
    case Cmd.left_brace: chr_cmd('begin-group character '); return
    case Cmd.right_brace: chr_cmd('end-group character '); return
    case Cmd.math_shift: chr_cmd('math shift character '); return
    case Cmd.tab_mark: if (chr_code === 256) print_esc(e, 'span'); else chr_cmd('alignment tab character '); return // §781 span_code
    case Cmd.car_ret: print_esc(e, chr_code === 257 ? 'cr' : 'crcr'); return // §781 cr_code
    case Cmd.mac_param: chr_cmd('macro parameter character '); return
    case Cmd.sup_mark: chr_cmd('superscript character '); return
    case Cmd.sub_mark: chr_cmd('subscript character '); return
    case Cmd.endv: print(e, 'end of alignment template'); return
    case Cmd.spacer: chr_cmd('blank space '); return
    case Cmd.letter: chr_cmd('the letter '); return
    case Cmd.other_char: chr_cmd('the character '); return
    // §1224
    case Cmd.char_given: print_esc(e, 'char'); print_hex(e, chr_code); return
    case Cmd.math_given: print_esc(e, 'mathchar'); print_hex(e, chr_code); return
    // §1295
    case Cmd.undefined_cs: print(e, 'undefined'); return
    case Cmd.call: case Cmd.long_call: case Cmd.outer_call: case Cmd.long_outer_call: { // etex.ch
      let n = cmd - Cmd.call
      if (e.info[e.link[chr_code]!] === protected_token) n += 4
      if ((n >> 2) & 1) print_esc(e, 'protected')
      if (n & 1) print_esc(e, 'long')
      if ((n >> 1) & 1) print_esc(e, 'outer')
      if (n > 0) print_char(e, 32)
      print(e, 'macro'); return
    }
    case Cmd.end_template: print_esc(e, 'outer endtemplate'); return
  }
  const prim = registry.get(cmd)
  if (prim) prim.print(e, chr_code)
  else print(e, '[unknown command code!]')
}

// §299 show_cur_cmd_chr
export function show_cur_cmd_chr(e: Engine): void {
  begin_diagnostic(e); print_nl(e, '{')
  if (e.mode !== e.shown_mode) { print_mode(e, e.mode); print(e, ': '); e.shown_mode = e.mode }
  print_cmd_chr(e, e.cur_cmd, e.cur_chr)
  if (e.equiv[int_base + tracing_ifs_code]! > 0 && e.cur_cmd >= Cmd.if_test && e.cur_cmd <= Cmd.fi_or_else) { // etex.ch
    print(e, ': ')
    let n: number, l: number
    if (e.cur_cmd === Cmd.fi_or_else) { print_cmd_chr(e, Cmd.if_test, e.cur_if); print_char(e, 32); n = 0; l = e.if_line }
    else { n = 1; l = e.line }
    for (let p = e.cond_ptr; p !== null; p = p.link) n++
    print(e, '(level '); print_int(e, n); print_char(e, 41); print_if_line(e, l)
  }
  print_char(e, 125)
  end_diagnostic(e, false)
}

// pdftex.web tokens_to_string
export function tokens_to_string(e: Engine, p: number): number[] {
  const old_setting = e.selector; e.selector = new_string
  const b = e.cur_str.length
  show_token_list(e, e.link[p]!, 0, 0x7fffffff)
  e.selector = old_setting
  return e.cur_str.splice(b)
}
