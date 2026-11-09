// §220–255 the table of equivalents, §268–288 saving and restoring equivalents
import type { Engine } from './engine.ts'
import { Cmd } from './types.ts'
import { print, print_char, print_esc, print_int, print_nl, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_scaled } from './arith.ts'
import { sprint_cs, text, set_text } from './hash.ts'
import { print_cmd_chr, show_token_list } from './tokens.ts'
import { delete_token_ref, delete_glue_ref, print_spec, zero_glue, flush_node_list, node_at, node_free, show_node_list } from './nodes.ts'
import { back_input } from './input.ts'
import { delete_sa_ref, sa_restore, restore_sa, group_trace, group_warning, tracing_assigns_code, tracing_groups_code } from './etex.ts'
import { get_avail } from './nodes.ts'
import { right_brace_limit, left_brace_limit } from './types.ts'
import { mu_val } from './types.ts'
import { overflow, confusion, print_err, help, int_error } from './error.ts'
import { level_zero, level_one, active_base, glue_base, local_base, par_shape_loc, output_routine_loc, toks_base, box_base, cur_font_loc,
  cat_code_base, lc_code_base, uc_code_base, sf_code_base, math_code_base, int_base, count_base, del_code_base, dimen_base,
  scaled_base, eqtb_size, int_pars, dimen_pars, int_par_names, dimen_par_names, glue_par_names, glue_pars, skip_base, mu_skip_base,
  thin_mu_skip_code, etex_pen_base, math_font_base, font_id_base, frozen_primitive, mag_code, tolerance_code, hang_after_code, max_dead_cycles_code,
  escape_char_code, end_line_char_code, frozen_control_sequence, frozen_dont_expand, frozen_protection, time_code, day_code,
  month_code, year_code, tracing_restores_code, show_stream_code } from './types.ts'
// the eqtb layout constants live in types.ts so that cyclic imports never see them uninitialised
export * from './types.ts'

export const int_par = (e: Engine, code: number): number => e.equiv[int_base + code]!

// §237 print_param
export function print_param(e: Engine, n: number): void {
  if (n >= 0 && n < int_pars) print_esc(e, int_par_names[n]!)
  else print(e, '[unknown integer parameter!]')
}

// §247 print_length_param
export function print_length_param(e: Engine, n: number): void {
  if (n >= 0 && n < dimen_pars) print_esc(e, dimen_par_names[n]!)
  else print(e, '[unknown dimen parameter!]')
}

// §227 print_cmd_chr for assign_glue and assign_mu_glue
export function print_glue_loc(e: Engine, chr: number): void {
  if (chr < skip_base) print_skip_param(e, chr - glue_base)
  else if (chr < mu_skip_base) { print_esc(e, 'skip'); print_int(e, chr - skip_base) }
  else { print_esc(e, 'muskip'); print_int(e, chr - mu_skip_base) }
}

// §225 print_skip_param
export function print_skip_param(e: Engine, n: number): void {
  if (n >= 0 && n < glue_pars) print_esc(e, glue_par_names[n]!)
  else print(e, '[unknown glue parameter!]')
}

// §222, §228, §232, §240, §250, §258 Initialize table entries (done by INITEX only)
export function init_eqtb(e: Engine): void {
  e.eq_type.fill(Cmd.undefined_cs, active_base, glue_base)
  e.eq_level.fill(level_zero, active_base, glue_base)
  e.equiv.fill(0, active_base, glue_base)
  // §228 glue parameters and registers point to zero_glue
  e.eq_type.fill(Cmd.glue_ref, glue_base, local_base); e.eq_level.fill(level_one, glue_base, local_base)
  e.equiv.fill(zero_glue, glue_base, local_base); e.spec[zero_glue]!.glue_ref_count += local_base - glue_base
  // §232
  e.eq_type[par_shape_loc] = Cmd.shape_ref; e.eq_level[par_shape_loc] = level_one
  e.eq_type.fill(Cmd.shape_ref, etex_pen_base, box_base); e.eq_level.fill(level_one, etex_pen_base, box_base)
  e.eq_type.fill(Cmd.undefined_cs, output_routine_loc, etex_pen_base)
  e.eq_type.fill(Cmd.box_ref, box_base, box_base + 256); e.eq_level.fill(level_one, box_base, box_base + 256)
  e.eq_type.fill(Cmd.data, cur_font_loc, int_base); e.eq_level.fill(level_one, cur_font_loc, int_base)
  for (let k = 0; k <= 255; k++) {
    e.equiv[cat_code_base + k] = Cmd.other_char; e.equiv[math_code_base + k] = k; e.equiv[sf_code_base + k] = 1000
  }
  e.equiv[cat_code_base + 13] = Cmd.car_ret; e.equiv[cat_code_base + 32] = Cmd.spacer
  e.equiv[cat_code_base + 92] = Cmd.escape; e.equiv[cat_code_base + 37] = Cmd.comment
  e.equiv[cat_code_base + 127] = Cmd.invalid_char; e.equiv[cat_code_base + 0] = Cmd.ignore
  for (let k = 48; k <= 57; k++) e.equiv[math_code_base + k] = k + 0o70000
  for (let k = 65; k <= 90; k++) {
    e.equiv[cat_code_base + k] = Cmd.letter; e.equiv[cat_code_base + k + 32] = Cmd.letter
    e.equiv[math_code_base + k] = k + 0o70000 + 0x100
    e.equiv[math_code_base + k + 32] = k + 32 + 0o70000 + 0x100
    e.equiv[lc_code_base + k] = k + 32; e.equiv[lc_code_base + k + 32] = k + 32
    e.equiv[uc_code_base + k] = k; e.equiv[uc_code_base + k + 32] = k
    e.equiv[sf_code_base + k] = 999
  }
  // §240
  e.equiv[int_base + mag_code] = 1000; e.equiv[int_base + tolerance_code] = 10000
  e.equiv[int_base + hang_after_code] = 1; e.equiv[int_base + max_dead_cycles_code] = 25
  e.equiv[int_base + escape_char_code] = 92; e.equiv[int_base + end_line_char_code] = 13
  for (let k = 0; k <= 255; k++) e.equiv[del_code_base + k] = -1
  e.equiv[del_code_base + 46] = 0
  e.equiv[int_base + show_stream_code] = -1 // showstream.ch
  // pdftex.web §32a Initialize pdfTeX's parameters (codes from §236 and §247 of pdftex.web)
  e.equiv[dimen_base + 21] = e.equiv[dimen_base + 22] = Math.trunc((473628672 + 50) / 100) // \pdfhorigin, \pdfvorigin: 1in
  e.equiv[int_base + 66] = 9; e.equiv[int_base + 67] = 3; e.equiv[int_base + 69] = 72 // compresslevel, decimaldigits, imageresolution
  e.equiv[int_base + 74] = 1; e.equiv[int_base + 75] = 4 // \pdfmajorversion, \pdfminorversion
  e.equiv[int_base + 79] = 1000; e.equiv[int_base + 80] = 2200; e.equiv[int_base + 81] = 1 // gamma, imagegamma, imagehicolor
  e.equiv[dimen_base + 33] = 65782 // \pdfpxdimen: one_bp
  for (let k = 28; k <= 32; k++) e.equiv[dimen_base + k] = -65536000 // \pdfignoreddimen and the line heights/depths: ignore_depth
  // §283
  e.xeq_level.fill(level_one, int_base)
  // §258, §1216
  e.hash_used = frozen_control_sequence; e.cs_count = 0
  e.eq_type[frozen_dont_expand] = Cmd.dont_expand; set_text(e, frozen_dont_expand, 'notexpanded:')
  e.eq_type[frozen_primitive] = Cmd.ignore_spaces; e.equiv[frozen_primitive] = 1 // pdftex.web
  e.eq_level[frozen_primitive] = level_one; set_text(e, frozen_primitive, 'pdfprimitive')
  set_text(e, frozen_protection, 'inaccessible')
}

// §241 fix_date_and_time (web2c takes the system clock)
export function fix_date_and_time(e: Engine): void {
  const d = e.date ?? new Date(), u = e.date !== undefined // texmfmp.c: SOURCE_DATE_EPOCH with FORCE_SOURCE_DATE is read as UTC
  e.sys_time = (u ? d.getUTCHours() : d.getHours()) * 60 + (u ? d.getUTCMinutes() : d.getMinutes())
  e.sys_day = u ? d.getUTCDate() : d.getDate(); e.sys_month = (u ? d.getUTCMonth() : d.getMonth()) + 1
  e.sys_year = u ? d.getUTCFullYear() : d.getFullYear()
  e.equiv[int_base + time_code] = e.sys_time; e.equiv[int_base + day_code] = e.sys_day
  e.equiv[int_base + month_code] = e.sys_month; e.equiv[int_base + year_code] = e.sys_year
}

// §252 show_eqtb
export function show_eqtb(e: Engine, n: number): void {
  if (n < active_base) print_char(e, 63)
  else if (n < glue_base) { // §223
    sprint_cs(e, n); print_char(e, 61); print_cmd_chr(e, e.eq_type[n]!, e.equiv[n]!)
    if (e.eq_type[n]! >= Cmd.call) { print_char(e, 58); show_token_list(e, e.link[e.equiv[n]!]!, 0, 32) }
  } else if (n < local_base) { // §229
    if (n < skip_base) {
      print_skip_param(e, n - glue_base); print_char(e, 61)
      print_spec(e, e.equiv[n]!, n < glue_base + thin_mu_skip_code ? 'pt' : 'mu')
    } else if (n < mu_skip_base) { print_esc(e, 'skip'); print_int(e, n - skip_base); print_char(e, 61); print_spec(e, e.equiv[n]!, 'pt') }
    else { print_esc(e, 'muskip'); print_int(e, n - mu_skip_base); print_char(e, 61); print_spec(e, e.equiv[n]!, 'mu') }
  }
  else if (n < int_base) { // §233
    if (n === par_shape_loc || (n >= etex_pen_base && n < box_base)) { 
      print_cmd_chr(e, Cmd.set_shape, n); print_char(e, 61)
      if (e.equiv[n] === 0) print_char(e, 48)
      else if (n > par_shape_loc) { // etex.ch
        const q = e.shapes[e.equiv[n]!]!
        print_int(e, q[0]!); print_char(e, 32); print_int(e, q[1]!)
        if (q[0]! > 1) print_esc(e, 'ETC.')
      } else print_int(e, e.shapes[e.equiv[n]!]![0]!)
    }
    else if (n < toks_base) {
      print_cmd_chr(e, Cmd.assign_toks, n); print_char(e, 61)
      if (e.equiv[n] !== 0) show_token_list(e, e.link[e.equiv[n]!]!, 0, 32)
    } else if (n < box_base) {
      print_esc(e, 'toks'); print_int(e, n - toks_base); print_char(e, 61)
      if (e.equiv[n] !== 0) show_token_list(e, e.link[e.equiv[n]!]!, 0, 32)
    } else if (n < cur_font_loc) {
      print_esc(e, 'box'); print_int(e, n - box_base); print_char(e, 61)
      if (e.equiv[n] === 0) print(e, 'void')
      else { e.depth_threshold = 0; e.breadth_max = 1; show_node_list(e, node_at(e, e.equiv[n]!)) }
    }
    else if (n < cat_code_base) { // §234
      if (n === cur_font_loc) print(e, 'current font')
      else if (n < math_font_base + 16) { print_esc(e, 'textfont'); print_int(e, n - math_font_base) }
      else if (n < math_font_base + 32) { print_esc(e, 'scriptfont'); print_int(e, n - math_font_base - 16) }
      else { print_esc(e, 'scriptscriptfont'); print_int(e, n - math_font_base - 32) }
      print_char(e, 61); print_esc(e, text(e, font_id_base + e.equiv[n]!) ?? 0)
    }
    else if (n < math_code_base) { // §235
      if (n < lc_code_base) { print_esc(e, 'catcode'); print_int(e, n - cat_code_base) }
      else if (n < uc_code_base) { print_esc(e, 'lccode'); print_int(e, n - lc_code_base) }
      else if (n < sf_code_base) { print_esc(e, 'uccode'); print_int(e, n - uc_code_base) }
      else { print_esc(e, 'sfcode'); print_int(e, n - sf_code_base) }
      print_char(e, 61); print_int(e, e.equiv[n]!)
    } else { print_esc(e, 'mathcode'); print_int(e, n - math_code_base); print_char(e, 61); print_int(e, e.equiv[n]!) }
  } else if (n < dimen_base) { // §242
    if (n < count_base) print_param(e, n - int_base)
    else if (n < del_code_base) { print_esc(e, 'count'); print_int(e, n - count_base) }
    else { print_esc(e, 'delcode'); print_int(e, n - del_code_base) }
    print_char(e, 61); print_int(e, e.equiv[n]!)
  } else if (n <= eqtb_size) { // §251
    if (n < scaled_base) print_length_param(e, n - dimen_base)
    else { print_esc(e, 'dimen'); print_int(e, n - scaled_base) }
    print_char(e, 61); print_scaled(e, e.equiv[n]!); print(e, 'pt')
  } else print_char(e, 63)
}

// §268 save_type values
const restore_old_value = 0, restore_zero = 1, insert_token = 2, level_boundary = 3

// §273 check_full_save_stack
function check_full_save_stack(e: Engine): void {
  if (e.save_ptr > e.max_save_stack) {
    e.max_save_stack = e.save_ptr
    if (e.max_save_stack > e.lim.save_size - 7) overflow(e, 'save size', e.lim.save_size)
  }
}

// §274 new_save_level
export function new_save_level(e: Engine, c: number): void {
  check_full_save_stack(e)
  if (e.eTeX_ex) { e.save_b0[e.save_ptr] = 0; e.save_rh[e.save_ptr] = e.line; e.save_ptr++ } // etex.ch: saved(0):=line
  e.save_b0[e.save_ptr] = level_boundary; e.save_b1[e.save_ptr] = e.cur_group; e.save_rh[e.save_ptr] = e.cur_boundary
  if (e.cur_level === 255) overflow(e, 'grouping levels', 255)
  e.cur_boundary = e.save_ptr; e.cur_group = c
  if (int_par(e, tracing_groups_code) > 0) group_trace(e, false)
  e.cur_level++; e.save_ptr++
}

// §275 eq_destroy
function eq_destroy(e: Engine, type: number, equiv: number): void {
  if (type === Cmd.shape_ref) e.shapes[equiv] = undefined
  if (type >= Cmd.call && type <= Cmd.long_outer_call) delete_token_ref(e, equiv)
  else if (type === Cmd.glue_ref) delete_glue_ref(e, equiv)
  else if (type === Cmd.box_ref) { flush_node_list(e, node_at(e, equiv)); node_free(e, equiv) }
  else if ((type === Cmd.register || type === Cmd.toks_register) && equiv > mu_val) delete_sa_ref(e, equiv) // etex.ch
}

// §276 eq_save
function eq_save(e: Engine, p: number, l: number): void {
  check_full_save_stack(e)
  if (l === level_zero) e.save_b0[e.save_ptr] = restore_zero
  else {
    e.save_b0[e.save_ptr] = e.eq_type[p]!; e.save_b1[e.save_ptr] = e.eq_level[p]!; e.save_rh[e.save_ptr] = e.equiv[p]!
    e.save_ptr++
    e.save_b0[e.save_ptr] = restore_old_value
  }
  e.save_b1[e.save_ptr] = l; e.save_rh[e.save_ptr] = p; e.save_ptr++
}

// §277 eq_define
export function eq_define(e: Engine, p: number, t: number, q: number): void {
  if (e.eTeX_ex && e.eq_type[p] === t && e.equiv[p] === q) { // etex.ch
    assign_trace(e, p, 'reassigning'); eq_destroy(e, t, q); return
  }
  assign_trace(e, p, 'changing')
  if (e.eq_level[p] === e.cur_level) eq_destroy(e, e.eq_type[p]!, e.equiv[p]!)
  else if (e.cur_level > level_one) eq_save(e, p, e.eq_level[p]!)
  e.eq_level[p] = e.cur_level; e.eq_type[p] = t; e.equiv[p] = q
  assign_trace(e, p, 'into')
}

// etex.ch assign_trace
function assign_trace(e: Engine, p: number, s: string): void {
  if (int_par(e, tracing_assigns_code) > 0) restore_trace(e, p, s)
}

// §278 eq_word_define
export function eq_word_define(e: Engine, p: number, w: number): void {
  if (e.eTeX_ex && e.equiv[p] === w) { assign_trace(e, p, 'reassigning'); return } // etex.ch
  assign_trace(e, p, 'changing')
  if (e.xeq_level[p] !== e.cur_level) { eq_save(e, p, e.xeq_level[p]!); e.xeq_level[p] = e.cur_level }
  e.equiv[p] = w
  assign_trace(e, p, 'into')
}

// §279 geq_define
export function geq_define(e: Engine, p: number, t: number, q: number): void {
  assign_trace(e, p, 'globally changing')
  eq_destroy(e, e.eq_type[p]!, e.equiv[p]!)
  e.eq_level[p] = level_one; e.eq_type[p] = t; e.equiv[p] = q
  assign_trace(e, p, 'into')
}

// §279 geq_word_define
export function geq_word_define(e: Engine, p: number, w: number): void {
  assign_trace(e, p, 'globally changing')
  e.equiv[p] = w; e.xeq_level[p] = level_one
  assign_trace(e, p, 'into')
}

// §280 save_for_after
export function save_for_after(e: Engine, t: number): void {
  if (e.cur_level > level_one) {
    check_full_save_stack(e)
    e.save_b0[e.save_ptr] = insert_token; e.save_b1[e.save_ptr] = level_zero; e.save_rh[e.save_ptr] = t; e.save_ptr++
  }
}

// §281 unsave
export function unsave(e: Engine): void {
  if (e.cur_level <= level_one) { confusion(e, 'curlevel'); return }
  let a = false // etex.ch: have we already processed an \aftergroup?
  e.cur_level--
  // §282 Clear off top level from save_stack
  for (;;) {
    e.save_ptr--
    if (e.save_b0[e.save_ptr] === level_boundary) break
    const p = e.save_rh[e.save_ptr]!
    if (e.save_b0[e.save_ptr] === insert_token) { // §326 (etex.ch: later tokens join the first one's list)
      const t = e.cur_tok; e.cur_tok = p
      if (a) {
        const q = get_avail(e); e.info[q] = e.cur_tok; e.link[q] = e.cur_input.loc; e.cur_input.loc = q; e.cur_input.start = q
        if (e.cur_tok < right_brace_limit) { if (e.cur_tok < left_brace_limit) e.align_state--; else e.align_state++ }
      } else { back_input(e); a = e.eTeX_ex }
      e.cur_tok = t
      continue
    }
    if (e.save_b0[e.save_ptr] === restore_sa) { // etex.ch
      sa_restore(e); e.sa_chain = e.sa_chain_stack.pop() ?? null; e.sa_level = e.save_b1[e.save_ptr]!
      continue
    }
    let l = 0
    if (e.save_b0[e.save_ptr] === restore_old_value) { l = e.save_b1[e.save_ptr]!; e.save_ptr-- }
    else { e.save_b0[e.save_ptr] = Cmd.undefined_cs; e.save_b1[e.save_ptr] = level_zero; e.save_rh[e.save_ptr] = 0 }
    // §283 Store save_stack[save_ptr] in eqtb[p], unless eqtb[p] holds a global value
    const s = e.save_ptr
    if (p < int_base) {
      if (e.eq_level[p] === level_one) {
        eq_destroy(e, e.save_b0[s]!, e.save_rh[s]!)
        if (int_par(e, tracing_restores_code) > 0) restore_trace(e, p, 'retaining')
      } else {
        eq_destroy(e, e.eq_type[p]!, e.equiv[p]!)
        e.eq_type[p] = e.save_b0[s]!; e.eq_level[p] = e.save_b1[s]!; e.equiv[p] = e.save_rh[s]!
        if (int_par(e, tracing_restores_code) > 0) restore_trace(e, p, 'restoring')
      }
    } else if (e.xeq_level[p] !== level_one) {
      e.equiv[p] = e.save_rh[s]!; e.xeq_level[p] = l
      if (int_par(e, tracing_restores_code) > 0) restore_trace(e, p, 'restoring')
    } else if (int_par(e, tracing_restores_code) > 0) restore_trace(e, p, 'retaining')
  }
  if (int_par(e, tracing_groups_code) > 0) group_trace(e, true) // etex.ch
  if (e.grp_stack[e.in_open] === e.cur_boundary) group_warning(e)
  e.cur_group = e.save_b1[e.save_ptr]!; e.cur_boundary = e.save_rh[e.save_ptr]!
  if (e.eTeX_ex) e.save_ptr--
}

// §288 prepare_mag
export function prepare_mag(e: Engine): void {
  if (e.mag_set > 0 && int_par(e, mag_code) !== e.mag_set) {
    print_err(e, 'Incompatible magnification ('); print_int(e, int_par(e, mag_code))
    print(e, ');'); print_nl(e, ' the previous value will be retained')
    help(e, "I can handle only one magnification ratio per job. So I've", 'reverted to the magnification you used earlier on this run.')
    int_error(e, e.mag_set)
    geq_word_define(e, int_base + mag_code, e.mag_set)
  }
  if (int_par(e, mag_code) <= 0 || int_par(e, mag_code) > 32768) {
    print_err(e, 'Illegal magnification has been changed to 1000')
    help(e, 'The magnification ratio must be between 1 and 32768.')
    int_error(e, int_par(e, mag_code)); geq_word_define(e, int_base + mag_code, 1000)
  }
  e.mag_set = int_par(e, mag_code)
}

// §284 restore_trace
function restore_trace(e: Engine, p: number, s: string): void {
  begin_diagnostic(e); print_char(e, 123); print(e, s); print_char(e, 32)
  show_eqtb(e, p); print_char(e, 125)
  end_diagnostic(e, false)
}
