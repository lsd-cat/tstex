// §644–679 packaging: scan_spec, hpack, vpackage, append_to_vlist
import type { Engine } from './engine.ts'
import { no_TeXXeT } from './etex.ts'
import { print, print_ln, print_nl, print_int, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_scaled, badness } from './arith.ts'
import { confusion } from './error.ts'
import { int_par, dimen_base, glue_base } from './eqtb.ts'
import { new_save_level } from './eqtb.ts'
import { scan_keyword, scan_normal_dimen, scan_left_brace } from './scan.ts'
import { new_char, new_null_box, new_rule, new_param_glue, new_skip_param, short_display, show_box, is_char_node, normal, fil, fill, filll,
  stretching, shrinking, hlist_node, vlist_node, rule_node, unset_node, ins_node, mark_node, adjust_node, whatsit_node,
  glue_node, kern_node, math_node, ligature_node, a_leaders, pdf_refxform_node, pdf_refximage_node, char_node, disc_node, margin_kern_node,
  left_side } from './nodes.ts'
import type { Node, BoxNode, CharNode, KernNode, MarginKernNode } from './nodes.ts'
import { char_info, char_width, char_height, char_depth, height_depth, null_font, get_font_code, ef_code_base, lp_code_base, rp_code_base,
  char_tag, lig_tag, lig_kern_start, lig_kern_restart, skip_byte, next_char, op_byte, stop_flag, kern_flag, char_kern, expand_font, quad } from './tfm.ts'
import { round_xn_over_d, ext_xn_over_d, divide_scaled, fix_int, pdf_error } from './pdf.ts'

export const exactly = 0, additional = 1 // §644
export const max_dimen = 0o7777777777
const hbadness_code = 26, vbadness_code = 27, hfuzz_code = 8, vfuzz_code = 9, overfull_rule_code = 16, pdf_ignored_dimen_code = 32
const line_skip_code = 0, baseline_skip_code = 1, line_skip_limit_code = 2

// §274 saved(k)
export const saved = (e: Engine, k: number): number => e.save_rh[e.save_ptr + k]!
export const set_saved = (e: Engine, k: number, v: number): void => { e.save_rh[e.save_ptr + k] = v }

// §645 scan_spec
export function scan_spec(e: Engine, c: number, three_codes: boolean): void {
  let s = 0, spec_code: number
  if (three_codes) s = saved(e, 0)
  found: {
    if (scan_keyword(e, 'to')) spec_code = exactly
    else if (scan_keyword(e, 'spread')) spec_code = additional
    else { spec_code = additional; e.cur_val = 0; break found }
    scan_normal_dimen(e)
  }
  if (three_codes) { set_saved(e, 0, s); e.save_ptr++ }
  set_saved(e, 0, spec_code); set_saved(e, 1, e.cur_val); e.save_ptr += 2
  new_save_level(e, c); scan_left_brace(e)
}

// pdftex.web font expansion helpers: char_stretch, char_shrink, get_kern, kern_stretch, kern_shrink, do_subst_font, char_pw,
// new_margin_kern. A ligature node carries its lig_char's font and character itself.
export const cal_expand_ratio = 2, subst_ex_font = 3
export function char_stretch(e: Engine, f: number, c: number): number {
  const k = e.pdf_font_stretch[f]!, ef = get_font_code(e, ef_code_base, f, c)
  if (k !== null_font && ef > 0) {
    const dw = (char_width(e, k, char_info(e, k, c)) - char_width(e, f, char_info(e, f, c))) | 0
    if (dw > 0) return round_xn_over_d(e, dw, ef, 1000)
  }
  return 0
}
export function char_shrink(e: Engine, f: number, c: number): number {
  const k = e.pdf_font_shrink[f]!, ef = get_font_code(e, ef_code_base, f, c)
  if (k !== null_font && ef > 0) {
    const dw = (char_width(e, f, char_info(e, f, c)) - char_width(e, k, char_info(e, k, c))) | 0
    if (dw > 0) return round_xn_over_d(e, dw, ef, 1000)
  }
  return 0
}
function get_kern(e: Engine, f: number, lc: number, rc: number): number {
  const i = char_info(e, f, lc)
  if (char_tag(i) !== lig_tag) return 0
  let k = lig_kern_start(e, f, i), j = e.font_info[k]!
  if (skip_byte(j) > stop_flag) { k = lig_kern_restart(e, f, j); j = e.font_info[k]! }
  for (;;) {
    if (next_char(j) === rc && skip_byte(j) <= stop_flag && op_byte(j) >= kern_flag) return char_kern(e, f, j)
    if (skip_byte(j) === 0) k++
    else { if (skip_byte(j) >= stop_flag) return 0; k += skip_byte(j) + 1 }
    j = e.font_info[k]!
  }
}
// kern_stretch (s = true) and kern_shrink
export function kern_stretch_shrink(e: Engine, p: Node, s: boolean): number {
  const l = e.prev_char_p, r = p.link
  if (l === null || l.link !== p || r === null) return 0
  if (!(is_char_node(l) || l.type === ligature_node) || !(is_char_node(r) || r.type === ligature_node)) return 0
  const k = s ? e.pdf_font_stretch[l.font]! : e.pdf_font_shrink[l.font]!
  if (l.font !== r.font || k === null_font) return 0
  const d = get_kern(e, k, l.character, r.character), w = (p as KernNode).width
  return round_xn_over_d(e, s ? (d - w) | 0 : (w - d) | 0, get_font_code(e, ef_code_base, l.font, l.character), 1000)
}
export function do_subst_font(e: Engine, p: Node, ex_ratio: number): void {
  if (p.type === disc_node) {
    for (let r = p.pre_break; r !== null; r = r.link) if (is_char_node(r) || r.type === ligature_node) do_subst_font(e, r, ex_ratio)
    for (let r = p.post_break; r !== null; r = r.link) if (is_char_node(r) || r.type === ligature_node) do_subst_font(e, r, ex_ratio)
    return
  }
  if (!is_char_node(p) && p.type !== ligature_node) pdf_error(e, 'font expansion', 'invalid node type')
  const f = p.font, ef = get_font_code(e, ef_code_base, f, p.character)
  if (ef === 0) return
  let k = f
  if (e.pdf_font_stretch[f] !== null_font && ex_ratio > 0)
    k = expand_font(e, f, ext_xn_over_d(e, Math.imul(ex_ratio, ef), e.pdf_font_expand_ratio[e.pdf_font_stretch[f]!]!, 1000000))
  else if (e.pdf_font_shrink[f] !== null_font && ex_ratio < 0)
    k = expand_font(e, f, ext_xn_over_d(e, Math.imul(ex_ratio, ef), -e.pdf_font_expand_ratio[e.pdf_font_shrink[f]!]!, 1000000))
  if (k !== f) {
    p.font = k
    if (!is_char_node(p)) for (let r = p.lig_ptr; r !== null; r = r.link) (r as CharNode).font = k
  }
}
export function char_pw(e: Engine, p: Node | null, side: number): number {
  if (side === left_side) e.last_leftmost_char = null; else e.last_rightmost_char = null
  if (p === null || !(is_char_node(p) || p.type === ligature_node)) return 0
  const f = p.font
  let c: number
  if (side === left_side) { c = get_font_code(e, lp_code_base, f, p.character); e.last_leftmost_char = p }
  else { c = get_font_code(e, rp_code_base, f, p.character); e.last_rightmost_char = p }
  if (c === 0) return 0
  return round_xn_over_d(e, quad(e, f), c, 1000)
}
export function new_margin_kern(e: Engine, w: number, p: Node | null, side: number): MarginKernNode {
  if (p === null) pdf_error(e, 'margin kerning', 'invalid pointer to marginal char node')
  const c = p as CharNode
  return { type: margin_kern_node, link: null, subtype: side, width: w, margin_char: new_char(c.font, c.character) }
}

// §649 hpack (pdftex.web: m=cal_expand_ratio measures the font stretch and shrink and, if the line needs expansion, packs
// again with m=subst_ex_font, which substitutes expanded fonts)
export function hpack(e: Engine, p: Node | null, w: number, m: number): BoxNode {
  const r = hpack_(e, p, w, m)
  if (m === cal_expand_ratio && e.font_expand_ratio !== 0) {
    e.font_expand_ratio = fix_int(e.font_expand_ratio, -1000, 1000)
    return hpack(e, r.list_ptr, w, subst_ex_font)
  }
  return r
}
function hpack_(e: Engine, p: Node | null, w: number, m: number): BoxNode {
  no_TeXXeT(e) // etex.ch branches on TeXXeT_en here; TeXXeT is not ported
  e.last_badness = 0
  const r = new_null_box()
  r.list_ptr = p
  const fake = new_char(0, 0) // plays r+list_offset: link(fake) is the list, q runs behind p (§655)
  fake.link = p
  let q: Node = fake, font_stretch = 0, font_shrink = 0
  if (m === cal_expand_ratio) { e.prev_char_p = null; e.font_expand_ratio = 0 }
  let h = 0, d = 0, x = 0
  const ts = e.total_stretch, tsh = e.total_shrink
  ts.fill(0); tsh.fill(0)
  while (p !== null) { // §651
    if (is_char_node(p)) { // §654
      if (m >= cal_expand_ratio) {
        e.prev_char_p = p
        if (m === cal_expand_ratio) {
          font_stretch = (font_stretch + char_stretch(e, p.font, p.character)) | 0
          font_shrink = (font_shrink + char_shrink(e, p.font, p.character)) | 0
        } else do_subst_font(e, p, e.font_expand_ratio)
      }
      const f = p.font, i = char_info(e, f, p.character), hd = height_depth(i)
      x = (x + char_width(e, f, i)) | 0
      let s = char_height(e, f, hd); if (s > h) h = s
      s = char_depth(e, f, hd); if (s > d) d = s
      p = p.link; continue
    }
    switch (p.type) {
      case hlist_node: case vlist_node: case rule_node: case unset_node: { // §653
        x = (x + p.width) | 0
        const s = p.type >= rule_node ? 0 : (p as BoxNode).shift_amount
        if (p.height - s > h) h = (p.height - s) | 0
        if (p.depth + s > d) d = (p.depth + s) | 0
        break
      }
      case ins_node: case mark_node: case adjust_node:
        if (e.adjust_tail !== null || e.pre_adjust_tail !== null) { // §655 Transfer node p to the adjustment list
          while (q.link !== p) q = q.link!
          if (p.type === adjust_node) {
            if (p.subtype !== 0) {
              if (e.pre_adjust_tail === null) confusion(e, 'pre vadjust')
              e.pre_adjust_tail.link = p.adjust_ptr
              while (e.pre_adjust_tail.link !== null) e.pre_adjust_tail = e.pre_adjust_tail.link
            } else {
              if (e.adjust_tail === null) confusion(e, 'pre vadjust')
              e.adjust_tail.link = p.adjust_ptr
              while (e.adjust_tail.link !== null) e.adjust_tail = e.adjust_tail.link
            }
            p = p.link
          } else { e.adjust_tail!.link = p; e.adjust_tail = p; p = p.link }
          q.link = p; p = q
        }
        break
      case whatsit_node: // §1360 (pdftex.web: Incorporate a whatsit node into an hbox)
        if (p.subtype === pdf_refxform_node || p.subtype === pdf_refximage_node) {
          x = (x + p.pdf_left) | 0
          if (p.pdf_top > h) h = p.pdf_top
          if (p.pdf_right > d) d = p.pdf_right
        }
        break
      case glue_node: { // §656
        const g = e.spec[p.glue_ptr]!
        x = (x + g.width) | 0
        ts[g.stretch_order] = (ts[g.stretch_order]! + g.stretch) | 0
        tsh[g.shrink_order] = (tsh[g.shrink_order]! + g.shrink) | 0
        if (p.subtype >= a_leaders) {
          const l = p.leader_ptr as BoxNode
          if (l.height > h) h = l.height
          if (l.depth > d) d = l.depth
        }
        break
      }
      case margin_kern_node: {
        const c = p.margin_char
        if (m === cal_expand_ratio) {
          const f = c.font
          do_subst_font(e, c, 1000)
          if (f !== c.font) font_stretch = (font_stretch - p.width - char_pw(e, c, p.subtype)) | 0
          c.font = f
          do_subst_font(e, c, -1000)
          if (f !== c.font) font_shrink = (font_shrink - p.width - char_pw(e, c, p.subtype)) | 0
          c.font = f
        } else if (m === subst_ex_font) { do_subst_font(e, c, e.font_expand_ratio); p.width = -char_pw(e, c, p.subtype) }
        x = (x + p.width) | 0
        break
      }
      case kern_node:
        if (p.subtype === normal) {
          if (m === cal_expand_ratio) {
            font_stretch = (font_stretch + kern_stretch_shrink(e, p, true)) | 0
            font_shrink = (font_shrink + kern_stretch_shrink(e, p, false)) | 0
          } else if (m === subst_ex_font) {
            const k = kern_stretch_shrink(e, p, e.font_expand_ratio > 0)
            if (k !== 0) {
              const l = e.prev_char_p as CharNode, n = p.link!
              if (is_char_node(n) || n.type === ligature_node) p.width = get_kern(e, l.font, l.character, n.character)
            }
          }
        }
        x = (x + p.width) | 0; break
      case math_node: x = (x + p.width) | 0; break
      case ligature_node: // §652 Make node p look like a char_node and goto reswitch
        if (m === subst_ex_font) do_subst_font(e, p, e.font_expand_ratio)
        p = { type: char_node, link: p.link, font: p.font, character: p.character } // lig_trick
        continue
      case disc_node: if (m === subst_ex_font) do_subst_font(e, p, e.font_expand_ratio); break
    }
    p = p.link
  }
  r.list_ptr = fake.link
  if (e.adjust_tail !== null) e.adjust_tail.link = null
  if (e.pre_adjust_tail !== null) e.pre_adjust_tail.link = null
  r.height = h; r.depth = d
  // §657 Determine the value of width(r) and the appropriate glue setting
  if (m === additional) w = (x + w) | 0
  r.width = w; x = (w - x) | 0
  if (x === 0) { r.glue_sign = normal; r.glue_order = normal; r.glue_set = 0; return r }
  let o: number
  if (x > 0) { // §658
    o = ts[filll] !== 0 ? filll : ts[fill] !== 0 ? fill : ts[fil] !== 0 ? fil : normal // §659
    if (m === cal_expand_ratio && o === normal && font_stretch > 0) { e.font_expand_ratio = divide_scaled(e, x, font_stretch, 3); return r }
    r.glue_order = o; r.glue_sign = stretching
    if (ts[o] !== 0) r.glue_set = x / ts[o]!
    else { r.glue_sign = normal; r.glue_set = 0 }
    if (o === normal && r.list_ptr !== null) { // §660 Report an underfull hbox
      e.last_badness = badness(x, ts[normal]!)
      if (e.last_badness > int_par(e, hbadness_code)) {
        print_ln(e)
        print_nl(e, e.last_badness > 100 ? 'Underfull' : 'Loose')
        print(e, ' \\hbox (badness '); print_int(e, e.last_badness)
        hpack_common_ending(e, r)
      }
    }
    return r
  }
  o = tsh[filll] !== 0 ? filll : tsh[fill] !== 0 ? fill : tsh[fil] !== 0 ? fil : normal // §665
  if (m === cal_expand_ratio && o === normal && font_shrink > 0) { e.font_expand_ratio = divide_scaled(e, x, font_shrink, 3); return r }
  r.glue_order = o; r.glue_sign = shrinking
  if (tsh[o] !== 0) r.glue_set = -x / tsh[o]!
  else { r.glue_sign = normal; r.glue_set = 0 }
  if (tsh[o]! < -x && o === normal && r.list_ptr !== null) {
    e.last_badness = 1000000; r.glue_set = 1
    // §666 Report an overfull hbox
    const excess = (-x - tsh[normal]!) | 0, hfuzz = e.equiv[dimen_base + hfuzz_code]!
    if (excess > hfuzz || int_par(e, hbadness_code) < 100) {
      if (e.equiv[dimen_base + overfull_rule_code]! > 0 && excess > hfuzz) {
        let t: Node = r.list_ptr
        while (t.link !== null) t = t.link
        const rule = new_rule(); rule.width = e.equiv[dimen_base + overfull_rule_code]!; t.link = rule
      }
      print_ln(e); print_nl(e, 'Overfull \\hbox ('); print_scaled(e, excess); print(e, 'pt too wide')
      hpack_common_ending(e, r)
    }
  } else if (o === normal && r.list_ptr !== null) { // §667 Report a tight hbox
    e.last_badness = badness(-x, tsh[normal]!)
    if (e.last_badness > int_par(e, hbadness_code)) {
      print_ln(e); print_nl(e, 'Tight \\hbox (badness '); print_int(e, e.last_badness)
      hpack_common_ending(e, r)
    }
  }
  return r
}

// §663 Finish issuing a diagnostic message for an overfull or underfull hbox
function hpack_common_ending(e: Engine, r: BoxNode): void {
  if (e.output_active) print(e, ') has occurred while \\output is active')
  else {
    if (e.pack_begin_line !== 0) {
      print(e, e.pack_begin_line > 0 ? ') in paragraph at lines ' : ') in alignment at lines ')
      print_int(e, Math.abs(e.pack_begin_line)); print(e, '--')
    } else print(e, ') detected at line ')
    print_int(e, e.line)
  }
  print_ln(e)
  e.font_in_short_display = null_font; short_display(e, r.list_ptr); print_ln(e)
  begin_diagnostic(e); show_box(e, r); end_diagnostic(e, true)
}

// §668 vpackage
export function vpackage(e: Engine, p: Node | null, h: number, m: number, l: number): BoxNode {
  e.last_badness = 0
  const r = new_null_box(); r.type = vlist_node; r.list_ptr = p
  let w = 0, d = 0, x = 0
  const ts = e.total_stretch, tsh = e.total_shrink
  ts.fill(0); tsh.fill(0)
  while (p !== null) { // §669
    if (is_char_node(p)) confusion(e, 'vpack')
    switch (p.type) {
      case hlist_node: case vlist_node: case rule_node: case unset_node: { // §670
        x = (x + d + p.height) | 0; d = p.depth
        const s = p.type >= rule_node ? 0 : (p as BoxNode).shift_amount
        if (p.width + s > w) w = (p.width + s) | 0
        break
      }
      case whatsit_node: // §1359 (pdftex.web: Incorporate a whatsit node into a vbox)
        if (p.subtype === pdf_refxform_node || p.subtype === pdf_refximage_node) {
          x = (x + d + p.pdf_top) | 0; d = p.pdf_right
          if (p.pdf_left > w) w = p.pdf_left
        }
        break
      case glue_node: { // §671
        x = (x + d) | 0; d = 0
        const g = e.spec[p.glue_ptr]!
        x = (x + g.width) | 0
        ts[g.stretch_order] = (ts[g.stretch_order]! + g.stretch) | 0
        tsh[g.shrink_order] = (tsh[g.shrink_order]! + g.shrink) | 0
        if (p.subtype >= a_leaders) { const g2 = p.leader_ptr as BoxNode; if (g2.width > w) w = g2.width }
        break
      }
      case kern_node: x = (x + d + p.width) | 0; d = 0; break
    }
    p = p.link
  }
  r.width = w
  if (d > l) { x = (x + d - l) | 0; r.depth = l } else r.depth = d
  // §672 Determine the value of height(r) and the appropriate glue setting
  if (m === additional) h = (x + h) | 0
  r.height = h; x = (h - x) | 0
  if (x === 0) { r.glue_sign = normal; r.glue_order = normal; r.glue_set = 0; return r }
  let o: number
  if (x > 0) { // §673
    o = ts[filll] !== 0 ? filll : ts[fill] !== 0 ? fill : ts[fil] !== 0 ? fil : normal
    r.glue_order = o; r.glue_sign = stretching
    if (ts[o] !== 0) r.glue_set = x / ts[o]!
    else { r.glue_sign = normal; r.glue_set = 0 }
    if (o === normal && r.list_ptr !== null) { // §674 Report an underfull vbox
      e.last_badness = badness(x, ts[normal]!)
      if (e.last_badness > int_par(e, vbadness_code)) {
        print_ln(e)
        print_nl(e, e.last_badness > 100 ? 'Underfull' : 'Loose')
        print(e, ' \\vbox (badness '); print_int(e, e.last_badness)
        vpack_common_ending(e, r)
      }
    }
    return r
  }
  o = tsh[filll] !== 0 ? filll : tsh[fill] !== 0 ? fill : tsh[fil] !== 0 ? fil : normal // §676
  r.glue_order = o; r.glue_sign = shrinking
  if (tsh[o] !== 0) r.glue_set = -x / tsh[o]!
  else { r.glue_sign = normal; r.glue_set = 0 }
  if (tsh[o]! < -x && o === normal && r.list_ptr !== null) {
    e.last_badness = 1000000; r.glue_set = 1
    const excess = (-x - tsh[normal]!) | 0 // §677 Report an overfull vbox
    if (excess > e.equiv[dimen_base + vfuzz_code]! || int_par(e, vbadness_code) < 100) {
      print_ln(e); print_nl(e, 'Overfull \\vbox ('); print_scaled(e, excess); print(e, 'pt too high')
      vpack_common_ending(e, r)
    }
  } else if (o === normal && r.list_ptr !== null) { // §678 Report a tight vbox
    e.last_badness = badness(-x, tsh[normal]!)
    if (e.last_badness > int_par(e, vbadness_code)) {
      print_ln(e); print_nl(e, 'Tight \\vbox (badness '); print_int(e, e.last_badness)
      vpack_common_ending(e, r)
    }
  }
  return r
}
export const vpack = (e: Engine, p: Node | null, h: number, m: number) => vpackage(e, p, h, m, max_dimen)

// §675 Finish issuing a diagnostic message for an overfull or underfull vbox
function vpack_common_ending(e: Engine, r: BoxNode): void {
  if (e.output_active) print(e, ') has occurred while \\output is active')
  else {
    if (e.pack_begin_line !== 0) { print(e, ') in alignment at lines '); print_int(e, Math.abs(e.pack_begin_line)); print(e, '--') }
    else print(e, ') detected at line ')
    print_int(e, e.line); print_ln(e)
  }
  begin_diagnostic(e); show_box(e, r); end_diagnostic(e, true)
}

// §679 append_to_vlist (pdftex: \pdfignoreddimen instead of ignore_depth)
export function append_to_vlist(e: Engine, b: BoxNode): void {
  if (e.prev_depth > e.equiv[dimen_base + pdf_ignored_dimen_code]!) {
    const d = (e.spec[e.equiv[glue_base + baseline_skip_code]!]!.width - e.prev_depth - b.height) | 0
    let p: Node
    if (d < e.equiv[dimen_base + line_skip_limit_code]!) p = new_param_glue(e, line_skip_code)
    else { p = new_skip_param(e, baseline_skip_code); e.spec[e.temp_ptr]!.width = d }
    e.tail.link = p; e.tail = p
  }
  e.tail.link = b; e.tail = b; e.prev_depth = b.depth
}
