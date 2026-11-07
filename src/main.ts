// §1029–1054 main_control, §1070 normal_paragraph, §1211–1215 prefixed_command, §1236–1240 do_register_command
import type { Engine } from './engine.ts'
import { Cmd, vmode, mmode, int_val, dimen_val, glue_val, new_string } from './types.ts'
import { print, print_char, print_esc, print_mode } from './print.ts'
import { error, print_err, help, confusion, fatal_error, every_job_text } from './error.ts'
import { add_glue_ref, delete_glue_ref, new_spec, zero_glue, get_avail, free_avail, add_token_ref, temp_head, normal } from './nodes.ts'
import { int_par, tracing_commands_code, global_defs_code, every_job_loc, eq_define, geq_define, eq_word_define, geq_word_define,
  frozen_control_sequence, frozen_protection, count_base, int_base, looseness_code, hang_after_code, dimen_base, hang_indent_code,
  scaled_base, skip_base, mu_skip_base, toks_base, output_routine_loc, frozen_end_group, frozen_right, new_save_level, unsave } from './eqtb.ts'
import { cs_token_flag, space_token, other_token, right_brace_token, left_brace_token, print_cmd_chr, show_cur_cmd_chr } from './tokens.ts'
import { get_token, back_input, back_error, ins_error, ins_list, begin_token_list } from './input.ts'
import { get_x_token } from './expand.ts'
import { scan_int, scan_eight_bit_int, scan_optional_equals, scan_keyword, scan_normal_dimen, scan_glue, scan_toks } from './scan.ts'
import { mult_integers, nx_plus_y, x_over_n } from './arith.ts'

// §269 group codes
export const bottom_level = 0, simple_group = 1, semi_simple_group = 14, math_shift_group = 15, math_left_group = 16
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
    if (e.cur_cmd === Cmd.left_brace && Math.abs(e.mode) !== mmode) { new_save_level(e, simple_group); continue } // §1063
    if (e.cur_cmd === Cmd.right_brace) { handle_right_brace(e); continue } // §1067
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

// §1226 toks_register,assign_toks: the assignment
export function assign_toks(e: Engine, a: number): void {
  let q = e.cur_cs
  if (e.cur_cmd === Cmd.toks_register) { scan_eight_bit_int(e); e.cur_chr = toks_base + e.cur_val }
  const p = e.cur_chr
  scan_optional_equals(e)
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
  if (e.cur_cmd !== Cmd.left_brace) {
    // §1227 If the right-hand side is a token parameter or token register, finish the assignment and goto done
    if (e.cur_cmd === Cmd.toks_register || e.cur_cmd === Cmd.assign_toks) {
      if (e.cur_cmd === Cmd.toks_register) { scan_eight_bit_int(e); q = e.equiv[toks_base + e.cur_val]! }
      else q = e.equiv[e.cur_chr]!
      if (q === 0) define(e, a, p, Cmd.undefined_cs, 0)
      else { add_token_ref(e, q); define(e, a, p, Cmd.call, q) }
      return
    }
  }
  back_input(e); e.cur_cs = q; q = scan_toks(e, false, false)
  if (e.link[e.def_ref] === 0) { define(e, a, p, Cmd.undefined_cs, 0); free_avail(e, e.def_ref) }
  else {
    if (p === output_routine_loc) { // enclose in curlies
      e.link[q] = get_avail(e); q = e.link[q]!; e.info[q] = right_brace_token + 125
      q = get_avail(e); e.info[q] = left_brace_token + 123
      e.link[q] = e.link[e.def_ref]!; e.link[e.def_ref] = q
    }
    define(e, a, p, Cmd.call, e.def_ref)
  }
}

// §1229 trap_zero_glue
export function trap_zero_glue(e: Engine): void {
  const g = e.spec[e.cur_val]!
  if (g.width === 0 && g.stretch === 0 && g.shrink === 0) { add_glue_ref(e, zero_glue); delete_glue_ref(e, e.cur_val); e.cur_val = zero_glue }
}

// §1236 do_register_command
export function do_register_command(e: Engine, a: number): void {
  const q = e.cur_cmd
  let l = 0, p: number
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
    p = e.cur_chr; scan_eight_bit_int(e) // scan_register_num outside e-TeX mode
    l = e.cur_val + (p === int_val ? count_base : p === dimen_val ? scaled_base : p === glue_val ? skip_base : mu_skip_base)
  }
  const w = e.equiv[l]!, s = w // eqtb[l].int for p<glue_val, equiv(l) otherwise
  if (q === Cmd.register) scan_optional_equals(e)
  else scan_keyword(e, 'by')
  e.arith_error = false
  if (q < Cmd.multiply) { // §1238 Compute result of register or advance, put it in cur_val
    if (p < glue_val) {
      if (p === int_val) scan_int(e); else scan_normal_dimen(e)
      if (q === Cmd.advance) e.cur_val = (e.cur_val + w) | 0
    } else {
      scan_glue(e, p)
      if (q === Cmd.advance) { // §1239 Compute the sum of two glue specs
        const qq = new_spec(e, e.cur_val), r = e.spec[s]!, g = e.spec[qq]!
        delete_glue_ref(e, e.cur_val)
        g.width = (g.width + r.width) | 0
        if (g.stretch === 0) g.stretch_order = normal
        if (g.stretch_order === r.stretch_order) g.stretch = (g.stretch + r.stretch) | 0
        else if (g.stretch_order < r.stretch_order && r.stretch !== 0) { g.stretch = r.stretch; g.stretch_order = r.stretch_order }
        if (g.shrink === 0) g.shrink_order = normal
        if (g.shrink_order === r.shrink_order) g.shrink = (g.shrink + r.shrink) | 0
        else if (g.shrink_order < r.shrink_order && r.shrink !== 0) { g.shrink = r.shrink; g.shrink_order = r.shrink_order }
        e.cur_val = qq
      }
    }
  } else { // §1240 Compute result of multiply or divide, put it in cur_val
    scan_int(e)
    if (p < glue_val) {
      if (q === Cmd.multiply) e.cur_val = p === int_val ? mult_integers(e, w, e.cur_val) : nx_plus_y(e, w, e.cur_val, 0)
      else e.cur_val = x_over_n(e, w, e.cur_val)
    } else {
      const r = new_spec(e, s), g = e.spec[r]!, o = e.spec[s]!
      if (q === Cmd.multiply) {
        g.width = nx_plus_y(e, o.width, e.cur_val, 0); g.stretch = nx_plus_y(e, o.stretch, e.cur_val, 0)
        g.shrink = nx_plus_y(e, o.shrink, e.cur_val, 0)
      } else {
        g.width = x_over_n(e, o.width, e.cur_val); g.stretch = x_over_n(e, o.stretch, e.cur_val)
        g.shrink = x_over_n(e, o.shrink, e.cur_val)
      }
      e.cur_val = r
    }
  }
  if (e.arith_error) {
    print_err(e, 'Arithmetic overflow')
    help(e, "I can't carry out that multiplication or division,", 'since the result is out of range.')
    if (p >= glue_val) delete_glue_ref(e, e.cur_val)
    error(e); return
  }
  if (p < glue_val) word_define(e, a, l, e.cur_val)
  else { trap_zero_glue(e); define(e, a, l, Cmd.glue_ref, e.cur_val) }
}

// §1064 off_save
function off_save(e: Engine): void {
  if (e.cur_group === bottom_level) { // §1066 Drop current token and complain that it was unmatched
    print_err(e, 'Extra '); print_cmd_chr(e, e.cur_cmd, e.cur_chr)
    help(e, "Things are pretty mixed up, but I think the worst is over.")
    error(e)
  } else {
    back_input(e); let p = get_avail(e); e.link[temp_head] = p
    print_err(e, 'Missing ')
    // §1065 Prepare to insert a token that matches cur_group, and print what it is
    if (e.cur_group === semi_simple_group) { e.info[p] = cs_token_flag + frozen_end_group; print_esc(e, 'endgroup') }
    else if (e.cur_group === math_shift_group) { e.info[p] = Cmd.math_shift * 0o400 + 36; print_char(e, 36) }
    else if (e.cur_group === math_left_group) {
      e.info[p] = cs_token_flag + frozen_right; e.link[p] = get_avail(e); p = e.link[p]!
      e.info[p] = other_token + 46; print_esc(e, 'right.')
    } else { e.info[p] = right_brace_token + 125; print_char(e, 125) }
    print(e, ' inserted'); ins_list(e, e.link[temp_head]!)
    help(e, "I've inserted something that you may have forgotten.", '(See the <inserted text> above.)',
      'With luck, this will get me unwedged. But if you', "really didn't forget anything, try typing `2' now; then",
      'my insertion and my current dilemma will both disappear.')
    error(e)
  }
}

// §1063 any_mode(end_group)
export function end_group(e: Engine): void {
  if (e.cur_group === semi_simple_group) unsave(e)
  else off_save(e)
}

// §1068 handle_right_brace
function handle_right_brace(e: Engine): void {
  switch (e.cur_group) {
    case simple_group: unsave(e); break
    case bottom_level:
      print_err(e, "Too many }'s")
      help(e, "You've closed more groups than you opened.", 'Such booboos are generally harmless, so keep going.')
      error(e); break
    case semi_simple_group: case math_shift_group: case math_left_group: extra_right_brace(e); break
    default: confusion(e, 'rightbrace') // the box, insert, align, output, math groups cannot open yet
  }
}

// §1069 extra_right_brace
function extra_right_brace(e: Engine): void {
  print_err(e, 'Extra }, or forgotten ')
  if (e.cur_group === semi_simple_group) print_esc(e, 'endgroup')
  else if (e.cur_group === math_shift_group) print_char(e, 36)
  else if (e.cur_group === math_left_group) print_esc(e, 'right')
  help(e, "I've deleted a group-closing symbol because it seems to be", "spurious, as in `$x}$'. But perhaps the } is legitimate and",
    "you forgot something else, as in `\\hbox{$x}'. In such cases", 'the way to recover is to insert both the forgotten and the',
    "deleted material, e.g., by typing `I$}'.")
  error(e); e.align_state++
}
