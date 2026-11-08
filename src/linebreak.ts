// §813–890 breaking paragraphs into lines (pdftex.web: font expansion with \pdfadjustspacing>1 keeps the font stretch and
// shrink in active_width[7..8]; \pdfprotrudechars puts margin kerns at the line ends; e-TeX's \lastlinefit, \interlinepenalties)
import { etex_pen_base } from './types.ts'
import type { Engine } from './engine.ts'
import { no_TeXXeT, fract, last_line_fit_code } from './etex.ts'
import { print_scaled } from './arith.ts'
import { max_dimen } from './scan.ts'
import { print, print_char, print_esc, print_int, print_nl, begin_diagnostic, end_diagnostic } from './print.ts'
import { badness, inf_bad } from './arith.ts'
import { error, print_err, help, confusion, normalize_selector } from './error.ts'
import { int_par, dimen_base, glue_base, par_shape_loc } from './eqtb.ts'
import { new_char, new_penalty, new_param_glue, new_spec, delete_glue_ref, add_glue_ref, flush_node_list, short_display, is_char_node,
  hlist_node, vlist_node, rule_node, ins_node, mark_node, adjust_node, ligature_node, disc_node, whatsit_node, math_node, glue_node,
  kern_node, penalty_node, normal, explicit, auto_kern, L_code, inf_penalty, eject_penalty, language_node, pdf_refxform_node,
  pdf_refximage_node, zero_glue, left_side, right_side } from './nodes.ts'
import type { Node, BoxNode, DiscNode, GlueNode, PenaltyNode, CharNode } from './nodes.ts'
import { char_info, char_width, null_font } from './tfm.ts'
import { hpack, append_to_vlist, exactly, cal_expand_ratio, char_stretch, char_shrink, kern_stretch_shrink, do_subst_font, char_pw,
  new_margin_kern } from './pack.ts'
import { pdf_error } from './pdf.ts'
import { pop_nest } from './main.ts'
import { init_trie, try_hyphenate, set_hyph_index } from './hyphenate.ts'

const pretolerance_code = 0, tolerance_code = 1, line_penalty_code = 2, hyphen_penalty_code = 3, ex_hyphen_penalty_code = 4,
  club_penalty_code = 5, widow_penalty_code = 6, display_widow_penalty_code = 7, broken_penalty_code = 8,
  inter_line_penalty_code = 13, double_hyphen_demerits_code = 14, final_hyphen_demerits_code = 15, adj_demerits_code = 16,
  looseness_code = 19, tracing_paragraphs_code = 32, hang_after_code = 41, pdf_adjust_spacing_code = 83, pdf_protrude_chars_code = 84
const hsize_code = 3, hang_indent_code = 17, emergency_stretch_code = 20, pdf_first_line_height_code = 28,
  pdf_last_line_depth_code = 29, pdf_each_line_height_code = 30, pdf_each_line_depth_code = 31, pdf_ignored_dimen_code = 32
const left_skip_code = 7, right_skip_code = 8, par_fill_skip_code = 14
const max_halfword = 0xfffffff
// §817 fitness classes, §819 break node types, §833 awful_bad
const very_loose_fit = 0, loose_fit = 1, decent_fit = 2, tight_fit = 3
const unhyphenated = 0, hyphenated = 1, delta_node = 2
const awful_bad = 0o7777777777

// §819–822 active, delta and passive nodes; a delta node keeps its six differences in w[1..6]
type Passive = { link: Passive | null, cur_break: Node | null, prev_break: Passive | null, serial: number }
type Active = { type: number, link: Active, fitness: number, line_number: number, total_demerits: number, break_node: Passive | null, w: number[],
  active_short?: number, active_glue?: number } // etex.ch: the two extra words of active_node_size_extended

const dimen = (e: Engine, c: number) => e.equiv[dimen_base + c]!
const precedes_break = (p: Node) => p.type < math_node // §148

// §826 finite_shrink
function finite_shrink(e: Engine, s: { no_shrink_error_yet: boolean }, p: number): number {
  if (s.no_shrink_error_yet) {
    s.no_shrink_error_yet = false
    if (int_par(e, tracing_paragraphs_code) > 0) end_diagnostic(e, true)
    print_err(e, 'Infinite glue shrinkage found in a paragraph')
    help(e, 'The paragraph just ended includes some glue that has', "infinite shrinkability, e.g., `\\hskip 0pt minus 1fil'.",
      "Such glue doesn't belong there---it allows a paragraph", "of any length to fit on one line. But it's safe to proceed,",
      'since the offensive shrinkability has been made finite.')
    error(e)
    if (int_par(e, tracing_paragraphs_code) > 0) begin_diagnostic(e)
  }
  const q = new_spec(e, p); e.spec[q]!.shrink_order = normal
  delete_glue_ref(e, p)
  return q
}

// pdftex.web check_expand_pars
function check_expand_pars(e: Engine, f: number): boolean {
  if (e.pdf_font_step[f] === 0 || (e.pdf_font_stretch[f] === null_font && e.pdf_font_shrink[f] === null_font)) return false
  if (e.cur_font_step < 0) e.cur_font_step = e.pdf_font_step[f]!
  else if (e.cur_font_step !== e.pdf_font_step[f]) pdf_error(e, 'font expansion', 'using fonts with different step of expansion in one paragraph is not allowed')
  let k = e.pdf_font_stretch[f]!
  if (k !== null_font) {
    if (e.max_stretch_ratio < 0) e.max_stretch_ratio = e.pdf_font_expand_ratio[k]!
    else if (e.max_stretch_ratio !== e.pdf_font_expand_ratio[k]) pdf_error(e, 'font expansion', 'using fonts with different limit of expansion in one paragraph is not allowed')
  }
  k = e.pdf_font_shrink[f]!
  if (k !== null_font) {
    if (e.max_shrink_ratio < 0) e.max_shrink_ratio = -e.pdf_font_expand_ratio[k]!
    else if (e.max_shrink_ratio !== -e.pdf_font_expand_ratio[k]!) pdf_error(e, 'font expansion', 'using fonts with different limit of expansion in one paragraph is not allowed')
  }
  return true
}

// Add (sign 1) or subtract (-1) the width of a char, ligature, box, rule or kern node to w[1], and with \pdfadjustspacing>1 its
// font stretch and shrink to w[7..8] (§841–842, §867, §870–871 with pdftex.web's add_char_stretch etc.)
function add_node_width(e: Engine, w: number[], s: Node, sign: number, what: string): void {
  if (is_char_node(s) || s.type === ligature_node) {
    const f = s.font
    w[1] = (w[1]! + sign * char_width(e, f, char_info(e, f, s.character))) | 0
    if (int_par(e, pdf_adjust_spacing_code) > 1 && check_expand_pars(e, f)) {
      e.prev_char_p = s
      w[7] = (w[7]! + sign * char_stretch(e, f, s.character)) | 0
      w[8] = (w[8]! + sign * char_shrink(e, f, s.character)) | 0
    }
  } else if (s.type === hlist_node || s.type === vlist_node || s.type === rule_node || s.type === kern_node) {
    w[1] = (w[1]! + sign * s.width) | 0
    if (s.type === kern_node && int_par(e, pdf_adjust_spacing_code) > 1 && s.subtype === normal) {
      w[7] = (w[7]! + sign * kern_stretch_shrink(e, s, true)) | 0
      w[8] = (w[8]! + sign * kern_stretch_shrink(e, s, false)) | 0
    }
  } else confusion(e, what)
}

// pdftex.web cp_skipable: nodes skipped at the margins during character protrusion
export function cp_skipable(p: Node | null): boolean {
  if (p === null || is_char_node(p)) return false
  switch (p.type) {
    case ins_node: case mark_node: case adjust_node: case penalty_node: return true
    case whatsit_node: return p.subtype !== pdf_refximage_node && p.subtype !== pdf_refxform_node
    case disc_node: return p.pre_break === null && p.post_break === null && p.replace_count === 0
    case math_node: return p.width === 0
    case kern_node: return p.width === 0 || p.subtype === normal || p.subtype === auto_kern
    case glue_node: return p.glue_ptr === zero_glue
    case hlist_node: return p.width === 0 && p.height === 0 && p.depth === 0 && p.list_ptr === null
  }
  return false
}
// utils.c prev_rightmost: the node whose link is e, searching from s (null if there is none)
export function prev_rightmost(s: Node | null, e: Node | null): Node | null {
  let p = s
  if (p === null) return null
  while (p.link !== e) { p = p.link; if (p === null) return null }
  return p
}
const max_hlist_stack = 512
function push_node(e: Engine, st: Node[], p: Node): void {
  if (st.length > max_hlist_stack) pdf_error(e, 'push_node', 'stack overflow')
  st.push(p)
}
// pdftex.web find_protchar_left, find_protchar_right
function find_protchar_left(e: Engine, l: Node, d: boolean): Node {
  if (l.link !== null && l.type === hlist_node && l.width === 0 && l.height === 0 && l.depth === 0 && l.list_ptr === null) l = l.link
  else if (d) while (l.link !== null && !(is_char_node(l) || l.type < math_node)) l = l.link
  const st: Node[] = []
  let run = true, t: Node
  do {
    t = l
    while (run && l.type === hlist_node && l.list_ptr !== null) { push_node(e, st, l); l = l.list_ptr }
    while (run && cp_skipable(l)) {
      while (l.link === null && st.length > 0) l = st.pop()!
      if (l.link !== null) l = l.link
      else if (st.length === 0) run = false
    }
  } while (t !== l)
  return l
}
function find_protchar_right(e: Engine, l: Node | null, r: Node | null): Node | null {
  if (r === null) return null
  const st: Node[] = []
  let run = true, t: Node | null
  do {
    t = r
    while (run && r !== null && r.type === hlist_node && r.list_ptr !== null) {
      push_node(e, st, l!); push_node(e, st, r); l = r.list_ptr; r = l
      while (r.link !== null) r = r.link
    }
    while (run && cp_skipable(r)) {
      while (r === l && st.length > 0) { r = st.pop()!; l = st.pop()! }
      if (r !== l && r !== null) r = prev_rightmost(l, r)
      else if (r === l && st.length === 0) run = false
    }
  } while (t !== r)
  return r
}

// §815 line_break
export function line_break(e: Engine, d: boolean): void {
  no_TeXXeT(e) // etex.ch branches on TeXXeT_en here; TeXXeT is not ported
  e.pack_begin_line = e.mode_line
  const tracing = () => int_par(e, tracing_paragraphs_code) > 0
  // §816 Get ready to start line breaking
  const temp_head = new_char(0, 0)
  temp_head.link = e.head.link
  if (is_char_node(e.tail) || e.tail.type !== glue_node) { const p = new_penalty(inf_penalty); e.tail.link = p; e.tail = p }
  else { // the glue node becomes a penalty node in place
    const t = e.tail as GlueNode
    delete_glue_ref(e, t.glue_ptr); flush_node_list(e, t.leader_ptr)
    const n = t as unknown as PenaltyNode & { glue_ptr?: number, leader_ptr?: Node | null }
    delete n.glue_ptr; delete n.leader_ptr; n.type = penalty_node; n.penalty = inf_penalty
  }
  const last_line_fill = new_param_glue(e, par_fill_skip_code) // etex.ch
  e.tail.link = last_line_fill
  const init_cur_lang = e.prev_graf % 0o200000, init_l_hyf = Math.trunc(e.prev_graf / 0o20000000),
    init_r_hyf = Math.trunc(e.prev_graf / 0o200000) % 0o100
  pop_nest(e)
  // §827
  const ns = { no_shrink_error_yet: true }
  const check_shrinkage = (c: number) => {
    const g = e.spec[e.equiv[glue_base + c]!]!
    if (g.shrink_order !== normal && g.shrink !== 0) e.equiv[glue_base + c] = finite_shrink(e, ns, e.equiv[glue_base + c]!)
  }
  check_shrinkage(left_skip_code); check_shrinkage(right_skip_code)
  const adjust_spacing = int_par(e, pdf_adjust_spacing_code), protrude_chars = int_par(e, pdf_protrude_chars_code)
  const nw = adjust_spacing > 1 ? 8 : 6 // do_all_eight
  const background = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  {
    const q = e.spec[e.equiv[glue_base + left_skip_code]!]!, r = e.spec[e.equiv[glue_base + right_skip_code]!]!
    background[1] = (q.width + r.width) | 0
    background[2 + q.stretch_order] = q.stretch
    background[2 + r.stretch_order] = (background[2 + r.stretch_order]! + r.stretch) | 0
    background[6] = (q.shrink + r.shrink) | 0
  }
  if (adjust_spacing > 1) { e.max_stretch_ratio = -1; e.max_shrink_ratio = -1; e.cur_font_step = -1; e.prev_char_p = null }
  // etex.ch Check for special treatment of last line of paragraph
  let do_last_line_fit = false
  const fill_width = [0, 0, 0]
  if (int_par(e, last_line_fit_code) > 0) {
    const q = e.spec[last_line_fill.glue_ptr]!
    if (q.stretch > 0 && q.stretch_order > normal && background[3] === 0 && background[4] === 0 && background[5] === 0) {
      do_last_line_fit = true; fill_width[q.stretch_order - 1] = q.stretch
    }
  }
  const best_pl_short = [0, 0, 0, 0], best_pl_glue = [0, 0, 0, 0]
  const active_width = [0, 0, 0, 0, 0, 0, 0, 0, 0], cur_active_width = [0, 0, 0, 0, 0, 0, 0, 0, 0],
    break_width = [0, 0, 0, 0, 0, 0, 0, 0, 0], disc_width = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  // §834
  let minimum_demerits = awful_bad
  const minimal_demerits = [awful_bad, awful_bad, awful_bad, awful_bad], best_place: (Passive | null)[] = [null, null, null, null],
    best_pl_line = [0, 0, 0, 0]
  // §848 line lengths
  const par_shape = e.shapes[e.equiv[par_shape_loc]!] // undefined for null
  let last_special_line: number, first_width = 0, second_width: number, first_indent = 0, second_indent: number
  if (par_shape === undefined) {
    if (dimen(e, hang_indent_code) === 0) { last_special_line = 0; second_width = dimen(e, hsize_code); second_indent = 0 }
    else { // §849
      const hang_after = int_par(e, hang_after_code), hang_indent = dimen(e, hang_indent_code), hsize = dimen(e, hsize_code)
      last_special_line = Math.abs(hang_after) | 0 // pdftex stores abs(-2^31) as -2^31; abs(x)>=c tests elsewhere treat it as large
      if (hang_after < 0) {
        first_width = (hsize - Math.abs(hang_indent)) | 0
        first_indent = hang_indent >= 0 ? hang_indent : 0
        second_width = hsize; second_indent = 0
      } else {
        first_width = hsize; first_indent = 0
        second_width = (hsize - Math.abs(hang_indent)) | 0
        second_indent = hang_indent >= 0 ? hang_indent : 0
      }
    }
  } else {
    last_special_line = par_shape[0]! - 1
    second_width = par_shape[2 * (last_special_line + 1)]!; second_indent = par_shape[2 * last_special_line + 1]!
  }
  const easy_line = int_par(e, looseness_code) === 0 ? last_special_line : max_halfword

  // §819 the active list ends where it begins
  const active = { type: hyphenated, fitness: 0, line_number: max_halfword, total_demerits: 0, break_node: null, w: [] } as unknown as Active
  active.link = active
  const last_active = active
  let passive: Passive | null = null, printed_node: Node = temp_head, pass_number = 0
  let cur_p: Node | null = null, second_pass = false, final_pass = false, threshold = 0, prev_p: Node = temp_head, first_p: Node | null = null
  let best_bet: Active = active, fewest_demerits = 0, best_line = 0, actual_looseness = 0

  // §829 try_break
  const try_break = (pi: number, break_type: number): void => {
    // §831 Make sure that pi is in the proper range
    if (Math.abs(pi) >= inf_penalty) {
      if (pi > 0) { update_printed_node(); return }
      pi = eject_penalty
    }
    let no_break_yet = true, prev_r: Active = active, prev_prev_r: Active = active, old_l = 0, r: Active, line_width = 0, l = 0
    for (let k = 1; k <= nw; k++) cur_active_width[k] = active_width[k]!
    for (;;) {
      r = prev_r.link
      // §832 If node r is of type delta_node, update cur_active_width, set prev_r and prev_prev_r, then goto continue
      if (r.type === delta_node) {
        for (let k = 1; k <= nw; k++) cur_active_width[k] = (cur_active_width[k]! + r.w[k]!) | 0
        prev_prev_r = prev_r; prev_r = r; continue
      }
      // §835 If a line number class has ended, create new active nodes for the best feasible breaks in that class;
      // then return if r=last_active, otherwise compute the new line_width
      l = r.line_number
      if (l > old_l) {
        if (minimum_demerits < awful_bad && (old_l !== easy_line || r === last_active)) {
          // §836 Create new active nodes for the best feasible breaks just found
          if (no_break_yet) { // §837 Compute the values of break_width
            no_break_yet = false
            for (let k = 1; k <= nw; k++) break_width[k] = background[k]!
            let s: Node | null = cur_p
            if (break_type > unhyphenated && cur_p !== null) { // §840 Compute the discretionary break_width values
              const dp = cur_p as DiscNode
              let t = dp.replace_count, v: Node = dp
              s = dp.post_break
              while (t > 0) { t--; v = v.link!; add_node_width(e, break_width, v, -1, 'disc1') }
              while (s !== null) { add_node_width(e, break_width, s, 1, 'disc2'); s = s.link }
              break_width[1] = (break_width[1]! + disc_width[1]!) | 0
              if (adjust_spacing > 1) { break_width[7] = (break_width[7]! + disc_width[7]!) | 0; break_width[8] = (break_width[8]! + disc_width[8]!) | 0 }
              if (dp.post_break === null) s = v.link
            }
            done: while (s !== null) {
              if (is_char_node(s)) break
              switch (s.type) {
                case glue_node: { // §838 Subtract glue from break_width
                  const v = e.spec[s.glue_ptr]!
                  break_width[1] = (break_width[1]! - v.width) | 0
                  break_width[2 + v.stretch_order] = (break_width[2 + v.stretch_order]! - v.stretch) | 0
                  break_width[6] = (break_width[6]! - v.shrink) | 0
                  break
                }
                case penalty_node: break
                case math_node: break_width[1] = (break_width[1]! - s.width) | 0; break
                case kern_node:
                  if (s.subtype !== explicit) break done
                  break_width[1] = (break_width[1]! - s.width) | 0; break
                default: break done
              }
              s = s.link
            }
          }
          // §843 Insert a delta node to prepare for breaks at cur_p
          if (prev_r.type === delta_node) {
            for (let k = 1; k <= nw; k++) prev_r.w[k] = (prev_r.w[k]! - cur_active_width[k]! + break_width[k]!) | 0
          } else if (prev_r === active) {
            for (let k = 1; k <= nw; k++) active_width[k] = break_width[k]!
          } else {
            const q: Active = { type: delta_node, link: r, fitness: 0, line_number: 0, total_demerits: 0, break_node: null, w: [0] }
            for (let k = 1; k <= nw; k++) q.w[k] = (break_width[k]! - cur_active_width[k]!) | 0
            prev_r.link = q; prev_prev_r = prev_r; prev_r = q
          }
          const adj = Math.abs(int_par(e, adj_demerits_code))
          if (adj >= awful_bad - minimum_demerits) minimum_demerits = awful_bad - 1
          else minimum_demerits = (minimum_demerits + adj) | 0
          for (let fit_class = very_loose_fit; fit_class <= tight_fit; fit_class++) {
            if (minimal_demerits[fit_class]! <= minimum_demerits) {
              // §845 Insert a new active node from best_place[fit_class] to cur_p
              pass_number++
              passive = { link: passive, cur_break: cur_p, serial: pass_number, prev_break: best_place[fit_class]! }
              const q: Active = { type: break_type, link: r, fitness: fit_class, line_number: best_pl_line[fit_class]! + 1,
                total_demerits: minimal_demerits[fit_class]!, break_node: passive, w: [] }
              if (do_last_line_fit) { q.active_short = best_pl_short[fit_class]!; q.active_glue = best_pl_glue[fit_class]! }
              prev_r.link = q; prev_r = q
              if (tracing()) { // §846 Print a symbolic description of the new break node
                print_nl(e, '@@'); print_int(e, passive.serial)
                print(e, ': line '); print_int(e, q.line_number - 1)
                print_char(e, 46); print_int(e, fit_class)
                if (break_type === hyphenated) print_char(e, 45)
                print(e, ' t='); print_int(e, q.total_demerits)
                if (do_last_line_fit) { // etex.ch Print additional data in the new active node
                  print(e, ' s='); print_scaled(e, q.active_short!); print(e, cur_p === null ? ' a=' : ' g='); print_scaled(e, q.active_glue!)
                }
                print(e, ' -> @@')
                if (passive.prev_break === null) print_char(e, 48)
                else print_int(e, passive.prev_break.serial)
              }
            }
            minimal_demerits[fit_class] = awful_bad
          }
          minimum_demerits = awful_bad
          // §844 Insert a delta node to prepare for the next active node
          if (r !== last_active) {
            const q: Active = { type: delta_node, link: r, fitness: 0, line_number: 0, total_demerits: 0, break_node: null, w: [0] }
            for (let k = 1; k <= nw; k++) q.w[k] = (cur_active_width[k]! - break_width[k]!) | 0
            prev_r.link = q; prev_prev_r = prev_r; prev_r = q
          }
        }
        if (r === last_active) { update_printed_node(); return }
        // §850 Compute the new line width
        if (l > easy_line) { line_width = second_width; old_l = max_halfword - 1 }
        else {
          old_l = l
          if (l > last_special_line) line_width = second_width
          else if (par_shape === undefined) line_width = first_width
          else line_width = par_shape[2 * l]!
        }
      }
      // §851 Consider the demerits for a line from r to cur_p; deactivate node r if it should no longer be active;
      // then goto continue if a line from r to cur_p is infeasible, otherwise record a new feasible break
      let artificial_demerits = false, b = 0, fit_class = 0, node_r_stays_active = false, g = 0
      let shortfall = (line_width - cur_active_width[1]!) | 0
      if (protrude_chars > 1) shortfall = (shortfall + total_pw(r, cur_p)) | 0
      if (adjust_spacing > 1 && shortfall !== 0) {
        let margin_kern_stretch = 0, margin_kern_shrink = 0
        if (protrude_chars > 1) { // Calculate variations of marginal kerns; cal_margin_kern_var uses left_pw for both sides
          const lp = e.last_leftmost_char, rp = e.last_rightmost_char
          const cal = (m: Node) => {
            const n = m as CharNode, cp = new_char(n.font, n.character)
            do_subst_font(e, cp, 1000)
            if (cp.font !== n.font) margin_kern_stretch = (margin_kern_stretch + char_pw(e, n, left_side) - char_pw(e, cp, left_side)) | 0
            cp.font = n.font
            do_subst_font(e, cp, -1000)
            if (cp.font !== n.font) margin_kern_shrink = (margin_kern_shrink + char_pw(e, cp, left_side) - char_pw(e, n, left_side)) | 0
          }
          if (lp !== null) cal(lp)
          if (rp !== null) cal(rp)
        }
        const st = (cur_active_width[7]! + margin_kern_stretch) | 0, sh = (cur_active_width[8]! + margin_kern_shrink) | 0
        if (shortfall > 0 && st > 0) {
          if (st > shortfall) shortfall = Math.trunc(Math.trunc(st / Math.trunc(e.max_stretch_ratio / e.cur_font_step)) / 2)
          else shortfall = (shortfall - st) | 0
        } else if (shortfall < 0 && sh > 0) {
          if (sh > -shortfall) shortfall = -Math.trunc(Math.trunc(sh / Math.trunc(e.max_shrink_ratio / e.cur_font_step)) / 2)
          else shortfall = (shortfall + sh) | 0
        }
      }
      found: {
      if (shortfall > 0) { // §852
        if (cur_active_width[3] !== 0 || cur_active_width[4] !== 0 || cur_active_width[5] !== 0) {
          if (do_last_line_fit) {
            if (cur_p === null) { // etex.ch Perform computations for last line and goto found
              not_found: {
                if (r.active_short === 0 || r.active_glue! <= 0) break not_found
                if (cur_active_width[3] !== fill_width[0] || cur_active_width[4] !== fill_width[1] || cur_active_width[5] !== fill_width[2]) break not_found
                g = r.active_short! > 0 ? cur_active_width[2]! : cur_active_width[6]!
                if (g <= 0) break not_found
                e.arith_error = false; g = fract(e, g, r.active_short!, r.active_glue!, max_dimen)
                if (int_par(e, last_line_fit_code) < 1000) g = fract(e, g, int_par(e, last_line_fit_code), 1000, max_dimen)
                if (e.arith_error) g = r.active_short! > 0 ? max_dimen : -max_dimen
                if (g > 0) { // the badness of the last line for stretching
                  if (g > shortfall) g = shortfall
                  if (g > 7230584 && cur_active_width[2]! < 1663497) { b = inf_bad; fit_class = very_loose_fit; break found }
                  b = badness(g, cur_active_width[2]!)
                  fit_class = b > 12 ? (b > 99 ? very_loose_fit : loose_fit) : decent_fit
                  break found
                } else if (g < 0) { // the badness of the last line for shrinking
                  if (-g > cur_active_width[6]!) g = -cur_active_width[6]!
                  b = badness(-g, cur_active_width[6]!)
                  fit_class = b > 12 ? tight_fit : decent_fit
                  break found
                }
              }
            }
            shortfall = 0
          }
          b = 0; fit_class = decent_fit
        }
        else if (shortfall > 7230584 && cur_active_width[2]! < 1663497) { b = inf_bad; fit_class = very_loose_fit }
        else {
          b = badness(shortfall, cur_active_width[2]!)
          fit_class = b > 12 ? (b > 99 ? very_loose_fit : loose_fit) : decent_fit
        }
      } else { // §853
        if (-shortfall > cur_active_width[6]!) b = inf_bad + 1
        else b = badness(-shortfall, cur_active_width[6]!)
        fit_class = b > 12 ? tight_fit : decent_fit
      }
      if (do_last_line_fit) { // etex.ch Adjust the additional data for last line
        if (cur_p === null) shortfall = 0
        g = shortfall > 0 ? cur_active_width[2]! : shortfall < 0 ? cur_active_width[6]! : 0
      }
      }
      let deactivate = false
      if (b > inf_bad || pi === eject_penalty) { // §854
        if (final_pass && minimum_demerits === awful_bad && r.link === last_active && prev_r === active) artificial_demerits = true
        else if (b > threshold) deactivate = true
        node_r_stays_active = false
      } else {
        prev_r = r
        if (b > threshold) continue
        node_r_stays_active = true
      }
      if (!deactivate) {
        // §855 Record a new feasible break
        let dd: number
        if (artificial_demerits) dd = 0
        else { // §859 Compute the demerits, d, from r to cur_p
          dd = (int_par(e, line_penalty_code) + b) | 0
          dd = Math.abs(dd) >= 10000 ? 100000000 : Math.imul(dd, dd)
          if (pi !== 0) {
            if (pi > 0) dd = (dd + Math.imul(pi, pi)) | 0
            else if (pi > eject_penalty) dd = (dd - Math.imul(pi, pi)) | 0
          }
          if (break_type === hyphenated && r.type === hyphenated) {
            if (cur_p !== null) dd = (dd + int_par(e, double_hyphen_demerits_code)) | 0
            else dd = (dd + int_par(e, final_hyphen_demerits_code)) | 0
          }
          if (Math.abs(fit_class - r.fitness) > 1) dd = (dd + int_par(e, adj_demerits_code)) | 0
        }
        if (tracing()) { // §856 Print a symbolic description of this feasible break
          if (printed_node !== cur_p) { // §857 Print the list between printed_node and cur_p, then set printed_node:=cur_p
            print_nl(e, '')
            if (cur_p === null) short_display(e, printed_node.link)
            else {
              const save_link = cur_p.link
              cur_p.link = null; print_nl(e, ''); short_display(e, printed_node.link)
              cur_p.link = save_link
            }
            printed_node = cur_p!
          }
          print_nl(e, '@')
          if (cur_p === null) print_esc(e, 'par')
          else if (cur_p.type !== glue_node) {
            if (cur_p.type === penalty_node) print_esc(e, 'penalty')
            else if (cur_p.type === disc_node) print_esc(e, 'discretionary')
            else if (cur_p.type === kern_node) print_esc(e, 'kern')
            else print_esc(e, 'math')
          }
          print(e, ' via @@')
          if (r.break_node === null) print_char(e, 48)
          else print_int(e, r.break_node.serial)
          print(e, ' b=')
          if (b > inf_bad) print_char(e, 42); else print_int(e, b)
          print(e, ' p='); print_int(e, pi); print(e, ' d=')
          if (artificial_demerits) print_char(e, 42); else print_int(e, dd)
        }
        dd = (dd + r.total_demerits) | 0
        if (dd <= minimal_demerits[fit_class]!) {
          minimal_demerits[fit_class] = dd
          best_place[fit_class] = r.break_node; best_pl_line[fit_class] = l
          if (do_last_line_fit) { best_pl_short[fit_class] = shortfall; best_pl_glue[fit_class] = g }
          if (dd < minimum_demerits) minimum_demerits = dd
        }
        if (node_r_stays_active) continue
      }
      // §860 Deactivate node r
      prev_r.link = r.link
      if (prev_r === active) { // §861 Update the active widths, since the first active node has been deleted
        r = active.link
        if (r.type === delta_node) {
          for (let k = 1; k <= nw; k++) active_width[k] = (active_width[k]! + r.w[k]!) | 0
          for (let k = 1; k <= nw; k++) cur_active_width[k] = active_width[k]!
          active.link = r.link
        }
      } else if (prev_r.type === delta_node) {
        r = prev_r.link
        if (r === last_active) {
          for (let k = 1; k <= nw; k++) cur_active_width[k] = (cur_active_width[k]! - prev_r.w[k]!) | 0
          prev_prev_r.link = last_active
          prev_r = prev_prev_r
        } else if (r.type === delta_node) {
          for (let k = 1; k <= nw; k++) cur_active_width[k] = (cur_active_width[k]! + r.w[k]!) | 0
          for (let k = 1; k <= nw; k++) prev_r.w[k] = (prev_r.w[k]! + r.w[k]!) | 0
          prev_r.link = r.link
        }
      }
    }
  }
  // pdftex.web total_pw: the protrusion of the line from r's break to p
  const total_pw = (q: Active, p: Node | null): number => {
    let l: Node | null = q.break_node === null ? first_p : q.break_node.cur_break, r = prev_rightmost(prev_p, p)
    if (p !== null && p.type === disc_node && p.pre_break !== null) { r = p.pre_break; while (r.link !== null) r = r.link }
    else r = find_protchar_right(e, l, r)
    found: {
      if (l !== null && l.type === disc_node) {
        if (l.post_break !== null) { l = l.post_break; break found }
        let n = l.replace_count
        l = l.link!
        while (n > 0) { if (l.link !== null) l = l.link; n-- }
      }
      l = find_protchar_left(e, l!, true)
    }
    return (char_pw(e, l, left_side) + char_pw(e, r, right_side)) | 0
  }
  // §858 Update the value of printed_node for symbolic displays (the exit of try_break)
  const update_printed_node = (): void => {
    if (cur_p === printed_node && cur_p !== null && cur_p.type === disc_node) {
      let t = cur_p.replace_count
      while (t > 0) { t--; printed_node = printed_node.link! }
    }
  }
  const kern_break = (): void => { // §866
    const c = cur_p as Node & { width: number }
    if (!is_char_node(c.link!) && auto_breaking && c.link!.type === glue_node) try_break(0, unhyphenated)
    active_width[1] = (active_width[1]! + c.width) | 0
  }
  let auto_breaking = true

  // §863 Find optimal breakpoints
  threshold = int_par(e, pretolerance_code)
  if (threshold >= 0) {
    if (tracing()) { begin_diagnostic(e); print_nl(e, '@firstpass') }
    second_pass = false; final_pass = false
  } else {
    threshold = int_par(e, tolerance_code); second_pass = true
    final_pass = dimen(e, emergency_stretch_code) <= 0
    if (tracing()) begin_diagnostic(e)
  }
  for (;;) {
    if (threshold > inf_bad) threshold = inf_bad
    if (second_pass) { // §891 Initialize for hyphenating a paragraph
      if (e.hy.trie_not_ready) init_trie(e)
      e.hy.cur_lang = init_cur_lang; e.hy.l_hyf = init_l_hyf; e.hy.r_hyf = init_r_hyf; set_hyph_index(e)
    }
    // §864 Create an active breakpoint representing the beginning of the paragraph
    active.link = { type: unhyphenated, fitness: decent_fit, link: last_active, break_node: null, line_number: e.prev_graf + 1,
      total_demerits: 0, w: [] }
    if (do_last_line_fit) { active.link.active_short = 0; active.link.active_glue = 0 }
    for (let k = 1; k <= nw; k++) active_width[k] = background[k]!
    passive = null; printed_node = temp_head; pass_number = 0
    e.font_in_short_display = null_font
    cur_p = temp_head.link; auto_breaking = true
    prev_p = cur_p!; e.prev_char_p = null; first_p = cur_p
    while (cur_p !== null && active.link !== last_active) {
      // §866 Call try_break if cur_p is a legal breakpoint; on the second pass, also try to hyphenate the next word, if cur_p
      // is a glue node; then advance cur_p to the next node of the paragraph that could possibly be a legal breakpoint
      if (is_char_node(cur_p)) { // §867
        prev_p = cur_p
        do { add_node_width(e, active_width, cur_p, 1, ''); cur_p = cur_p.link! } while (is_char_node(cur_p))
      }
      const p: Node = cur_p
      switch (p.type) {
        case hlist_node: case vlist_node: case rule_node: active_width[1] = (active_width[1]! + p.width) | 0; break
        case whatsit_node: // §1362
          if (p.subtype === language_node) { e.hy.cur_lang = p.what_lang; e.hy.l_hyf = p.what_lhm; e.hy.r_hyf = p.what_rhm } // adv_past: no set_hyph_index (pdftex.web)
          if (p.subtype === pdf_refxform_node || p.subtype === pdf_refximage_node) active_width[1] = (active_width[1]! + p.pdf_left) | 0
          break
        case glue_node: {
          // §868 If node cur_p is a legal breakpoint, call try_break; then update the active widths by including the glue
          if (auto_breaking) {
            if (is_char_node(prev_p)) try_break(0, unhyphenated)
            else if (precedes_break(prev_p)) try_break(0, unhyphenated)
            else if (prev_p.type === kern_node && prev_p.subtype !== explicit) try_break(0, unhyphenated)
          }
          const g = e.spec[p.glue_ptr]!
          if (g.shrink_order !== normal && g.shrink !== 0) p.glue_ptr = finite_shrink(e, ns, p.glue_ptr)
          const q = e.spec[p.glue_ptr]!
          active_width[1] = (active_width[1]! + q.width) | 0
          active_width[2 + q.stretch_order] = (active_width[2 + q.stretch_order]! + q.stretch) | 0
          active_width[6] = (active_width[6]! + q.shrink) | 0
          if (second_pass && auto_breaking) try_hyphenate(e, p) // §894 Try to hyphenate the following word
          break
        }
        case kern_node:
          if (p.subtype === explicit) kern_break()
          else {
            active_width[1] = (active_width[1]! + p.width) | 0
            if (adjust_spacing > 1 && p.subtype === normal) {
              active_width[7] = (active_width[7]! + kern_stretch_shrink(e, p, true)) | 0
              active_width[8] = (active_width[8]! + kern_stretch_shrink(e, p, false)) | 0
            }
          }
          break
        case ligature_node: add_node_width(e, active_width, p, 1, ''); break
        case disc_node: { // §869 Try to break after a discretionary fragment, then goto done5
          let s = p.pre_break
          const k8 = adjust_spacing > 1 ? [1, 7, 8] : [1] // do_one_seven_eight
          for (const k of k8) disc_width[k] = 0
          if (s === null) try_break(int_par(e, ex_hyphen_penalty_code), hyphenated)
          else {
            do { add_node_width(e, disc_width, s, 1, 'disc3'); s = s.link } while (s !== null)
            for (const k of k8) active_width[k] = (active_width[k]! + disc_width[k]!) | 0
            try_break(int_par(e, hyphen_penalty_code), hyphenated)
            for (const k of k8) active_width[k] = (active_width[k]! - disc_width[k]!) | 0
          }
          let r = p.replace_count
          s = p.link
          while (r > 0) { add_node_width(e, active_width, s!, 1, 'disc4'); r--; s = s!.link }
          prev_p = p; cur_p = s
          continue
        }
        case math_node:
          if (p.subtype < L_code) auto_breaking = (p.subtype & 1) === 1
          kern_break()
          break
        case penalty_node: try_break(p.penalty, unhyphenated); break
        case mark_node: case ins_node: case adjust_node: break
        default: confusion(e, 'paragraph')
      }
      prev_p = cur_p!; cur_p = cur_p!.link
    }
    if (cur_p === null) {
      // §873 Try the final line break at the end of the paragraph, and goto done if the desired breakpoints have been found
      try_break(eject_penalty, hyphenated)
      if (active.link !== last_active) {
        // §874 Find an active node with fewest demerits
        let r = active.link; fewest_demerits = awful_bad
        do {
          if (r.type !== delta_node && r.total_demerits < fewest_demerits) { fewest_demerits = r.total_demerits; best_bet = r }
          r = r.link
        } while (r !== last_active)
        best_line = best_bet.line_number
        const looseness = int_par(e, looseness_code)
        if (looseness === 0) break
        // §875 Find the best active node for the desired looseness
        r = active.link; actual_looseness = 0
        do {
          if (r.type !== delta_node) {
            const line_diff = r.line_number - best_line
            if ((line_diff < actual_looseness && looseness <= line_diff) || (line_diff > actual_looseness && looseness >= line_diff)) {
              best_bet = r; actual_looseness = line_diff; fewest_demerits = r.total_demerits
            } else if (line_diff === actual_looseness && r.total_demerits < fewest_demerits) {
              best_bet = r; fewest_demerits = r.total_demerits
            }
          }
          r = r.link
        } while (r !== last_active)
        best_line = best_bet.line_number
        if (actual_looseness === looseness || final_pass) break
      }
    }
    // §865 Clean up the memory by removing the break nodes (garbage collected)
    if (!second_pass) {
      if (tracing()) print_nl(e, '@secondpass')
      threshold = int_par(e, tolerance_code); second_pass = true; final_pass = dimen(e, emergency_stretch_code) <= 0
    } else {
      if (tracing()) print_nl(e, '@emergencypass')
      background[2] = (background[2]! + dimen(e, emergency_stretch_code)) | 0; final_pass = true
    }
  }
  if (tracing()) { end_diagnostic(e, true); normalize_selector(e) }
  if (do_last_line_fit) { // etex.ch Adjust the final line of the paragraph
    if (best_bet.active_short === 0) do_last_line_fit = false
    else {
      const q = new_spec(e, last_line_fill.glue_ptr); delete_glue_ref(e, last_line_fill.glue_ptr)
      const s = e.spec[q]!
      s.width = (s.width + best_bet.active_short! - best_bet.active_glue!) | 0; s.stretch = 0; last_line_fill.glue_ptr = q
    }
  }
  // §876 Break the paragraph at the chosen breakpoints, justify the resulting lines to the correct widths, and append
  // them to the current vertical list
  post_line_break(e, d, temp_head, best_bet.break_node!, best_line,
    { last_special_line, first_width, second_width, first_indent, second_indent, par_shape })
  e.pack_begin_line = 0
}

// §877 post_line_break
function post_line_break(e: Engine, d: boolean, temp_head: Node, last: Passive, best_line: number,
  w: { last_special_line: number, first_width: number, second_width: number, first_indent: number, second_indent: number,
    par_shape: number[] | undefined }): void {
  // §878 Reverse the links of the relevant passive nodes, setting cur_p to the first breakpoint
  let q: Passive | null = last, cur_p: Passive | null = null
  do { const r: Passive = q!; q = r.prev_break; r.prev_break = cur_p; cur_p = r } while (q !== null)
  let cur_line = e.prev_graf + 1, disc_break: boolean, post_disc_break: boolean
  do {
    // §880 Justify the line ending at breakpoint cur_p, and append it to the current vertical list, together with
    // associated penalties and other insertions
    // §881 Modify the end of the line to reflect the nature of the break and to include \rightskip; also set the proper
    // value of disc_break
    let q: Node | null = cur_p!.cur_break, r: Node | null
    disc_break = false; post_disc_break = false
    let glue_break = false
    if (q !== null) {
      if (q.type === glue_node) {
        delete_glue_ref(e, q.glue_ptr)
        q.glue_ptr = e.equiv[glue_base + right_skip_code]!
        q.subtype = right_skip_code + 1; add_glue_ref(e, q.glue_ptr)
        glue_break = true
      } else {
        if (q.type === disc_node) { // §882 Change discretionary to compulsory and set disc_break:=true
          let t = q.replace_count
          if (t === 0) r = q.link
          else { // §883 Destroy the t nodes following q, and make r point to the following node
            r = q
            while (t > 1) { r = r!.link; t-- }
            const s: Node = r!.link!
            r = s.link; s.link = null
            flush_node_list(e, q.link); q.replace_count = 0
          }
          if (q.post_break !== null) { // §884 Transplant the post-break list
            let s: Node = q.post_break
            while (s.link !== null) s = s.link
            s.link = r; r = q.post_break; q.post_break = null; post_disc_break = true
          }
          if (q.pre_break !== null) { // §885 Transplant the pre-break list
            let s: Node = q.pre_break
            q.link = s
            while (s.link !== null) s = s.link
            q.pre_break = null; q = s
          }
          q.link = r; disc_break = true
        } else if (q.type === kern_node || q.type === math_node) q.width = 0
      }
    } else {
      q = temp_head
      while (q.link !== null) q = q.link
    }
    if (int_par(e, pdf_protrude_chars_code) > 0) { // pdftex.web: q is the rightmost breakpoint or the last node of pre_break
      let p: Node | null, ptmp: Node | null
      if (disc_break && (is_char_node(q) || q.type !== disc_node)) { p = q; ptmp = p }
      else { p = prev_rightmost(temp_head.link, q); ptmp = p; p = find_protchar_right(e, temp_head.link, p) }
      const w = char_pw(e, p, right_side)
      if (w !== 0) {
        const k = new_margin_kern(e, -w, e.last_rightmost_char, right_side)
        k.link = ptmp!.link; ptmp!.link = k
        if (ptmp === q) q = q.link!
      }
    }
    if (!glue_break) { // §886 Put the \rightskip glue after node q
      const g = new_param_glue(e, right_skip_code); g.link = q.link; q.link = g; q = g
    }
    // §887 Put the \leftskip glue at the left and detach this line
    r = q.link; q.link = null; q = temp_head.link; temp_head.link = r
    if (int_par(e, pdf_protrude_chars_code) > 0) {
      const p = find_protchar_left(e, q!, false), w = char_pw(e, p, left_side)
      if (w !== 0) { const k = new_margin_kern(e, -w, e.last_leftmost_char, left_side); k.link = q; q = k }
    }
    if (e.equiv[glue_base + left_skip_code] !== 0) {
      const g = new_param_glue(e, left_skip_code); g.link = q; q = g
    }
    // §889 Call the packaging subroutine, setting just_box to the justified box
    let cur_width: number, cur_indent: number
    if (cur_line > w.last_special_line) { cur_width = w.second_width; cur_indent = w.second_indent }
    else if (w.par_shape === undefined) { cur_width = w.first_width; cur_indent = w.first_indent }
    else { cur_width = w.par_shape[2 * cur_line]!; cur_indent = w.par_shape[2 * cur_line - 1]! }
    e.adjust_tail = e.adjust_head; e.pre_adjust_tail = e.pre_adjust_head
    const just_box: BoxNode = hpack(e, q, cur_width, int_par(e, pdf_adjust_spacing_code) > 0 ? cal_expand_ratio : exactly)
    e.just_box = just_box
    just_box.shift_amount = cur_indent
    // §888 Append the new box to the current vertical list, followed by the list of special nodes taken out of the box
    // by the packager
    const ign = dimen(e, pdf_ignored_dimen_code)
    if (dimen(e, pdf_each_line_height_code) !== ign) just_box.height = dimen(e, pdf_each_line_height_code)
    if (dimen(e, pdf_each_line_depth_code) !== ign) just_box.depth = dimen(e, pdf_each_line_depth_code)
    if (dimen(e, pdf_first_line_height_code) !== ign && cur_line === e.prev_graf + 1) just_box.height = dimen(e, pdf_first_line_height_code)
    if (dimen(e, pdf_last_line_depth_code) !== ign && cur_line + 1 === best_line) just_box.depth = dimen(e, pdf_last_line_depth_code)
    if (e.pre_adjust_head !== e.pre_adjust_tail) { e.tail.link = e.pre_adjust_head.link; e.tail = e.pre_adjust_tail! }
    e.pre_adjust_tail = null
    append_to_vlist(e, just_box)
    if (e.adjust_head !== e.adjust_tail) { e.tail.link = e.adjust_head.link; e.tail = e.adjust_tail! }
    e.adjust_tail = null
    // §890 Append a penalty node, if a nonzero penalty is appropriate (e-TeX's penalty arrays are always null)
    if (cur_line + 1 !== best_line) {
      let pen: number, q = e.shapes[e.equiv[etex_pen_base]!] // etex.ch: the e-TeX penalty arrays
      if (q !== undefined) pen = q[Math.min(cur_line, q[0]!)]!
      else pen = int_par(e, inter_line_penalty_code)
      q = e.shapes[e.equiv[etex_pen_base + 1]!]
      if (q !== undefined) pen = (pen + q[Math.min(cur_line - e.prev_graf, q[0]!)]!) | 0
      else if (cur_line === e.prev_graf + 1) pen = (pen + int_par(e, club_penalty_code)) | 0
      q = e.shapes[e.equiv[etex_pen_base + (d ? 3 : 2)]!]
      if (q !== undefined) pen = (pen + q[Math.min(best_line - cur_line - 1, q[0]!)]!) | 0
      else if (cur_line + 2 === best_line) pen = (pen + int_par(e, d ? display_widow_penalty_code : widow_penalty_code)) | 0
      if (disc_break) pen = (pen + int_par(e, broken_penalty_code)) | 0
      if (pen !== 0) { const p = new_penalty(pen); e.tail.link = p; e.tail = p }
    }
    cur_line++; cur_p = cur_p!.prev_break
    if (cur_p !== null && !post_disc_break) {
      // §879 Prune unwanted nodes at the beginning of the next line
      let r: Node = temp_head, q: Node
      for (;;) {
        q = r.link!
        if (q === cur_p.cur_break) break
        if (is_char_node(q)) break
        if (q.type < math_node) break // non_discardable
        if (q.type === kern_node && q.subtype !== explicit) break
        r = q
      }
      if (r !== temp_head) { r.link = null; flush_node_list(e, temp_head.link); temp_head.link = q }
    }
  } while (cur_p !== null)
  if (cur_line !== best_line || temp_head.link !== null) confusion(e, 'line breaking')
  e.prev_graf = best_line - 1
}
