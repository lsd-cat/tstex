// §220–255 the table of equivalents, §268–288 saving and restoring equivalents
import type { Engine } from './engine.ts'
import { Cmd } from './types.ts'
import { print, print_char, print_esc, print_int, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_scaled } from './arith.ts'
import { sprint_cs } from './hash.ts'
import { print_cmd_chr, show_token_list } from './tokens.ts'
import { delete_token_ref } from './nodes.ts'
import { back_input } from './input.ts'
import { overflow, confusion, fatal_error } from './error.ts'
import { level_zero, level_one, active_base, glue_base, local_base, par_shape_loc, output_routine_loc, toks_base, box_base, cur_font_loc,
  cat_code_base, lc_code_base, uc_code_base, sf_code_base, math_code_base, int_base, count_base, del_code_base, dimen_base,
  scaled_base, eqtb_size, int_pars, dimen_pars, int_par_names, mag_code, tolerance_code, hang_after_code, max_dead_cycles_code,
  escape_char_code, end_line_char_code, frozen_control_sequence, frozen_dont_expand, frozen_protection, time_code, day_code,
  month_code, year_code, tracing_restores_code } from './types.ts'
// the eqtb layout constants live in types.ts so that cyclic imports never see them uninitialised
export * from './types.ts'

// §247 the names of the dimension parameters, indexed by code
const dimen_par_names = ['parindent', 'mathsurround', 'lineskiplimit', 'hsize', 'vsize', 'maxdepth',
  'splitmaxdepth', 'boxmaxdepth', 'hfuzz', 'vfuzz', 'delimitershortfall', 'nulldelimiterspace',
  'scriptspace', 'predisplaysize', 'displaywidth', 'displayindent', 'overfullrule', 'hangindent',
  'hoffset', 'voffset', 'emergencystretch']

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

// §222, §228, §232, §240, §250, §258 Initialize table entries (done by INITEX only)
export function init_eqtb(e: Engine): void {
  e.eq_type.fill(Cmd.undefined_cs, active_base, glue_base)
  e.eq_level.fill(level_zero, active_base, glue_base)
  e.equiv.fill(0, active_base, glue_base)
  // §228 glue parameters and registers point to zero_glue (shortcut: glue specs do not exist yet, equiv 0 stands for zero_glue; M2)
  e.eq_type.fill(Cmd.glue_ref, glue_base, local_base); e.eq_level.fill(level_one, glue_base, local_base)
  // §232
  e.eq_type[par_shape_loc] = Cmd.shape_ref; e.eq_level[par_shape_loc] = level_one
  e.eq_type.fill(Cmd.undefined_cs, output_routine_loc, box_base)
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
  // §283
  e.xeq_level.fill(level_one, int_base)
  // §258, §1216
  e.hash_used = frozen_control_sequence; e.cs_count = 0
  e.eq_type[frozen_dont_expand] = Cmd.dont_expand; e.text.set(frozen_dont_expand, 'notexpanded:')
  e.text.set(frozen_protection, 'inaccessible')
}

// §241 fix_date_and_time (web2c takes the system clock)
export function fix_date_and_time(e: Engine): void {
  const d = new Date()
  e.sys_time = d.getHours() * 60 + d.getMinutes()
  e.sys_day = d.getDate(); e.sys_month = d.getMonth() + 1; e.sys_year = d.getFullYear()
  e.equiv[int_base + time_code] = e.sys_time; e.equiv[int_base + day_code] = e.sys_day
  e.equiv[int_base + month_code] = e.sys_month; e.equiv[int_base + year_code] = e.sys_year
}

// §252 show_eqtb
export function show_eqtb(e: Engine, n: number): void {
  if (n < active_base) print_char(e, 63)
  else if (n < glue_base) { // §223
    sprint_cs(e, n); print_char(e, 61); print_cmd_chr(e, e.eq_type[n]!, e.equiv[n]!)
    if (e.eq_type[n]! >= Cmd.call) { print_char(e, 58); show_token_list(e, e.link[e.equiv[n]!]!, 0, 32) }
  } else if (n < local_base) fatal_error(e, 'unsupported: showing glue') // §229
  else if (n < int_base) { // §233
    if (n === par_shape_loc) { print_esc(e, 'parshape'); print_char(e, 61); print_char(e, 48) }
    else if (n < toks_base) {
      print_cmd_chr(e, Cmd.assign_toks, n); print_char(e, 61)
      if (e.equiv[n] !== 0) show_token_list(e, e.link[e.equiv[n]!]!, 0, 32)
    } else if (n < box_base) {
      print_esc(e, 'toks'); print_int(e, n - toks_base); print_char(e, 61)
      if (e.equiv[n] !== 0) show_token_list(e, e.link[e.equiv[n]!]!, 0, 32)
    } else if (n < cur_font_loc) { print_esc(e, 'box'); print_int(e, n - box_base); print_char(e, 61); print(e, 'void') }
    else if (n < cat_code_base) fatal_error(e, 'unsupported: showing fonts') // §234
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
const save_size = 100000 // TeX Live default save_size

// §273 check_full_save_stack
function check_full_save_stack(e: Engine): void {
  if (e.save_ptr > e.max_save_stack) {
    e.max_save_stack = e.save_ptr
    if (e.max_save_stack > save_size - 7) overflow(e, 'save size', save_size)
  }
}

// §274 new_save_level
export function new_save_level(e: Engine, c: number): void {
  check_full_save_stack(e)
  e.save_b0[e.save_ptr] = level_boundary; e.save_b1[e.save_ptr] = e.cur_group; e.save_rh[e.save_ptr] = e.cur_boundary
  if (e.cur_level === 255) overflow(e, 'grouping levels', 255)
  e.cur_boundary = e.save_ptr; e.cur_level++; e.save_ptr++; e.cur_group = c
}

// §275 eq_destroy; only token lists exist so far (glue, shape and box equivalents are always null)
function eq_destroy(e: Engine, type: number, equiv: number): void {
  if (type >= Cmd.call && type <= Cmd.long_outer_call) delete_token_ref(e, equiv)
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
  if (e.eq_level[p] === e.cur_level) eq_destroy(e, e.eq_type[p]!, e.equiv[p]!)
  else if (e.cur_level > level_one) eq_save(e, p, e.eq_level[p]!)
  e.eq_level[p] = e.cur_level; e.eq_type[p] = t; e.equiv[p] = q
}

// §278 eq_word_define
export function eq_word_define(e: Engine, p: number, w: number): void {
  if (e.xeq_level[p] !== e.cur_level) { eq_save(e, p, e.xeq_level[p]!); e.xeq_level[p] = e.cur_level }
  e.equiv[p] = w
}

// §279 geq_define
export function geq_define(e: Engine, p: number, t: number, q: number): void {
  eq_destroy(e, e.eq_type[p]!, e.equiv[p]!)
  e.eq_level[p] = level_one; e.eq_type[p] = t; e.equiv[p] = q
}

// §279 geq_word_define
export function geq_word_define(e: Engine, p: number, w: number): void {
  e.equiv[p] = w; e.xeq_level[p] = level_one
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
  e.cur_level--
  // §282 Clear off top level from save_stack
  for (;;) {
    e.save_ptr--
    if (e.save_b0[e.save_ptr] === level_boundary) break
    const p = e.save_rh[e.save_ptr]!
    if (e.save_b0[e.save_ptr] === insert_token) { // §326
      const t = e.cur_tok; e.cur_tok = p; back_input(e); e.cur_tok = t
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
  e.cur_group = e.save_b1[e.save_ptr]!; e.cur_boundary = e.save_rh[e.save_ptr]!
}

// §284 restore_trace
function restore_trace(e: Engine, p: number, s: string): void {
  begin_diagnostic(e); print_char(e, 123); print(e, s); print_char(e, 32)
  show_eqtb(e, p); print_char(e, 125)
  end_diagnostic(e, false)
}
