// §699–718 font parameters and subroutines for math mode, §719–767 mlist_to_hlist
import type { Engine } from './engine.ts'
import { math_font_base, int_base, dimen_base, glue_base } from './types.ts'
import { print, print_char, print_esc, print_int } from './print.ts'
import { half, x_over_n, nx_plus_y, xn_over_d } from './arith.ts'
import { error, print_err, help, confusion } from './error.ts'
import { new_null_box, new_rule, new_kern, new_glue, new_spec, new_char, new_penalty, new_noad, empty_field, flush_node_list,
  delete_glue_ref, is_char_node, zero_glue, ss_glue, normal, mu_glue, cond_math_glue, explicit, inf_penalty, vlist_node, rule_node,
  ins_node, mark_node, adjust_node, whatsit_node, penalty_node, disc_node, glue_node, kern_node, style_node, choice_node,
  ord_noad, op_noad, bin_noad, rel_noad, open_noad, close_noad, punct_noad, inner_noad, radical_noad, fraction_noad, under_noad,
  over_noad, accent_noad, vcenter_noad, left_noad, right_noad, math_char, sub_box, sub_mlist, math_text_char, limits,
  default_code, text_style, script_style, cramped } from './nodes.ts'
import type { Node, BoxNode, KernNode, Noad, Field, Delim, StyleNode } from './nodes.ts'
import { char_info, char_exists, char_width, char_italic, char_height, char_depth, height_depth, char_tag, char_kern,
  lig_kern_start, lig_kern_restart, skip_byte, next_char, op_byte, rem_byte, b0, b1, b2, b3, stop_flag, kern_flag, lig_tag,
  list_tag, ext_tag, null_font, param, space_code, x_height_code, char_warning, new_character } from './tfm.ts'
import { hpack, vpack, exactly, additional } from './pack.ts'

const delimiter_factor_code = 18, bin_op_penalty_code = 9, rel_penalty_code = 10
const delimiter_shortfall_code = 10, null_delimiter_space_code = 11, script_space_code = 12
const thin_mu_skip_code = 15, med_mu_skip_code = 16, thick_mu_skip_code = 17

// §699 size codes, print_size
export const text_size = 0, script_size = 16, script_script_size = 32
export function print_size(e: Engine, s: number): void {
  print_esc(e, s === text_size ? 'textfont' : s === script_size ? 'scriptfont' : 'scriptscriptfont')
}
export const fam_fnt = (e: Engine, n: number): number => e.equiv[math_font_base + n]!

// §700 math symbol parameters, §701 math extension parameters
const mathsy = (e: Engine, k: number, s: number): number => e.font_info[k + e.param_base[fam_fnt(e, 2 + s)]!] ?? 0
export const math_x_height = (e: Engine, s: number) => mathsy(e, 5, s)
export const math_quad = (e: Engine, s: number) => mathsy(e, 6, s)
const num1 = (e: Engine, s: number) => mathsy(e, 8, s), num2 = (e: Engine, s: number) => mathsy(e, 9, s)
const num3 = (e: Engine, s: number) => mathsy(e, 10, s), denom1 = (e: Engine, s: number) => mathsy(e, 11, s)
const denom2 = (e: Engine, s: number) => mathsy(e, 12, s), sup1 = (e: Engine, s: number) => mathsy(e, 13, s)
const sup2 = (e: Engine, s: number) => mathsy(e, 14, s), sup3 = (e: Engine, s: number) => mathsy(e, 15, s)
const sub1 = (e: Engine, s: number) => mathsy(e, 16, s), sub2 = (e: Engine, s: number) => mathsy(e, 17, s)
const sup_drop = (e: Engine, s: number) => mathsy(e, 18, s), sub_drop = (e: Engine, s: number) => mathsy(e, 19, s)
const delim1 = (e: Engine, s: number) => mathsy(e, 20, s), delim2 = (e: Engine, s: number) => mathsy(e, 21, s)
export const axis_height = (e: Engine, s: number) => mathsy(e, 22, s)
export const total_mathsy_params = 22, total_mathex_params = 13
const mathex = (e: Engine, k: number): number => e.font_info[k + e.param_base[fam_fnt(e, 3 + e.cur_size)]!] ?? 0
const default_rule_thickness = (e: Engine) => mathex(e, 8)
const big_op_spacing = (e: Engine, k: number) => mathex(e, 8 + k)

// §702
const cramped_style = (c: number) => 2 * (c >> 1) + cramped
const sub_style = (c: number) => 2 * (c >> 2) + script_style + cramped
const sup_style = (c: number) => 2 * (c >> 2) + script_style + (c % 2)
const num_style = (c: number) => c + 2 - 2 * Math.trunc(c / 6)
const denom_style = (c: number) => 2 * (c >> 1) + cramped + 2 - 2 * Math.trunc(c / 6)

// §703 Set up the values of cur_size and cur_mu, based on cur_style
function set_cur_size(e: Engine): void {
  e.cur_size = e.cur_style < script_style ? text_size : 16 * ((e.cur_style - text_style) >> 1)
  e.cur_mu = x_over_n(e, math_quad(e, e.cur_size), 18)
}

// §704 fraction_rule
function fraction_rule(t: number): Node {
  const p = new_rule(); p.height = t; p.depth = 0; return p
}

// §705 overbar
function overbar(e: Engine, b: Node, k: number, t: number): BoxNode {
  let p: Node = new_kern(k); p.link = b
  const q = fraction_rule(t); q.link = p
  p = new_kern(t); p.link = q
  return vpack(e, p, 0, additional)
}

// §709 char_box
function char_box(e: Engine, f: number, c: number): BoxNode {
  const q = char_info(e, f, c), hd = height_depth(q), b = new_null_box()
  b.width = (char_width(e, f, q) + char_italic(e, f, q)) | 0
  b.height = char_height(e, f, hd); b.depth = char_depth(e, f, hd)
  b.list_ptr = new_char(f, c)
  return b
}

// §711 stack_into_box
function stack_into_box(e: Engine, b: BoxNode, f: number, c: number): void {
  const p = char_box(e, f, c); p.link = b.list_ptr; b.list_ptr = p; b.height = p.height
}

// §712 height_plus_depth
function height_plus_depth(e: Engine, f: number, c: number): number {
  const hd = height_depth(char_info(e, f, c))
  return (char_height(e, f, hd) + char_depth(e, f, hd)) | 0
}

// §706 var_delimiter
export function var_delimiter(e: Engine, d: Delim, s: number, v: number): BoxNode {
  let f = null_font, w = 0, large_attempt = false, z = d.small_fam, x = d.small_char, c = 0, q = 0
  found: for (;;) {
    if (z !== 0 || x !== 0) { // §707 Look at the variants of (z,x)
      z = z + s + 16
      do {
        z -= 16
        const g = fam_fnt(e, z)
        if (g !== null_font) { // §708 Look at the list of characters starting with x in font g
          let y = x
          if (y >= e.font_bc[g]! && y <= e.font_ec[g]!) {
            for (;;) {
              q = char_info(e, g, y)
              if (!char_exists(q)) break
              if (char_tag(q) === ext_tag) { f = g; c = y; break found }
              const hd = height_depth(q), u = (char_height(e, g, hd) + char_depth(e, g, hd)) | 0
              if (u > w) {
                f = g; c = y; w = u
                if (u >= v) break found
              }
              if (char_tag(q) !== list_tag) break
              y = rem_byte(q)
            }
          }
        }
      } while (z >= 16)
    }
    if (large_attempt) break
    large_attempt = true; z = d.large_fam; x = d.large_char
  }
  let b: BoxNode
  if (f !== null_font) { // §710 Make variable b point to a box for (f,c)
    if (char_tag(q) === ext_tag) { // §713 Construct an extensible character in a new box b
      b = new_null_box(); b.type = vlist_node
      const r = e.font_info[e.exten_base[f]! + rem_byte(q)]!
      // §714 Compute the minimum suitable height, w, and the corresponding number of extension steps, n
      c = b3(r); const u = height_plus_depth(e, f, c)
      w = 0; q = char_info(e, f, c); b.width = (char_width(e, f, q) + char_italic(e, f, q)) | 0
      c = b2(r); if (c !== 0) w = (w + height_plus_depth(e, f, c)) | 0
      c = b1(r); if (c !== 0) w = (w + height_plus_depth(e, f, c)) | 0
      c = b0(r); if (c !== 0) w = (w + height_plus_depth(e, f, c)) | 0
      let n = 0
      if (u > 0) while (w < v) {
        w = (w + u) | 0; n++
        if (b1(r) !== 0) w = (w + u) | 0
      }
      c = b2(r); if (c !== 0) stack_into_box(e, b, f, c)
      c = b3(r); for (let m = 1; m <= n; m++) stack_into_box(e, b, f, c)
      c = b1(r)
      if (c !== 0) { stack_into_box(e, b, f, c); c = b3(r); for (let m = 1; m <= n; m++) stack_into_box(e, b, f, c) }
      c = b0(r); if (c !== 0) stack_into_box(e, b, f, c)
      b.depth = (w - b.height) | 0
    } else b = char_box(e, f, c)
  } else { b = new_null_box(); b.width = e.equiv[dimen_base + null_delimiter_space_code]! }
  b.shift_amount = (half((b.height - b.depth) | 0) - axis_height(e, s)) | 0
  return b
}

// §715 rebox
function rebox(e: Engine, b: BoxNode, w: number): BoxNode {
  if (b.width !== w && b.list_ptr !== null) {
    if (b.type === vlist_node) b = hpack(e, b, 0, additional)
    let p = b.list_ptr!
    if (is_char_node(p) && p.link === null) {
      const f = p.font, v = char_width(e, f, char_info(e, f, p.character))
      if (v !== b.width) p.link = new_kern((b.width - v) | 0)
    }
    const g = new_glue(e, ss_glue); g.link = p
    while (p.link !== null) p = p.link
    p.link = new_glue(e, ss_glue)
    return hpack(e, g, w, exactly)
  }
  b.width = w; return b
}

// §716 math_glue
export function math_glue(e: Engine, g: number, m: number): number {
  let n = x_over_n(e, m, 0o200000), f = e.remainder
  if (f < 0) { n--; f = (f + 0o200000) | 0 }
  const mu_mult = (x: number) => nx_plus_y(e, n, x, xn_over_d(e, x, f, 0o200000))
  const p = new_spec(e, zero_glue), s = e.spec[p]!, o = e.spec[g]!
  s.width = mu_mult(o.width)
  s.stretch_order = o.stretch_order
  s.stretch = s.stretch_order === normal ? mu_mult(o.stretch) : o.stretch
  s.shrink_order = o.shrink_order
  s.shrink = s.shrink_order === normal ? mu_mult(o.shrink) : o.shrink
  return p
}

// §717 math_kern
function math_kern(e: Engine, p: KernNode, m: number): void {
  if (p.subtype === mu_glue) {
    let n = x_over_n(e, m, 0o200000), f = e.remainder
    if (f < 0) { n--; f = (f + 0o200000) | 0 }
    p.width = nx_plus_y(e, n, p.width, xn_over_d(e, p.width, f, 0o200000)); p.subtype = explicit
  }
}

// §718 flush_math
export function flush_math(e: Engine): void {
  flush_node_list(e, e.head.link); flush_node_list(e, e.incompleat_noad)
  e.head.link = null; e.tail = e.head; e.incompleat_noad = null
}

// §720 clean_box
function clean_box(e: Engine, p: Field, s: number): BoxNode {
  let q: Node | null
  found: {
    switch (p.math_type) {
      case math_char: { const n = new_noad(); n.nucleus = { ...p }; e.cur_mlist = n; break }
      case sub_box: q = p.info; break found
      case sub_mlist: e.cur_mlist = p.info; break
      default: q = new_null_box(); break found
    }
    const save_style = e.cur_style; e.cur_style = s; e.mlist_penalties = false
    q = mlist_to_hlist(e)
    e.cur_style = save_style
    set_cur_size(e)
  }
  let x: BoxNode
  if (q === null || is_char_node(q)) x = hpack(e, q, 0, additional)
  else if (q.link === null && q.type <= vlist_node && (q as BoxNode).shift_amount === 0) x = q as BoxNode
  else x = hpack(e, q, 0, additional)
  // §721 Simplify a trivial box
  const r0 = x.list_ptr
  if (r0 !== null && is_char_node(r0)) {
    const r = r0.link
    if (r !== null && r.link === null && !is_char_node(r) && r.type === kern_node) r0.link = null
  }
  return x
}

// §722 fetch
function fetch(e: Engine, a: Field): void {
  e.cur_c = a.character; e.cur_f = fam_fnt(e, a.fam + e.cur_size)
  if (e.cur_f === null_font) { // §723 Complain about an undefined family and set cur_i null
    print_err(e, ''); print_size(e, e.cur_size); print_char(e, 32)
    print_int(e, a.fam); print(e, ' is undefined (character ')
    print(e, e.cur_c); print_char(e, 41)
    help(e, 'Somewhere in the math formula just ended, you used the', 'stated character from an undefined font family. For example,',
      "plain TeX doesn't allow \\it or \\sl in subscripts. Proceed,", "and I'll try to forget that I needed that character.")
    error(e); e.cur_i = 0; a.math_type = 0
  } else {
    if (e.cur_c >= e.font_bc[e.cur_f]! && e.cur_c <= e.font_ec[e.cur_f]!) e.cur_i = char_info(e, e.cur_f, e.cur_c)
    else e.cur_i = 0
    if (!char_exists(e.cur_i)) { char_warning(e, e.cur_f, e.cur_c); a.math_type = 0; e.cur_i = 0 }
  }
}

// §734 make_over
function make_over(e: Engine, q: Noad): void {
  const t = default_rule_thickness(e)
  q.nucleus.info = overbar(e, clean_box(e, q.nucleus, cramped_style(e.cur_style)), Math.imul(3, t), t)
  q.nucleus.math_type = sub_box
}

// §735 make_under
function make_under(e: Engine, q: Noad): void {
  const x = clean_box(e, q.nucleus, e.cur_style)
  const p = new_kern(Math.imul(3, default_rule_thickness(e))); x.link = p
  p.link = fraction_rule(default_rule_thickness(e))
  const y = vpack(e, x, 0, additional)
  const delta = (y.height + y.depth + default_rule_thickness(e)) | 0
  y.height = x.height; y.depth = (delta - y.height) | 0
  q.nucleus.info = y; q.nucleus.math_type = sub_box
}

// §736 make_vcenter
function make_vcenter(e: Engine, q: Noad): void {
  const v = q.nucleus.info as BoxNode
  if (v.type !== vlist_node) confusion(e, 'vcenter')
  const delta = (v.height + v.depth) | 0
  v.height = (axis_height(e, e.cur_size) + half(delta)) | 0
  v.depth = (delta - v.height) | 0
}

// §737 make_radical
function make_radical(e: Engine, q: Noad): void {
  const x = clean_box(e, q.nucleus, cramped_style(e.cur_style))
  let clr: number
  if (e.cur_style < text_style) clr = (default_rule_thickness(e) + Math.trunc(Math.abs(math_x_height(e, e.cur_size)) / 4)) | 0
  else { clr = default_rule_thickness(e); clr = (clr + Math.trunc(Math.abs(clr) / 4)) | 0 }
  const y = var_delimiter(e, q.left_delimiter, e.cur_size, (x.height + x.depth + clr + default_rule_thickness(e)) | 0)
  const delta = (y.depth - (x.height + x.depth + clr)) | 0
  if (delta > 0) clr = (clr + half(delta)) | 0
  y.shift_amount = -(x.height + clr) | 0
  y.link = overbar(e, x, clr, y.height)
  q.nucleus.info = hpack(e, y, 0, additional); q.nucleus.math_type = sub_box
}

// §738 make_math_accent
function make_math_accent(e: Engine, q: Noad): void {
  fetch(e, q.accent_chr)
  if (!char_exists(e.cur_i)) return
  let i = e.cur_i, c = e.cur_c
  const f = e.cur_f
  // §741 Compute the amount of skew
  let s = 0
  if (q.nucleus.math_type === math_char) {
    fetch(e, q.nucleus)
    if (char_tag(e.cur_i) === lig_tag) {
      let a = lig_kern_start(e, e.cur_f, e.cur_i)
      e.cur_i = e.font_info[a]!
      if (skip_byte(e.cur_i) > stop_flag) { a = lig_kern_restart(e, e.cur_f, e.cur_i); e.cur_i = e.font_info[a]! }
      for (;;) {
        if (next_char(e.cur_i) === e.skew_char[e.cur_f]) {
          if (op_byte(e.cur_i) >= kern_flag && skip_byte(e.cur_i) <= stop_flag) s = char_kern(e, e.cur_f, e.cur_i)
          break
        }
        if (skip_byte(e.cur_i) >= stop_flag) break
        a = a + skip_byte(e.cur_i) + 1
        e.cur_i = e.font_info[a]!
      }
    }
  }
  let x = clean_box(e, q.nucleus, cramped_style(e.cur_style))
  const w = x.width
  let h = x.height
  for (;;) { // §740 Switch to a larger accent if available and appropriate
    if (char_tag(i) !== list_tag) break
    const y = rem_byte(i)
    i = char_info(e, f, y)
    if (!char_exists(i)) break
    if (char_width(e, f, i) > w) break
    c = y
  }
  let delta = h < param(e, x_height_code, f) ? h : param(e, x_height_code, f)
  if ((q.supscr.math_type !== 0 || q.subscr.math_type !== 0) && q.nucleus.math_type === math_char) {
    // §742 Swap the subscript and superscript into box x
    flush_node_list(e, x)
    const n = new_noad()
    n.nucleus = { ...q.nucleus }; n.supscr = { ...q.supscr }; n.subscr = { ...q.subscr }
    q.supscr = empty_field(); q.subscr = empty_field()
    q.nucleus.math_type = sub_mlist; q.nucleus.info = n
    x = clean_box(e, q.nucleus, e.cur_style); delta = (delta + x.height - h) | 0; h = x.height
  }
  const y = char_box(e, f, c)
  y.shift_amount = (s + half((w - y.width) | 0)) | 0
  y.width = 0
  const p = new_kern(-delta); p.link = x; y.link = p
  const yy = vpack(e, y, 0, additional); yy.width = x.width
  if (yy.height < h) { // §739 Make the height of box y equal to h
    const k = new_kern((h - yy.height) | 0); k.link = yy.list_ptr; yy.list_ptr = k; yy.height = h
  }
  q.nucleus.info = yy; q.nucleus.math_type = sub_box
}

// §743 make_fraction
function make_fraction(e: Engine, q: Noad): void {
  if (q.thickness === default_code) q.thickness = default_rule_thickness(e)
  // §744 Create equal-width boxes x and z for the numerator and denominator
  let x = clean_box(e, q.supscr, num_style(e.cur_style))
  let z = clean_box(e, q.subscr, denom_style(e.cur_style))
  if (x.width < z.width) x = rebox(e, x, z.width); else z = rebox(e, z, x.width)
  let shift_up: number, shift_down: number
  if (e.cur_style < text_style) { shift_up = num1(e, e.cur_size); shift_down = denom1(e, e.cur_size) }
  else {
    shift_down = denom2(e, e.cur_size)
    shift_up = q.thickness !== 0 ? num2(e, e.cur_size) : num3(e, e.cur_size)
  }
  let clr: number, delta: number
  const ax = axis_height(e, e.cur_size)
  if (q.thickness === 0) { // §745
    clr = Math.imul(e.cur_style < text_style ? 7 : 3, default_rule_thickness(e))
    delta = half((clr - ((shift_up - x.depth) - (z.height - shift_down))) | 0)
    if (delta > 0) { shift_up = (shift_up + delta) | 0; shift_down = (shift_down + delta) | 0 }
  } else { // §746
    clr = e.cur_style < text_style ? Math.imul(3, q.thickness) : q.thickness
    delta = half(q.thickness)
    const delta1 = (clr - ((shift_up - x.depth) - (ax + delta))) | 0
    const delta2 = (clr - ((ax - delta) - (z.height - shift_down))) | 0
    if (delta1 > 0) shift_up = (shift_up + delta1) | 0
    if (delta2 > 0) shift_down = (shift_down + delta2) | 0
  }
  // §747 Construct a vlist box for the fraction
  const v = new_null_box(); v.type = vlist_node
  v.height = (shift_up + x.height) | 0; v.depth = (z.depth + shift_down) | 0
  v.width = x.width
  let p: Node
  if (q.thickness === 0) { p = new_kern(((shift_up - x.depth) - (z.height - shift_down)) | 0); p.link = z }
  else {
    const y = fraction_rule(q.thickness)
    p = new_kern(((ax - delta) - (z.height - shift_down)) | 0)
    y.link = p; p.link = z
    p = new_kern(((shift_up - x.depth) - (ax + delta)) | 0)
    p.link = y
  }
  x.link = p; v.list_ptr = x
  // §748 Put the fraction into a box with its delimiters, and make new_hlist(q) point to it
  delta = e.cur_style < text_style ? delim1(e, e.cur_size) : delim2(e, e.cur_size)
  const l = var_delimiter(e, q.left_delimiter, e.cur_size, delta); l.link = v
  const r = var_delimiter(e, q.right_delimiter, e.cur_size, delta); v.link = r
  q.new_hlist = hpack(e, l, 0, additional)
}

// §749 make_op
function make_op(e: Engine, q: Noad): number {
  let delta: number
  if (q.subtype === normal && e.cur_style < text_style) q.subtype = limits
  if (q.nucleus.math_type === math_char) {
    fetch(e, q.nucleus)
    if (e.cur_style < text_style && char_tag(e.cur_i) === list_tag) { // make it larger
      const c = rem_byte(e.cur_i), i = char_info(e, e.cur_f, c)
      if (char_exists(i)) { e.cur_c = c; e.cur_i = i; q.nucleus.character = c }
    }
    delta = char_italic(e, e.cur_f, e.cur_i)
    const x = clean_box(e, q.nucleus, e.cur_style)
    if (q.subscr.math_type !== 0 && q.subtype !== limits) x.width = (x.width - delta) | 0
    x.shift_amount = (half((x.height - x.depth) | 0) - axis_height(e, e.cur_size)) | 0
    q.nucleus.math_type = sub_box; q.nucleus.info = x
  } else delta = 0
  if (q.subtype === limits) { // §750 Construct a box with limits above and below it, skewed by delta
    let x = clean_box(e, q.supscr, sup_style(e.cur_style))
    let y = clean_box(e, q.nucleus, e.cur_style)
    let z = clean_box(e, q.subscr, sub_style(e.cur_style))
    const v = new_null_box(); v.type = vlist_node; v.width = y.width
    if (x.width > v.width) v.width = x.width
    if (z.width > v.width) v.width = z.width
    x = rebox(e, x, v.width); y = rebox(e, y, v.width); z = rebox(e, z, v.width)
    x.shift_amount = half(delta); z.shift_amount = -x.shift_amount | 0
    v.height = y.height; v.depth = y.depth
    // §751 Attach the limits to y and adjust height(v), depth(v) to account for their presence
    if (q.supscr.math_type === 0) v.list_ptr = y
    else {
      let shift_up = (big_op_spacing(e, 3) - x.depth) | 0
      if (shift_up < big_op_spacing(e, 1)) shift_up = big_op_spacing(e, 1)
      let p: Node = new_kern(shift_up); p.link = y; x.link = p
      p = new_kern(big_op_spacing(e, 5)); p.link = x; v.list_ptr = p
      v.height = (v.height + big_op_spacing(e, 5) + x.height + x.depth + shift_up) | 0
    }
    if (q.subscr.math_type !== 0) {
      let shift_down = (big_op_spacing(e, 4) - z.height) | 0
      if (shift_down < big_op_spacing(e, 2)) shift_down = big_op_spacing(e, 2)
      let p: Node = new_kern(shift_down); y.link = p; p.link = z
      p = new_kern(big_op_spacing(e, 5)); z.link = p
      v.depth = (v.depth + big_op_spacing(e, 5) + z.height + z.depth + shift_down) | 0
    }
    q.new_hlist = v
  }
  return delta
}

// §752 make_ord
function make_ord(e: Engine, q: Noad): void {
  restart: for (;;) {
    if (q.subscr.math_type !== 0 || q.supscr.math_type !== 0 || q.nucleus.math_type !== math_char) return
    const p = q.link as Noad | null
    if (p === null || p.type < ord_noad || p.type > punct_noad || p.nucleus.math_type !== math_char || p.nucleus.fam !== q.nucleus.fam) return
    q.nucleus.math_type = math_text_char
    fetch(e, q.nucleus)
    if (char_tag(e.cur_i) !== lig_tag) return
    let a = lig_kern_start(e, e.cur_f, e.cur_i)
    e.cur_c = p.nucleus.character
    e.cur_i = e.font_info[a]!
    if (skip_byte(e.cur_i) > stop_flag) { a = lig_kern_restart(e, e.cur_f, e.cur_i); e.cur_i = e.font_info[a]! }
    for (;;) {
      // §753 If instruction cur_i is a kern with cur_c, attach the kern after q; or if it is a ligature with cur_c, combine noads q and p
      if (next_char(e.cur_i) === e.cur_c && skip_byte(e.cur_i) <= stop_flag) {
        if (op_byte(e.cur_i) >= kern_flag) {
          const k = new_kern(char_kern(e, e.cur_f, e.cur_i)); k.link = q.link; q.link = k; return
        }
        const o = op_byte(e.cur_i), rem = rem_byte(e.cur_i)
        switch (o) {
          case 1: case 5: q.nucleus.character = rem; break
          case 2: case 6: p.nucleus.character = rem; break
          case 3: case 7: case 11: {
            const r = new_noad()
            r.nucleus.character = rem; r.nucleus.fam = q.nucleus.fam
            q.link = r; r.link = p
            r.nucleus.math_type = o < 11 ? math_char : math_text_char // prevent combination
            break
          }
          default:
            q.link = p.link; q.nucleus.character = rem
            Object.assign(q.subscr, p.subscr); Object.assign(q.supscr, p.supscr)
        }
        if (o > 3) return
        q.nucleus.math_type = math_char; continue restart
      }
      if (skip_byte(e.cur_i) >= stop_flag) return
      a = a + skip_byte(e.cur_i) + 1
      e.cur_i = e.font_info[a]!
    }
  }
}

// §756 make_scripts
function make_scripts(e: Engine, q: Noad, delta: number): void {
  let p = q.new_hlist, shift_up: number, shift_down: number
  if (p !== null && is_char_node(p)) { shift_up = 0; shift_down = 0 }
  else {
    const z = hpack(e, p, 0, additional)
    const t = e.cur_style < script_style ? script_size : script_script_size
    shift_up = (z.height - sup_drop(e, t)) | 0
    shift_down = (z.depth + sub_drop(e, t)) | 0
  }
  const s = e.cur_size, mxh = math_x_height(e, s)
  let x: BoxNode, clr: number
  if (q.supscr.math_type === 0) { // §757 Construct a subscript box x when there is no superscript
    x = clean_box(e, q.subscr, sub_style(e.cur_style))
    x.width = (x.width + e.equiv[dimen_base + script_space_code]!) | 0
    if (shift_down < sub1(e, s)) shift_down = sub1(e, s)
    clr = (x.height - Math.trunc(Math.abs(Math.imul(mxh, 4)) / 5)) | 0
    if (shift_down < clr) shift_down = clr
    x.shift_amount = shift_down
  } else {
    // §758 Construct a superscript box x
    x = clean_box(e, q.supscr, sup_style(e.cur_style))
    x.width = (x.width + e.equiv[dimen_base + script_space_code]!) | 0
    if (e.cur_style % 2 === 1) clr = sup3(e, s)
    else if (e.cur_style < text_style) clr = sup1(e, s)
    else clr = sup2(e, s)
    if (shift_up < clr) shift_up = clr
    clr = (x.depth + Math.trunc(Math.abs(mxh) / 4)) | 0
    if (shift_up < clr) shift_up = clr
    if (q.subscr.math_type === 0) x.shift_amount = -shift_up | 0
    else { // §759 Construct a sub/superscript combination box x, with the superscript offset by delta
      const y = clean_box(e, q.subscr, sub_style(e.cur_style))
      y.width = (y.width + e.equiv[dimen_base + script_space_code]!) | 0
      if (shift_down < sub2(e, s)) shift_down = sub2(e, s)
      clr = (Math.imul(4, default_rule_thickness(e)) - ((shift_up - x.depth) - (y.height - shift_down))) | 0
      if (clr > 0) {
        shift_down = (shift_down + clr) | 0
        clr = (Math.trunc(Math.abs(Math.imul(mxh, 4)) / 5) - (shift_up - x.depth)) | 0
        if (clr > 0) { shift_up = (shift_up + clr) | 0; shift_down = (shift_down - clr) | 0 }
      }
      x.shift_amount = delta
      const k = new_kern(((shift_up - x.depth) - (y.height - shift_down)) | 0); x.link = k; k.link = y
      x = vpack(e, x, 0, additional); x.shift_amount = shift_down
    }
  }
  if (q.new_hlist === null) q.new_hlist = x
  else {
    p = q.new_hlist
    while (p.link !== null) p = p.link
    p.link = x
  }
}

// §762 make_left_right
function make_left_right(e: Engine, q: Noad, style: number, max_d: number, max_h: number): number {
  e.cur_style = style; set_cur_size(e)
  let delta2 = (max_d + axis_height(e, e.cur_size)) | 0
  let delta1 = (max_h + max_d - delta2) | 0
  if (delta2 > delta1) delta1 = delta2 // delta1 is max distance from axis
  let delta = Math.imul(Math.trunc(delta1 / 500), e.equiv[int_base + delimiter_factor_code]!)
  delta2 = (delta1 + delta1 - e.equiv[dimen_base + delimiter_shortfall_code]!) | 0
  if (delta < delta2) delta = delta2
  q.new_hlist = var_delimiter(e, q.left_delimiter, e.cur_size, delta)
  return q.type - (left_noad - open_noad)
}

// §764 the inter-element spacing table, rows and columns ord_noad..inner_noad
const math_spacing = '02340001' + '22*40001' + '33**3**3' + '44*04004' + '00*00000' + '02340001' + '11*11111' + '12341011'

// §726 mlist_to_hlist: converts e.cur_mlist in e.cur_style and returns the hlist (TeX's link(temp_head))
export function mlist_to_hlist(e: Engine): Node | null {
  const mlist = e.cur_mlist, penalties = e.mlist_penalties, style = e.cur_style
  let q = mlist, r: Noad | null = null, r_type: number = op_noad, max_h = 0, max_d = 0
  set_cur_size(e)
  const NOAD = 0, NODE = 1, DIMS = 2, CONVERT = 3
  while (q !== null) {
    // §727 Process node-or-noad q as much as possible in preparation for the second pass
    let delta = 0, L = CONVERT
    reswitch: for (;;) { // §728 Do first-pass processing based on type(q)
      delta = 0
      switch (q.type) {
        case bin_noad:
          switch (r_type) {
            case bin_noad: case op_noad: case rel_noad: case open_noad: case punct_noad: case left_noad:
              q.type = ord_noad; continue reswitch
          }
          break
        case rel_noad: case close_noad: case punct_noad: case right_noad:
          if (r_type === bin_noad) r!.type = ord_noad // §729
          if (q.type === right_noad) L = NOAD
          break
        // §733 Cases for noads that can follow a bin_noad
        case left_noad: L = NOAD; break
        case fraction_noad: make_fraction(e, q); L = DIMS; break
        case op_noad: delta = make_op(e, q); if (q.subtype === limits) L = DIMS; break
        case ord_noad: make_ord(e, q); break
        case open_noad: case inner_noad: break
        case radical_noad: make_radical(e, q); break
        case over_noad: make_over(e, q); break
        case under_noad: make_under(e, q); break
        case accent_noad: make_math_accent(e, q); break
        case vcenter_noad: make_vcenter(e, q); break
        // §730 Cases for nodes that can appear in an mlist, after which we goto done_with_node
        case style_node: e.cur_style = q.subtype; set_cur_size(e); L = NODE; break
        case choice_node: { // §731 Change this node to a style node followed by the correct choice
          let p: Node | null
          switch (e.cur_style >> 1) {
            case 0: p = q.display_mlist; q.display_mlist = null; break
            case 1: p = q.text_mlist; q.text_mlist = null; break
            case 2: p = q.script_mlist; q.script_mlist = null; break
            default: p = q.script_script_mlist; q.script_script_mlist = null
          }
          flush_node_list(e, q.display_mlist); flush_node_list(e, q.text_mlist)
          flush_node_list(e, q.script_mlist); flush_node_list(e, q.script_script_mlist)
          const sn = q as unknown as StyleNode
          sn.type = style_node; sn.subtype = e.cur_style; sn.width = 0; sn.depth = 0
          if (p !== null) {
            const z = sn.link; sn.link = p
            while (p.link !== null) p = p.link
            p.link = z
          }
          L = NODE; break
        }
        case ins_node: case mark_node: case adjust_node: case whatsit_node: case penalty_node: case disc_node: L = NODE; break
        case rule_node:
          if (q.height > max_h) max_h = q.height
          if (q.depth > max_d) max_d = q.depth
          L = NODE; break
        case glue_node: // §732 Convert math glue to ordinary glue
          if (q.subtype === mu_glue) {
            const x = q.glue_ptr, y = math_glue(e, x, e.cur_mu)
            delete_glue_ref(e, x); q.glue_ptr = y; q.subtype = normal
          } else if (e.cur_size !== text_size && q.subtype === cond_math_glue) {
            const p = q.link
            if (p !== null && (p.type === glue_node || p.type === kern_node)) { q.link = p.link; p.link = null; flush_node_list(e, p) }
          }
          L = NODE; break
        case kern_node: math_kern(e, q, e.cur_mu); L = NODE; break
        default: confusion(e, 'mlist1')
      }
      break
    }
    if (L === CONVERT) { // §754 Convert nucleus(q) to an hlist and attach the sub/superscripts
      const n = (q as Noad), nu = n.nucleus
      let p: Node | null
      switch (nu.math_type) {
        case math_char: case math_text_char: // §755
          fetch(e, nu)
          if (char_exists(e.cur_i)) {
            delta = char_italic(e, e.cur_f, e.cur_i); p = new_character(e, e.cur_f, e.cur_c)!
            if (nu.math_type === math_text_char && param(e, space_code, e.cur_f) !== 0) delta = 0 // no italic correction in mid-word of text font
            if (n.subscr.math_type === 0 && delta !== 0) { p.link = new_kern(delta); delta = 0 }
          } else p = null
          break
        case 0: p = null; break
        case sub_box: p = nu.info; break
        case sub_mlist: {
          e.cur_mlist = nu.info; const save_style = e.cur_style
          e.mlist_penalties = false; const h = mlist_to_hlist(e)
          e.cur_style = save_style; set_cur_size(e)
          p = hpack(e, h, 0, additional)
          break
        }
        default: confusion(e, 'mlist2')
      }
      n.new_hlist = p
      if (n.subscr.math_type !== 0 || n.supscr.math_type !== 0) make_scripts(e, n, delta)
      L = DIMS
    }
    if (L === DIMS) { // check_dimensions
      const z = hpack(e, (q as Noad).new_hlist, 0, additional)
      if (z.height > max_h) max_h = z.height
      if (z.depth > max_d) max_d = z.depth
    }
    if (L !== NODE) { // done_with_noad
      r = q as Noad; r_type = r.type
      if (r_type === right_noad) { r_type = left_noad; e.cur_style = style; set_cur_size(e) }
    }
    q = q.link // done_with_node
  }
  if (r_type === bin_noad) r!.type = ord_noad // §729
  // §760 Make a second pass over the mlist, removing all noads and inserting the proper spacing and penalties
  const head = new_char(0, 0)
  let p: Node = head
  q = mlist; r_type = 0; e.cur_style = style
  set_cur_size(e)
  while (q !== null) {
    // §761 If node q is a style node, change the style and goto delete_q; ...
    let t: number = ord_noad, pen = inf_penalty
    switch (q.type) {
      case op_noad: case open_noad: case close_noad: case punct_noad: case inner_noad: t = q.type; break
      case bin_noad: t = bin_noad; pen = e.equiv[int_base + bin_op_penalty_code]!; break
      case rel_noad: t = rel_noad; pen = e.equiv[int_base + rel_penalty_code]!; break
      case ord_noad: case vcenter_noad: case over_noad: case under_noad: break
      case radical_noad: case accent_noad: case fraction_noad: break
      case left_noad: case right_noad: t = make_left_right(e, q, style, max_d, max_h); break
      case style_node: e.cur_style = q.subtype; set_cur_size(e); q = q.link; continue // §763, delete_q
      case whatsit_node: case penalty_node: case rule_node: case disc_node: case adjust_node: case ins_node: case mark_node:
      case glue_node: case kern_node:
        p.link = q; p = q; q = q.link; p.link = null; continue
      default: confusion(e, 'mlist3')
    }
    if (r_type > 0) { // §766 Append inter-element spacing based on r_type and t
      let x: number
      switch (math_spacing[(r_type - ord_noad) * 8 + t - ord_noad]) {
        case '0': x = 0; break
        case '1': x = e.cur_style < script_style ? thin_mu_skip_code : 0; break
        case '2': x = thin_mu_skip_code; break
        case '3': x = e.cur_style < script_style ? med_mu_skip_code : 0; break
        case '4': x = e.cur_style < script_style ? thick_mu_skip_code : 0; break
        default: confusion(e, 'mlist4')
      }
      if (x !== 0) {
        const y = math_glue(e, e.equiv[glue_base + x]!, e.cur_mu)
        const z = new_glue(e, y); e.spec[y]!.glue_ref_count = 0; p.link = z; p = z
        z.subtype = x + 1 // store a symbolic subtype
      }
    }
    // §767 Append any new_hlist entries for q, and any appropriate penalties
    if (q.new_hlist !== null) {
      p.link = q.new_hlist
      do p = p.link!; while (p.link !== null)
    }
    if (penalties && q.link !== null && pen < inf_penalty) {
      r_type = q.link.type
      if (r_type !== penalty_node && r_type !== rel_noad) { const z = new_penalty(pen); p.link = z; p = z }
    }
    if (q.type === right_noad) t = open_noad
    r_type = t
    q = q.link // delete_q
  }
  return head.link
}
