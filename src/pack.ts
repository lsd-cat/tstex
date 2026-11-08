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
  glue_node, kern_node, math_node, ligature_node, a_leaders, pdf_refxform_node, pdf_refximage_node } from './nodes.ts'
import type { Node, BoxNode } from './nodes.ts'
import { char_info, char_width, char_height, char_depth, height_depth, null_font } from './tfm.ts'

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

// §649 hpack (pdftex: no font expansion, m is exactly or additional)
export function hpack(e: Engine, p: Node | null, w: number, m: number): BoxNode {
  no_TeXXeT(e) // etex.ch branches on TeXXeT_en here; TeXXeT is not ported
  e.last_badness = 0
  const r = new_null_box()
  r.list_ptr = p
  const fake = new_char(0, 0) // plays r+list_offset: link(fake) is the list, q runs behind p (§655)
  fake.link = p
  let q: Node = fake
  let h = 0, d = 0, x = 0
  const ts = e.total_stretch, tsh = e.total_shrink
  ts.fill(0); tsh.fill(0)
  while (p !== null) { // §651
    if (is_char_node(p)) { // §654
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
      case kern_node: case math_node: x = (x + p.width) | 0; break
      case ligature_node: { // §652 Make node p look like a char_node and goto reswitch
        const f = p.font, i = char_info(e, f, p.character), hd = height_depth(i)
        x = (x + char_width(e, f, i)) | 0
        let s = char_height(e, f, hd); if (s > h) h = s
        s = char_depth(e, f, hd); if (s > d) d = s
        break
      }
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
