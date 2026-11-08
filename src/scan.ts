// §402–440 basic scanning subroutines, §464–473 building token lists
import type { Engine } from './engine.ts'
import { Cmd, nonstop_mode, int_val, dimen_val, glue_val, mu_val, ident_val, tok_val, new_string } from './types.ts'
import { print, print_int, print_esc, print_ln } from './print.ts'
import { print_scaled, round_decimals, xn_over_d, nx_plus_y, unity } from './arith.ts'
import { error, print_err, help, int_error, fatal_error } from './error.ts'
import { count_base, scaled_base, skip_base, mu_skip_base, toks_base, active_base, single_base, dimen_base, int_par, mag_code, prepare_mag, end_line_char_code, font_id_base, cur_font_loc } from './eqtb.ts'
import { vmode, par_shape_loc } from './types.ts'
import { box, is_char_node, math_node, penalty_node, kern_node, glue_node, mu_glue, unset_node } from './nodes.ts'
import type { Node } from './nodes.ts'
import { scan_font_ident, find_font_dimen, param, quad_code, x_height_code } from './tfm.ts'
import { sprint_cs, prim_lookup_cs } from './hash.ts'
import { prim_eqtb_base, frozen_primitive, frozen_relax } from './types.ts'
import { get_avail, free_avail, flush_list, temp_head, backup_head, new_spec, add_glue_ref, delete_glue_ref, print_spec, zero_glue, fil, filll } from './nodes.ts'
import { unsupported } from './main.ts'
import { protected_token } from './types.ts'
import { cs_token_flag, left_brace_token, left_brace_limit, right_brace_limit, other_token, letter_token, space_token, end_match_token, match_token, out_param_token, print_cmd_chr } from './tokens.ts'
import { get_token, get_next, back_input, back_error, back_list, defining, absorbing, normal, begin_file_reading, end_file_reading, input_ln, runaway, new_line, prompt_input } from './input.ts'
import { closed, just_open } from './files.ts'
import { get_x_token, x_token, expand } from './expand.ts'
import { read_line_toks } from './etex.ts'
import { scan_expr, the_unexpanded, find_sa_element, sa, current_if_type, current_if_branch } from './etex.ts'
import { char_info, char_width, char_height, char_depth, char_italic, height_depth } from './tfm.ts'
import { level_one } from './types.ts'

const zero_token = other_token + 48, alpha_token = other_token + 96, octal_token = other_token + 39,
  hex_token = other_token + 34, A_token = letter_token + 65, other_A_token = other_token + 65
export const infinity = 0o17777777777, max_dimen = 0o7777777777
const point_token = other_token + 46, continental_point_token = other_token + 44, normal_order = 0
const pdf_px_dimen_code = 33
// §416 last_item codes (pdftex.web numbering)
const last_node_type_code = glue_val + 1, input_line_no_code = glue_val + 2, badness_code = input_line_no_code + 1,
  pdftex_version_code = badness_code + 1, eTeX_int = 20, eTeX_dim = eTeX_int + 8, eTeX_glue = eTeX_dim + 9, eTeX_mu = eTeX_glue + 1,
  eTeX_expr = eTeX_mu + 1, font_char_ic_code = eTeX_dim + 3, par_shape_length_code = eTeX_dim + 4, par_shape_dimen_code = eTeX_dim + 6,
  glue_stretch_code = eTeX_dim + 7

// §403 scan_left_brace
export function scan_left_brace(e: Engine): void {
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer || e.cur_cmd === Cmd.relax) // §404
  if (e.cur_cmd !== Cmd.left_brace) {
    print_err(e, 'Missing { inserted')
    help(e, "A left brace was mandatory here, so I've put one in.", 'You might want to delete and/or insert some corrections',
      'so that I will find a matching right brace soon.', "(If you're confused by all this, try typing `I}' now.)")
    back_error(e); e.cur_tok = left_brace_token + 123; e.cur_cmd = Cmd.left_brace
    e.cur_chr = 123; e.align_state++
  }
}

// §405 scan_optional_equals
export function scan_optional_equals(e: Engine): void {
  do get_x_token(e); while (e.cur_cmd === Cmd.spacer) // §406
  if (e.cur_tok !== other_token + 61) back_input(e)
}

// §407 scan_keyword
export function scan_keyword(e: Engine, s: string): boolean {
  let p = backup_head, k = 0
  e.link[p] = 0
  const save_cur_cs = e.cur_cs // pdftex.web
  while (k < s.length) {
    get_x_token(e)
    const c = s.charCodeAt(k)
    if (e.cur_cs === 0 && (e.cur_chr === c || e.cur_chr === c - 32)) {
      const q = get_avail(e); e.link[p] = q; e.info[q] = e.cur_tok; p = q; k++
    } else if (e.cur_cmd !== Cmd.spacer || p !== backup_head) {
      back_input(e)
      if (p !== backup_head) back_list(e, e.link[backup_head]!)
      e.cur_cs = save_cur_cs
      return false
    }
  }
  flush_list(e, e.link[backup_head]!)
  return true
}

// §408 mu_error
export function mu_error(e: Engine): void {
  print_err(e, 'Incompatible glue units')
  help(e, "I'm going to assume that 1mu=1pt when they're mixed.")
  error(e)
}

// pdftex.web Reset cur_tok for unexpandable primitives (the frozen \pdfprimitive seen by scan_int or scan_something_internal)
function reset_prim_tok(e: Engine): void {
  get_token(e)
  const p = prim_lookup_cs(e, e.cur_cs)
  if (p !== 0) {
    e.cur_cmd = e.eq_type[prim_eqtb_base + p]!; e.cur_chr = e.equiv[prim_eqtb_base + p]!
    e.cur_cs = prim_eqtb_base + p; e.cur_tok = cs_token_flag + e.cur_cs
  } else { e.cur_cmd = Cmd.relax; e.cur_chr = 0; e.cur_tok = cs_token_flag + frozen_relax; e.cur_cs = frozen_relax }
}

// §413 scan_something_internal
export function scan_something_internal(e: Engine, level: number, negative: boolean): void {
  while (e.cur_cmd === Cmd.ignore_spaces && e.cur_chr === 1) reset_prim_tok(e) // restart
  const m = e.cur_chr
  switch (e.cur_cmd) {
    case Cmd.def_code: // §414 Fetch a character code from some table
      scan_char_num(e)
      e.cur_val = e.equiv[m + e.cur_val]!; e.cur_val_level = int_val
      break
    case Cmd.toks_register: case Cmd.assign_toks: case Cmd.def_family: case Cmd.set_font: case Cmd.def_font:
    case Cmd.letterspace_font: case Cmd.pdf_copy_font: // §415 Fetch a token list or font identifier, provided that level=tok_val
      if (level !== tok_val) {
        print_err(e, 'Missing number, treated as zero')
        help(e, "A number should have been here; I inserted `0'.", "(If you can't figure out why I needed to see a number,",
          "look up `weird error' in the index to The TeXbook.)")
        back_error(e); e.cur_val = 0; e.cur_val_level = dimen_val
      } else if (e.cur_cmd <= Cmd.assign_toks) {
        if (e.cur_cmd < Cmd.assign_toks) { // etex.ch
          if (m === 0) {
            scan_register_num(e)
            if (e.cur_val < 256) e.cur_val = e.equiv[toks_base + e.cur_val]!
            else { const q = find_sa_element(e, tok_val, e.cur_val, false); e.cur_val = q === 0 ? 0 : sa(e, q).ptr }
          } else e.cur_val = sa(e, m).ptr
        } else e.cur_val = e.equiv[m]!
        e.cur_val_level = tok_val
      } else { back_input(e); scan_font_ident(e); e.cur_val = font_id_base + e.cur_val; e.cur_val_level = ident_val }
      break
    case Cmd.set_aux: // §418 Fetch the space_factor or the prev_depth
      if (Math.abs(e.mode) !== m) {
        print_err(e, 'Improper '); print_cmd_chr(e, Cmd.set_aux, m)
        help(e, 'You can refer to \\spacefactor only in horizontal mode;', 'you can refer to \\prevdepth only in vertical mode; and',
          'neither of these is meaningful inside \\write. So', "I'm forgetting what you said and using zero instead.")
        error(e)
        e.cur_val = 0; e.cur_val_level = level !== tok_val ? dimen_val : int_val
      } else if (m === vmode) { e.cur_val = e.prev_depth; e.cur_val_level = dimen_val }
      else { e.cur_val = e.space_factor; e.cur_val_level = int_val }
      break
    case Cmd.set_prev_graf: // §422 Fetch the prev_graf
      if (e.mode === 0) e.cur_val = 0
      else {
        let p = e.nest_ptr
        e.nest[p] = { ...e.nest[p]!, mode: e.mode, prev_graf: e.prev_graf }
        while (Math.abs(e.nest[p]!.mode) !== vmode) p--
        e.cur_val = e.nest[p]!.prev_graf
      }
      e.cur_val_level = int_val
      break
    case Cmd.set_page_int: // §419 Fetch the dead_cycles or the insert_penalties
      e.cur_val = m === 0 ? e.dead_cycles : m === 2 ? e.interaction : e.insert_penalties; e.cur_val_level = int_val
      break
    case Cmd.set_page_dimen: // §421 Fetch something on the page_so_far
      if (e.page_contents === 0 && !e.output_active) e.cur_val = m === 0 ? max_dimen : 0
      else e.cur_val = e.page_so_far[m]!
      e.cur_val_level = dimen_val
      break
    case Cmd.set_shape: // §423 Fetch the par_shape size (e-TeX's penalty arrays are unsupported)
      if (m > par_shape_loc) { // etex.ch Fetch a penalties array element
        scan_int(e)
        const q = e.shapes[e.equiv[m]!]
        if (q === undefined || e.cur_val < 0) e.cur_val = 0
        else e.cur_val = q[Math.min(e.cur_val, q[0]!)]!
      } else e.cur_val = e.equiv[par_shape_loc] === 0 ? 0 : e.shapes[e.equiv[par_shape_loc]!]![0]!
      e.cur_val_level = int_val
      break
    case Cmd.set_box_dimen: { // §420 Fetch a box dimension
      scan_register_num(e)
      const q = box(e, e.cur_val)
      e.cur_val = q === null ? 0 : m === 1 ? q.width : m === 2 ? q.depth : q.height
      e.cur_val_level = dimen_val
      break
    }
    case Cmd.assign_font_dimen: // §425 Fetch a font dimension
      find_font_dimen(e, false); e.font_info[e.fmem_ptr] = 0
      e.cur_val = e.font_info[e.cur_val]!; e.cur_val_level = dimen_val
      break
    case Cmd.assign_font_int: // §426 Fetch a font integer
      if (m > 1) unsupported(e) // pdftex's \lpcode etc.
      scan_font_ident(e)
      e.cur_val = m === 0 ? e.hyphen_char[e.cur_val]! : e.skew_char[e.cur_val]!; e.cur_val_level = int_val
      break
    case Cmd.assign_int: e.cur_val = e.equiv[m]!; e.cur_val_level = int_val; break
    case Cmd.assign_dimen: e.cur_val = e.equiv[m]!; e.cur_val_level = dimen_val; break
    case Cmd.assign_glue: e.cur_val = e.equiv[m]!; e.cur_val_level = glue_val; break
    case Cmd.assign_mu_glue: e.cur_val = e.equiv[m]!; e.cur_val_level = mu_val; break
    case Cmd.char_given: case Cmd.math_given: e.cur_val = e.cur_chr; e.cur_val_level = int_val; break
    case Cmd.register: // §427 Fetch a register (etex.ch: sparse array elements)
      if (m > mu_val) { const x = sa(e, m); e.cur_val_level = x.t; e.cur_val = x.t < glue_val ? x.int : x.ptr }
      else {
        scan_register_num(e); e.cur_val_level = m
        if (e.cur_val > 255) {
          const q = find_sa_element(e, m, e.cur_val, false)
          e.cur_val = q === 0 ? (m < glue_val ? 0 : zero_glue) : m < glue_val ? sa(e, q).int : sa(e, q).ptr
        } else e.cur_val = e.equiv[(m === int_val ? count_base : m === dimen_val ? scaled_base : m === glue_val ? skip_base : mu_skip_base) + e.cur_val]!
      }
      break
    case Cmd.last_item: // §424 Fetch an item in the current node, if appropriate
      if (m >= input_line_no_code) {
        if (m === input_line_no_code) e.cur_val = e.line
        else if (m === badness_code) e.cur_val = e.last_badness
        else if (m === pdftex_version_code) e.cur_val = 140
        else if (m >= eTeX_glue) { // etex.ch Process an expression and return
          if (m < eTeX_mu) { scan_glue(e, mu_val); e.cur_val_level = glue_val } // \mutoglue
          else if (m < eTeX_expr) { scan_glue(e, glue_val); e.cur_val_level = mu_val } // \gluetomu
          else { e.cur_val_level = m - eTeX_expr + int_val; scan_expr(e) }
          while (e.cur_val_level > level) {
            if (e.cur_val_level === glue_val) { const g = e.cur_val; e.cur_val = e.spec[g]!.width; delete_glue_ref(e, g) }
            else if (e.cur_val_level === mu_val) mu_error(e)
            e.cur_val_level--
          }
          if (negative) {
            if (e.cur_val_level >= glue_val) {
              const g = e.cur_val; e.cur_val = new_spec(e, g); delete_glue_ref(e, g); const h = e.spec[e.cur_val]!
              h.width = -h.width | 0; h.stretch = -h.stretch | 0; h.shrink = -h.shrink | 0
            } else e.cur_val = -e.cur_val | 0
          }
          return
        } else if (m >= eTeX_dim) { // etex.ch Cases for fetching a dimension value
          if (m <= font_char_ic_code) {
            scan_font_ident(e); const q = e.cur_val; scan_char_num(e)
            if (e.font_bc[q]! <= e.cur_val && e.font_ec[q]! >= e.cur_val) {
              const i = char_info(e, q, e.cur_val)
              e.cur_val = m === eTeX_dim ? char_width(e, q, i) : m === eTeX_dim + 1 ? char_height(e, q, height_depth(i))
                : m === eTeX_dim + 2 ? char_depth(e, q, height_depth(i)) : char_italic(e, q, i)
            } else e.cur_val = 0
          } else if (m <= par_shape_dimen_code) {
            let q = m - par_shape_length_code; scan_int(e)
            const ps = e.shapes[e.equiv[par_shape_loc]!]
            if (ps === undefined || e.cur_val <= 0) e.cur_val = 0
            else {
              if (q === 2) { q = e.cur_val % 2; e.cur_val = (e.cur_val + q) >> 1 }
              if (e.cur_val > ps[0]!) e.cur_val = ps[0]!
              e.cur_val = ps[2 * e.cur_val - q]!
            }
          } else { // \gluestretch, \glueshrink
            scan_glue(e, glue_val); const q = e.cur_val
            e.cur_val = m === glue_stretch_code ? e.spec[q]!.stretch : e.spec[q]!.shrink; delete_glue_ref(e, q)
          }
          e.cur_val_level = dimen_val
        } else { // etex.ch Cases for fetching an integer value
          switch (m - eTeX_int) {
            case 0: e.cur_val = 2; break // \eTeXversion
            case 1: e.cur_val = e.cur_level - level_one; break
            case 2: e.cur_val = e.cur_group; break
            case 3: { let q = e.cond_ptr; e.cur_val = 0; while (q !== null) { e.cur_val++; q = q.link } break }
            case 4: e.cur_val = current_if_type(e); break
            case 5: e.cur_val = current_if_branch(e); break
            default: { // \gluestretchorder, \glueshrinkorder
              scan_glue(e, glue_val); const q = e.cur_val
              e.cur_val = m === eTeX_int + 6 ? e.spec[q]!.stretch_order : e.spec[q]!.shrink_order; delete_glue_ref(e, q)
            }
          }
          e.cur_val_level = int_val
        }
        if (m < eTeX_dim) e.cur_val_level = int_val
      } else {
        e.cur_val = m === glue_val ? zero_glue : 0
        let tx = e.tail // find_effective_tail (etex.ch)
        if (tx.type === math_node && tx.subtype === 3) { let r = e.head, q: Node; do { q = r; r = q.link! } while (r !== tx); tx = q }
        if (m === last_node_type_code) { e.cur_val_level = int_val; if (tx === e.head || e.mode === 0) e.cur_val = -1 }
        else e.cur_val_level = m
        if (!is_char_node(tx) && e.mode !== 0) {
          switch (m) {
            case int_val: if (tx.type === penalty_node) e.cur_val = tx.penalty; break
            case dimen_val: if (tx.type === kern_node) e.cur_val = tx.width; break
            case glue_val: if (tx.type === glue_node) { e.cur_val = tx.glue_ptr; if (tx.subtype === mu_glue) e.cur_val_level = mu_val } break
            case last_node_type_code: e.cur_val = tx.type <= unset_node ? tx.type + 1 : unset_node + 2; break
          }
        } else if (e.mode === vmode && tx === e.head) {
          switch (m) {
            case int_val: e.cur_val = e.last_penalty; break
            case dimen_val: e.cur_val = e.last_kern; break
            case glue_val: if (e.last_glue !== 0o17777777777) e.cur_val = e.last_glue; break
            case last_node_type_code: e.cur_val = e.last_node_type; break
          }
        }
      }
      break
    case Cmd.ignore_spaces: // pdftex: trap unexpandable primitives (chr=1 handled above); \ignorespaces leaves cur_val, cur_val_level as they were
      break
    default:
      if (e.cur_cmd >= Cmd.min_internal && e.cur_cmd <= Cmd.max_internal) unsupported(e)
      // §428 Complain that \the can't do this; give zero result
      print_err(e, "You can't use `"); print_cmd_chr(e, e.cur_cmd, e.cur_chr)
      print(e, "' after "); print_esc(e, 'the')
      help(e, "I'm forgetting what you said and using zero instead.")
      error(e)
      e.cur_val = 0; e.cur_val_level = level !== tok_val ? dimen_val : int_val
  }
  while (e.cur_val_level > level) { // §429 Convert cur_val to a lower level
    if (e.cur_val_level === glue_val) e.cur_val = e.spec[e.cur_val]!.width
    else if (e.cur_val_level === mu_val) mu_error(e)
    e.cur_val_level--
  }
  // §430 Fix the reference count, if any, and negate cur_val if negative
  if (negative) {
    if (e.cur_val_level >= glue_val) {
      e.cur_val = new_spec(e, e.cur_val); const g = e.spec[e.cur_val]!
      g.width = -g.width | 0; g.stretch = -g.stretch | 0; g.shrink = -g.shrink | 0
    } else e.cur_val = -e.cur_val | 0
  } else if (e.cur_val_level >= glue_val && e.cur_val_level <= mu_val) add_glue_ref(e, e.cur_val)
}

// §433 scan_eight_bit_int
export function scan_eight_bit_int(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > 255) {
    print_err(e, 'Bad register code')
    help(e, 'A register number must be between 0 and 255.', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// etex.ch scan_register_num: 0..255 in compatibility mode, 0..32767 in extended mode
export function scan_register_num(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > e.max_reg_num) {
    print_err(e, 'Bad register code')
    help(e, e.max_reg_help_line, 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// §434 scan_four_bit_int
export function scan_four_bit_int(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > 15) {
    print_err(e, 'Bad number')
    help(e, 'Since I expected to read a number between 0 and 15,', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// tex.ch scan_four_bit_int_or_18
export function scan_four_bit_int_or_18(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || (e.cur_val > 15 && e.cur_val !== 18)) {
    print_err(e, 'Bad number')
    help(e, 'Since I expected to read a number between 0 and 15,', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// §434 scan_char_num
export function scan_char_num(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > 255) {
    print_err(e, 'Bad character code')
    help(e, 'A character number must be between 0 and 255.', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// §436 scan_fifteen_bit_int
export function scan_fifteen_bit_int(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > 0o77777) {
    print_err(e, 'Bad mathchar')
    help(e, 'A mathchar number must be between 0 and 32767.', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// §437 scan_twenty_seven_bit_int
export function scan_twenty_seven_bit_int(e: Engine): void {
  scan_int(e)
  if (e.cur_val < 0 || e.cur_val > 0o777777777) {
    print_err(e, 'Bad delimiter code')
    help(e, 'A numeric delimiter code must be between 0 and 2^{27}-1.', 'I changed this one to zero.'); int_error(e, e.cur_val); e.cur_val = 0
  }
}

// §441 Get the next non-blank non-sign token; set negative appropriately
function get_sign(e: Engine): boolean {
  let negative = false
  do {
    do get_x_token(e); while (e.cur_cmd === Cmd.spacer)
    if (e.cur_tok === other_token + 45) { negative = !negative; e.cur_tok = other_token + 43 }
  } while (e.cur_tok === other_token + 43)
  return negative
}

// §440 scan_int
export function scan_int(e: Engine): void {
  e.radix = 0
  let OK_so_far = true, negative = false
  do { // §441 inline: one JS frame less per nested \number
    do get_x_token(e); while (e.cur_cmd === Cmd.spacer)
    if (e.cur_tok === other_token + 45) { negative = !negative; e.cur_tok = other_token + 43 }
  } while (e.cur_tok === other_token + 43)
  while (e.cur_tok === cs_token_flag + frozen_primitive) reset_prim_tok(e) // pdftex.web: goto restart
  if (e.cur_tok === alpha_token) {
    // §442 Scan an alphabetic character code into cur_val
    get_token(e)
    if (e.cur_tok < cs_token_flag) {
      e.cur_val = e.cur_chr
      if (e.cur_cmd <= Cmd.right_brace) {
        if (e.cur_cmd === Cmd.right_brace) e.align_state++
        else e.align_state--
      }
    } else if (e.cur_tok < cs_token_flag + single_base) e.cur_val = e.cur_tok - cs_token_flag - active_base
    else e.cur_val = e.cur_tok - cs_token_flag - single_base
    if (e.cur_val > 255) {
      print_err(e, 'Improper alphabetic constant')
      help(e, 'A one-character control sequence belongs after a ` mark.', "So I'm essentially inserting \\0 here.")
      e.cur_val = 48; back_error(e)
    } else { get_x_token(e); if (e.cur_cmd !== Cmd.spacer) back_input(e) } // §443
  } else if (e.cur_cmd >= Cmd.min_internal && e.cur_cmd <= Cmd.max_internal) scan_something_internal(e, int_val, false)
  else {
    // §444 Scan a numeric constant
    e.radix = 10; let m = 214748364
    if (e.cur_tok === octal_token) { e.radix = 8; m = 0o2000000000; get_x_token(e) }
    else if (e.cur_tok === hex_token) { e.radix = 16; m = 0o1000000000; get_x_token(e) }
    let vacuous = true; e.cur_val = 0
    // §445 Accumulate the constant until cur_tok is not a suitable digit
    for (;;) {
      let d: number
      if (e.cur_tok < zero_token + e.radix && e.cur_tok >= zero_token && e.cur_tok <= zero_token + 9) d = e.cur_tok - zero_token
      else if (e.radix === 16) {
        if (e.cur_tok <= A_token + 5 && e.cur_tok >= A_token) d = e.cur_tok - A_token + 10
        else if (e.cur_tok <= other_A_token + 5 && e.cur_tok >= other_A_token) d = e.cur_tok - other_A_token + 10
        else break
      } else break
      vacuous = false
      if (e.cur_val >= m && (e.cur_val > m || d > 7 || e.radix !== 10)) {
        if (OK_so_far) {
          print_err(e, 'Number too big')
          help(e, "I can only go up to 2147483647='17777777777=\"7FFFFFFF,", "so I'm using that number instead of yours.")
          error(e); e.cur_val = infinity; OK_so_far = false
        }
      } else e.cur_val = e.cur_val * e.radix + d
      get_x_token(e)
    }
    if (vacuous) { // §446 Express astonishment that no number was here
      print_err(e, 'Missing number, treated as zero')
      help(e, "A number should have been here; I inserted `0'.", "(If you can't figure out why I needed to see a number,",
        "look up `weird error' in the index to The TeXbook.)")
      back_error(e)
    } else if (e.cur_cmd !== Cmd.spacer) back_input(e)
  }
  if (negative) e.cur_val = -e.cur_val | 0
}

// §443 Scan an optional space
function scan_optional_space(e: Engine): void {
  get_x_token(e); if (e.cur_cmd !== Cmd.spacer) back_input(e)
}

// §448 scan_dimen
export function scan_dimen(e: Engine, mu: boolean, inf: boolean, shortcut: boolean): void {
  let f = 0, negative = false
  e.arith_error = false; e.cur_order = normal_order
  attach_sign: {
    if (!shortcut) {
      negative = get_sign(e)
      if (e.cur_cmd >= Cmd.min_internal && e.cur_cmd <= Cmd.max_internal) { // §449 Fetch an internal dimension and goto attach_sign, or fetch an internal integer
        if (mu) {
          scan_something_internal(e, mu_val, false)
          if (e.cur_val_level !== int_val) { // tex.ch [26.449]
            coerce_glue(e)
            if (e.cur_val_level !== mu_val) mu_error(e)
            break attach_sign
          }
        } else {
          scan_something_internal(e, dimen_val, false)
          if (e.cur_val_level === dimen_val) break attach_sign
        }
      } else {
        back_input(e)
        if (e.cur_tok === continental_point_token) e.cur_tok = point_token
        if (e.cur_tok !== point_token) scan_int(e)
        else { e.radix = 10; e.cur_val = 0 }
        if (e.cur_tok === continental_point_token) e.cur_tok = point_token
        if (e.radix === 10 && e.cur_tok === point_token) { // §452 Scan decimal fraction
          let k = 0, p = 0
          get_token(e)
          for (;;) {
            get_x_token(e)
            if (e.cur_tok > zero_token + 9 || e.cur_tok < zero_token) break
            if (k < 17) { const q = get_avail(e); e.link[q] = p; e.info[q] = e.cur_tok - zero_token; p = q; k++ }
          }
          for (let kk = k; kk >= 1; kk--) { e.dig[kk - 1] = e.info[p]!; const q = p; p = e.link[p]!; free_avail(e, q) }
          f = round_decimals(e, k)
          if (e.cur_cmd !== Cmd.spacer) back_input(e)
        }
      }
    }
    if (e.cur_val < 0) { negative = !negative; e.cur_val = -e.cur_val | 0 }
    // §453 Scan units and set cur_val to x*(cur_val+f/2^16), where there are x sp per unit; goto attach_sign if the units are internal
    done: {
      attach_fraction: {
        if (inf && scan_keyword(e, 'fil')) { // §454 Scan for fil units; goto attach_fraction if found
          e.cur_order = fil
          while (scan_keyword(e, 'l')) {
            if (e.cur_order === filll) {
              print_err(e, 'Illegal unit of measure ('); print(e, 'replaced by filll)')
              help(e, "I dddon't go any higher than filll."); error(e)
            } else e.cur_order++
          }
          break attach_fraction
        }
        // §455 Scan for units that are internal dimensions; goto attach_sign with cur_val set if found
        const save_cur_val = e.cur_val
        let v: number
        found: {
          do get_x_token(e); while (e.cur_cmd === Cmd.spacer) // §406
          if (e.cur_cmd < Cmd.min_internal || e.cur_cmd > Cmd.max_internal) back_input(e)
          else {
            if (mu) { scan_something_internal(e, mu_val, false); coerce_glue(e); if (e.cur_val_level !== mu_val) mu_error(e) }
            else scan_something_internal(e, dimen_val, false)
            v = e.cur_val; break found
          }
          not_found: {
            if (mu) break not_found
            if (scan_keyword(e, 'em')) v = param(e, quad_code, e.equiv[cur_font_loc]!) // §558
            else if (scan_keyword(e, 'ex')) v = param(e, x_height_code, e.equiv[cur_font_loc]!) // §559
            else if (scan_keyword(e, 'px')) v = e.equiv[dimen_base + pdf_px_dimen_code]!
            else break not_found
            scan_optional_space(e)
            break found
          }
          if (mu) { // §456 Scan for mu units and goto attach_fraction
            if (!scan_keyword(e, 'mu')) {
              print_err(e, 'Illegal unit of measure ('); print(e, 'mu inserted)')
              help(e, 'The unit of measurement in math glue must be mu.', "To recover gracefully from this error, it's best to",
                "delete the erroneous units; e.g., type `2' to delete", 'two letters. (See Chapter 27 of The TeXbook.)')
              error(e)
            }
            break attach_fraction
          }
          if (scan_keyword(e, 'true')) { // §457 Adjust for the magnification ratio
            prepare_mag(e)
            const mag = int_par(e, mag_code)
            if (mag !== 1000) {
              e.cur_val = xn_over_d(e, e.cur_val, 1000, mag)
              f = Math.trunc(((Math.imul(1000, f) + Math.imul(0o200000, e.remainder)) | 0) / mag)
              e.cur_val = (e.cur_val + Math.trunc(f / 0o200000)) | 0; f = f % 0o200000
            }
          }
          if (scan_keyword(e, 'pt')) break attach_fraction
          // §458 Scan for all other units and adjust cur_val and f accordingly; goto done in the case of scaled points
          let num: number, denom: number
          if (scan_keyword(e, 'in')) { num = 7227; denom = 100 }
          else if (scan_keyword(e, 'pc')) { num = 12; denom = 1 }
          else if (scan_keyword(e, 'cm')) { num = 7227; denom = 254 }
          else if (scan_keyword(e, 'mm')) { num = 7227; denom = 2540 }
          else if (scan_keyword(e, 'bp')) { num = 7227; denom = 7200 }
          else if (scan_keyword(e, 'dd')) { num = 1238; denom = 1157 }
          else if (scan_keyword(e, 'cc')) { num = 14856; denom = 1157 }
          else if (scan_keyword(e, 'nd')) { num = 685; denom = 642 }
          else if (scan_keyword(e, 'nc')) { num = 1370; denom = 107 }
          else if (scan_keyword(e, 'sp')) break done
          else { // §459 Complain about unknown unit and goto done2
            print_err(e, 'Illegal unit of measure ('); print(e, 'pt inserted)')
            help(e, 'Dimensions can be in units of em, ex, in, pt, pc,', 'cm, mm, dd, cc, nd, nc, bp, or sp; but yours is a new one!',
              "I'll assume that you meant to say pt, for printer's points.", "To recover gracefully from this error, it's best to",
              "delete the erroneous units; e.g., type `2' to delete", 'two letters. (See Chapter 27 of The TeXbook.)')
            error(e); break attach_fraction
          }
          e.cur_val = xn_over_d(e, e.cur_val, num, denom)
          f = Math.trunc(((Math.imul(num, f) + Math.imul(0o200000, e.remainder)) | 0) / denom)
          e.cur_val = (e.cur_val + Math.trunc(f / 0o200000)) | 0; f = f % 0o200000
          break attach_fraction
        }
        // found:
        e.cur_val = nx_plus_y(e, save_cur_val, v!, xn_over_d(e, v!, f, 0o200000))
        break attach_sign
      }
      // attach_fraction:
      if (e.cur_val >= 0o40000) e.arith_error = true
      else e.cur_val = (e.cur_val * unity + f) | 0
    }
    // done:
    scan_optional_space(e)
  }
  // attach_sign:
  if (e.arith_error || Math.abs(e.cur_val) >= 0o10000000000) { // §460 Report that this dimension is out of range
    print_err(e, 'Dimension too large')
    help(e, "I can't work with sizes bigger than about 19 feet.", "Continue and I'll use the largest value I can.")
    error(e); e.cur_val = max_dimen; e.arith_error = false
  }
  if (negative) e.cur_val = -e.cur_val | 0
}
export const scan_normal_dimen = (e: Engine) => scan_dimen(e, false, false, false)

// §451 Coerce glue to a dimension
function coerce_glue(e: Engine): void {
  if (e.cur_val_level >= glue_val) { const v = e.spec[e.cur_val]!.width; delete_glue_ref(e, e.cur_val); e.cur_val = v }
}

// §461 scan_glue
export function scan_glue(e: Engine, level: number): void {
  const mu = level === mu_val
  const negative = get_sign(e)
  if (e.cur_cmd >= Cmd.min_internal && e.cur_cmd <= Cmd.max_internal) {
    scan_something_internal(e, level, negative)
    if (e.cur_val_level >= glue_val) {
      if (e.cur_val_level !== level) mu_error(e)
      return
    }
    if (e.cur_val_level === int_val) scan_dimen(e, mu, false, true)
    else if (level === mu_val) mu_error(e)
  } else {
    back_input(e); scan_dimen(e, mu, false, false)
    if (negative) e.cur_val = -e.cur_val | 0
  }
  // §462 Create a new glue specification whose width is cur_val; scan for its stretch and shrink components
  const q = new_spec(e, zero_glue), g = e.spec[q]!
  g.width = e.cur_val
  if (scan_keyword(e, 'plus')) { scan_dimen(e, mu, true, false); g.stretch = e.cur_val; g.stretch_order = e.cur_order }
  if (scan_keyword(e, 'minus')) { scan_dimen(e, mu, true, false); g.shrink = e.cur_val; g.shrink_order = e.cur_order }
  e.cur_val = q
}

// §464 str_toks: converts the current string from position b to a token list at link(temp_head)
export function str_toks(e: Engine, b: number): number {
  let p = temp_head
  e.link[p] = 0
  for (let k = b; k < e.cur_str.length; k++) {
    const t = e.cur_str[k] === 32 ? space_token : other_token + e.cur_str[k]!
    const q = get_avail(e); e.link[p] = q; e.info[q] = t; p = q
  }
  e.cur_str.length = b
  return p
}

// §465 the_toks
export function the_toks(e: Engine): number {
  if ((e.cur_chr & 1) === 1) return the_unexpanded(e, e.cur_chr) // etex.ch
  get_x_token(e); scan_something_internal(e, tok_val, false)
  if (e.cur_val_level >= ident_val) { // §466 Copy the token list
    let p = temp_head
    e.link[p] = 0
    const store_new_token = (x: number) => { const q = get_avail(e); e.link[p] = q; e.info[q] = x; p = q }
    if (e.cur_val_level === ident_val) store_new_token(cs_token_flag + e.cur_val)
    else if (e.cur_val !== 0) for (let r = e.link[e.cur_val]!; r !== 0; r = e.link[r]!) store_new_token(e.info[r]!)
    return p
  }
  const old_setting = e.selector; e.selector = new_string
  const b = e.cur_str.length
  switch (e.cur_val_level) {
    case int_val: print_int(e, e.cur_val); break
    case dimen_val: print_scaled(e, e.cur_val); print(e, 'pt'); break
    case glue_val: print_spec(e, e.cur_val, 'pt'); delete_glue_ref(e, e.cur_val); break
    case mu_val: print_spec(e, e.cur_val, 'mu'); delete_glue_ref(e, e.cur_val); break
  }
  e.selector = old_setting
  return str_toks(e, b)
}

// §473 scan_toks
export function scan_toks(e: Engine, macro_def: boolean, xpand: boolean): number {
  e.scanner_status = macro_def ? defining : absorbing
  e.warning_index = e.cur_cs; e.def_ref = get_avail(e); e.info[e.def_ref] = 0
  let p = e.def_ref, hash_brace = 0, t = zero_token, unbalance: number
  const store_new_token = (x: number) => { const q = get_avail(e); e.link[p] = q; e.info[q] = x; p = q }
  found: {
    if (macro_def) {
      // §474 Scan and build the parameter part of the macro definition
      done: {
        done1: for (;;) {
          get_token(e)
          if (e.cur_tok < right_brace_limit) break done1
          if (e.cur_cmd === Cmd.mac_param) {
            // §476 If the next character is a parameter number, make cur_tok a match token
            const s = match_token + e.cur_chr
            get_token(e)
            if (e.cur_tok < left_brace_limit) {
              hash_brace = e.cur_tok
              store_new_token(e.cur_tok); store_new_token(end_match_token)
              break done
            }
            if (t === zero_token + 9) {
              print_err(e, 'You already have nine parameters')
              help(e, "I'm going to ignore the # sign you just used,", 'as well as the token that followed it.'); error(e)
              continue done1
            }
            t++
            if (e.cur_tok !== t) {
              print_err(e, 'Parameters must be numbered consecutively')
              help(e, "I've inserted the digit you should have used after the #.", "Type `1' to delete what you did use."); back_error(e)
            }
            e.cur_tok = s
          }
          store_new_token(e.cur_tok)
        }
        store_new_token(end_match_token)
        if (e.cur_cmd === Cmd.right_brace) { // §475 Express shock at the missing left brace
          print_err(e, 'Missing { inserted'); e.align_state++
          help(e, "Where was the left brace? You said something like `\\def\\a}',", "which I'm going to interpret as `\\def\\a{}'."); error(e)
          break found
        }
      }
    } else scan_left_brace(e)
    // §477 Scan and build the body of the token list
    unbalance = 1
    for (;;) {
      if (xpand) {
        // §478 Expand the next part of the input
        for (;;) {
          get_next(e)
          if (e.cur_cmd >= Cmd.call && e.info[e.link[e.cur_chr]!] === protected_token) { e.cur_cmd = Cmd.relax; e.cur_chr = 257 } // etex.ch
          if (e.cur_cmd <= Cmd.max_command) break
          if (e.cur_cmd !== Cmd.the) expand(e)
          else {
            const q = the_toks(e)
            if (e.link[temp_head] !== 0) { e.link[p] = e.link[temp_head]!; p = q }
          }
        }
        x_token(e)
      } else get_token(e)
      if (e.cur_tok < right_brace_limit) {
        if (e.cur_cmd < Cmd.right_brace) unbalance++
        else { unbalance--; if (unbalance === 0) break found }
      } else if (e.cur_cmd === Cmd.mac_param && macro_def) {
        // §479 Look for parameter number or ##
        const s = e.cur_tok
        if (xpand) get_x_token(e); else get_token(e)
        if (e.cur_cmd !== Cmd.mac_param) {
          if (e.cur_tok <= zero_token || e.cur_tok > t) {
            print_err(e, 'Illegal parameter number in definition of '); sprint_cs(e, e.warning_index)
            help(e, "You meant to type ## instead of #, right?", 'Or maybe a } was forgotten somewhere earlier, and things',
              "are all screwed up? I'm going to assume that you meant ##.")
            back_error(e); e.cur_tok = s
          } else e.cur_tok = out_param_token - 48 + e.cur_chr
        }
      }
      store_new_token(e.cur_tok)
    }
  }
  e.scanner_status = normal
  if (hash_brace !== 0) store_new_token(hash_brace)
  return p
}

// §482 read_toks
export function read_toks(e: Engine, n: number, r: number, j: number): void {
  e.scanner_status = defining; e.warning_index = r
  e.def_ref = get_avail(e); e.info[e.def_ref] = 0
  let p = e.def_ref
  const store_new_token = (x: number) => { const q = get_avail(e); e.link[p] = q; e.info[q] = x; p = q }
  store_new_token(end_match_token)
  const m = n < 0 || n > 15 ? 16 : n
  const s = e.align_state; e.align_state = 1000000
  do {
    // §483 Input and store tokens from the next line of the file
    begin_file_reading(e); e.cur_input.name = m + 1
    if (e.read_open[m] === closed) { // §484 Input for \read from the terminal
      if (e.interaction > nonstop_mode) {
        if (e.term_in === null) fatal_error(e, 'unsupported: terminal input')
        if (n < 0) prompt_input(e, '')
        else { print_ln(e); sprint_cs(e, r); prompt_input(e, '='); n = -1 }
      } else fatal_error(e, '*** (cannot \\read from terminal in nonstop modes)')
    } else if (e.read_open[m] === just_open) { // §485 Input the first line of read_file[m]
      if (input_ln(e, e.read_file[m]!)) e.read_open[m] = normal
      else { delete e.read_file[m]; e.read_open[m] = closed }
    } else if (!input_ln(e, e.read_file[m]!)) { // §486 Input the next line of read_file[m]
      delete e.read_file[m]; e.read_open[m] = closed
      if (e.align_state !== 1000000) {
        runaway(e); print_err(e, 'File ended within '); print_esc(e, 'read')
        help(e, 'This \\read has unbalanced braces.')
        e.align_state = 1000000; e.cur_input.limit = 0; error(e)
      }
    }
    const ci = e.cur_input
    ci.limit = e.last
    if (int_par(e, end_line_char_code) < 0 || int_par(e, end_line_char_code) > 255) ci.limit--
    else e.buffer[ci.limit] = int_par(e, end_line_char_code)
    e.first = ci.limit + 1; ci.loc = ci.start; ci.state = new_line
    if (j === 1) p = read_line_toks(e, p) // etex.ch Handle \readline and goto done
    else for (;;) {
      get_token(e)
      if (e.cur_tok === 0) break // cur_cmd=cur_chr=0 will occur at the end of the line
      if (e.align_state < 1000000) { // unmatched `}' aborts the line
        do get_token(e); while (e.cur_tok !== 0)
        e.align_state = 1000000; break
      }
      store_new_token(e.cur_tok)
    }
    end_file_reading(e)
  } while (e.align_state !== 1000000)
  e.cur_val = e.def_ref; e.scanner_status = normal; e.align_state = s
}
