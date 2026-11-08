// §967–979 breaking vertical lists into pages (prune_page_top, vert_break, vsplit), §980–1028 the page builder,
// §1054 its_all_over (pdftex.web; e-TeX's \marks classes, \pagediscards and \splitdiscards are inactive outside e-TeX mode)
import type { Engine } from './engine.ts'
import { do_marks, vsplit_init, fire_up_init, fire_up_done, find_sa_element, sa, mark_val, saving_vdiscards_code } from './etex.ts'
import type { MarkNode } from './nodes.ts'
import { last_box_code, copy_code, vsplit_code } from './main.ts'
import { vmode } from './types.ts'
import { print, print_char, print_esc, print_int, print_nl, print_ln, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_scaled, badness, x_over_n, inf_bad } from './arith.ts'
import { error, print_err, help, confusion, output_text, backed_up, token_list } from './error.ts'
import { int_par, int_base, dimen_base, glue_base, count_base, scaled_base, skip_base, geq_word_define, output_routine_loc,
  new_save_level, unsave } from './eqtb.ts'
import { new_skip_param, new_spec, delete_glue_ref, add_glue_ref, add_token_ref, delete_token_ref, flush_node_list, show_box, box,
  change_box, new_null_box, new_glue, new_penalty, fill_glue, hlist_node, vlist_node, rule_node, ins_node, mark_node,
  whatsit_node, glue_node, kern_node, penalty_node, math_node, normal, inf_penalty, eject_penalty, new_char } from './nodes.ts'
import type { Node, BoxNode, InsNode } from './nodes.ts'
import { vpack, vpackage, exactly, additional, max_dimen } from './pack.ts'
import { push_nest, pop_nest, normal_paragraph, end_graf, privileged, tail_append, output_group } from './main.ts'
import { ship_out } from './dvi.ts'
import { begin_token_list, end_token_list, get_token, back_input } from './input.ts'
import { scan_left_brace } from './scan.ts'

const awful_bad = 0o7777777777, deplorable = 100000, max_halfword = 0o17777777777
const empty = 0, inserts_only = 1, box_there = 2 // §980
const inserting = 0, split_up = 1 // §981
const tracing_pages_code = 33, output_penalty_code = 39, max_dead_cycles_code = 40, holding_inserts_code = 53,
  vbadness_code = 27, vsize_code = 4, max_depth_code = 5, split_max_depth_code = 6, vfuzz_code = 9, hsize_code = 3,
  pdf_ignored_dimen_code = 32, split_top_skip_code = 10, top_skip_code = 9
export const top_mark_code = 0, first_mark_code = 1, bot_mark_code = 2, split_first_mark_code = 3, split_bot_mark_code = 4 // §382

// §981 a page insertion node; page_ins_head is the sentinel with subtype 255
export type PageIns = { type: number, subtype: number, link: PageIns, height: number, broken_ptr: Node | null,
  broken_ins: InsNode | null, last_ins_ptr: Node | null, best_ins_ptr: Node | null }
export function new_page_ins_head(): PageIns {
  const h = { type: split_up, subtype: 255, height: 0, broken_ptr: null, broken_ins: null, last_ins_ptr: null, best_ins_ptr: null } as unknown as PageIns
  h.link = h
  return h
}

const count = (e: Engine, n: number) => e.equiv[count_base + n]!
const dimen = (e: Engine, n: number) => e.equiv[scaled_base + n]!
const precedes_break = (p: Node) => p.type < math_node // §148
// box(n)+list_offset: a pseudo node whose link is the box's list
const list_head = (b: BoxNode): Node => ({ get link() { return b.list_ptr }, set link(v: Node | null) { b.list_ptr = v } }) as unknown as Node

// §968 prune_page_top (etex.ch: with s the discarded nodes go to split_disc)
export function prune_page_top(e: Engine, p: Node | null, s: boolean): Node | null {
  const temp_head = new_char(0, 0)
  let prev_p: Node = temp_head, r: Node | null = null
  temp_head.link = p
  while (p !== null) {
    switch (p.type) {
      case hlist_node: case vlist_node: case rule_node: { // §969 Insert glue for split_top_skip and set p:=null
        const q = new_skip_param(e, split_top_skip_code); prev_p.link = q; q.link = p
        const g = e.spec[e.temp_ptr]!
        if (g.width > p.height) g.width = (g.width - p.height) | 0; else g.width = 0
        p = null
        break
      }
      case whatsit_node: case mark_node: case ins_node: prev_p = p; p = prev_p.link; break
      case glue_node: case kern_node: case penalty_node: {
        const q: Node = p
        p = q.link; q.link = null; prev_p.link = p
        if (s) { if (e.disc_ptr[vsplit_code] === null) e.disc_ptr[vsplit_code] = q; else r!.link = q; r = q }
        else flush_node_list(e, q)
        break
      }
      default: confusion(e, 'pruning')
    }
  }
  return temp_head.link
}

// §970 vert_break
export function vert_break(e: Engine, p: Node | null, h: number, d: number): Node | null {
  let prev_p: Node | null = p, least_cost = awful_bad, best_place: Node | null = null, prev_dp = 0, pi = 0, b: number
  const active_height = [0, 0, 0, 0, 0, 0, 0]
  for (;;) {
    // §972 If node p is a legal breakpoint, check if this break is the best known, and goto done if p is null or if the
    // page-so-far is already too full to accept more stuff
    let update = false, legal = true
    if (p === null) pi = eject_penalty
    else switch (p.type) { // §973
      case hlist_node: case vlist_node: case rule_node:
        active_height[1] = (active_height[1]! + prev_dp + p.height) | 0; prev_dp = p.depth; legal = false; break
      case whatsit_node: legal = false; break // §1365
      case glue_node: if (precedes_break(prev_p!)) pi = 0; else { legal = false; update = true } break
      case kern_node: {
        const t = p.link === null ? penalty_node : p.link.type
        if (t === glue_node) pi = 0; else { legal = false; update = true }
        break
      }
      case penalty_node: pi = p.penalty; break
      case mark_node: case ins_node: legal = false; break
      default: confusion(e, 'vertbreak')
    }
    if (legal) {
      // §974 Check if node p is a new champion breakpoint; then goto done if p is a forced break or if the page-so-far is
      // already too full
      if (pi < inf_penalty) {
        const cur_height = active_height[1]! // §975 Compute the badness, b, using awful_bad if the box is too full
        if (cur_height < h) {
          if (active_height[3] !== 0 || active_height[4] !== 0 || active_height[5] !== 0) b = 0
          else b = badness((h - cur_height) | 0, active_height[2]!)
        } else if (((cur_height - h) | 0) > active_height[6]!) b = awful_bad
        else b = badness((cur_height - h) | 0, active_height[6]!)
        if (b < awful_bad) {
          if (pi <= eject_penalty) b = pi
          else if (b < inf_bad) b = (b + pi) | 0
          else b = deplorable
        }
        if (b <= least_cost) { best_place = p; least_cost = b; e.best_height_plus_depth = (cur_height + prev_dp) | 0 }
        if (b === awful_bad || pi <= eject_penalty) return best_place
      }
      if (p!.type < glue_node || p!.type > kern_node) update = false
      else update = true
    }
    if (update) { // §976 Update the current height and depth measurements with respect to a glue or kern node p
      let w: number
      if (p!.type === kern_node) w = (p as Node & { width: number }).width
      else {
        const gp = p as Node & { glue_ptr: number }
        let q = e.spec[gp.glue_ptr]!
        active_height[2 + q.stretch_order] = (active_height[2 + q.stretch_order]! + q.stretch) | 0
        active_height[6] = (active_height[6]! + q.shrink) | 0
        if (q.shrink_order !== normal && q.shrink !== 0) {
          print_err(e, 'Infinite glue shrinkage found in box being split')
          help(e, 'The box you are \\vsplitting contains some infinitely', "shrinkable glue, e.g., `\\vss' or `\\vskip 0pt minus 1fil'.",
            "Such glue doesn't belong there; but you can safely proceed,", 'since the offensive shrinkability has been made finite.')
          error(e)
          const r = new_spec(e, gp.glue_ptr); e.spec[r]!.shrink_order = normal; delete_glue_ref(e, gp.glue_ptr)
          gp.glue_ptr = r; q = e.spec[r]!
        }
        w = q.width
      }
      active_height[1] = (active_height[1]! + prev_dp + w) | 0; prev_dp = 0
    }
    if (prev_dp > d) { active_height[1] = (active_height[1]! + prev_dp - d) | 0; prev_dp = d } // not_found
    prev_p = p; p = prev_p!.link
  }
}

// §977 vsplit
export function vsplit(e: Engine, n: number, h: number): BoxNode | null {
  e.cur_val = n
  const v = box(e, n)
  flush_node_list(e, e.disc_ptr[vsplit_code]!); e.disc_ptr[vsplit_code] = null // etex.ch
  do_marks(e, vsplit_init)
  if (e.cur_mark[split_first_mark_code] !== 0) {
    delete_token_ref(e, e.cur_mark[split_first_mark_code]!); e.cur_mark[split_first_mark_code] = 0
    delete_token_ref(e, e.cur_mark[split_bot_mark_code]!); e.cur_mark[split_bot_mark_code] = 0
  }
  // §978 Dispense with trivial cases of void or bad boxes
  if (v === null) return null
  if (v.type !== vlist_node) {
    print_err(e, ''); print_esc(e, 'vsplit'); print(e, ' needs a '); print_esc(e, 'vbox')
    help(e, 'The box you are trying to split is an \\hbox.', "I can't split such a box, so I'll leave it alone.")
    error(e); return null
  }
  const smd = e.equiv[dimen_base + split_max_depth_code]!
  let q = vert_break(e, v.list_ptr, h, smd)
  // §979 Look at all the marks in nodes before the break, and set the final link to null at the break
  let p = v.list_ptr!
  if (p === q) v.list_ptr = null
  else for (;;) {
    if (p.type === mark_node && p.mark_class !== 0) { // etex.ch Update the current marks for vsplit
      const m = sa(e, find_sa_element(e, mark_val, p.mark_class, true)).mark
      if (m[3] === 0) { m[3] = p.mark_ptr; add_token_ref(e, p.mark_ptr) }
      else delete_token_ref(e, m[4]!)
      m[4] = p.mark_ptr; add_token_ref(e, p.mark_ptr)
    } else if (p.type === mark_node) {
      if (e.cur_mark[split_first_mark_code] === 0) {
        e.cur_mark[split_first_mark_code] = p.mark_ptr; e.cur_mark[split_bot_mark_code] = p.mark_ptr
        e.info[p.mark_ptr]! += 2
      } else {
        delete_token_ref(e, e.cur_mark[split_bot_mark_code]!)
        e.cur_mark[split_bot_mark_code] = p.mark_ptr; add_token_ref(e, p.mark_ptr)
      }
    }
    if (p.link === q) { p.link = null; break }
    p = p.link!
  }
  q = prune_page_top(e, q, int_par(e, saving_vdiscards_code) > 0)
  const l = v.list_ptr
  if (q !== null) q = vpack(e, q, 0, additional)
  change_box(e, n, q)
  return vpackage(e, l, h, exactly, smd)
}

// §985 print_totals
export function print_totals(e: Engine): void {
  const s = e.page_so_far
  print_scaled(e, s[1]!)
  const plus = (i: number, u: string) => { if (s[i] !== 0) { print(e, ' plus '); print_scaled(e, s[i]!); print(e, u) } }
  plus(2, ''); plus(3, 'fil'); plus(4, 'fill'); plus(5, 'filll')
  if (s[6] !== 0) { print(e, ' minus '); print_scaled(e, s[6]!) }
}

// §986 Show the status of the current page
export function show_page_status(e: Engine): void {
  if (e.page_head === e.page_tail) return
  print_nl(e, '### current page:')
  if (e.output_active) print(e, ' (held over for next output)')
  show_box(e, e.page_head.link)
  if (e.page_contents > empty) {
    print_nl(e, 'total height '); print_totals(e)
    print_nl(e, ' goal height '); print_scaled(e, e.page_so_far[0]!)
    for (let r = e.page_ins_head.link; r !== e.page_ins_head; r = r.link) {
      print_ln(e); print_esc(e, 'insert'); let t = r.subtype
      print_int(e, t); print(e, ' adds ')
      if (count(e, t) === 1000) t = r.height
      else t = Math.imul(x_over_n(e, r.height, 1000), count(e, t))
      print_scaled(e, t)
      if (r.type === split_up) {
        let q: Node = e.page_head; t = 0
        do { q = q.link!; if (q.type === ins_node && q.subtype === r.subtype) t++ } while (q !== r.broken_ins)
        print(e, ', #'); print_int(e, t); print(e, ' might split')
      }
    }
  }
}

// §987 freeze_page_specs
function freeze_page_specs(e: Engine, s: number): void {
  e.page_contents = s
  e.page_so_far[0] = e.equiv[dimen_base + vsize_code]!; e.page_max_depth = e.equiv[dimen_base + max_depth_code]!
  e.page_so_far[7] = 0
  for (let k = 1; k <= 6; k++) e.page_so_far[k] = 0
  e.least_page_cost = awful_bad
  if (int_par(e, tracing_pages_code) > 0) {
    begin_diagnostic(e)
    print_nl(e, '%% goal height='); print_scaled(e, e.page_so_far[0]!)
    print(e, ', max depth='); print_scaled(e, e.page_max_depth)
    end_diagnostic(e, false)
  }
}

// §992 box_error
function box_error(e: Engine, n: number): void {
  error(e); begin_diagnostic(e)
  print_nl(e, 'The following box has been deleted:')
  show_box(e, box(e, n)); end_diagnostic(e, true)
  flush_node_list(e, box(e, n)); change_box(e, n, null)
}

// §993 ensure_vbox
function ensure_vbox(e: Engine, n: number): void {
  const p = box(e, n)
  if (p !== null && p.type === hlist_node) {
    print_err(e, 'Insertions can only be added to a vbox')
    help(e, "Tut tut: You're trying to \\insert into a", '\\box register that now contains an \\hbox.',
      "Proceed, and I'll discard its present contents.")
    box_error(e, n)
  }
}

// §991 Start a new current page
export function start_new_page(e: Engine): void {
  e.page_contents = empty; e.page_tail = e.page_head; e.page_head.link = null
  e.last_glue = max_halfword; e.last_penalty = 0; e.last_kern = 0; e.last_node_type = -1
  e.page_so_far[7] = 0; e.page_max_depth = 0
}

// §995 contrib_tail:=x (the tail of the contribution list is nest[0].tail when we are not in vertical mode)
const set_contrib_tail = (e: Engine, x: Node) => { if (e.nest_ptr === 0) e.tail = x; else e.nest[0]!.tail = x }

// §994 build_page
export function build_page(e: Engine): void {
  if (e.contrib_head.link === null || e.output_active) return
  const s = e.page_so_far
  do {
    const p: Node = e.contrib_head.link!
    // §996 Update the values of last_glue, last_penalty, and last_kern
    if (e.last_glue !== max_halfword) delete_glue_ref(e, e.last_glue)
    e.last_penalty = 0; e.last_kern = 0
    e.last_node_type = p.type + 1
    if (p.type === glue_node) { e.last_glue = p.glue_ptr; add_glue_ref(e, e.last_glue) }
    else {
      e.last_glue = max_halfword
      if (p.type === penalty_node) e.last_penalty = p.penalty
      else if (p.type === kern_node) e.last_kern = p.width
    }
    // §997 Move node p to the current page; if it is time for a page break, put the nodes following the break back onto
    // the contribution list, and return to the user's output routine if there is one
    // §1000 If the current page is empty and node p is to be deleted, goto done1; otherwise use node p to update the state
    // of the current page; ...
    let go: 'check' | 'contribute' | 'update' | 'done1' = 'check', pi = 0
    switch (p.type) {
      case hlist_node: case vlist_node: case rule_node:
        if (e.page_contents < box_there) { // §1001 Initialize the current page, insert the \topskip glue ahead of p
          if (e.page_contents === empty) freeze_page_specs(e, box_there); else e.page_contents = box_there
          const q = new_skip_param(e, top_skip_code), g = e.spec[e.temp_ptr]!
          if (g.width > p.height) g.width = (g.width - p.height) | 0; else g.width = 0
          q.link = p; e.contrib_head.link = q; continue
        }
        s[1] = (s[1]! + s[7]! + p.height) | 0; s[7] = p.depth; go = 'contribute' // §1002
        break
      case whatsit_node: go = 'contribute'; break // §1364
      case glue_node:
        if (e.page_contents < box_there) go = 'done1'
        else if (precedes_break(e.page_tail)) pi = 0
        else go = 'update'
        break
      case kern_node:
        if (e.page_contents < box_there) go = 'done1'
        else if (p.link === null) return
        else if (p.link.type === glue_node) pi = 0
        else go = 'update'
        break
      case penalty_node: if (e.page_contents < box_there) go = 'done1'; else pi = p.penalty; break
      case mark_node: go = 'contribute'; break
      case ins_node: append_insertion(e, p); go = 'contribute'; break
      default: confusion(e, 'page')
    }
    if (go === 'check') {
      // §1005 Check if node p is a new champion breakpoint; then if it is time for a page break, prepare for output, and
      // either fire up the user's output routine and return or ship out the page and goto done
      if (pi < inf_penalty) {
        let b: number, c: number
        // §1007 Compute the badness, b, of the current page, using awful_bad if the box is too full
        if (s[1]! < s[0]!) {
          if (s[3] !== 0 || s[4] !== 0 || s[5] !== 0) b = 0
          else b = badness((s[0]! - s[1]!) | 0, s[2]!)
        } else if (((s[1]! - s[0]!) | 0) > s[6]!) b = awful_bad
        else b = badness((s[1]! - s[0]!) | 0, s[6]!)
        if (b < awful_bad) {
          if (pi <= eject_penalty) c = pi
          else if (b < inf_bad) c = (b + pi + e.insert_penalties) | 0
          else c = deplorable
        } else c = b
        if (e.insert_penalties >= 10000) c = awful_bad
        if (int_par(e, tracing_pages_code) > 0) { // §1006 Display the page break cost
          begin_diagnostic(e); print_nl(e, '%')
          print(e, ' t='); print_totals(e)
          print(e, ' g='); print_scaled(e, s[0]!)
          print(e, ' b='); if (b === awful_bad) print_char(e, 42); else print_int(e, b)
          print(e, ' p='); print_int(e, pi)
          print(e, ' c='); if (c === awful_bad) print_char(e, 42); else print_int(e, c)
          if (c <= e.least_page_cost) print_char(e, 35)
          end_diagnostic(e, false)
        }
        if (c <= e.least_page_cost) {
          e.best_page_break = p; e.best_size = s[0]!; e.least_page_cost = c
          for (let r = e.page_ins_head.link; r !== e.page_ins_head; r = r.link) r.best_ins_ptr = r.last_ins_ptr
        }
        if (c === awful_bad || pi <= eject_penalty) {
          fire_up(e, p)
          if (e.output_active) return
          continue // goto done
        }
      }
      go = p.type < glue_node || p.type > kern_node ? 'contribute' : 'update'
    }
    if (go === 'update') { // §1004 Update the current page measurements with respect to the glue or kern specified by node p
      let w: number
      if (p.type === kern_node) w = p.width
      else {
        const gp = p as Node & { glue_ptr: number }
        let q = e.spec[gp.glue_ptr]!
        s[2 + q.stretch_order] = (s[2 + q.stretch_order]! + q.stretch) | 0
        s[6] = (s[6]! + q.shrink) | 0
        if (q.shrink_order !== normal && q.shrink !== 0) {
          print_err(e, 'Infinite glue shrinkage found on current page')
          help(e, 'The page about to be output contains some infinitely', "shrinkable glue, e.g., `\\vss' or `\\vskip 0pt minus 1fil'.",
            "Such glue doesn't belong there; but you can safely proceed,", 'since the offensive shrinkability has been made finite.')
          error(e)
          const r = new_spec(e, gp.glue_ptr); e.spec[r]!.shrink_order = normal; delete_glue_ref(e, gp.glue_ptr)
          gp.glue_ptr = r; q = e.spec[r]!
        }
        w = q.width
      }
      s[1] = (s[1]! + s[7]! + w) | 0; s[7] = 0
      go = 'contribute'
    }
    if (go === 'contribute') {
      // §1003 Make sure that page_max_depth is not exceeded
      if (s[7]! > e.page_max_depth) { s[1] = (s[1]! + s[7]! - e.page_max_depth) | 0; s[7] = e.page_max_depth }
      // §998 Link node p into the current page and goto done
      e.page_tail.link = p; e.page_tail = p
      e.contrib_head.link = p.link; p.link = null
      continue
    }
    // §999 Recycle node p
    e.contrib_head.link = p.link; p.link = null
    if (int_par(e, saving_vdiscards_code) > 0) { // etex.ch: page_disc, tail_page_disc
      if (e.disc_ptr[last_box_code] === null) e.disc_ptr[last_box_code] = p; else e.disc_ptr[copy_code]!.link = p
      e.disc_ptr[copy_code] = p
    } else flush_node_list(e, p)
  } while (e.contrib_head.link !== null)
  // §995 Make the contribution list empty by setting its tail to contrib_head
  set_contrib_tail(e, e.contrib_head)
}

// §1008 Append an insertion to the current page and goto contribute
function append_insertion(e: Engine, p: InsNode): void {
  const s = e.page_so_far
  if (e.page_contents === empty) freeze_page_specs(e, inserts_only)
  const n = p.subtype
  let r = e.page_ins_head
  while (n >= r.link.subtype) r = r.link
  if (r.subtype !== n) {
    // §1009 Create a page insertion node with subtype(r)=n, and include the glue correction for box n in the current page state
    const q: PageIns = { type: inserting, subtype: n, link: r.link, height: 0, broken_ptr: null, broken_ins: null, last_ins_ptr: null,
      best_ins_ptr: null }
    r.link = q; r = q
    ensure_vbox(e, n)
    const b = box(e, n)
    r.height = b === null ? 0 : (b.height + b.depth) | 0
    const g = e.spec[e.equiv[skip_base + n]!]!
    const h = count(e, n) === 1000 ? r.height : Math.imul(x_over_n(e, r.height, 1000), count(e, n))
    s[0] = (s[0]! - h - g.width) | 0
    s[2 + g.stretch_order] = (s[2 + g.stretch_order]! + g.stretch) | 0
    s[6] = (s[6]! + g.shrink) | 0
    if (g.shrink_order !== normal && g.shrink !== 0) {
      print_err(e, 'Infinite glue shrinkage inserted from '); print_esc(e, 'skip'); print_int(e, n)
      help(e, 'The correction glue for page breaking with insertions', 'must have finite shrinkability. But you may proceed,',
        'since the offensive shrinkability has been made finite.')
      error(e)
    }
  }
  if (r.type === split_up) e.insert_penalties = (e.insert_penalties + p.float_cost) | 0
  else {
    r.last_ins_ptr = p
    const delta = (s[0]! - s[1]! - s[7]! + s[6]!) | 0
    const h = count(e, n) === 1000 ? p.height : Math.imul(x_over_n(e, p.height, 1000), count(e, n))
    if ((h <= 0 || h <= delta) && ((p.height + r.height) | 0) <= dimen(e, n)) { s[0] = (s[0]! - h) | 0; r.height = (r.height + p.height) | 0 }
    else {
      // §1010 Find the best way to split the insertion, and change type(r) to split_up
      let w: number
      if (count(e, n) <= 0) w = max_dimen
      else {
        w = (s[0]! - s[1]! - s[7]!) | 0
        if (count(e, n) !== 1000) w = Math.imul(x_over_n(e, w, count(e, n)), 1000)
      }
      if (w > ((dimen(e, n) - r.height) | 0)) w = (dimen(e, n) - r.height) | 0
      const q = vert_break(e, p.ins_ptr, w, p.depth)
      r.height = (r.height + e.best_height_plus_depth) | 0
      if (int_par(e, tracing_pages_code) > 0) { // §1011 Display the insertion split cost
        begin_diagnostic(e); print_nl(e, '% split'); print_int(e, n)
        print(e, ' to '); print_scaled(e, w)
        print_char(e, 44); print_scaled(e, e.best_height_plus_depth)
        print(e, ' p=')
        if (q === null) print_int(e, eject_penalty)
        else if (q.type === penalty_node) print_int(e, q.penalty)
        else print_char(e, 48)
        end_diagnostic(e, false)
      }
      if (count(e, n) !== 1000) e.best_height_plus_depth = Math.imul(x_over_n(e, e.best_height_plus_depth, 1000), count(e, n))
      s[0] = (s[0]! - e.best_height_plus_depth) | 0
      r.type = split_up; r.broken_ptr = q; r.broken_ins = p
      if (q === null) e.insert_penalties = (e.insert_penalties + eject_penalty) | 0
      else if (q.type === penalty_node) e.insert_penalties = (e.insert_penalties + q.penalty) | 0
    }
  }
}

// §1012 fire_up
function fire_up(e: Engine, c: Node): void {
  const m = e.cur_mark
  // §1013 Set the value of output_penalty
  const bpb = e.best_page_break!
  if (bpb.type === penalty_node) { geq_word_define(e, int_base + output_penalty_code, bpb.penalty); bpb.penalty = inf_penalty }
  else geq_word_define(e, int_base + output_penalty_code, inf_penalty)
  do_marks(e, fire_up_init) // etex.ch
  if (m[bot_mark_code] !== 0) {
    if (m[top_mark_code] !== 0) delete_token_ref(e, m[top_mark_code]!)
    m[top_mark_code] = m[bot_mark_code]!; add_token_ref(e, m[top_mark_code]!)
    delete_token_ref(e, m[first_mark_code]!); m[first_mark_code] = 0
  }
  // §1014 Put the optimal current page into box 255, update first_mark and bot_mark, append insertions to their boxes,
  // and put the remaining nodes back on the contribution list
  if (c === e.best_page_break) e.best_page_break = null
  if (box(e, 255) !== null) { // §1015 Ensure that box 255 is empty before output
    print_err(e, ''); print_esc(e, 'box'); print(e, '255 is not void')
    help(e, "You shouldn't use \\box255 except in \\output routines.", "Proceed, and I'll discard its present contents.")
    box_error(e, 255)
  }
  e.insert_penalties = 0
  const save_split_top_skip = e.equiv[glue_base + split_top_skip_code]!
  const holding = int_par(e, holding_inserts_code) > 0
  if (!holding) { // §1018 Prepare all the boxes involved in insertions to act as queues
    for (let r = e.page_ins_head.link; r !== e.page_ins_head; r = r.link) {
      if (r.best_ins_ptr !== null) {
        const n = r.subtype; ensure_vbox(e, n)
        if (box(e, n) === null) change_box(e, n, new_null_box())
        let p = list_head(box(e, n)!)
        while (p.link !== null) p = p.link
        r.last_ins_ptr = p
      }
    }
  }
  const hold_head = new_char(0, 0)
  let q: Node = hold_head, prev_p: Node = e.page_head, p: Node | null = prev_p.link
  hold_head.link = null
  while (p !== e.best_page_break) {
    if (p!.type === ins_node) {
      if (!holding) {
        // §1020 Either insert the material specified by node p into the appropriate box, or hold it for the next page;
        // also delete node p from the current page
        const pi: InsNode = p as InsNode
        let r = e.page_ins_head.link
        while (r.subtype !== pi.subtype) r = r.link
        let wait: boolean
        if (r.best_ins_ptr === null) wait = true
        else {
          wait = false
          let s = r.last_ins_ptr!
          s.link = pi.ins_ptr
          if (r.best_ins_ptr === pi) {
            // §1021 Wrap up the box specified by node r, splitting node p if called for; set wait:=true if node p holds a
            // remainder after splitting
            if (r.type === split_up && r.broken_ins === pi && r.broken_ptr !== null) {
              while (s.link !== r.broken_ptr) s = s.link!
              s.link = null
              e.equiv[glue_base + split_top_skip_code] = pi.split_top_ptr
              pi.ins_ptr = prune_page_top(e, r.broken_ptr, false)
              if (pi.ins_ptr !== null) {
                const t = vpack(e, pi.ins_ptr, 0, additional)
                pi.height = (t.height + t.depth) | 0
                wait = true
              }
            }
            r.best_ins_ptr = null
            const n = r.subtype
            change_box(e, n, vpack(e, box(e, n)!.list_ptr, 0, additional))
          } else {
            while (s.link !== null) s = s.link
            r.last_ins_ptr = s
          }
        }
        // §1022 Either append the insertion node p after node q, and remove it from the current page, or delete node(p)
        prev_p.link = pi.link; pi.link = null
        if (wait) { q.link = pi; q = pi; e.insert_penalties++ }
        else delete_glue_ref(e, pi.split_top_ptr)
        p = prev_p
      }
    } else if (p!.type === mark_node && (p as MarkNode).mark_class !== 0) { // etex.ch Update the current marks for fire_up
      const x = sa(e, find_sa_element(e, mark_val, (p as MarkNode).mark_class, true)).mark, mp = (p as MarkNode).mark_ptr
      if (x[1] === 0) { x[1] = mp; add_token_ref(e, mp) }
      if (x[2] !== 0) delete_token_ref(e, x[2]!)
      x[2] = mp; add_token_ref(e, mp)
    } else if (p!.type === mark_node) { // §1016 Update the values of first_mark and bot_mark
      if (m[first_mark_code] === 0) { m[first_mark_code] = p!.mark_ptr; add_token_ref(e, p!.mark_ptr) }
      if (m[bot_mark_code] !== 0) delete_token_ref(e, m[bot_mark_code]!)
      m[bot_mark_code] = p!.mark_ptr; add_token_ref(e, p!.mark_ptr)
    }
    prev_p = p!; p = prev_p.link
  }
  e.equiv[glue_base + split_top_skip_code] = save_split_top_skip
  // §1017 Break the current page at node p, put it in box 255, and put the remaining nodes on the contribution list
  if (p !== null) {
    if (e.contrib_head.link === null) set_contrib_tail(e, e.page_tail)
    e.page_tail.link = e.contrib_head.link
    e.contrib_head.link = p
    prev_p.link = null
  }
  const save_vbadness = int_par(e, vbadness_code), save_vfuzz = e.equiv[dimen_base + vfuzz_code]!
  e.equiv[int_base + vbadness_code] = inf_bad; e.equiv[dimen_base + vfuzz_code] = max_dimen
  change_box(e, 255, vpackage(e, e.page_head.link, e.best_size, exactly, e.page_max_depth))
  e.equiv[int_base + vbadness_code] = save_vbadness; e.equiv[dimen_base + vfuzz_code] = save_vfuzz
  if (e.last_glue !== max_halfword) delete_glue_ref(e, e.last_glue)
  start_new_page(e)
  if (q !== hold_head) { e.page_head.link = hold_head.link; e.page_tail = q }
  e.page_ins_head.link = e.page_ins_head // §1019 Delete the page-insertion nodes
  do_marks(e, fire_up_done) // etex.ch
  if (m[top_mark_code] !== 0 && m[first_mark_code] === 0) { m[first_mark_code] = m[top_mark_code]!; add_token_ref(e, m[top_mark_code]!) }
  if (e.equiv[output_routine_loc] !== 0) {
    if (e.dead_cycles >= int_par(e, max_dead_cycles_code)) { // §1024 Explain that too many dead cycles have occurred in a row
      print_err(e, 'Output loop---'); print_int(e, e.dead_cycles); print(e, ' consecutive dead cycles')
      help(e, "I've concluded that your \\output is awry; it never does a", "\\shipout, so I'm shipping \\box255 out myself. Next time",
        'increase \\maxdeadcycles if you want me to be more patient!')
      error(e)
    } else { // §1025 Fire up the user's output routine and return
      e.output_active = true; e.dead_cycles++
      push_nest(e); e.mode = -vmode; e.prev_depth = e.equiv[dimen_base + pdf_ignored_dimen_code]!; e.mode_line = -e.line
      begin_token_list(e, e.equiv[output_routine_loc]!, output_text)
      new_save_level(e, output_group); normal_paragraph(e)
      scan_left_brace(e)
      return
    }
  }
  // §1023 Perform the default output routine
  if (e.page_head.link !== null) {
    if (e.contrib_head.link === null) set_contrib_tail(e, e.page_tail)
    else e.page_tail.link = e.contrib_head.link
    e.contrib_head.link = e.page_head.link
    e.page_head.link = null; e.page_tail = e.page_head
  }
  flush_node_list(e, e.disc_ptr[last_box_code]!); e.disc_ptr[last_box_code] = null // etex.ch
  ship_out(e, box(e, 255)!); change_box(e, 255, null)
}

// §1026 Resume the page builder after an output routine has come to an end
export function resume_page_builder(e: Engine): void {
  // unbalanced-braces.ch: the output-ending brace may have been backed up; the finished output level is still there
  while (e.cur_input.state === token_list && e.cur_input.loc === 0 && e.cur_input.index === backed_up) end_token_list(e)
  if (e.cur_input.state !== token_list || e.cur_input.loc !== 0 || e.cur_input.index !== output_text) {
    // §1027 Recover from an unbalanced output routine
    print_err(e, 'Unbalanced output routine')
    help(e, "Your sneaky output routine has problematic {'s and/or }'s.", "I can't handle that very well; good luck.")
    error(e)
    do get_token(e); while (e.cur_input.loc !== 0)
  }
  e.output_can_end = true; end_token_list(e); e.output_can_end = false
  end_graf(e); unsave(e); e.output_active = false; e.insert_penalties = 0
  if (box(e, 255) !== null) { // §1028 Ensure that box 255 is empty after output
    print_err(e, "Output routine didn't use all of "); print_esc(e, 'box'); print_int(e, 255)
    help(e, 'Your \\output commands should empty \\box255,', "e.g., by saying `\\shipout\\box255'.",
      "Proceed; I'll discard its present contents.")
    box_error(e, 255)
  }
  if (e.tail !== e.head) { e.page_tail.link = e.head.link; e.page_tail = e.tail }
  if (e.page_head.link !== null) {
    if (e.contrib_head.link === null) e.nest[0]!.tail = e.page_tail
    e.page_tail.link = e.contrib_head.link
    e.contrib_head.link = e.page_head.link
    e.page_head.link = null; e.page_tail = e.page_head
  }
  flush_node_list(e, e.disc_ptr[last_box_code]!); e.disc_ptr[last_box_code] = null // etex.ch
  pop_nest(e); build_page(e)
}

// §1054 its_all_over
export function its_all_over(e: Engine): boolean {
  if (privileged(e)) {
    if (e.page_head === e.page_tail && e.head === e.tail && e.dead_cycles === 0) return true
    back_input(e)
    const b = new_null_box(); b.width = e.equiv[dimen_base + hsize_code]!; tail_append(e, b)
    tail_append(e, new_glue(e, fill_glue))
    tail_append(e, new_penalty(-0o10000000000))
    build_page(e)
  }
  return false
}
