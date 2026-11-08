// §813–890 breaking paragraphs into lines (pdftex.web; \pdfadjustspacing, \pdfprotrudechars and e-TeX's \lastlinefit,
import { etex_pen_base } from './types.ts'
// \interlinepenalties etc. are inactive in this engine)
import type { Engine } from './engine.ts'
import { no_TeXXeT, fract, last_line_fit_code } from './etex.ts'
import { print_scaled } from './arith.ts'
import { max_dimen } from './scan.ts'
import { print, print_char, print_esc, print_int, print_nl, begin_diagnostic, end_diagnostic } from './print.ts'
import { badness, inf_bad } from './arith.ts'
import { error, print_err, help, confusion, fatal_error, normalize_selector } from './error.ts'
import { int_par, dimen_base, glue_base, par_shape_loc } from './eqtb.ts'
import { new_char, new_penalty, new_param_glue, new_spec, delete_glue_ref, add_glue_ref, flush_node_list, short_display, is_char_node,
  hlist_node, vlist_node, rule_node, ins_node, mark_node, adjust_node, ligature_node, disc_node, whatsit_node, math_node, glue_node,
  kern_node, penalty_node, normal, explicit, L_code, inf_penalty, eject_penalty, language_node } from './nodes.ts'
import type { Node, BoxNode, DiscNode, GlueNode, PenaltyNode } from './nodes.ts'
import { char_info, char_width, null_font } from './tfm.ts'
import { hpack, append_to_vlist, exactly } from './pack.ts'
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

// width of a char, ligature, box, rule or kern node inside a discretionary (§841–842, §870–871)
function disc_node_width(e: Engine, s: Node, what: string): number {
  if (is_char_node(s) || s.type === ligature_node) return char_width(e, s.font, char_info(e, s.font, s.character))
  if (s.type === hlist_node || s.type === vlist_node || s.type === rule_node || s.type === kern_node) return s.width
  confusion(e, what)
}

// §815 line_break
export function line_break(e: Engine, d: boolean): void {
  no_TeXXeT(e) // etex.ch branches on TeXXeT_en here; TeXXeT is not ported
  if (int_par(e, pdf_adjust_spacing_code) !== 0) fatal_error(e, 'unsupported: \\pdfadjustspacing')
  if (int_par(e, pdf_protrude_chars_code) !== 0) fatal_error(e, 'unsupported: \\pdfprotrudechars')
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
  const background = [0, 0, 0, 0, 0, 0, 0]
  {
    const q = e.spec[e.equiv[glue_base + left_skip_code]!]!, r = e.spec[e.equiv[glue_base + right_skip_code]!]!
    background[1] = (q.width + r.width) | 0
    background[2 + q.stretch_order] = q.stretch
    background[2 + r.stretch_order] = (background[2 + r.stretch_order]! + r.stretch) | 0
    background[6] = (q.shrink + r.shrink) | 0
  }
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
  const active_width = [0, 0, 0, 0, 0, 0, 0], cur_active_width = [0, 0, 0, 0, 0, 0, 0], break_width = [0, 0, 0, 0, 0, 0, 0],
    disc_width = [0, 0, 0, 0, 0, 0, 0]
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
  let cur_p: Node | null = null, second_pass = false, final_pass = false, threshold = 0
  let best_bet: Active = active, fewest_demerits = 0, best_line = 0, actual_looseness = 0

  // §829 try_break
  const try_break = (pi: number, break_type: number): void => {
    // §831 Make sure that pi is in the proper range
    if (Math.abs(pi) >= inf_penalty) {
      if (pi > 0) { update_printed_node(); return }
      pi = eject_penalty
    }
    let no_break_yet = true, prev_r: Active = active, prev_prev_r: Active = active, old_l = 0, r: Active, line_width = 0, l = 0
    for (let k = 1; k <= 6; k++) cur_active_width[k] = active_width[k]!
    for (;;) {
      r = prev_r.link
      // §832 If node r is of type delta_node, update cur_active_width, set prev_r and prev_prev_r, then goto continue
      if (r.type === delta_node) {
        for (let k = 1; k <= 6; k++) cur_active_width[k] = (cur_active_width[k]! + r.w[k]!) | 0
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
            for (let k = 1; k <= 6; k++) break_width[k] = background[k]!
            let s: Node | null = cur_p
            if (break_type > unhyphenated && cur_p !== null) { // §840 Compute the discretionary break_width values
              const dp = cur_p as DiscNode
              let t = dp.replace_count, v: Node = dp
              s = dp.post_break
              while (t > 0) { t--; v = v.link!; break_width[1] = (break_width[1]! - disc_node_width(e, v, 'disc1')) | 0 }
              while (s !== null) { break_width[1] = (break_width[1]! + disc_node_width(e, s, 'disc2')) | 0; s = s.link }
              break_width[1] = (break_width[1]! + disc_width[1]!) | 0
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
            for (let k = 1; k <= 6; k++) prev_r.w[k] = (prev_r.w[k]! - cur_active_width[k]! + break_width[k]!) | 0
          } else if (prev_r === active) {
            for (let k = 1; k <= 6; k++) active_width[k] = break_width[k]!
          } else {
            const q: Active = { type: delta_node, link: r, fitness: 0, line_number: 0, total_demerits: 0, break_node: null, w: [0] }
            for (let k = 1; k <= 6; k++) q.w[k] = (break_width[k]! - cur_active_width[k]!) | 0
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
            for (let k = 1; k <= 6; k++) q.w[k] = (cur_active_width[k]! - break_width[k]!) | 0
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
          for (let k = 1; k <= 6; k++) active_width[k] = (active_width[k]! + r.w[k]!) | 0
          for (let k = 1; k <= 6; k++) cur_active_width[k] = active_width[k]!
          active.link = r.link
        }
      } else if (prev_r.type === delta_node) {
        r = prev_r.link
        if (r === last_active) {
          for (let k = 1; k <= 6; k++) cur_active_width[k] = (cur_active_width[k]! - prev_r.w[k]!) | 0
          prev_prev_r.link = last_active
          prev_r = prev_prev_r
        } else if (r.type === delta_node) {
          for (let k = 1; k <= 6; k++) cur_active_width[k] = (cur_active_width[k]! + r.w[k]!) | 0
          for (let k = 1; k <= 6; k++) prev_r.w[k] = (prev_r.w[k]! + r.w[k]!) | 0
          prev_r.link = r.link
        }
      }
    }
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
    for (let k = 1; k <= 6; k++) active_width[k] = background[k]!
    passive = null; printed_node = temp_head; pass_number = 0
    e.font_in_short_display = null_font
    cur_p = temp_head.link; auto_breaking = true
    let prev_p: Node = cur_p!
    while (cur_p !== null && active.link !== last_active) {
      // §866 Call try_break if cur_p is a legal breakpoint; on the second pass, also try to hyphenate the next word, if cur_p
      // is a glue node; then advance cur_p to the next node of the paragraph that could possibly be a legal breakpoint
      if (is_char_node(cur_p)) { // §867
        prev_p = cur_p
        do {
          const c: Node = cur_p
          active_width[1] = (active_width[1]! + char_width(e, c.font, char_info(e, c.font, c.character))) | 0
          cur_p = c.link!
        } while (is_char_node(cur_p))
      }
      const p: Node = cur_p
      switch (p.type) {
        case hlist_node: case vlist_node: case rule_node: active_width[1] = (active_width[1]! + p.width) | 0; break
        case whatsit_node: // §1362
          if (p.subtype === language_node) { e.hy.cur_lang = p.what_lang; e.hy.l_hyf = p.what_lhm; e.hy.r_hyf = p.what_rhm; set_hyph_index(e) }
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
          else active_width[1] = (active_width[1]! + p.width) | 0
          break
        case ligature_node: active_width[1] = (active_width[1]! + char_width(e, p.font, char_info(e, p.font, p.character))) | 0; break
        case disc_node: { // §869 Try to break after a discretionary fragment, then goto done5
          let s = p.pre_break
          disc_width[1] = 0
          if (s === null) try_break(int_par(e, ex_hyphen_penalty_code), hyphenated)
          else {
            do { disc_width[1] = (disc_width[1]! + disc_node_width(e, s, 'disc3')) | 0; s = s.link } while (s !== null)
            active_width[1] = (active_width[1]! + disc_width[1]!) | 0
            try_break(int_par(e, hyphen_penalty_code), hyphenated)
            active_width[1] = (active_width[1]! - disc_width[1]!) | 0
          }
          let r = p.replace_count
          s = p.link
          while (r > 0) { active_width[1] = (active_width[1]! + disc_node_width(e, s!, 'disc4')) | 0; r--; s = s!.link }
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
    if (!glue_break) { // §886 Put the \rightskip glue after node q
      const g = new_param_glue(e, right_skip_code); g.link = q.link; q.link = g; q = g
    }
    // §887 Put the \leftskip glue at the left and detach this line
    r = q.link; q.link = null; q = temp_head.link; temp_head.link = r
    if (e.equiv[glue_base + left_skip_code] !== 0) {
      const g = new_param_glue(e, left_skip_code); g.link = q; q = g
    }
    // §889 Call the packaging subroutine, setting just_box to the justified box
    let cur_width: number, cur_indent: number
    if (cur_line > w.last_special_line) { cur_width = w.second_width; cur_indent = w.second_indent }
    else if (w.par_shape === undefined) { cur_width = w.first_width; cur_indent = w.first_indent }
    else { cur_width = w.par_shape[2 * cur_line]!; cur_indent = w.par_shape[2 * cur_line - 1]! }
    e.adjust_tail = e.adjust_head; e.pre_adjust_tail = e.pre_adjust_head
    const just_box: BoxNode = hpack(e, q, cur_width, exactly)
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
