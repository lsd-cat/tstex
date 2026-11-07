// §1029–1054 main_control, §1070 normal_paragraph, §1211–1215 prefixed_command, §1236–1240 do_register_command
import type { Engine } from './engine.ts'
import { Cmd, vmode, int_val, glue_val, new_string } from './types.ts'
import { print, print_char, print_esc, print_mode } from './print.ts'
import { error, print_err, help, confusion, fatal_error, every_job_text } from './error.ts'
import { int_par, tracing_commands_code, global_defs_code, every_job_loc, eq_define, geq_define, eq_word_define, geq_word_define,
  frozen_control_sequence, frozen_protection, count_base, int_base, looseness_code, hang_after_code, dimen_base, hang_indent_code } from './eqtb.ts'
import { cs_token_flag, space_token, print_cmd_chr, show_cur_cmd_chr } from './tokens.ts'
import { get_token, back_input, back_error, ins_error, begin_token_list } from './input.ts'
import { get_x_token } from './expand.ts'
import { scan_int, scan_eight_bit_int, scan_optional_equals, scan_keyword } from './scan.ts'
import { mult_integers, x_over_n } from './arith.ts'
import { registry } from './primitives/index.ts'

// §1030 main_control
export function main_control(e: Engine): void {
  if (e.equiv[every_job_loc] !== 0) begin_token_list(e, e.equiv[every_job_loc]!, every_job_text)
  for (;;) {
    get_x_token(e)
    // §1031 Give diagnostic information, if requested
    if (int_par(e, tracing_commands_code) > 0) show_cur_cmd_chr(e)
    if (e.cur_cmd > Cmd.max_non_prefixed_command) { prefixed_command(e); continue } // §1210
    if (e.cur_cmd === Cmd.spacer && Math.abs(e.mode) === vmode) continue // §1045
    const prim = registry.get(e.cur_cmd)
    if (prim?.run) { if (prim.run(e, e.cur_chr) === true) return; continue }
    unsupported(e)
  }
}

// fatal_error("unsupported: <meaning of the current command>")
export function unsupported(e: Engine): never {
  const old_setting = e.selector, b = e.cur_str.length
  e.selector = new_string; print_cmd_chr(e, e.cur_cmd, e.cur_chr); e.selector = old_setting
  fatal_error(e, 'unsupported: ' + String.fromCharCode(...e.cur_str.splice(b)))
}

// §1049 you_cant
function you_cant(e: Engine): void {
  print_err(e, "You can't use `"); print_cmd_chr(e, e.cur_cmd, e.cur_chr)
  print(e, "' in "); print_mode(e, e.mode)
}

// §1050 report_illegal_case
export function report_illegal_case(e: Engine): void {
  you_cant(e)
  help(e, "Sorry, but I'm not programmed to handle this case;", "I'll just pretend that you didn't ask for it.",
    "If you're in the wrong mode, you might be able to", "return to the right one by typing `I}' or `I$' or `I\\par'.")
  error(e)
}

// §1051 privileged
export function privileged(e: Engine): boolean {
  if (e.mode > 0) return true
  report_illegal_case(e); return false
}

// §1054 its_all_over
export function its_all_over(e: Engine): boolean {
  // shortcut: page and contribution lists are always empty and dead_cycles=0 until M2 builds boxes
  return privileged(e)
}

// §1070 normal_paragraph (par_shape_ptr is always null until \parshape exists)
export function normal_paragraph(e: Engine): void {
  if (int_par(e, looseness_code) !== 0) eq_word_define(e, int_base + looseness_code, 0)
  if (e.equiv[dimen_base + hang_indent_code] !== 0) eq_word_define(e, dimen_base + hang_indent_code, 0)
  if (int_par(e, hang_after_code) !== 1) eq_word_define(e, int_base + hang_after_code, 1)
}

// §1214 define and word_define
export function define(e: Engine, a: number, p: number, t: number, q: number): void {
  if (a >= 4) geq_define(e, p, t, q); else eq_define(e, p, t, q)
}
export function word_define(e: Engine, a: number, p: number, w: number): void {
  if (a >= 4) geq_word_define(e, p, w); else eq_word_define(e, p, w)
}

// §1211 prefixed_command
export function prefixed_command(e: Engine): void {
  let a = 0
  while (e.cur_cmd === Cmd.prefix) {
    if ((Math.trunc(a / e.cur_chr) & 1) === 0) a += e.cur_chr
    do get_x_token(e); while ((e.cur_cmd as number) === Cmd.spacer || (e.cur_cmd as number) === Cmd.relax)
    if (e.cur_cmd <= Cmd.max_non_prefixed_command) { // §1212 Discard erroneous prefixes and return
      print_err(e, "You can't use a prefix with `"); print_cmd_chr(e, e.cur_cmd, e.cur_chr); print_char(e, 39)
      help(e, "I'll pretend you didn't say \\long or \\outer or \\global.")
      back_error(e); return
    }
  }
  // §1213 Discard the prefixes \long and \outer if they are irrelevant
  if (e.cur_cmd !== Cmd.def && a % 4 !== 0) {
    print_err(e, "You can't use `"); print_esc(e, 'long'); print(e, "' or `")
    print_esc(e, 'outer'); print(e, "' with `")
    print_cmd_chr(e, e.cur_cmd, e.cur_chr); print_char(e, 39)
    help(e, "I'll pretend you didn't say \\long or \\outer here.")
    error(e)
  }
  // §1214 Adjust for the setting of \globaldefs
  if (int_par(e, global_defs_code) !== 0) {
    if (int_par(e, global_defs_code) < 0) { if (a >= 4) a -= 4 }
    else if (a < 4) a += 4
  }
  const prim = registry.get(e.cur_cmd)
  if (prim?.assign) prim.assign(e, a)
  else if (prim) unsupported(e)
  else confusion(e, 'prefix')
  // §1269 Insert a token saved by \afterassignment, if any
  if (e.after_token !== 0) { e.cur_tok = e.after_token; back_input(e); e.after_token = 0 }
}

// §1215 get_r_token
export function get_r_token(e: Engine): void {
  for (;;) {
    do get_token(e); while (e.cur_tok === space_token)
    if (e.cur_cs !== 0 && e.cur_cs <= frozen_control_sequence) return
    print_err(e, 'Missing control sequence inserted')
    help(e, "Please don't say `\\def cs{...}', say `\\def\\cs{...}'.", "I've inserted an inaccessible control sequence so that your",
      'definition will be completed without mixing me up too badly.', "You can recover graciously from this error, if you're",
      'careful; see exercise 27.2 in The TeXbook.')
    if (e.cur_cs === 0) back_input(e)
    e.cur_tok = cs_token_flag + frozen_protection; ins_error(e)
  }
}

// §1236 do_register_command; only integer registers exist so far
export function do_register_command(e: Engine, a: number): void {
  const q = e.cur_cmd
  let l: number, p: number
  // §1237 Compute the register location l and its type p; but return if invalid
  found: {
    if (q !== Cmd.register) {
      get_x_token(e)
      if (e.cur_cmd >= Cmd.assign_int && e.cur_cmd <= Cmd.assign_mu_glue) {
        l = e.cur_chr; p = e.cur_cmd - Cmd.assign_int; break found
      }
      if (e.cur_cmd !== Cmd.register) {
        print_err(e, "You can't use `"); print_cmd_chr(e, e.cur_cmd, e.cur_chr)
        print(e, "' after "); print_cmd_chr(e, q, 0)
        help(e, "I'm forgetting what you said and not changing anything.")
        error(e); return
      }
    }
    p = e.cur_chr; scan_eight_bit_int(e)
    if (p !== int_val) fatal_error(e, 'unsupported: \\dimen, \\skip, \\muskip')
    l = e.cur_val + count_base
  }
  if (p !== int_val) fatal_error(e, 'unsupported: dimen and glue arithmetic')
  if (q === Cmd.register) scan_optional_equals(e)
  else scan_keyword(e, 'by')
  e.arith_error = false
  if (q < Cmd.multiply) { // §1238
    scan_int(e)
    if (q === Cmd.advance) e.cur_val = (e.cur_val + e.equiv[l]!) | 0
  } else { // §1240
    scan_int(e)
    if (q === Cmd.multiply) e.cur_val = mult_integers(e, e.equiv[l]!, e.cur_val)
    else e.cur_val = x_over_n(e, e.equiv[l]!, e.cur_val)
  }
  if (e.arith_error) {
    print_err(e, 'Arithmetic overflow')
    help(e, "I can't carry out that multiplication or division,", 'since the result is out of range.')
    error(e); return
  }
  if (p < glue_val) word_define(e, a, l, e.cur_val)
}
