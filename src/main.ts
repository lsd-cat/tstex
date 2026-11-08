// §211–219 the semantic nest, §1029–1054 main_control, §1055–1135 building boxes and lists,
// §1211–1215 prefixed_command, §1236–1240 do_register_command
import type { Engine } from './engine.ts'
import { no_TeXXeT } from './etex.ts'
import { etex_pen_base } from './types.ts'
import { batch_mode, no_print, term_only } from './types.ts'
import { Cmd, vmode, hmode, mmode, int_val, dimen_val, glue_val, mu_val, tok_val, new_string } from './types.ts'
import { print, print_char, print_esc, print_mode, print_nl, print_ln, print_int, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_scaled, xn_over_d, half } from './arith.ts'
import { error, print_err, help, confusion, fatal_error, overflow, every_job_text, every_par_text, inserted } from './error.ts'
import { add_glue_ref, delete_glue_ref, new_spec, zero_glue, get_avail, free_avail, add_token_ref, temp_head, normal,
  new_char, new_null_box, new_rule, new_glue, new_param_glue, new_kern, new_penalty, new_disc, new_ligature, new_lig_item,
  new_whatsit_node, flush_node_list, copy_node_list, show_box, box, change_box, node_ref, is_char_node, char_node, hlist_node,
  vlist_node, rule_node, ins_node, mark_node, adjust_node, ligature_node, disc_node, math_node, glue_node, kern_node,
  a_leaders, mu_glue, explicit, acc_kern, language_node, fill_glue, new_math, new_noad, new_choice, null_delimiter, node_free,
  stretching, shrinking, L_code, before, after, inf_penalty, ord_noad, inner_noad, radical_noad, fraction_noad, accent_noad,
  vcenter_noad, left_noad, right_noad, math_char, sub_box, sub_mlist, default_code, text_style, display_style } from './nodes.ts'
import type { Node, CharNode, LigNode, BoxNode, InsNode, AdjustNode, MarkNode, GlueNode, Noad, Field, Delim, ChoiceNode } from './nodes.ts'
import { mlist_to_hlist, flush_math, fam_fnt, math_quad, text_size, script_size, script_script_size, total_mathsy_params,
  total_mathex_params } from './math.ts'
import { int_par, partoken_context_code, tracing_commands_code, global_defs_code, every_job_loc, every_par_loc, eq_define, geq_define, eq_word_define,
  geq_word_define, frozen_control_sequence, frozen_protection, count_base, int_base, looseness_code, hang_after_code, dimen_base,
  hang_indent_code, scaled_base, skip_base, mu_skip_base, toks_base, output_routine_loc, frozen_end_group, frozen_right,
  new_save_level, unsave, cur_font_loc, sf_code_base, box_base, glue_base, local_base, par_shape_loc, math_code_base, del_code_base } from './eqtb.ts'
import { cs_token_flag, space_token, other_token, right_brace_token, left_brace_token, math_shift_token, tab_token, print_cmd_chr,
  show_cur_cmd_chr } from './tokens.ts'
import { get_token, get_next, back_input, back_error, ins_error, ins_list, begin_token_list } from './input.ts'
import { get_x_token, x_token } from './expand.ts'
import { scan_int, scan_eight_bit_int, scan_register_num, scan_char_num, scan_optional_equals, scan_keyword, scan_normal_dimen, scan_dimen, scan_glue,
  scan_toks, scan_left_brace, scan_fifteen_bit_int, scan_twenty_seven_bit_int, max_dimen } from './scan.ts'
import { mult_integers, nx_plus_y, x_over_n } from './arith.ts'
import { find_sa_element, sa, sa_def, sa_w_def, box_val } from './etex.ts'
import { char_info, char_exists, char_width, char_italic, char_height, height_depth, char_tag, char_kern, lig_kern_start,
  lig_kern_restart, skip_byte, next_char, op_byte, rem_byte, stop_flag, kern_flag, lig_tag, non_char, non_address, char_warning,
  new_character, param, space_code, x_height_code, slant_code, extra_space_code, quad_code } from './tfm.ts'
import { hpack, vpack, vpackage, append_to_vlist, scan_spec, saved, set_saved, additional, exactly } from './pack.ts'
import { ship_out } from './dvi.ts'
import { line_break } from './linebreak.ts'
import { build_page, its_all_over, vsplit, show_page_status, resume_page_builder } from './page.ts'

// §269 group codes
export const bottom_level = 0, simple_group = 1, hbox_group = 2, adjusted_hbox_group = 3, vbox_group = 4, vtop_group = 5,
  align_group = 6, no_align_group = 7, output_group = 8, math_group = 9, disc_group = 10, insert_group = 11, vcenter_group = 12,
  math_choice_group = 13, semi_simple_group = 14, math_shift_group = 15, math_left_group = 16
import { registry } from './primitives/index.ts'
import { prim_lookup_cs } from './hash.ts'
import { prim_eqtb_base } from './types.ts'
import { do_endv, align_group_right_brace, no_align_group_right_brace } from './align.ts'

// §1071 box context codes, §1055–1058
export const box_flag = 0o10000000000, global_box_flag = 0o10000100000, ship_out_flag = 0o10000200000,
  leader_flag = 0o10000200001, box_code = 0, copy_code = 1, last_box_code = 2, vsplit_code = 3, vtop_code = 4
export const fil_code = 0, fill_code = 1, ss_code = 2, fil_neg_code = 3, skip_code = 4, mskip_code = 5
const default_rule = 26214
const space_skip_code = 12, xspace_skip_code = 13, par_skip_code = 2, split_top_skip_code = 10
const language_code = 50, left_hyphen_min_code = 51, right_hyphen_min_code = 52, floating_penalty_code = 42
const pdf_adjust_interword_glue_code = 87, par_indent_code = 0, split_max_depth_code = 6, box_max_depth_code = 7
const pdf_ignored_dimen = (e: Engine) => e.equiv[dimen_base + 32]!
const every_vbox_loc = local_base + 6, every_hbox_loc = local_base + 5, every_hbox_text = 10, every_vbox_text = 11

// §212 list_state_record
// TeX's aux word is three fields here (prev_depth, space_factor+clang, incompleat_noad); eTeX_aux is LR_box/delim_ptr
export type ListState = { mode: number, head: Node, tail: Node, prev_graf: number, mode_line: number, prev_depth: number,
  space_factor: number, clang: number, incompleat_noad: Node | null, eTeX_aux: Node | null }
const cur_list = (e: Engine): ListState => ({ mode: e.mode, head: e.head, tail: e.tail, prev_graf: e.prev_graf,
  mode_line: e.mode_line, prev_depth: e.prev_depth, space_factor: e.space_factor, clang: e.clang, incompleat_noad: e.incompleat_noad,
  eTeX_aux: e.eTeX_aux })

// §214 tail_append
export function tail_append(e: Engine, p: Node): void { e.tail.link = p; e.tail = p }

// §216 push_nest
export function push_nest(e: Engine): void {
  if (e.nest_ptr > e.max_nest_stack) {
    e.max_nest_stack = e.nest_ptr
    if (e.nest_ptr === e.lim.nest_size) overflow(e, 'semantic nest size', e.lim.nest_size)
  }
  e.nest[e.nest_ptr] = cur_list(e); e.nest_ptr++
  e.head = new_char(0, 0); e.tail = e.head; e.prev_graf = 0; e.mode_line = e.line; e.eTeX_aux = null
}

// §217 pop_nest
export function pop_nest(e: Engine): void {
  e.nest_ptr--
  const s = e.nest[e.nest_ptr]!
  e.mode = s.mode; e.head = s.head; e.tail = s.tail; e.prev_graf = s.prev_graf; e.mode_line = s.mode_line
  e.prev_depth = s.prev_depth; e.space_factor = s.space_factor; e.clang = s.clang; e.incompleat_noad = s.incompleat_noad
  e.eTeX_aux = s.eTeX_aux
}

// §218 show_activities
export function show_activities(e: Engine): void {
  e.nest[e.nest_ptr] = cur_list(e)
  print_nl(e, ''); print_ln(e)
  for (let p = e.nest_ptr; p >= 0; p--) {
    const n = e.nest[p]!, m = n.mode
    print_nl(e, '### '); print_mode(e, m)
    print(e, ' entered at line '); print_int(e, Math.abs(n.mode_line))
    if (m === hmode && n.prev_graf !== 0o40600000) {
      print(e, ' (language'); print_int(e, n.prev_graf % 0o200000)
      print(e, ':hyphenmin'); print_int(e, Math.trunc(n.prev_graf / 0o20000000))
      print_char(e, 44); print_int(e, Math.trunc(n.prev_graf / 0o200000) % 0o100)
      print_char(e, 41)
    }
    if (n.mode_line < 0) print(e, ' (\\output routine)')
    if (p === 0) {
      show_page_status(e) // §986
      if (e.contrib_head.link !== null) print_nl(e, '### recent contributions:')
    }
    show_box(e, n.head.link)
    // §219 Show the auxiliary field
    switch (Math.trunc(Math.abs(m) / (Cmd.max_command + 1))) {
      case 0:
        print_nl(e, 'prevdepth ')
        if (n.prev_depth <= pdf_ignored_dimen(e)) print(e, 'ignored'); else print_scaled(e, n.prev_depth)
        if (n.prev_graf !== 0) {
          print(e, ', prevgraf '); print_int(e, n.prev_graf); print(e, ' line')
          if (n.prev_graf !== 1) print_char(e, 115)
        }
        break
      case 1:
        print_nl(e, 'spacefactor '); print_int(e, n.space_factor)
        if (m > 0 && n.clang > 0) { print(e, ', current language '); print_int(e, n.clang) }
        break
      case 2: if (n.incompleat_noad !== null) { print(e, 'this will begin denominator of:'); show_box(e, n.incompleat_noad) } break
    }
  }
}

export { build_page, its_all_over }

// commands that start a paragraph in vertical mode (§1090)
const starts_par = new Set<number>([Cmd.letter, Cmd.other_char, Cmd.char_num, Cmd.char_given, Cmd.math_shift, Cmd.un_hbox,
  Cmd.vrule, Cmd.accent, Cmd.discretionary, Cmd.hskip, Cmd.valign, Cmd.ex_space, Cmd.no_boundary])
// §1046 math-only cases in non-math modes
const math_only = new Set<number>([Cmd.sup_mark, Cmd.sub_mark, Cmd.math_char_num, Cmd.math_given, Cmd.math_comp, Cmd.delim_num,
  Cmd.left_right, Cmd.above, Cmd.radical, Cmd.math_style, Cmd.math_choice, Cmd.vcenter, Cmd.non_script, Cmd.mkern,
  Cmd.limit_switch, Cmd.mskip, Cmd.math_accent])
const non_math_only = new Set<number>([Cmd.endv, Cmd.par_end, Cmd.stop, Cmd.vskip, Cmd.un_vbox, Cmd.valign, Cmd.hrule])

// §1030 main_control
export function main_control(e: Engine): void {
  if (e.equiv[every_job_loc] !== 0) begin_token_list(e, e.equiv[every_job_loc]!, every_job_text)
  let fetch = true
  for (;;) {
    if (fetch) get_x_token(e) // big_switch
    fetch = true
    // reswitch: §1031 Give diagnostic information, if requested
    if (int_par(e, tracing_commands_code) > 0) show_cur_cmd_chr(e)
    const c = e.cur_cmd, m = Math.abs(e.mode)
    if (c > Cmd.max_non_prefixed_command && c !== Cmd.partoken_name) { prefixed_command(e); continue } // §1210
    if (m === vmode && starts_par.has(c)) { back_input(e); new_graf(e, true); continue } // §1090
    if (m !== mmode ? math_only.has(c) : non_math_only.has(c)) { insert_dollar_sign(e); continue }
    if (m === mmode) switch (c) {
      case Cmd.letter: case Cmd.other_char: case Cmd.char_given: set_math_char(e, e.equiv[math_code_base + e.cur_chr]!); continue // §1154
      case Cmd.char_num: scan_char_num(e); e.cur_chr = e.cur_val; set_math_char(e, e.equiv[math_code_base + e.cur_chr]!); continue
      case Cmd.math_given: set_math_char(e, e.cur_chr); continue
      case Cmd.no_boundary: continue // §1045
      case Cmd.left_brace: { const n = new_noad(); tail_append(e, n); back_input(e); scan_math(e, n.nucleus); continue } // §1150
      case Cmd.sup_mark: case Cmd.sub_mark: sub_sup(e); continue // §1175
      case Cmd.math_shift: if (e.cur_group === math_shift_group) after_math(e); else off_save(e); continue // §1193
      case Cmd.ital_corr: tail_append(e, new_kern(0)); continue // §1112
    }
    switch (c) {
      case Cmd.letter: case Cmd.other_char: case Cmd.char_given: fetch = !main_loop(e); continue // hmode
      case Cmd.char_num: scan_char_num(e); e.cur_chr = e.cur_val; fetch = !main_loop(e); continue
      case Cmd.no_boundary:
        get_x_token(e)
        if (e.cur_cmd === Cmd.letter || e.cur_cmd === Cmd.other_char || e.cur_cmd === Cmd.char_given || e.cur_cmd === Cmd.char_num) e.cancel_boundary = true
        fetch = false; continue
      case Cmd.spacer:
        if (m === hmode) {
          if (int_par(e, pdf_adjust_interword_glue_code) > 0) fatal_error(e, 'unsupported: \\pdfadjustinterwordglue')
          if (e.space_factor === 1000) append_normal_space(e); else app_space(e)
        }
        continue // §1045 vmode+spacer, mmode+spacer: do_nothing
      case Cmd.ex_space: append_normal_space(e); continue
      case Cmd.math_shift: init_math(e); continue // §1137 hmode+math_shift
      case Cmd.left_brace: new_save_level(e, simple_group); continue // §1063
      case Cmd.right_brace: handle_right_brace(e); continue // §1067
      case Cmd.mac_param: case Cmd.last_item: report_illegal_case(e); continue // §1045, §1048
      case Cmd.tab_mark: case Cmd.car_ret: align_error(e); continue // §1126
      case Cmd.endv: // §1130, partoken.ch
        if (int_par(e, partoken_context_code) > 1 && e.mode === hmode) {
          back_input(e); e.cur_tok = e.par_token; back_input(e); e.cur_input.index = inserted
        } else do_endv(e)
        continue
      case Cmd.ignore_spaces: // §1045; pdftex.web: chr=1 is the frozen \pdfprimitive
        if (e.cur_chr === 0) { do get_x_token(e); while (e.cur_cmd === Cmd.spacer); fetch = false; continue } // §406
        {
          const t = e.scanner_status; e.scanner_status = 0; get_next(e); e.scanner_status = t // normal
          const p = prim_lookup_cs(e, e.cur_cs)
          if (p !== 0) {
            e.cur_cmd = e.eq_type[prim_eqtb_base + p]!; e.cur_chr = e.equiv[prim_eqtb_base + p]!
            e.cur_tok = cs_token_flag + prim_eqtb_base + p; fetch = false
          }
        }
        continue
    }
    if ((c === Cmd.vmove && m === vmode) || (c === Cmd.hmove && m !== vmode) || (c === Cmd.vadjust && m === vmode)
      || (c === Cmd.ital_corr && m === vmode) || (c === Cmd.eq_no && m !== mmode)) { report_illegal_case(e); continue } // §1048
    const prim = registry.get(c)
    if (prim?.run) {
      if (prim.run(e, e.cur_chr) === true) return
      continue
    }
    unsupported(e)
  }
}

// §1034 adjust_space_factor
function adjust_space_factor(e: Engine): void {
  e.main_s = e.equiv[sf_code_base + e.cur_chr]!
  if (e.main_s === 1000) e.space_factor = 1000
  else if (e.main_s < 1000) { if (e.main_s > 0) e.space_factor = e.main_s }
  else if (e.space_factor < 1000) e.space_factor = 1000
  else e.space_factor = e.main_s
}

// §1034 character(tail) as TeX reads it: the subtype byte of a non-char node
const character_of = (p: Node): number => p.type === char_node ? p.character : p.type === disc_node ? p.replace_count : (p as LigNode).subtype

// §1035 wrapup and pack_lig
function wrapup(e: Engine, rt: boolean): void {
  if (e.cur_l >= non_char) return
  if (e.cur_q.link !== null && character_of(e.tail) === e.hyphen_char[e.main_f]) e.ins_disc = true
  if (e.ligature_present) { // pack_lig
    const p = new_ligature(e.main_f, e.cur_l, e.cur_q.link)
    e.main_p = p
    if (e.lft_hit) { p.subtype = 2; e.lft_hit = false }
    if (rt && e.lig_stack === null) { p.subtype++; e.rt_hit = false }
    e.cur_q.link = p; e.tail = p; e.ligature_present = false
  }
  if (e.ins_disc) {
    e.ins_disc = false
    if (e.mode > 0) tail_append(e, new_disc())
  }
}

// §1034 Append character cur_chr and the following characters (if any) to the current hlist in the current font;
// returns true for goto reswitch, false for goto big_switch.
// pdftex's get_auto_kern always gives null: \knaccode/\knbccode are unsupported, so every kn code is 0.
const WRAPUP = 0, MOVE = 1, MOVE1 = 2, MOVE2 = 3, LOOKAHEAD = 4, LOOKAHEAD1 = 5, LIG = 6, LIG1 = 7, LIG2 = 8, MOVE_LIG = 9
function main_loop(e: Engine): boolean {
  adjust_space_factor(e)
  e.main_f = e.equiv[cur_font_loc]!
  e.bchar = e.font_bchar[e.main_f]!; e.false_bchar = e.font_false_bchar[e.main_f]!
  if (e.mode > 0 && int_par(e, language_code) !== e.clang) fix_language(e)
  e.lig_stack = new_char(e.main_f, e.cur_chr); e.cur_l = e.cur_chr
  e.cur_q = e.tail
  let L: number
  if (e.cancel_boundary) { e.cancel_boundary = false; e.main_k = non_address } else e.main_k = e.bchar_label[e.main_f]!
  if (e.main_k === non_address) L = MOVE2
  else { e.cur_r = e.cur_l; e.cur_l = non_char; L = LIG1 }
  for (;;) switch (L) {
    case WRAPUP: wrapup(e, e.rt_hit); L = MOVE; continue
    case MOVE: // §1036
      if (e.lig_stack === null) return true
      e.cur_q = e.tail; e.cur_l = (e.lig_stack as CharNode | LigNode).character
      L = MOVE1; continue
    case MOVE1: if (!is_char_node(e.lig_stack!)) { L = MOVE_LIG; continue }
      L = MOVE2; continue
    case MOVE2:
      if (e.cur_chr < e.font_bc[e.main_f]! || e.cur_chr > e.font_ec[e.main_f]!) {
        char_warning(e, e.main_f, e.cur_chr); e.lig_stack = null; return false
      }
      e.main_i = char_info(e, e.main_f, e.cur_l)
      if (!char_exists(e.main_i)) { char_warning(e, e.main_f, e.cur_chr); e.lig_stack = null; return false }
      e.tail.link = e.lig_stack; e.tail = e.lig_stack!
      L = LOOKAHEAD; continue
    case LOOKAHEAD: { // §1038
      get_next(e)
      let c = e.cur_cmd
      if (c === Cmd.letter || c === Cmd.other_char || c === Cmd.char_given) { L = LOOKAHEAD1; continue }
      x_token(e); c = e.cur_cmd
      if (c === Cmd.letter || c === Cmd.other_char || c === Cmd.char_given) { L = LOOKAHEAD1; continue }
      if (c === Cmd.char_num) { scan_char_num(e); e.cur_chr = e.cur_val; L = LOOKAHEAD1; continue }
      if (c === Cmd.no_boundary) e.bchar = non_char
      e.cur_r = e.bchar; e.lig_stack = null; L = LIG; continue
    }
    case LOOKAHEAD1:
      adjust_space_factor(e)
      e.lig_stack = new_char(e.main_f, e.cur_chr); e.cur_r = e.cur_chr
      if (e.cur_r === e.false_bchar) e.cur_r = non_char
      L = LIG; continue
    case LIG: // §1039
      if (char_tag(e.main_i) !== lig_tag || e.cur_r === non_char) { L = WRAPUP; continue }
      e.main_k = lig_kern_start(e, e.main_f, e.main_i); e.main_j = e.font_info[e.main_k]!
      if (skip_byte(e.main_j) <= stop_flag) { L = LIG2; continue }
      e.main_k = lig_kern_restart(e, e.main_f, e.main_j)
      L = LIG1; continue
    case LIG1: e.main_j = e.font_info[e.main_k]!; L = LIG2; continue
    case LIG2:
      if (next_char(e.main_j) === e.cur_r && skip_byte(e.main_j) <= stop_flag) { L = do_lig(e); continue }
      if (skip_byte(e.main_j) === 0) e.main_k++
      else {
        if (skip_byte(e.main_j) >= stop_flag) { L = WRAPUP; continue }
        e.main_k += skip_byte(e.main_j) + 1
      }
      L = LIG1; continue
    case MOVE_LIG: { // §1037
      const ls = e.lig_stack as LigNode
      e.main_p = ls.lig_ptr
      if (e.main_p !== null) tail_append(e, e.main_p)
      e.lig_stack = ls.link
      e.main_i = char_info(e, e.main_f, e.cur_l); e.ligature_present = true
      if (e.lig_stack === null) {
        if (e.main_p !== null) { L = LOOKAHEAD; continue }
        e.cur_r = e.bchar
      } else e.cur_r = (e.lig_stack as CharNode | LigNode).character
      L = LIG; continue
    }
  }
}

// §1040 Do ligature or kern command; returns the next label
function do_lig(e: Engine): number {
  const j = e.main_j
  if (op_byte(j) >= kern_flag) {
    wrapup(e, e.rt_hit)
    tail_append(e, new_kern(char_kern(e, e.main_f, j))); return MOVE
  }
  if (e.cur_l === non_char) e.lft_hit = true
  else if (e.lig_stack === null) e.rt_hit = true
  switch (op_byte(j)) {
    case 1: case 5: e.cur_l = rem_byte(j); e.main_i = char_info(e, e.main_f, e.cur_l); e.ligature_present = true; break
    case 2: case 6:
      e.cur_r = rem_byte(j)
      if (e.lig_stack === null) { e.lig_stack = new_lig_item(e.cur_r); e.bchar = non_char }
      else if (is_char_node(e.lig_stack)) {
        e.main_p = e.lig_stack; const ls = new_lig_item(e.cur_r); ls.lig_ptr = e.main_p; e.lig_stack = ls
      } else (e.lig_stack as LigNode).character = e.cur_r
      break
    case 3: {
      e.cur_r = rem_byte(j)
      e.main_p = e.lig_stack; const ls = new_lig_item(e.cur_r); ls.link = e.main_p; e.lig_stack = ls
      break
    }
    case 7: case 11:
      wrapup(e, false)
      e.cur_q = e.tail; e.cur_l = rem_byte(j)
      e.main_i = char_info(e, e.main_f, e.cur_l); e.ligature_present = true
      break
    default:
      e.cur_l = rem_byte(j); e.ligature_present = true
      return e.lig_stack === null ? WRAPUP : MOVE1
  }
  if (op_byte(j) > 4 && op_byte(j) !== 7) return WRAPUP
  if (e.cur_l < non_char) return LIG
  e.main_k = e.bchar_label[e.main_f]!
  return LIG1
}

// §1042 Find the glue specification main_p for text spaces in the current font
function font_glue_spec(e: Engine): number {
  const f = e.equiv[cur_font_loc]!
  let p = e.font_glue[f]!
  if (p === 0) {
    p = new_spec(e, zero_glue); const k = e.param_base[f]! + space_code, g = e.spec[p]!
    g.width = e.font_info[k]!; g.stretch = e.font_info[k + 1]!; g.shrink = e.font_info[k + 2]!
    e.font_glue[f] = p
  }
  return p
}

// §1041 Append a normal inter-word space to the current list
function append_normal_space(e: Engine): void {
  const p = e.equiv[glue_base + space_skip_code] === zero_glue ? new_glue(e, font_glue_spec(e)) : new_param_glue(e, space_skip_code)
  e.tail.link = p; e.tail = p
}

// §1043 app_space
function app_space(e: Engine): void {
  let q: GlueNode
  if (e.space_factor >= 2000 && e.equiv[glue_base + xspace_skip_code] !== zero_glue) q = new_param_glue(e, xspace_skip_code)
  else {
    let p = e.equiv[glue_base + space_skip_code]!
    if (p === zero_glue) p = font_glue_spec(e)
    p = new_spec(e, p)
    const g = e.spec[p]! // §1044 Modify the glue specification in main_p according to the space factor
    if (e.space_factor >= 2000) g.width = (g.width + param(e, extra_space_code, e.equiv[cur_font_loc]!)) | 0
    g.stretch = xn_over_d(e, g.stretch, e.space_factor, 1000)
    g.shrink = xn_over_d(e, g.shrink, 1000, e.space_factor)
    q = new_glue(e, p); g.glue_ref_count = 0
  }
  e.tail.link = q; e.tail = q
}

// §1047 insert_dollar_sign
function insert_dollar_sign(e: Engine): void {
  back_input(e); e.cur_tok = math_shift_token + 36
  print_err(e, 'Missing $ inserted')
  help(e, "I've inserted a begin-math/end-math symbol since I think", 'you left one out. Proceed, with fingers crossed.')
  ins_error(e)
}

// fatal_error("unsupported: <meaning of the current command>")
export function unsupported(e: Engine): never {
  const old_setting = e.selector, b = e.cur_str.length
  e.selector = new_string; print_cmd_chr(e, e.cur_cmd, e.cur_chr); e.selector = old_setting
  fatal_error(e, 'unsupported: ' + String.fromCharCode(...e.cur_str.splice(b)))
}

// §1049 you_cant
export function you_cant(e: Engine): void {
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

// §1060 append_glue
export function append_glue(e: Engine): void {
  const s = e.cur_chr
  switch (s) {
    case fil_code: e.cur_val = 1; break // fil_glue
    case fill_code: e.cur_val = fill_glue; break
    case ss_code: e.cur_val = 3; break // ss_glue
    case fil_neg_code: e.cur_val = 4; break // fil_neg_glue
    case skip_code: scan_glue(e, glue_val); break
    case mskip_code: scan_glue(e, 3); break // mu_val
  }
  const g = new_glue(e, e.cur_val)
  tail_append(e, g)
  if (s >= skip_code) {
    e.spec[e.cur_val]!.glue_ref_count--
    if (s > skip_code) g.subtype = mu_glue
  }
}

// §1061 append_kern
export function append_kern(e: Engine): void {
  const s = e.cur_chr
  scan_dimen(e, s === mu_glue, false, false)
  const k = new_kern(e.cur_val); k.subtype = s; tail_append(e, k)
}

// §1070 normal_paragraph
export function normal_paragraph(e: Engine): void {
  if (int_par(e, looseness_code) !== 0) eq_word_define(e, int_base + looseness_code, 0)
  if (e.equiv[dimen_base + hang_indent_code] !== 0) eq_word_define(e, dimen_base + hang_indent_code, 0)
  if (int_par(e, hang_after_code) !== 1) eq_word_define(e, int_base + hang_after_code, 1)
  if (e.equiv[par_shape_loc] !== 0) eq_define(e, par_shape_loc, Cmd.shape_ref, 0)
  if (e.equiv[etex_pen_base] !== 0) eq_define(e, etex_pen_base, Cmd.shape_ref, 0) // etex.ch
}

// §1075 box_end
export function box_end(e: Engine, box_context: number): void {
  if (box_context < box_flag) { // §1076 Append box cur_box to the current list, shifted by box_context
    const b = e.cur_box
    if (b === null) return
    (b as BoxNode).shift_amount = box_context
    if (Math.abs(e.mode) === vmode) {
      if (e.pre_adjust_tail !== null) {
        if (e.pre_adjust_head !== e.pre_adjust_tail) { e.tail.link = e.pre_adjust_head.link; e.tail = e.pre_adjust_tail }
        e.pre_adjust_tail = null
      }
      append_to_vlist(e, b as BoxNode)
      if (e.adjust_tail !== null) {
        if (e.adjust_head !== e.adjust_tail) { e.tail.link = e.adjust_head.link; e.tail = e.adjust_tail }
        e.adjust_tail = null
      }
      if (e.mode > 0) build_page(e)
    } else {
      let bb: Node = b
      if (Math.abs(e.mode) === hmode) e.space_factor = 1000
      else { const n = new_noad(); n.nucleus.math_type = sub_box; n.nucleus.info = b; bb = n }
      e.tail.link = bb; e.tail = bb
    }
  } else if (box_context < ship_out_flag) { // §1077 Store cur_box in a box register
    let a: number
    if (box_context < global_box_flag) { e.cur_val = box_context - box_flag; a = 0 }
    else { e.cur_val = box_context - global_box_flag; a = 4 }
    if (e.cur_val < 256) define(e, a, box_base + e.cur_val, Cmd.box_ref, node_ref(e, e.cur_box))
    else sa_def(e, find_sa_element(e, box_val, e.cur_val, true), 0, e.cur_box, a >= 4) // etex.ch sa_def_box
  } else if (e.cur_box !== null) {
    if (box_context > ship_out_flag) { // §1078 Append a new leader node that uses cur_box
      do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
      if ((e.cur_cmd === Cmd.hskip && Math.abs(e.mode) !== vmode) || (e.cur_cmd === Cmd.vskip && Math.abs(e.mode) === vmode)) {
        append_glue(e)
        const g = e.tail as GlueNode
        g.subtype = box_context - (leader_flag - a_leaders); g.leader_ptr = e.cur_box
      } else {
        print_err(e, 'Leaders not followed by proper glue')
        help(e, "You should say `\\leaders <box or rule><hskip or vskip>'.", "I found the <box or rule>, but there's no suitable",
          "<hskip or vskip>, so I'm ignoring these leaders.")
        back_error(e); flush_node_list(e, e.cur_box)
      }
    } else ship_out(e, e.cur_box as BoxNode)
  }
}

// §1079 begin_box
export function begin_box(e: Engine, box_context: number): void {
  switch (e.cur_chr) {
    case box_code: scan_register_num(e); e.cur_box = box(e, e.cur_val); change_box(e, e.cur_val, null); break
    case copy_code: scan_register_num(e); e.cur_box = copy_node_list(e, box(e, e.cur_val)); break
    case last_box_code: // §1080 If the current list ends with a box node, delete it from the list and make cur_box point to it
      e.cur_box = null
      if (Math.abs(e.mode) === mmode) {
        you_cant(e); help(e, 'Sorry; this \\lastbox will be void.'); error(e)
      } else if (e.mode === vmode && e.head === e.tail) {
        you_cant(e)
        help(e, "Sorry...I usually can't take things from the current page.", 'This \\lastbox will therefore be void.')
        error(e)
      } else {
        const tx = find_effective_tail(e)
        if (!is_char_node(tx) && (tx.type === hlist_node || tx.type === vlist_node) && fetch_effective_tail(e, tx)) { // §1081
          e.cur_box = tx; tx.shift_amount = 0
        }
      }
      break
    case vsplit_code: { // §1082 Split off part of a vertical box, make cur_box point to it
      scan_register_num(e); const n = e.cur_val
      if (!scan_keyword(e, 'to')) {
        print_err(e, "Missing `to' inserted")
        help(e, "I'm working on `\\vsplit<box number> to <dimen>';", 'will look for the <dimen> next.')
        error(e)
      }
      scan_normal_dimen(e)
      e.cur_box = vsplit(e, n, e.cur_val)
      break
    }
    default: { // §1083 Initiate the construction of an hbox or vbox, then return
      let k = e.cur_chr - vtop_code
      set_saved(e, 0, box_context)
      if (k === hmode) {
        if (box_context < box_flag && Math.abs(e.mode) === vmode) scan_spec(e, adjusted_hbox_group, true)
        else scan_spec(e, hbox_group, true)
      } else {
        if (k === vmode) scan_spec(e, vbox_group, true)
        else { scan_spec(e, vtop_group, true); k = vmode }
        normal_paragraph(e)
      }
      push_nest(e); e.mode = -k
      if (k === vmode) {
        e.prev_depth = pdf_ignored_dimen(e)
        if (e.equiv[every_vbox_loc] !== 0) begin_token_list(e, e.equiv[every_vbox_loc]!, every_vbox_text)
      } else {
        e.space_factor = 1000
        if (e.equiv[every_hbox_loc] !== 0) begin_token_list(e, e.equiv[every_hbox_loc]!, every_hbox_text)
      }
      return
    }
  }
  box_end(e, box_context)
}

// etex.ch find_effective_tail: tail, or the node before a final \endM math node
const begin_M_code = 2, end_M_code = 3
function find_effective_tail(e: Engine): Node {
  let tx = e.tail
  if (!is_char_node(tx) && tx.type === math_node && tx.subtype === end_M_code) {
    let r = e.head, q: Node
    do { q = r; r = q.link! } while (r !== tx)
    tx = q
  }
  return tx
}

// etex.ch fetch_effective_tail: unlink tx from the current list; false (TeX's goto done/exit) if tx ends a discretionary
function fetch_effective_tail(e: Engine, tx: Node): boolean {
  let q: Node | null = e.head, p: Node | null = null, r: Node | null, fm: boolean
  do {
    r = p; p = q!; fm = false
    if (!is_char_node(q!)) {
      if (q!.type === disc_node) {
        for (let m = 1; m <= q!.replace_count; m++) p = p!.link
        if (p === tx) return false
      } else if (q!.type === math_node && q!.subtype === begin_M_code) fm = true
    }
    q = p!.link
  } while (q !== tx)
  q = tx.link; p!.link = q; tx.link = null
  if (q === null) {
    if (fm) confusion(e, 'tail1')
    e.tail = p!
  } else if (fm) { e.tail = r!; r!.link = null; flush_node_list(e, p) }
  return true
}

// §1084 scan_box
export function scan_box(e: Engine, box_context: number): void {
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
  if (e.cur_cmd === Cmd.make_box) begin_box(e, box_context)
  else if (box_context >= leader_flag && (e.cur_cmd === Cmd.hrule || e.cur_cmd === Cmd.vrule)) {
    e.cur_box = scan_rule_spec(e); box_end(e, box_context)
  } else {
    print_err(e, 'A <box> was supposed to be here')
    help(e, 'I was expecting to see \\hbox or \\vbox or \\copy or \\box or', 'something like that. So you might find something missing in',
      'your output. But keep trying; you can fix this later.')
    back_error(e)
  }
}

// §463 scan_rule_spec
export function scan_rule_spec(e: Engine): Node {
  const q = new_rule()
  if (e.cur_cmd === Cmd.vrule) q.width = default_rule
  else { q.height = default_rule; q.depth = 0 }
  for (;;) {
    if (scan_keyword(e, 'width')) { scan_normal_dimen(e); q.width = e.cur_val; continue }
    if (scan_keyword(e, 'height')) { scan_normal_dimen(e); q.height = e.cur_val; continue }
    if (scan_keyword(e, 'depth')) { scan_normal_dimen(e); q.depth = e.cur_val; continue }
    return q
  }
}

// §1086 package
function package_(e: Engine, c: number): void {
  const d = e.equiv[dimen_base + box_max_depth_code]!
  unsave(e); e.save_ptr -= 3
  if (e.mode === -hmode) e.cur_box = hpack(e, e.head.link, saved(e, 2), saved(e, 1))
  else {
    const b = vpackage(e, e.head.link, saved(e, 2), saved(e, 1), d)
    e.cur_box = b
    if (c === vtop_code) { // §1087 Readjust the height and depth of cur_box, for \vtop
      let h = 0
      const p = b.list_ptr
      if (p !== null && !is_char_node(p) && p.type <= rule_node) h = (p as BoxNode).height
      b.depth = (b.depth - h + b.height) | 0; b.height = h
    }
  }
  pop_nest(e); box_end(e, saved(e, 0))
}

// §1091 norm_min, new_graf
const norm_min = (h: number) => h <= 0 ? 1 : h >= 63 ? 63 : h
const cur_lang_of = (e: Engine) => { const l = int_par(e, language_code); return l <= 0 || l > 255 ? 0 : l } // §934 set_cur_lang
export function new_graf(e: Engine, indented: boolean): void {
  e.prev_graf = 0
  if (e.mode === vmode || e.head !== e.tail) tail_append(e, new_param_glue(e, par_skip_code))
  push_nest(e); e.mode = hmode; e.space_factor = 1000; e.clang = cur_lang_of(e)
  e.prev_graf = (norm_min(int_par(e, left_hyphen_min_code)) * 0o100 + norm_min(int_par(e, right_hyphen_min_code))) * 0o200000 + e.clang
  if (indented) { const b = new_null_box(); b.width = e.equiv[dimen_base + par_indent_code]!; e.tail = b; e.head.link = b }
  if (e.equiv[every_par_loc] !== 0) begin_token_list(e, e.equiv[every_par_loc]!, every_par_text)
  if (e.nest_ptr === 1) build_page(e)
}

// §1093 indent_in_hmode
export function indent_in_hmode(e: Engine): void {
  if (e.cur_chr > 0) {
    let p: Node = new_null_box(); p.width = e.equiv[dimen_base + par_indent_code]!
    if (Math.abs(e.mode) === hmode) e.space_factor = 1000
    else { const q = new_noad(); q.nucleus.math_type = sub_box; q.nucleus.info = p; p = q }
    tail_append(e, p)
  }
}

// §1095 head_for_vmode
export function head_for_vmode(e: Engine): void {
  if (e.mode < 0) {
    if (e.cur_cmd !== Cmd.hrule) off_save(e)
    else {
      print_err(e, "You can't use `"); print_esc(e, 'hrule'); print(e, "' here except with leaders")
      help(e, 'To put a horizontal rule in an hbox or an alignment,', 'you should use \\leaders or \\hrulefill (see The TeXbook).')
      error(e)
    }
  } else { back_input(e); e.cur_tok = e.par_token; back_input(e); e.cur_input.index = inserted }
}

// §1096 end_graf
export function end_graf(e: Engine): void {
  if (e.mode === hmode) {
    if (e.head === e.tail) pop_nest(e)
    else line_break(e, false)
    normal_paragraph(e)
    e.error_count = 0
  }
}

// §1099 begin_insert_or_adjust
export function begin_insert_or_adjust(e: Engine): void {
  if (e.cur_cmd === Cmd.vadjust) e.cur_val = 255
  else {
    scan_eight_bit_int(e)
    if (e.cur_val === 255) {
      print_err(e, "You can't "); print_esc(e, 'insert'); print_int(e, 255)
      help(e, "I'm changing to \\insert0; box 255 is special."); error(e); e.cur_val = 0
    }
  }
  set_saved(e, 0, e.cur_val)
  set_saved(e, 1, e.cur_cmd === Cmd.vadjust && scan_keyword(e, 'pre') ? 1 : 0)
  e.save_ptr += 2
  new_save_level(e, insert_group); scan_left_brace(e); normal_paragraph(e)
  push_nest(e); e.mode = -vmode; e.prev_depth = pdf_ignored_dimen(e)
}

// §1101 make_mark
export function make_mark(e: Engine): void {
  let c = 0
  if (e.cur_chr !== 0) { scan_register_num(e); c = e.cur_val }
  scan_toks(e, false, true)
  const p: MarkNode = { type: mark_node, link: null, subtype: 0, mark_ptr: e.def_ref, mark_class: c }
  e.tail.link = p; e.tail = p
}

// §1103 append_penalty
export function append_penalty(e: Engine): void {
  scan_int(e); tail_append(e, new_penalty(e.cur_val))
  if (e.mode === vmode) build_page(e)
}

// §1105 delete_last
export function delete_last(e: Engine): void {
  if (e.mode === vmode && e.tail === e.head) { // §1106 Apologize for inability to do the operation now, unless \unskip follows non-glue
    if (e.cur_chr !== glue_node || e.last_glue !== 0o17777777777) {
      you_cant(e)
      help(e, "Sorry...I usually can't take things from the current page.",
        e.cur_chr === kern_node ? "Try `I\\kern-\\lastkern' instead." : e.cur_chr !== glue_node ? 'Perhaps you can make the output routine do it.'
          : "Try `I\\vskip-\\lastskip' instead.")
      error(e)
    }
  } else {
    const tx = find_effective_tail(e)
    if (!is_char_node(tx) && tx.type === e.cur_chr && fetch_effective_tail(e, tx)) flush_node_list(e, tx)
  }
}

// §1110 unpackage
export function unpackage(e: Engine): void {
  done: {
  if (e.cur_chr > copy_code) { // etex.ch Handle saved items and goto done
    e.tail.link = e.disc_ptr[e.cur_chr]!; e.disc_ptr[e.cur_chr] = null; break done
  }
  const c = e.cur_chr
  scan_register_num(e)
  const p = box(e, e.cur_val)
  if (p === null) return
  const m = Math.abs(e.mode)
  if (m === mmode || (m === vmode && p.type !== vlist_node) || (m === hmode && p.type !== hlist_node)) {
    print_err(e, "Incompatible list can't be unboxed")
    help(e, 'Sorry, Pandora. (You sneaky devil.)', 'I refuse to unbox an \\hbox in vertical mode or vice versa.',
      "And I can't open any boxes in math mode.")
    error(e); return
  }
  if (c === copy_code) e.tail.link = copy_node_list(e, p.list_ptr)
  else { e.tail.link = p.list_ptr; change_box(e, e.cur_val, null) }
  }
  while (e.tail.link !== null) e.tail = e.tail.link // no margin kern nodes exist (\pdfprotrudechars is unsupported)
}

// §1113 append_italic_correction
export function append_italic_correction(e: Engine): void {
  if (e.tail === e.head) return
  const t = e.tail
  let f: number, c: number
  if (is_char_node(t)) { f = t.font; c = t.character }
  else if (t.type === ligature_node) { f = t.font; c = t.character }
  else return
  const k = new_kern(char_italic(e, f, char_info(e, f, c))); k.subtype = explicit
  tail_append(e, k)
}

// §1117 append_discretionary (pdftex's auto kerns are always null)
export function append_discretionary(e: Engine): void {
  const d = new_disc()
  tail_append(e, d)
  if (e.cur_chr === 1) {
    const f = e.equiv[cur_font_loc]!, c = e.hyphen_char[f]!
    if (c >= 0 && c < 256) d.pre_break = new_character(e, f, c)
  } else {
    e.save_ptr++; set_saved(e, -1, 0); new_save_level(e, disc_group)
    scan_left_brace(e); push_nest(e); e.mode = -hmode; e.space_factor = 1000
  }
}

// §1119 build_discretionary
function build_discretionary(e: Engine): void {
  unsave(e)
  // §1121 Prune the current list, if necessary, until it contains only char, kern, hlist, vlist, rule and ligature nodes
  let q: Node = e.head, p = q.link, n = 0
  while (p !== null) {
    if (!is_char_node(p) && p.type > rule_node && p.type !== kern_node && p.type !== ligature_node) {
      print_err(e, 'Improper discretionary list')
      help(e, 'Discretionary lists must contain only boxes and kerns.')
      error(e)
      begin_diagnostic(e)
      print_nl(e, 'The following discretionary sublist has been deleted:')
      show_box(e, p)
      end_diagnostic(e, true)
      flush_node_list(e, p); q.link = null; break
    }
    q = p; p = q.link; n++
  }
  p = e.head.link; pop_nest(e)
  const d = e.tail as import('./nodes.ts').DiscNode
  switch (saved(e, -1)) {
    case 0: d.pre_break = p; break
    case 1: d.post_break = p; break
    case 2: // §1120 Attach list p to the current list, and record its length; then finish up and return
      if (n > 0 && Math.abs(e.mode) === mmode) {
        print_err(e, 'Illegal math '); print_esc(e, 'discretionary')
        help(e, 'Sorry: The third part of a discretionary break must be', 'empty, in math formulas. I had to delete your third part.')
        flush_node_list(e, p); n = 0; error(e)
      } else e.tail.link = p
      if (n <= 255) d.replace_count = n
      else {
        print_err(e, 'Discretionary list is too long')
        help(e, 'Wow---I never thought anybody would tweak me here.', "You can't seriously need such a huge discretionary list?")
        error(e)
      }
      if (n > 0) e.tail = q
      e.save_ptr--; return
  }
  set_saved(e, -1, saved(e, -1) + 1); new_save_level(e, disc_group); scan_left_brace(e)
  push_nest(e); e.mode = -hmode; e.space_factor = 1000
}

// §1123 make_accent
export function make_accent(e: Engine): void {
  scan_char_num(e)
  let f = e.equiv[cur_font_loc]!
  let p: Node | null = new_character(e, f, e.cur_val)
  if (p === null) return
  const x = param(e, x_height_code, f), s = param(e, slant_code, f) / 65536
  const a = char_width(e, f, char_info(e, f, (p as CharNode).character))
  do_assignments(e)
  // §1124 Create a character node q for the next character, but set q:=null if problems arise
  let q: CharNode | null = null
  f = e.equiv[cur_font_loc]!
  if (e.cur_cmd === Cmd.letter || e.cur_cmd === Cmd.other_char || e.cur_cmd === Cmd.char_given) q = new_character(e, f, e.cur_chr)
  else if (e.cur_cmd === Cmd.char_num) { scan_char_num(e); q = new_character(e, f, e.cur_val) }
  else back_input(e)
  if (q !== null) { // §1125 Append the accent with appropriate kerns, then set p:=q
    const t = param(e, slant_code, f) / 65536
    const i = char_info(e, f, q.character)
    const w = char_width(e, f, i), h = char_height(e, f, height_depth(i))
    if (h !== x) { const b = hpack(e, p, 0, additional); b.shift_amount = (x - h) | 0; p = b }
    const delta = zround_((w - a) / 2 + h * t - x * s)
    const r = new_kern(delta); r.subtype = acc_kern; e.tail.link = r; r.link = p
    const k = new_kern((-a - delta) | 0); k.subtype = acc_kern; e.tail = k; p.link = k; p = q
  }
  e.tail.link = p; e.tail = p; e.space_factor = 1000
}
import { zround as zround_ } from './nodes.ts'

// §1127 align_error
function align_error(e: Engine): void {
  if (Math.abs(e.align_state) > 2) { // §1128 Express consternation over the fact that no alignment is in progress
    print_err(e, 'Misplaced '); print_cmd_chr(e, e.cur_cmd, e.cur_chr)
    if (e.cur_tok === tab_token + 38) {
      help(e, "I can't figure out why you would want to use a tab mark", 'here. If you just want an ampersand, the remedy is',
        "simple: Just type `I\\&' now. But if some right brace", 'up above has ended a previous alignment prematurely,',
        "you're probably due for more error messages, and you", "might try typing `S' now just to see what is salvageable.")
    } else {
      help(e, "I can't figure out why you would want to use a tab mark", 'or \\cr or \\span just now. If something like a right brace',
        'up above has ended a previous alignment prematurely,', "you're probably due for more error messages, and you",
        "might try typing `S' now just to see what is salvageable.")
    }
    error(e)
  } else {
    back_input(e)
    if (e.align_state < 0) { print_err(e, 'Missing { inserted'); e.align_state++; e.cur_tok = left_brace_token + 123 }
    else { print_err(e, 'Missing } inserted'); e.align_state--; e.cur_tok = right_brace_token + 125 }
    help(e, "I've put in what seems to be necessary to fix", 'the current column of the current alignment.',
      'Try to go on, since this might almost work.')
    ins_error(e)
  }
}

// §1135 do_assignments
export function do_assignments(e: Engine): void {
  for (;;) {
    do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
    if (e.cur_cmd <= Cmd.max_non_prefixed_command) return
    e.set_box_allowed = false; prefixed_command(e); e.set_box_allowed = true
  }
}

// §1376 fix_language
function fix_language(e: Engine): void {
  const l = cur_lang_of(e)
  if (l !== e.clang) {
    const w = new_whatsit_node(language_node)
    w.what_lang = l; e.clang = l
    w.what_lhm = norm_min(int_par(e, left_hyphen_min_code)); w.what_rhm = norm_min(int_par(e, right_hyphen_min_code))
    tail_append(e, w)
  }
}
export { fix_language, norm_min }

// §1265 new_interaction
export function new_interaction(e: Engine): void {
  print_ln(e)
  e.interaction = e.cur_chr
  e.selector = e.interaction === batch_mode ? no_print : term_only // §75
  if (e.log_opened) e.selector += 2
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
      help(e, e.eTeX_ex ? "I'll pretend you didn't say \\long or \\outer or \\global or \\protected."
        : "I'll pretend you didn't say \\long or \\outer or \\global.")
      back_error(e); return
    }
    if (int_par(e, tracing_commands_code) > 2 && e.eTeX_ex) show_cur_cmd_chr(e) // etex.ch
  }
  // §1213 Discard the prefixes \long and \outer if they are irrelevant (etex.ch: and \protected; j is the protected flag)
  let j = 0
  if (a >= 8) { j = 8; a -= 8 }
  if (e.cur_cmd !== Cmd.def && (a % 4 !== 0 || j !== 0)) {
    print_err(e, "You can't use `"); print_esc(e, 'long'); print(e, "' or `")
    print_esc(e, 'outer')
    help(e, "I'll pretend you didn't say \\long or \\outer here.")
    if (e.eTeX_ex) { e.help_line[0] = "I'll pretend you didn't say \\long or \\outer or \\protected here."; print(e, "' or `"); print_esc(e, 'protected') }
    print(e, "' with `")
    print_cmd_chr(e, e.cur_cmd, e.cur_chr); print_char(e, 39)
    error(e)
  }
  // §1214 Adjust for the setting of \globaldefs
  if (int_par(e, global_defs_code) !== 0) {
    if (int_par(e, global_defs_code) < 0) { if (a >= 4) a -= 4 }
    else if (a < 4) a += 4
  }
  const prim = registry.get(e.cur_cmd)
  if (prim?.assign) prim.assign(e, e.cur_cmd === Cmd.def ? a + j : a) // def sees \protected as a+8
  else if (prim && e.cur_cmd !== Cmd.partoken_name) unsupported(e)
  else confusion(e, 'prefix') // also \global\partokenname (partoken.ch adds no prefixed case)
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
  let q = e.cur_cs, sp = false // etex.ch: does p refer to a sparse array element?
  if (e.cur_cmd === Cmd.toks_register) {
    if (e.cur_chr === 0) {
      scan_register_num(e)
      if (e.cur_val > 255) { e.cur_chr = find_sa_element(e, tok_val, e.cur_val, true); sp = true }
      else e.cur_chr = toks_base + e.cur_val
    } else sp = true
  }
  const p = e.cur_chr
  const sa_define = (v: number, t: number) => { if (sp) sa_def(e, p, v, null, a >= 4); else define(e, a, p, t, v) }
  scan_optional_equals(e)
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
  if (e.cur_cmd !== Cmd.left_brace) {
    // §1227 If the right-hand side is a token parameter or token register, finish the assignment and goto done
    if (e.cur_cmd === Cmd.toks_register || e.cur_cmd === Cmd.assign_toks) {
      if (e.cur_cmd === Cmd.toks_register) {
        if (e.cur_chr === 0) {
          scan_register_num(e)
          if (e.cur_val < 256) q = e.equiv[toks_base + e.cur_val]!
          else { const x = find_sa_element(e, tok_val, e.cur_val, false); q = x === 0 ? 0 : sa(e, x).ptr }
        } else q = sa(e, e.cur_chr).ptr
      } else q = e.equiv[e.cur_chr]!
      if (q === 0) sa_define(0, Cmd.undefined_cs)
      else { add_token_ref(e, q); sa_define(q, Cmd.call) }
      return
    }
  }
  back_input(e); e.cur_cs = q; q = scan_toks(e, false, false)
  if (e.link[e.def_ref] === 0) { sa_define(0, Cmd.undefined_cs); free_avail(e, e.def_ref) }
  else {
    if (p === output_routine_loc && !sp) { // enclose in curlies
      e.link[q] = get_avail(e); q = e.link[q]!; e.info[q] = right_brace_token + 125
      q = get_avail(e); e.info[q] = left_brace_token + 123
      e.link[q] = e.link[e.def_ref]!; e.link[e.def_ref] = q
    }
    sa_define(e.def_ref, Cmd.call)
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
  let l = 0, p: number, sp = false // etex.ch: does l refer to a sparse array element?
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
    if (e.cur_chr > mu_val) { l = e.cur_chr; p = sa(e, l).t; sp = true }
    else {
      p = e.cur_chr; scan_register_num(e)
      if (e.cur_val > 255) { l = find_sa_element(e, p, e.cur_val, true); sp = true }
      else l = e.cur_val + (p === int_val ? count_base : p === dimen_val ? scaled_base : p === glue_val ? skip_base : mu_skip_base)
    }
  }
  const w = sp ? (p < glue_val ? sa(e, l).int : sa(e, l).ptr) : e.equiv[l]!, s = w // eqtb[l].int for p<glue_val, equiv(l) otherwise
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
  if (p < glue_val) { if (sp) sa_w_def(e, l, e.cur_val, a >= 4); else word_define(e, a, l, e.cur_val) }
  else { trap_zero_glue(e); if (sp) sa_def(e, l, e.cur_val, null, a >= 4); else define(e, a, l, Cmd.glue_ref, e.cur_val) }
}

// §1064 off_save
export function off_save(e: Engine): void {
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
  // partoken.ch: with \partokencontext>0 (>1) a vbox-like (insert/output) group ending in horizontal mode first gets a par token
  const ctx = int_par(e, partoken_context_code)
  if (e.mode === hmode && (ctx > 0 && (e.cur_group === vbox_group || e.cur_group === vtop_group || e.cur_group === vcenter_group) ||
    ctx > 1 && (e.cur_group === insert_group || e.cur_group === output_group || e.cur_group === no_align_group))) {
    back_input(e); e.cur_tok = e.par_token; back_input(e); e.cur_input.index = inserted; return
  }
  switch (e.cur_group) {
    case simple_group: unsave(e); break
    case bottom_level:
      print_err(e, "Too many }'s")
      help(e, "You've closed more groups than you opened.", 'Such booboos are generally harmless, so keep going.')
      error(e); break
    case semi_simple_group: case math_shift_group: case math_left_group: extra_right_brace(e); break
    case hbox_group: package_(e, 0); break // §1085
    case adjusted_hbox_group: e.adjust_tail = e.adjust_head; e.pre_adjust_tail = e.pre_adjust_head; package_(e, 0); break
    case vbox_group: end_graf(e); package_(e, 0); break
    case vtop_group: end_graf(e); package_(e, vtop_code); break
    case insert_group: { // §1100
      end_graf(e)
      const q = e.equiv[glue_base + split_top_skip_code]!; add_glue_ref(e, q)
      const d = e.equiv[dimen_base + split_max_depth_code]!, f = int_par(e, floating_penalty_code)
      unsave(e); e.save_ptr -= 2
      const p = vpack(e, e.head.link, 0, additional); pop_nest(e)
      if (saved(e, 0) < 255) {
        const n: InsNode = { type: ins_node, link: null, subtype: saved(e, 0), height: (p.height + p.depth) | 0, depth: d,
          split_top_ptr: q, float_cost: f, ins_ptr: p.list_ptr }
        tail_append(e, n)
      } else {
        const n: AdjustNode = { type: adjust_node, link: null, subtype: saved(e, 1), adjust_ptr: p.list_ptr }
        tail_append(e, n); delete_glue_ref(e, q)
      }
      if (e.nest_ptr === 0) build_page(e)
      break
    }
    case disc_group: build_discretionary(e); break // §1118
    case output_group: resume_page_builder(e); break // §1100
    case vcenter_group: finish_vcenter(e); break // §1168
    case math_choice_group: build_choices(e); break // §1173
    case math_group: finish_math_group(e); break // §1186
    case align_group: align_group_right_brace(e); break // §1132
    case no_align_group: no_align_group_right_brace(e); break // §1133
    default: confusion(e, 'rightbrace')
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

// §1136–1207 building math lists
const cur_fam_code = 44, var_code = 0o70000, every_math_loc = local_base + 3, every_display_loc = local_base + 4
const every_math_text = 8, every_display_text = 9
const math_surround_code = 1, hsize_code = 3, pre_display_size_code = 13, display_width_code = 14, display_indent_code = 15
const pre_display_penalty_code = 11, post_display_penalty_code = 12, pre_display_direction_code = 107
const above_display_skip_code = 3, below_display_skip_code = 4, above_display_short_skip_code = 5, below_display_short_skip_code = 6
const dlist = 2 // etex.ch: box_lr of an hlist from display math mode
const fam_in_range = (e: Engine) => int_par(e, cur_fam_code) >= 0 && int_par(e, cur_fam_code) < 16
// a noad field on the save stack (TeX keeps its mem address there): a handle into Engine.nodes
const field_ref = (e: Engine, f: Field): number => node_ref(e, f as unknown as Node)
const field_at = (e: Engine, h: number): Field => e.nodes[h] as unknown as Field

// §1136 push_math
export function push_math(e: Engine, c: number): void {
  push_nest(e); e.mode = -mmode; e.incompleat_noad = null; new_save_level(e, c)
}

// §1139 Go into ordinary math mode
function go_into_ordinary_math(e: Engine): void {
  push_math(e, math_shift_group); eq_word_define(e, int_base + cur_fam_code, -1)
  if (e.equiv[every_math_loc] !== 0) begin_token_list(e, e.equiv[every_math_loc]!, every_math_text)
}

// §1138 init_math (e-TeX's prototype box j and direction x stay null and 0: eTeX_ex and TeXXeT are off)
export function init_math(e: Engine): void {
  no_TeXXeT(e) // etex.ch branches on TeXXeT_en here; TeXXeT is not ported
  get_token(e) // get_x_token would fail on \ifmmode!
  if (e.cur_cmd !== Cmd.math_shift || e.mode <= 0) { back_input(e); go_into_ordinary_math(e); return }
  // §1145 Go into display math mode
  let w = -max_dimen
  if (e.head === e.tail) pop_nest(e) // §1145 Prepare for display after an empty paragraph
  else {
    line_break(e, true)
    // §1146 Calculate the natural width, w, by which the characters of the final line extend to the right of the reference point
    const jb = e.just_box as BoxNode
    let v = jb.shift_amount
    v = (v + Math.imul(2, param(e, quad_code, e.equiv[cur_font_loc]!))) | 0
    for (let p = jb.list_ptr; p !== null; p = p.link) {
      // §1147 Let d be the natural width of node p; if the node is visible, goto found
      let d = 0, found = false, done = false
      if (is_char_node(p) || p.type === ligature_node) {
        const f = (p as CharNode).font
        d = char_width(e, f, char_info(e, f, (p as CharNode).character)); found = true
      } else switch (p.type) {
        case hlist_node: case vlist_node: case rule_node: d = p.width; found = true; break
        case kern_node: d = p.width; break
        case math_node: // §1439 (TeXXeT off)
          d = p.width
          if (p.subtype >= L_code) { w = max_dimen; done = true }
          break
        case glue_node: { // §1148
          const q = e.spec[p.glue_ptr]!
          d = q.width
          if (jb.glue_sign === stretching) { if (jb.glue_order === q.stretch_order && q.stretch !== 0) v = max_dimen }
          else if (jb.glue_sign === shrinking) { if (jb.glue_order === q.shrink_order && q.shrink !== 0) v = max_dimen }
          if (p.subtype >= a_leaders) found = true
          break
        }
        default: d = 0 // a whatsit has width 0 (no \pdfrefxform or \pdfrefximage nodes)
      }
      if (done) break
      if (!found) { if (v < max_dimen) v = (v + d) | 0; continue }
      if (v < max_dimen) { v = (v + d) | 0; w = v }
      else { w = max_dimen; break }
    }
  }
  // §1149 Calculate the length, l, and the shift amount, s, of the display lines
  let l: number, s: number
  if (e.equiv[par_shape_loc] === 0) {
    const hi = e.equiv[dimen_base + hang_indent_code]!, ha = int_par(e, hang_after_code)
    if (hi !== 0 && ((ha >= 0 && e.prev_graf + 2 > ha) || (e.prev_graf + 1 < (-ha | 0)))) {
      l = (e.equiv[dimen_base + hsize_code]! - (Math.abs(hi) | 0)) | 0; s = hi > 0 ? hi : 0
    } else { l = e.equiv[dimen_base + hsize_code]!; s = 0 }
  } else {
    const sh = e.shapes[e.equiv[par_shape_loc]!]!, n = sh[0]!
    const k = e.prev_graf + 2 >= n ? n : e.prev_graf + 2
    s = sh[2 * k - 1]!; l = sh[2 * k]!
  }
  push_math(e, math_shift_group); e.mode = mmode
  eq_word_define(e, int_base + cur_fam_code, -1)
  eq_word_define(e, dimen_base + pre_display_size_code, w)
  e.eTeX_aux = null // LR_box:=j
  eq_word_define(e, dimen_base + display_width_code, l)
  eq_word_define(e, dimen_base + display_indent_code, s)
  if (e.equiv[every_display_loc] !== 0) begin_token_list(e, e.equiv[every_display_loc]!, every_display_text)
  if (e.nest_ptr === 1) build_page(e)
}

// §1142 start_eq_no
export function start_eq_no(e: Engine): void {
  set_saved(e, 0, e.cur_chr); e.save_ptr++
  go_into_ordinary_math(e)
}

// §1151 Treat cur_chr as an active character
function treat_as_active(e: Engine): void {
  e.cur_cs = e.cur_chr + 1 // active_base
  e.cur_cmd = e.eq_type[e.cur_cs]!; e.cur_chr = e.equiv[e.cur_cs]!
  x_token(e); back_input(e)
}

// §1151 scan_math
export function scan_math(e: Engine, p: Field): void {
  let c: number
  restart: for (;;) {
    do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
    for (;;) { // reswitch
      switch (e.cur_cmd) {
        case Cmd.letter: case Cmd.other_char: case Cmd.char_given:
          c = e.equiv[math_code_base + e.cur_chr]!
          if (c === 0o100000) { treat_as_active(e); continue restart }
          break
        case Cmd.char_num: scan_char_num(e); e.cur_chr = e.cur_val; e.cur_cmd = Cmd.char_given; continue
        case Cmd.math_char_num: scan_fifteen_bit_int(e); c = e.cur_val; break
        case Cmd.math_given: c = e.cur_chr; break
        case Cmd.delim_num: scan_twenty_seven_bit_int(e); c = Math.trunc(e.cur_val / 0o10000); break
        default: // §1153 Scan a subformula enclosed in braces and return
          back_input(e); scan_left_brace(e)
          set_saved(e, 0, field_ref(e, p)); e.save_ptr++; push_math(e, math_group)
          return
      }
      break restart
    }
  }
  p.math_type = math_char; p.character = c % 256
  p.fam = c >= var_code && fam_in_range(e) ? int_par(e, cur_fam_code) : (c >> 8) % 16
}

// §1155 set_math_char
export function set_math_char(e: Engine, c: number): void {
  if (c >= 0o100000) { treat_as_active(e); return }
  const p = new_noad()
  p.nucleus.math_type = math_char; p.nucleus.character = c % 256; p.nucleus.fam = (c >> 8) % 16
  if (c >= var_code) {
    if (fam_in_range(e)) p.nucleus.fam = int_par(e, cur_fam_code)
    p.type = ord_noad
  } else p.type = (ord_noad + (c >> 12)) as Noad['type']
  e.tail.link = p; e.tail = p
}

// §1160 scan_delimiter (TeX's garbage target is a throwaway object)
export function scan_delimiter(e: Engine, p: Delim, r: boolean): void {
  if (r) scan_twenty_seven_bit_int(e)
  else {
    do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
    switch (e.cur_cmd) {
      case Cmd.letter: case Cmd.other_char: e.cur_val = e.equiv[del_code_base + e.cur_chr]!; break
      case Cmd.delim_num: scan_twenty_seven_bit_int(e); break
      default: e.cur_val = -1
    }
  }
  if (e.cur_val < 0) { // §1161 Report that an invalid delimiter code is being changed to null
    print_err(e, 'Missing delimiter (. inserted)')
    help(e, "I was expecting to see something like `(' or `\\{' or", "`\\}' here. If you typed, e.g., `{' instead of `\\{', you",
      "should probably delete the `{' by typing `1' now, so that", 'braces don\'t get unbalanced. Otherwise just proceed.',
      'Acceptable delimiters are characters whose \\delcode is', "nonnegative, or you can use `\\delimiter <delimiter code>'.")
    back_error(e); e.cur_val = 0
  }
  p.small_fam = (e.cur_val >> 20) % 16; p.small_char = (e.cur_val >> 12) % 256
  p.large_fam = (e.cur_val >> 8) % 16; p.large_char = e.cur_val % 256
}

// §1165 math_ac
export function math_ac(e: Engine): void {
  if (e.cur_cmd === Cmd.accent) { // §1166 Complain that the user should have said \mathaccent
    print_err(e, 'Please use '); print_esc(e, 'mathaccent'); print(e, ' for accents in math mode')
    help(e, "I'm changing \\accent to \\mathaccent here; wish me luck.", '(Accents are not the same in formulas as they are in text.)')
    error(e)
  }
  const n = new_noad(); n.type = accent_noad; tail_append(e, n)
  n.accent_chr.math_type = math_char
  scan_fifteen_bit_int(e)
  n.accent_chr.character = e.cur_val % 256
  n.accent_chr.fam = e.cur_val >= var_code && fam_in_range(e) ? int_par(e, cur_fam_code) : (e.cur_val >> 8) % 16
  scan_math(e, n.nucleus)
}

// §1176 sub_sup
export function sub_sup(e: Engine): void {
  let t = 0, p: Field | null = null
  const tl = e.tail as Noad
  if (tl !== e.head && !is_char_node(tl) && tl.type >= ord_noad && tl.type < left_noad) { // scripts_allowed
    p = e.cur_cmd === Cmd.sup_mark ? tl.supscr : tl.subscr
    t = p.math_type
  }
  if (p === null || t !== 0) { // §1177 Insert a dummy noad to be sub/superscripted
    const n = new_noad(); tail_append(e, n)
    p = e.cur_cmd === Cmd.sup_mark ? n.supscr : n.subscr
    if (t !== 0) {
      if (e.cur_cmd === Cmd.sup_mark) { print_err(e, 'Double superscript'); help(e, "I treat `x^1^2' essentially like `x^1{}^2'.") }
      else { print_err(e, 'Double subscript'); help(e, "I treat `x_1_2' essentially like `x_1{}_2'.") }
      error(e)
    }
  }
  scan_math(e, p)
}

// §1184 fin_mlist
export function fin_mlist(e: Engine, p: Node | null): Node | null {
  let q: Node | null
  const n = e.incompleat_noad as Noad | null
  if (n !== null) { // §1185 Compleat the incompleat noad
    n.subscr.math_type = sub_mlist; n.subscr.info = e.head.link
    if (p === null) q = n
    else {
      q = n.supscr.info
      if (q === null || q.type !== left_noad || e.eTeX_aux === null) confusion(e, 'right')
      n.supscr.info = e.eTeX_aux.link; e.eTeX_aux.link = n; n.link = p
    }
  } else { e.tail.link = p; q = e.head.link }
  pop_nest(e)
  return q
}

// §1194 Check that the necessary fonts for math symbols are present; if not, flush the current math lists and return true
function math_fonts_missing(e: Engine): boolean {
  const fp = (n: number) => e.font_params[fam_fnt(e, n)]!
  if (fp(2 + text_size) < total_mathsy_params || fp(2 + script_size) < total_mathsy_params || fp(2 + script_script_size) < total_mathsy_params) {
    print_err(e, 'Math formula deleted: Insufficient symbol fonts')
    help(e, "Sorry, but I can't typeset math unless \\textfont 2", 'and \\scriptfont 2 and \\scriptscriptfont 2 have all',
      'the \\fontdimen values needed in math symbol fonts.')
    error(e); flush_math(e); return true
  }
  if (fp(3 + text_size) < total_mathex_params || fp(3 + script_size) < total_mathex_params || fp(3 + script_script_size) < total_mathex_params) {
    print_err(e, 'Math formula deleted: Insufficient extension fonts')
    help(e, "Sorry, but I can't typeset math unless \\textfont 3", 'and \\scriptfont 3 and \\scriptscriptfont 3 have all',
      'the \\fontdimen values needed in math extension fonts.')
    error(e); flush_math(e); return true
  }
  return false
}

// §1197 Check that another $ follows
export function check_that_another_dollar_follows(e: Engine): void {
  get_x_token(e)
  if (e.cur_cmd !== Cmd.math_shift) {
    print_err(e, 'Display math should end with $$')
    help(e, "The `$' that I just saw supposedly matches a previous `$$'.", "So I shall assume that you typed `$$' both times.")
    back_error(e)
  }
}

// §1194 after_math
export function after_math(e: Engine): void {
  no_TeXXeT(e) // etex.ch branches on TeXXeT_en here; TeXXeT is not ported
  let j: Node | null = null
  if (e.mode === mmode) j = e.eTeX_aux // §1194 Retrieve the prototype box
  let danger = math_fonts_missing(e)
  let m = e.mode, l = false, p = fin_mlist(e, null), a: BoxNode | null = null
  if (e.mode === -m) { // end of equation number
    check_that_another_dollar_follows(e)
    e.cur_mlist = p; e.cur_style = text_style; e.mlist_penalties = false
    a = hpack(e, mlist_to_hlist(e), 0, additional); a.subtype = dlist
    unsave(e); e.save_ptr-- // now cur_group=math_shift_group
    if (saved(e, 0) === 1) l = true
    if (e.mode === mmode) j = e.eTeX_aux
    danger = math_fonts_missing(e)
    m = e.mode; p = fin_mlist(e, null)
  }
  if (m < 0) { // §1196 Finish math in text
    tail_append(e, new_math(e.equiv[dimen_base + math_surround_code]!, before))
    e.cur_mlist = p; e.cur_style = text_style; e.mlist_penalties = e.mode > 0
    e.tail.link = mlist_to_hlist(e)
    while (e.tail.link !== null) e.tail = e.tail.link
    tail_append(e, new_math(e.equiv[dimen_base + math_surround_code]!, after))
    e.space_factor = 1000; unsave(e)
    return
  }
  if (a === null) check_that_another_dollar_follows(e)
  // §1199 Finish displayed math
  e.cur_mlist = p; e.cur_style = display_style; e.mlist_penalties = false
  p = mlist_to_hlist(e)
  e.adjust_tail = e.adjust_head; e.pre_adjust_tail = e.pre_adjust_head
  let b = hpack(e, p, 0, additional); p = b.list_ptr
  const t = e.adjust_tail; e.adjust_tail = null
  const pre_t = e.pre_adjust_tail; e.pre_adjust_tail = null
  let w = b.width
  const z = e.equiv[dimen_base + display_width_code]!
  let s = e.equiv[dimen_base + display_indent_code]!
  if (int_par(e, pre_display_direction_code) < 0) s = (-s - z) | 0
  let en: number, q: number
  if (a === null || danger) { en = 0; q = 0 } else { en = a.width; q = (en + math_quad(e, text_size)) | 0 }
  if (w + q > z) { // §1201 Squeeze the equation as much as possible
    if (en !== 0 && (w - e.total_shrink[normal]! + q <= z || e.total_shrink[1] !== 0 || e.total_shrink[2] !== 0 || e.total_shrink[3] !== 0)) {
      b = hpack(e, p, (z - q) | 0, exactly)
    } else {
      en = 0
      if (w > z) b = hpack(e, p, z, exactly)
    }
    w = b.width
  }
  // §1202 Determine the displacement, d, of the left edge of the equation
  b.subtype = dlist
  let d = half((z - w) | 0)
  if (en > 0 && d < Math.imul(2, en)) { // too close
    d = half((z - w - en) | 0)
    if (p !== null && !is_char_node(p) && p.type === glue_node) d = 0
  }
  // §1203 Append the glue or equation number preceding the display
  tail_append(e, new_penalty(int_par(e, pre_display_penalty_code)))
  let g1: number, g2: number
  if (d + s <= e.equiv[dimen_base + pre_display_size_code]! || l) { g1 = above_display_skip_code; g2 = below_display_skip_code }
  else { g1 = above_display_short_skip_code; g2 = below_display_short_skip_code }
  if (l && en === 0) { app_display(e, j, a!, 0); tail_append(e, new_penalty(inf_penalty)) }
  else tail_append(e, new_param_glue(e, g1))
  // §1204 Append the display and perhaps also the equation number
  if (en !== 0) {
    const r = new_kern((z - w - en - d) | 0)
    let bb: Node
    if (l) { a!.link = r; r.link = b; bb = a!; d = 0 } else { b.link = r; r.link = a; bb = b }
    b = hpack(e, bb, 0, additional)
  }
  app_display(e, j, b, d)
  // §1205 Append the glue or equation number following the display
  if (a !== null && en === 0 && !l) {
    tail_append(e, new_penalty(inf_penalty))
    app_display(e, j, a, (z - a.width) | 0)
    g2 = 0
  }
  if (t !== e.adjust_head) { e.tail.link = e.adjust_head.link; e.tail = t! } // migrating material comes after equation number
  if (pre_t !== e.pre_adjust_head) { e.tail.link = e.pre_adjust_head.link; e.tail = pre_t! }
  tail_append(e, new_penalty(int_par(e, post_display_penalty_code)))
  if (g2 > 0) tail_append(e, new_param_glue(e, g2))
  flush_node_list(e, j) // §1199 Flush the prototype box
  resume_after_display(e)
}

// §1200 resume_after_display
export function resume_after_display(e: Engine): void {
  if (e.cur_group !== math_shift_group) confusion(e, 'display')
  unsave(e); e.prev_graf += 3
  push_nest(e); e.mode = hmode; e.space_factor = 1000; e.clang = cur_lang_of(e)
  e.prev_graf = (norm_min(int_par(e, left_hyphen_min_code)) * 0o100 + norm_min(int_par(e, right_hyphen_min_code))) * 0o200000 + e.clang
  get_x_token(e); if (e.cur_cmd !== Cmd.spacer) back_input(e) // §443 Scan an optional space
  if (e.nest_ptr === 1) build_page(e)
}

// etex.ch app_display (pre_display_direction=0 without e-TeX, so the TeXXeT branch is unreachable)
function app_display(e: Engine, _j: Node | null, b: BoxNode, d: number): void {
  if (int_par(e, pre_display_direction_code) !== 0) fatal_error(e, 'unsupported: \\predisplaydirection')
  b.shift_amount = (e.equiv[dimen_base + display_indent_code]! + d) | 0
  append_to_vlist(e, b)
}

// §1181 math_fraction
export function math_fraction(e: Engine): void {
  const c = e.cur_chr, delimited_code = 3
  if (e.incompleat_noad !== null) { // §1183 Ignore the fraction operation and complain about this ambiguous case
    if (c >= delimited_code) { scan_delimiter(e, null_delimiter(), false); scan_delimiter(e, null_delimiter(), false) }
    if (c % delimited_code === 0) scan_normal_dimen(e)
    print_err(e, 'Ambiguous; you need another { and }')
    help(e, "I'm ignoring this fraction specification, since I don't", "know whether a construction like `x \\over y \\over z'",
      "means `{x \\over y} \\over z' or `x \\over {y \\over z}'.")
    error(e)
    return
  }
  const n = new_noad(); e.incompleat_noad = n
  n.type = fraction_noad; n.subtype = normal
  n.supscr.math_type = sub_mlist; n.supscr.info = e.head.link
  e.head.link = null; e.tail = e.head
  // §1182 Use code c to distinguish between generalized fractions
  if (c >= delimited_code) { scan_delimiter(e, n.left_delimiter, false); scan_delimiter(e, n.right_delimiter, false) }
  switch (c % delimited_code) {
    case 0: scan_normal_dimen(e); n.thickness = e.cur_val; break
    case 1: n.thickness = default_code; break
    case 2: n.thickness = 0; break
  }
}

// §1191 math_left_right
export function math_left_right(e: Engine): void {
  const t = e.cur_chr, middle_noad = 1
  if (t !== left_noad && e.cur_group !== math_left_group) { // §1192 Try to recover from mismatched \right
    if (e.cur_group === math_shift_group) {
      scan_delimiter(e, null_delimiter(), false)
      print_err(e, 'Extra ')
      if (t === middle_noad) { print_esc(e, 'middle'); help(e, "I'm ignoring a \\middle that had no matching \\left.") }
      else { print_esc(e, 'right'); help(e, "I'm ignoring a \\right that had no matching \\left.") }
      error(e)
    } else off_save(e)
    return
  }
  const p = new_noad(); p.type = t as Noad['type']
  scan_delimiter(e, p.left_delimiter, false)
  if (t === middle_noad) { p.type = right_noad; p.subtype = middle_noad }
  let q: Node | null
  if (t === left_noad) q = p
  else { q = fin_mlist(e, p); unsave(e) } // end of math_left_group
  if (t !== right_noad) { push_math(e, math_left_group); e.head.link = q; e.tail = p; e.eTeX_aux = p }
  else {
    const n = new_noad(); tail_append(e, n); n.type = inner_noad
    n.nucleus.math_type = sub_mlist; n.nucleus.info = q
  }
}

// §1172 append_choices
export function append_choices(e: Engine): void {
  tail_append(e, new_choice()); e.save_ptr++; set_saved(e, -1, 0)
  push_math(e, math_choice_group); scan_left_brace(e)
}

// §1174 build_choices
function build_choices(e: Engine): void {
  unsave(e)
  const p = fin_mlist(e, null), t = e.tail as ChoiceNode
  switch (saved(e, -1)) {
    case 0: t.display_mlist = p; break
    case 1: t.text_mlist = p; break
    case 2: t.script_mlist = p; break
    case 3: t.script_script_mlist = p; e.save_ptr--; return
  }
  set_saved(e, -1, saved(e, -1) + 1); push_math(e, math_choice_group); scan_left_brace(e)
}

// §1186 math_group in handle_right_brace
function finish_math_group(e: Engine): void {
  unsave(e); e.save_ptr--
  const h = saved(e, 0), f = field_at(e, h)
  node_free(e, h)
  f.math_type = sub_mlist
  const p = fin_mlist(e, null)
  f.info = p
  if (p === null || p.link !== null) return
  if (p.type === ord_noad) {
    if (p.subscr.math_type === 0 && p.supscr.math_type === 0) Object.assign(f, p.nucleus)
  } else if (p.type === accent_noad && f === (e.tail as Noad).nucleus && e.tail.type === ord_noad) {
    // §1187 Replace the tail of the list by p
    let q = e.head
    while (q.link !== e.tail) q = q.link!
    q.link = p; e.tail = p
  }
}

// §1167 vcenter_group in handle_right_brace
function finish_vcenter(e: Engine): void {
  end_graf(e); unsave(e); e.save_ptr -= 2
  const p = vpack(e, e.head.link, saved(e, 1), saved(e, 0)); pop_nest(e)
  const n = new_noad(); tail_append(e, n); n.type = vcenter_noad
  n.nucleus.math_type = sub_box; n.nucleus.info = p
}

// §1164 math_radical
export function math_radical(e: Engine): void {
  const n = new_noad(); tail_append(e, n); n.type = radical_noad
  scan_delimiter(e, n.left_delimiter, true); scan_math(e, n.nucleus)
}
