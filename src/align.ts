// §768–812 alignment; §1126–1131 and §1206 its main_control and display pieces
import type { Engine } from './engine.ts'
import { Cmd, vmode, hmode, mmode, glue_val, frozen_end_template, frozen_cr } from './types.ts'
import { print, print_esc } from './print.ts'
import { error, print_err, help, confusion, fatal_error, token_list, u_template, v_template } from './error.ts'
import { int_par, glue_base, dimen_base, local_base, eq_define, geq_define, new_save_level, unsave } from './eqtb.ts'
import { get_avail, flush_list, flush_node_list, new_null_box, new_glue, new_param_glue, new_penalty, add_glue_ref,
  delete_glue_ref, zero_glue, is_char_node, hlist_node, vlist_node, rule_node, unset_node, normal, fil, fill, filll, stretching,
  shrinking, null_flag, hold_head, omit_template, new_char } from './nodes.ts'
import type { Node, BoxNode, GlueNode, RuleNode } from './nodes.ts'
import { cs_token_flag } from './tokens.ts'
import { get_token, back_input, back_error, ins_error, begin_token_list, aligning } from './input.ts'
import { expand, get_x_or_protected } from './expand.ts'
import { scan_optional_equals, scan_glue, scan_left_brace } from './scan.ts'
import { hpack, vpack, vpackage, append_to_vlist, scan_spec, saved, additional } from './pack.ts'
import { push_nest, pop_nest, tail_append, normal_paragraph, end_graf, off_save, do_assignments, check_that_another_dollar_follows,
  resume_after_display, build_page, align_group, no_align_group } from './main.ts'
import { flush_math } from './math.ts'

// §769 an alignrecord is a null box whose info is its span list; u_part/v_part are token lists, extra_info the template's end
export type AlignRecord = BoxNode & { info: Span, u_part: number, v_part: number, extra_info: number }
// §797 a span node; span_n is TeX's link field (columns spanned minus one), info the next span node or end_span
export type Span = { span_n: number, width: number, info: Span }
// §772 the alignment stack entries
export type AlignState = { cur_align: AlignRecord | null, preamble: Node | null, cur_span: AlignRecord | null, cur_loop: Node | null,
  align_state: number, cur_head: Node | null, cur_tail: Node | null, cur_pre_head: Node | null, cur_pre_tail: Node | null }

export const span_code = 256, cr_code = 257, cr_cr_code = 258 // §780
const end_template_token = cs_token_flag + frozen_end_template
const max_quarterword = 255
// §797 link(end_span)=max_quarterword+1; info(end_span) is set transiently in §803 (to an alignrecord)
const end_span: Span = { span_n: max_quarterword + 1, width: 0, info: null as unknown as Span }
const tab_skip_code = 11, global_defs_code = 43, every_cr_loc = local_base + 8, every_cr_text = 13
const above_display_skip_code = 3, below_display_skip_code = 4, pre_display_penalty_code = 11, post_display_penalty_code = 12
const display_indent_code = 15, overfull_rule_code = 16, pdf_ignored_dimen_code = 32
const rec = (p: Node | null) => p as AlignRecord
const glue = (p: Node | null) => p as GlueNode

// §772 push_alignment
function push_alignment(e: Engine): void {
  e.align_stack.push({ cur_align: e.cur_align, preamble: e.align_head.link, cur_span: e.cur_span, cur_loop: e.cur_loop,
    align_state: e.align_state, cur_head: e.cur_head, cur_tail: e.cur_tail, cur_pre_head: e.cur_pre_head, cur_pre_tail: e.cur_pre_tail })
  e.cur_head = new_char(0, 0); e.cur_pre_head = new_char(0, 0)
}

// §772 pop_alignment
function pop_alignment(e: Engine): void {
  const p = e.align_stack.pop()!
  e.cur_tail = p.cur_tail; e.cur_head = p.cur_head; e.cur_pre_tail = p.cur_pre_tail; e.cur_pre_head = p.cur_pre_head
  e.align_state = p.align_state; e.cur_loop = p.cur_loop; e.cur_span = p.cur_span; e.align_head.link = p.preamble
  e.cur_align = p.cur_align
}

// §774 init_align
export function init_align(e: Engine): void {
  const save_cs_ptr = e.cur_cs
  push_alignment(e); e.align_state = -1000000
  if (e.mode === mmode && (e.tail !== e.head || e.incompleat_noad !== null)) { // §776
    print_err(e, 'Improper '); print_esc(e, 'halign'); print(e, " inside $$'s")
    help(e, 'Displays can use special alignments (like \\eqalignno)', "only if nothing but the alignment itself is between $$'s.",
      "So I've deleted the formulas that preceded this alignment.")
    error(e); flush_math(e)
  }
  push_nest(e)
  // §775 Change current mode to -vmode for \halign, -hmode for \valign
  if (e.mode === mmode) { e.mode = -vmode; e.prev_depth = e.nest[e.nest_ptr - 2]!.prev_depth }
  else if (e.mode > 0) e.mode = -e.mode
  scan_spec(e, align_group, false)
  // §777 Scan the preamble and record it in the preamble list
  e.align_head.link = null; let cur_align: Node = e.align_head; e.cur_loop = null; e.scanner_status = aligning
  e.warning_index = save_cs_ptr; e.align_state = -1000000
  for (;;) {
    cur_align.link = new_param_glue(e, tab_skip_code); cur_align = cur_align.link // §778
    if (e.cur_cmd === Cmd.car_ret) break
    // §779 Scan preamble text until cur_cmd is tab_mark or car_ret, looking for changes in the tabskip glue; append an alignrecord
    // §783 Scan the template <u_j>, putting the resulting token list in hold_head
    let p = hold_head; e.link[p] = 0
    for (;;) {
      get_preamble_token(e)
      if (e.cur_cmd === Cmd.mac_param) break
      if (e.cur_cmd <= Cmd.car_ret && e.cur_cmd >= Cmd.tab_mark && e.align_state === -1000000) {
        if (p === hold_head && e.cur_loop === null && e.cur_cmd === Cmd.tab_mark) e.cur_loop = cur_align
        else {
          print_err(e, 'Missing # inserted in alignment preamble')
          help(e, "There should be exactly one # between &'s, when an", '\\halign or \\valign is being set up. In this case you had',
            "none, so I've put one in; maybe that will work.")
          back_error(e); break
        }
      } else if (e.cur_cmd !== Cmd.spacer || p !== hold_head) { e.link[p] = get_avail(e); p = e.link[p]!; e.info[p] = e.cur_tok }
    }
    const r = new_null_box() as AlignRecord
    r.info = end_span; r.width = null_flag; r.u_part = e.link[hold_head]!; r.v_part = 0; r.extra_info = 0
    cur_align.link = r; cur_align = r
    // §784 Scan the template <v_j>, putting the resulting token list in hold_head
    p = hold_head; e.link[p] = 0
    for (;;) {
      get_preamble_token(e)
      if (e.cur_cmd <= Cmd.car_ret && e.cur_cmd >= Cmd.tab_mark && e.align_state === -1000000) break
      if (e.cur_cmd === Cmd.mac_param) {
        print_err(e, 'Only one # is allowed per tab')
        help(e, "There should be exactly one # between &'s, when an", '\\halign or \\valign is being set up. In this case you had',
          "more than one, so I'm ignoring all but the first.")
        error(e); continue
      }
      e.link[p] = get_avail(e); p = e.link[p]!; e.info[p] = e.cur_tok
    }
    e.link[p] = get_avail(e); p = e.link[p]!; e.info[p] = end_template_token
    r.v_part = e.link[hold_head]!
  }
  e.scanner_status = 0 // normal
  e.cur_align = rec(cur_align)
  new_save_level(e, align_group)
  if (e.equiv[every_cr_loc] !== 0) begin_token_list(e, e.equiv[every_cr_loc]!, every_cr_text)
  align_peek(e)
}

// §782 get_preamble_token
function get_preamble_token(e: Engine): void {
  for (;;) {
    get_token(e)
    while (e.cur_chr === span_code && e.cur_cmd === Cmd.tab_mark) {
      get_token(e)
      if (e.cur_cmd > Cmd.max_command) { expand(e); get_token(e) }
    }
    if (e.cur_cmd === Cmd.endv) fatal_error(e, '(interwoven alignment preambles are not allowed)')
    if (e.cur_cmd === Cmd.assign_glue && e.cur_chr === glue_base + tab_skip_code) {
      scan_optional_equals(e); scan_glue(e, glue_val)
      if (int_par(e, global_defs_code) > 0) geq_define(e, glue_base + tab_skip_code, Cmd.glue_ref, e.cur_val)
      else eq_define(e, glue_base + tab_skip_code, Cmd.glue_ref, e.cur_val)
      continue
    }
    return
  }
}

// §785 align_peek (etex.ch: get_x_or_protected)
export function align_peek(e: Engine): void {
  for (;;) {
    e.align_state = 1000000
    do get_x_or_protected(e); while (e.cur_cmd === Cmd.spacer)
    if (e.cur_cmd === Cmd.no_align) {
      scan_left_brace(e); new_save_level(e, no_align_group)
      if (e.mode === -vmode) normal_paragraph(e)
    } else if (e.cur_cmd === Cmd.right_brace) fin_align(e)
    else if (e.cur_cmd === Cmd.car_ret && e.cur_chr === cr_cr_code) continue
    else { init_row(e); init_col(e) }
    return
  }
}

// §786 init_row
function init_row(e: Engine): void {
  push_nest(e); e.mode = (-hmode - vmode) - e.mode
  if (e.mode === -hmode) e.space_factor = 0; else e.prev_depth = 0
  const g = new_glue(e, glue(e.align_head.link).glue_ptr); g.subtype = tab_skip_code + 1; tail_append(e, g)
  e.cur_align = rec(e.align_head.link!.link); e.cur_tail = e.cur_head; e.cur_pre_tail = e.cur_pre_head
  init_span(e, e.cur_align)
}

// §787 init_span
function init_span(e: Engine, p: AlignRecord): void {
  push_nest(e)
  if (e.mode === -hmode) e.space_factor = 1000
  else { e.prev_depth = e.equiv[dimen_base + pdf_ignored_dimen_code]!; normal_paragraph(e) }
  e.cur_span = p
}

// §788 init_col
function init_col(e: Engine): void {
  const a = e.cur_align!
  a.extra_info = e.cur_cmd
  if (e.cur_cmd === Cmd.omit) e.align_state = 0
  else { back_input(e); begin_token_list(e, a.u_part, u_template) }
}

// §789 Insert the <v_j> template and goto restart (called by get_next)
export function insert_v_template(e: Engine): void {
  if (e.scanner_status === aligning || e.cur_align === null) fatal_error(e, '(interwoven alignment preambles are not allowed)')
  const a = e.cur_align
  e.cur_cmd = a.extra_info; a.extra_info = e.cur_chr
  if (e.cur_cmd === Cmd.omit) begin_token_list(e, omit_template, v_template)
  else begin_token_list(e, a.v_part, v_template)
  e.align_state = 1000000
}

// §659, §665 the highest order of infinity with a nonzero total
const order = (t: number[]) => t[filll] !== 0 ? filll : t[fill] !== 0 ? fill : t[fil] !== 0 ? fil : normal

// §791 fin_col
function fin_col(e: Engine): boolean {
  if (e.cur_align === null) confusion(e, 'endv')
  let q: Node | null = e.cur_align.link
  if (q === null) confusion(e, 'endv')
  if (e.align_state < 500000) fatal_error(e, '(interwoven alignment preambles are not allowed)')
  let p = rec(q.link)
  // §792 If the preamble list has been traversed, check that the row has ended
  if (p === null && e.cur_align.extra_info < cr_code) {
    if (e.cur_loop !== null) { // §793 Lengthen the preamble periodically
      p = new_null_box() as AlignRecord; q.link = p
      p.info = end_span; p.width = null_flag; p.extra_info = 0; e.cur_loop = e.cur_loop.link!
      // §794 Copy the templates from node cur_loop into node p
      const cl = rec(e.cur_loop)
      let t = hold_head, r = cl.u_part
      while (r !== 0) { e.link[t] = get_avail(e); t = e.link[t]!; e.info[t] = e.info[r]!; r = e.link[r]! }
      e.link[t] = 0; p.u_part = e.link[hold_head]!
      t = hold_head; r = cl.v_part
      while (r !== 0) { e.link[t] = get_avail(e); t = e.link[t]!; e.info[t] = e.info[r]!; r = e.link[r]! }
      e.link[t] = 0; p.v_part = e.link[hold_head]!
      e.cur_loop = e.cur_loop.link!
      const g = new_glue(e, glue(e.cur_loop).glue_ptr); g.subtype = tab_skip_code + 1; p.link = g
    } else {
      print_err(e, 'Extra alignment tab has been changed to '); print_esc(e, 'cr')
      help(e, 'You have given more \\span or & marks than there were', 'in the preamble to the \\halign or \\valign now in progress.',
        "So I'll assume that you meant to type \\cr instead.")
      e.cur_align.extra_info = cr_code; error(e)
    }
  }
  if (e.cur_align.extra_info !== span_code) {
    unsave(e); new_save_level(e, align_group)
    // §796 Package an unset box for the current column and record its width
    let u: BoxNode, w: number
    if (e.mode === -hmode) {
      e.adjust_tail = e.cur_tail; e.pre_adjust_tail = e.cur_pre_tail
      u = hpack(e, e.head.link, 0, additional); w = u.width
      e.cur_tail = e.adjust_tail; e.adjust_tail = null
      e.cur_pre_tail = e.pre_adjust_tail; e.pre_adjust_tail = null
    } else { u = vpackage(e, e.head.link, 0, additional, 0); w = u.height }
    let n = 0
    if (e.cur_span !== e.cur_align) { // §798 Update width entry for spanned columns
      let s: Node = e.cur_span!
      do { n++; s = s.link!.link! } while (s !== e.cur_align)
      if (n > max_quarterword) confusion(e, '256 spans')
      let t: Span = e.cur_span! as unknown as Span
      while (t.info.span_n < n) t = t.info
      if (t.info.span_n > n) { const s2: Span = { span_n: n, width: w, info: t.info }; t.info = s2 }
      else if (t.info.width < w) t.info.width = w
    } else if (w > e.cur_align.width) e.cur_align.width = w
    u.type = unset_node; u.subtype = n
    let o = order(e.total_stretch)
    u.glue_order = o; u.glue_set = e.total_stretch[o]!
    o = order(e.total_shrink)
    u.glue_sign = o; u.shift_amount = e.total_shrink[o]!
    pop_nest(e); e.tail.link = u; e.tail = u
    // §795 Copy the tabskip glue between columns
    const g = new_glue(e, glue(e.cur_align.link).glue_ptr); g.subtype = tab_skip_code + 1; tail_append(e, g)
    if (e.cur_align.extra_info >= cr_code) return true
    init_span(e, p)
  }
  e.align_state = 1000000
  do get_x_or_protected(e); while (e.cur_cmd === Cmd.spacer)
  e.cur_align = p
  init_col(e); return false
}

// §799 fin_row
function fin_row(e: Engine): void {
  let p: BoxNode
  if (e.mode === -hmode) {
    p = hpack(e, e.head.link, 0, additional)
    pop_nest(e)
    if (e.cur_pre_head !== e.cur_pre_tail) { e.tail.link = e.cur_pre_head!.link; e.tail = e.cur_pre_tail! }
    append_to_vlist(e, p)
    if (e.cur_head !== e.cur_tail) { e.tail.link = e.cur_head!.link; e.tail = e.cur_tail! }
  } else {
    p = vpack(e, e.head.link, 0, additional); pop_nest(e)
    e.tail.link = p; e.tail = p; e.space_factor = 1000
  }
  p.type = unset_node; p.glue_set = 0
  if (e.equiv[every_cr_loc] !== 0) begin_token_list(e, e.equiv[every_cr_loc]!, every_cr_text)
  align_peek(e)
}

// §800 fin_align
function fin_align(e: Engine): void {
  if (e.cur_group !== align_group) confusion(e, 'align1')
  unsave(e)
  if (e.cur_group !== align_group) confusion(e, 'align0')
  unsave(e)
  const o = e.nest[e.nest_ptr - 1]!.mode === mmode ? e.equiv[dimen_base + display_indent_code]! : 0
  // §801 Go through the preamble list, determining the column widths and changing the alignrecords to dummy unset boxes
  let q = rec(e.align_head.link!.link)
  do {
    flush_list(e, q.u_part); flush_list(e, q.v_part)
    const p = rec(q.link!.link)
    if (q.width === null_flag) { // §802 Nullify width(q) and the tabskip glue following this column
      q.width = 0; const r = glue(q.link), s = r.glue_ptr
      if (s !== zero_glue) { add_glue_ref(e, zero_glue); delete_glue_ref(e, s); r.glue_ptr = zero_glue }
    }
    if (q.info !== end_span) { // §803 Merge the widths in the span nodes of q with those of p, destroying the span nodes of q
      const t = (q.width + e.spec[glue(q.link).glue_ptr]!.width) | 0
      let r = q.info, s: Span = end_span, n = 1
      s.info = p as unknown as Span
      do {
        r.width = (r.width - t) | 0; const u = r.info
        while (r.span_n > n) { s = s.info; n = s.info.span_n + 1 }
        if (r.span_n < n) { r.info = s.info; s.info = r; r.span_n--; s = r }
        else if (r.width > s.info.width) s.info.width = r.width
        r = u
      } while (r !== end_span)
    }
    q.type = unset_node; q.subtype = 0; q.height = 0; q.depth = 0; q.glue_order = normal; q.glue_sign = normal
    q.glue_set = 0; q.shift_amount = 0; q = p
  } while (q !== null)
  // §804 Package the preamble list, to determine the actual tabskip glue amounts, and let p point to this prototype box
  e.save_ptr -= 2; e.pack_begin_line = -e.mode_line
  let p: BoxNode
  if (e.mode === -vmode) {
    const rule_save = e.equiv[dimen_base + overfull_rule_code]!
    e.equiv[dimen_base + overfull_rule_code] = 0
    p = hpack(e, e.align_head.link, saved(e, 1), saved(e, 0)); e.equiv[dimen_base + overfull_rule_code] = rule_save
  } else {
    let r = rec(e.align_head.link!.link)
    do { r.height = r.width; r.width = 0; r = rec(r.link!.link) } while (r !== null)
    p = vpack(e, e.align_head.link, saved(e, 1), saved(e, 0))
    r = rec(e.align_head.link!.link)
    do { r.width = r.height; r.height = 0; r = rec(r.link!.link) } while (r !== null)
  }
  e.pack_begin_line = 0
  // §805 Set the glue in all the unset boxes of the current list
  let qq = e.head.link, s: Node = e.head
  while (qq !== null) {
    if (!is_char_node(qq)) {
      if (qq.type === unset_node) set_unset_row(e, qq, p, o)
      else if (qq.type === rule_node) { // §806 Make the running dimensions in rule q extend to the boundaries of the alignment
        const ru = qq as RuleNode
        if (ru.width === null_flag) ru.width = p.width
        if (ru.height === null_flag) ru.height = p.height
        if (ru.depth === null_flag) ru.depth = p.depth
        if (o !== 0) {
          const r = qq.link; qq.link = null; const b = hpack(e, qq, 0, additional)
          b.shift_amount = o; b.link = r; s.link = b; qq = b
        }
      }
    }
    s = qq; qq = qq.link
  }
  flush_node_list(e, p); pop_alignment(e)
  // §812 Insert the current list into its environment
  const prev_depth = e.prev_depth, space_factor = e.space_factor, clang = e.clang
  const pp = e.head.link, qt = e.tail
  pop_nest(e)
  if (e.mode === mmode) finish_display_alignment(e, pp, qt, prev_depth)
  else {
    e.prev_depth = prev_depth; e.space_factor = space_factor; e.clang = clang
    e.tail.link = pp
    if (pp !== null) e.tail = qt
    if (e.mode === vmode) build_page(e)
  }
}

// §807 Set the unset box q and the unset boxes in it
function set_unset_row(e: Engine, q: BoxNode, p: BoxNode, o: number): void {
  if (e.mode === -vmode) {
    q.type = hlist_node; q.width = p.width
    if (e.nest[e.nest_ptr - 1]!.mode === mmode) q.subtype = 2 // set_box_lr(q)(dlist)
  } else { q.type = vlist_node; q.height = p.height }
  q.glue_order = p.glue_order; q.glue_sign = p.glue_sign; q.glue_set = p.glue_set; q.shift_amount = o
  let r = q.list_ptr!.link as BoxNode | null, s = p.list_ptr!.link as Node
  do {
    // §808 Set the glue in node r and change it from an unset node
    let n = r!.subtype, t = (s as BoxNode).width
    const w = t
    let u: Node = new_char(0, 0); const head = u // hold_head
    r!.subtype = 0 // set_box_lr(r)(0)
    while (n > 0) {
      n--
      // §809 Append tabskip glue and an empty box to list u, and update s and t as the prototype nodes are passed
      s = s.link!; const v = (s as GlueNode).glue_ptr; const g = new_glue(e, v); u.link = g; u = g
      g.subtype = tab_skip_code + 1; const vs = e.spec[v]!; t = (t + vs.width) | 0
      if (p.glue_sign === stretching) { if (vs.stretch_order === p.glue_order) t = (t + Math.round(p.glue_set * vs.stretch)) | 0 }
      else if (p.glue_sign === shrinking) { if (vs.shrink_order === p.glue_order) t = (t - Math.round(p.glue_set * vs.shrink)) | 0 }
      s = s.link!; const b = new_null_box(); u.link = b; u = b; t = (t + (s as BoxNode).width) | 0
      if (e.mode === -vmode) b.width = (s as BoxNode).width
      else { b.type = vlist_node; b.height = (s as BoxNode).width }
    }
    const rr = r!
    if (e.mode === -vmode) { // §810 Make the unset node r into an hlist_node of width w, setting the glue as if the width were t
      rr.height = q.height; rr.depth = q.depth
      set_glue(rr, t, rr.width)
      rr.width = w; rr.type = hlist_node
    } else { // §811 Make the unset node r into a vlist_node of height w, setting the glue as if the height were t
      rr.width = q.width
      set_glue(rr, t, rr.height)
      rr.height = w; rr.type = vlist_node
    }
    rr.shift_amount = 0
    let last: Node = rr
    if (u !== head) { u.link = rr.link; rr.link = head.link; last = u }
    r = last.link!.link as BoxNode | null; s = s.link!.link!
  } while (r !== null)
}

// §810–811 glue setting of an unset node r of natural size x (stretch in glue_set, shrink in shift_amount) to size t
function set_glue(r: BoxNode, t: number, x: number): void {
  if (t === x) { r.glue_sign = normal; r.glue_order = normal; r.glue_set = 0 }
  else if (t > x) {
    r.glue_sign = stretching
    r.glue_set = r.glue_set === 0 ? 0 : (t - x) / r.glue_set
  } else {
    r.glue_order = r.glue_sign; r.glue_sign = shrinking
    if (r.shift_amount === 0) r.glue_set = 0
    else if (r.glue_order === normal && x - t > r.shift_amount) r.glue_set = 1
    else r.glue_set = (x - t) / r.shift_amount
  }
}

// §1206 Finish an alignment in a display
function finish_display_alignment(e: Engine, p: Node | null, q: Node, aux_save: number): void {
  do_assignments(e)
  if (e.cur_cmd !== Cmd.math_shift) { // §1207 Pontificate about improper alignment in display
    print_err(e, 'Missing $$ inserted')
    help(e, 'Displays can use special alignments (like \\eqalignno)', "only if nothing but the alignment itself is between $$'s.")
    back_error(e)
  } else check_that_another_dollar_follows(e)
  flush_node_list(e, e.eTeX_aux) // LR_box
  pop_nest(e)
  tail_append(e, new_penalty(int_par(e, pre_display_penalty_code)))
  tail_append(e, new_param_glue(e, above_display_skip_code))
  e.tail.link = p
  if (p !== null) e.tail = q
  tail_append(e, new_penalty(int_par(e, post_display_penalty_code)))
  tail_append(e, new_param_glue(e, below_display_skip_code))
  e.prev_depth = aux_save; resume_after_display(e)
}

// §1129 no_align_error, omit_error
export function no_align_error(e: Engine): void {
  print_err(e, 'Misplaced '); print_esc(e, 'noalign')
  help(e, 'I expect to see \\noalign only after the \\cr of', "an alignment. Proceed, and I'll ignore this case."); error(e)
}
export function omit_error(e: Engine): void {
  print_err(e, 'Misplaced '); print_esc(e, 'omit')
  help(e, 'I expect to see \\omit only after tab marks or the \\cr of', "an alignment. Proceed, and I'll ignore this case."); error(e)
}

// §1131 do_endv
export function do_endv(e: Engine): void {
  e.base_ptr = e.input_ptr; e.input_stack[e.base_ptr] = e.cur_input
  const at = (k: number) => e.input_stack[k]!
  while (at(e.base_ptr).index !== v_template && at(e.base_ptr).loc === 0 && at(e.base_ptr).state === token_list) e.base_ptr--
  if (at(e.base_ptr).index !== v_template || at(e.base_ptr).loc !== 0 || at(e.base_ptr).state !== token_list)
    fatal_error(e, '(interwoven alignment preambles are not allowed)')
  if (e.cur_group === align_group) {
    end_graf(e)
    if (fin_col(e)) fin_row(e)
  } else off_save(e)
}

// §1132 align_group and no_align_group cases of handle_right_brace
export function align_group_right_brace(e: Engine): void {
  back_input(e); e.cur_tok = cs_token_flag + frozen_cr
  print_err(e, 'Missing '); print_esc(e, 'cr'); print(e, ' inserted')
  help(e, "I'm guessing that you meant to end an alignment here.")
  ins_error(e)
}
export function no_align_group_right_brace(e: Engine): void {
  end_graf(e); unsave(e); align_peek(e)
}
