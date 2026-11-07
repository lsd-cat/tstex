// §487–510 conditional processing (e-TeX's \unless is honoured; its tracing and if_warning need \tracingifs/\tracingnesting, which -ini lacks)
import type { Engine } from './engine.ts'
import { Cmd, vmode, hmode, mmode } from './types.ts'
import { print, print_char, print_int, print_esc, begin_diagnostic, end_diagnostic } from './print.ts'
import { error, print_err, help, confusion } from './error.ts'
import { int_par, tracing_commands_code, active_base } from './eqtb.ts'
import { cs_token_flag, other_token, print_cmd_chr } from './tokens.ts'
import { get_next, back_error, skipping } from './input.ts'
import { get_x_token, insert_relax } from './expand.ts'
import { scan_int, scan_dimen, scan_eight_bit_int, scan_four_bit_int_or_18 } from './scan.ts'
import { closed } from './files.ts'
import { unsupported } from './main.ts'

// §489
export type CondNode = { link: CondNode | null, if_limit: number, cur_if: number, if_line: number }
export const unless_code = 32
export const if_char_code = 0, if_cat_code = 1, if_int_code = 2, if_dim_code = 3, if_odd_code = 4, if_vmode_code = 5,
  if_hmode_code = 6, if_mmode_code = 7, if_inner_code = 8, if_void_code = 9, if_hbox_code = 10, if_vbox_code = 11,
  ifx_code = 12, if_eof_code = 13, if_true_code = 14, if_false_code = 15, if_case_code = 16
export const if_code = 1, fi_code = 2, else_code = 3, or_code = 4

// §494 pass_text
export function pass_text(e: Engine): void {
  const save_scanner_status = e.scanner_status
  e.scanner_status = skipping; let l = 0
  e.skip_line = e.line
  for (;;) {
    get_next(e)
    if (e.cur_cmd === Cmd.fi_or_else) {
      if (l === 0) break
      if (e.cur_chr === fi_code) l--
    } else if (e.cur_cmd === Cmd.if_test) l++
  }
  e.scanner_status = save_scanner_status
}

// §495 Push the condition stack
function push_cond(e: Engine): void {
  e.cond_ptr = { link: e.cond_ptr, if_limit: e.if_limit, cur_if: e.cur_if, if_line: e.if_line }
  e.cur_if = e.cur_chr; e.if_limit = if_code; e.if_line = e.line
}

// §496 Pop the condition stack
export function pop_cond(e: Engine): void {
  const p = e.cond_ptr!
  e.if_line = p.if_line; e.cur_if = p.cur_if; e.if_limit = p.if_limit; e.cond_ptr = p.link
}

// §497 change_if_limit
function change_if_limit(e: Engine, l: number, p: CondNode | null): void {
  if (p === e.cond_ptr) { e.if_limit = l; return }
  let q = e.cond_ptr
  for (;;) {
    if (q === null) confusion(e, 'if')
    if (q.link === p) { q.if_limit = l; return }
    q = q.link
  }
}

// §506 get_x_token_or_active_char
function get_x_token_or_active_char(e: Engine): void {
  get_x_token(e)
  if (e.cur_cmd === Cmd.relax && e.cur_chr === 257) { e.cur_cmd = Cmd.active_char; e.cur_chr = e.cur_tok - cs_token_flag - active_base }
}

// §498 conditional
export function conditional(e: Engine): void {
  push_cond(e); const save_cond_ptr = e.cond_ptr
  const is_unless = e.cur_chr >= unless_code, this_if = e.cur_chr % unless_code
  let b = false
  // §501 Either process \ifcase or set b to the value of a boolean condition
  switch (this_if) {
    case if_char_code: case if_cat_code: { // §506
      let m: number, n: number
      get_x_token_or_active_char(e)
      if (e.cur_cmd > Cmd.active_char || e.cur_chr > 255) { m = Cmd.relax; n = 256 }
      else { m = e.cur_cmd; n = e.cur_chr }
      get_x_token_or_active_char(e)
      if (e.cur_cmd > Cmd.active_char || e.cur_chr > 255) { e.cur_cmd = Cmd.relax; e.cur_chr = 256 }
      b = this_if === if_char_code ? n === e.cur_chr : m === e.cur_cmd
      break
    }
    case if_int_code: case if_dim_code: { // §503
      if (this_if === if_int_code) scan_int(e); else scan_dimen(e, false, false, false)
      const n = e.cur_val
      let r: number
      do get_x_token(e); while (e.cur_cmd === Cmd.spacer) // §406
      if (e.cur_tok >= other_token + 60 && e.cur_tok <= other_token + 62) r = e.cur_tok - other_token
      else {
        print_err(e, 'Missing = inserted for '); print_cmd_chr(e, Cmd.if_test, this_if)
        help(e, "I was expecting to see `<', `=', or `>'. Didn't.")
        back_error(e); r = 61
      }
      if (this_if === if_int_code) scan_int(e); else scan_dimen(e, false, false, false)
      b = r === 60 ? n < e.cur_val : r === 61 ? n === e.cur_val : n > e.cur_val
      break
    }
    case if_odd_code: scan_int(e); b = (e.cur_val & 1) !== 0; break // §504
    case if_vmode_code: b = Math.abs(e.mode) === vmode; break
    case if_hmode_code: b = Math.abs(e.mode) === hmode; break
    case if_mmode_code: b = Math.abs(e.mode) === mmode; break
    case if_inner_code: b = e.mode < 0; break
    case ifx_code: { // §507
      const save_scanner_status = e.scanner_status; e.scanner_status = 0
      get_next(e); const n = e.cur_cs, p = e.cur_cmd, q = e.cur_chr
      get_next(e)
      if (e.cur_cmd !== p) b = false
      else if (e.cur_cmd < Cmd.call) b = e.cur_chr === q
      else { // §508 Test if two macro texts match
        let pp = e.link[e.cur_chr]!, qq = e.link[e.equiv[n]!]!
        if (pp === qq) b = true
        else {
          while (pp !== 0 && qq !== 0) {
            if (e.info[pp] !== e.info[qq]) pp = 0
            else { pp = e.link[pp]!; qq = e.link[qq]! }
          }
          b = pp === 0 && qq === 0
        }
      }
      e.scanner_status = save_scanner_status
      break
    }
    case if_true_code: b = true; break
    case if_false_code: b = false; break
    case if_case_code: { // §509 Select the appropriate case and return or goto common_ending
      scan_int(e); let n = e.cur_val
      if (int_par(e, tracing_commands_code) > 1) {
        begin_diagnostic(e); print(e, '{case '); print_int(e, n); print_char(e, 125); end_diagnostic(e, false)
      }
      while (n !== 0) {
        pass_text(e)
        if (e.cond_ptr === save_cond_ptr) {
          if (e.cur_chr === or_code) n--
          else { common_ending(e); return }
        } else if (e.cur_chr === fi_code) pop_cond(e)
      }
      change_if_limit(e, or_code, save_cond_ptr)
      return
    }
    case if_void_code: case if_hbox_code: case if_vbox_code: // §505 Test box register status
      // shortcut: every box register is void until M2 builds boxes, so p=null
      scan_eight_bit_int(e); b = this_if === if_void_code; break
    case if_eof_code: // tex.ch; shellenabledp is reported true, as pdftex's restricted shell escape (AUDIT.md)
      scan_four_bit_int_or_18(e); b = e.cur_val === 18 ? false : e.read_open[e.cur_val] === closed; break
    default: unsupported(e) // \ifpdfprimitive
  }
  if (is_unless) b = !b
  if (int_par(e, tracing_commands_code) > 1) { // §502
    begin_diagnostic(e); print(e, b ? '{true}' : '{false}'); end_diagnostic(e, false)
  }
  if (b) { change_if_limit(e, else_code, save_cond_ptr); return }
  // §500 Skip to \else or \fi, then goto common_ending
  for (;;) {
    pass_text(e)
    if (e.cond_ptr === save_cond_ptr) {
      if (e.cur_chr !== or_code) break
      print_err(e, 'Extra '); print_esc(e, 'or')
      help(e, "I'm ignoring this; it doesn't match any \\if.")
      error(e)
    } else if (e.cur_chr === fi_code) pop_cond(e)
  }
  common_ending(e)
}

// §498 common_ending
function common_ending(e: Engine): void {
  if (e.cur_chr === fi_code) pop_cond(e)
  else e.if_limit = fi_code
}

// §510 Terminate the current conditional and skip to \fi
export function fi_or_else(e: Engine): void {
  if (e.cur_chr > e.if_limit) {
    if (e.if_limit === if_code) insert_relax(e)
    else {
      print_err(e, 'Extra '); print_cmd_chr(e, Cmd.fi_or_else, e.cur_chr)
      help(e, "I'm ignoring this; it doesn't match any \\if.")
      error(e)
    }
  } else {
    while (e.cur_chr !== fi_code) pass_text(e)
    pop_cond(e)
  }
}
