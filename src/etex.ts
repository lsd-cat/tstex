// etex.ch §1379– the extended features of e-TeX: expressions, sparse arrays, group/if/file tracing, \showgroups,
// \scantokens pseudo files, scan_general_text (pdftex.web's merged copy is the text ported)
import type { Engine } from './engine.ts'
import { Cmd, int_val, dimen_val, glue_val, mu_val, tok_val, vmode, hmode, mmode, level_one } from './types.ts'
import { print, print_char, print_esc, print_int, print_nl, print_ln, begin_diagnostic, end_diagnostic } from './print.ts'
import { print_scaled, nx_plus_y, mult_integers } from './arith.ts'
import { error, print_err, help, overflow, show_context, token_list } from './error.ts'
import { int_par, tracing_restores_code, int_base } from './eqtb.ts'
import { get_avail, free_avail, flush_list, temp_head, new_spec, add_glue_ref, delete_glue_ref, zero_glue, print_spec, normal,
  flush_node_list, delete_token_ref, show_node_list, left_noad } from './nodes.ts'
import type { Node } from './nodes.ts'
import { other_token, right_brace_limit, print_cmd_chr, show_token_list, token_show } from './tokens.ts'
import { get_token, back_input, back_error, begin_file_reading, absorbing } from './input.ts'
import { get_x_token } from './expand.ts'
import { scan_int, scan_normal_dimen, scan_glue, scan_left_brace, max_dimen, infinity, str_toks } from './scan.ts'
import { bottom_level, simple_group, hbox_group, adjusted_hbox_group, vbox_group, vtop_group, align_group, no_align_group,
  output_group, math_group, disc_group, insert_group, vcenter_group, math_choice_group, semi_simple_group, math_shift_group,
  math_left_group, box_flag, global_box_flag, ship_out_flag, leader_flag } from './main.ts'
import { saved, exactly } from './pack.ts'
import { fi_code, else_code, or_code, unless_code } from './conditional.ts'
import type { CondNode } from './conditional.ts'

export const tracing_assigns_code = 102, tracing_groups_code = 103, tracing_ifs_code = 104, tracing_scan_tokens_code = 105,
  tracing_nesting_code = 106, pre_display_direction_code = 107, last_line_fit_code = 108, saving_vdiscards_code = 109,
  saving_hyph_codes_code = 110, eTeX_state_code = 112
export const TeXXeT_en = (e: Engine): boolean => int_par(e, eTeX_state_code) > 0

// §1381 eTeX_enabled
export function eTeX_enabled(e: Engine, b: boolean, j: number, k: number): boolean {
  if (!b) { print_err(e, 'Improper '); print_cmd_chr(e, j, k); help(e, 'Sorry, this optional e-TeX feature has been disabled.'); error(e) }
  return b
}

// ---------------------------------------------------------------- expressions

const expr_none = 0, expr_add = 1, expr_sub = 2, expr_mult = 3, expr_div = 4, expr_scale = 5

// etex.ch add_or_sub
function add_or_sub(e: Engine, x: number, y: number, max_answer: number, negative: boolean): number {
  if (negative) y = -y | 0
  if (x >= 0) { if (y <= max_answer - x) return (x + y) | 0 }
  else if (y >= -max_answer - x) return (x + y) | 0
  e.arith_error = true; return 0
}

// etex.ch quotient: rounded n/d
function quotient(e: Engine, n: number, d: number): number {
  if (d === 0) { e.arith_error = true; return 0 }
  let negative = false
  if (d < 0) { d = -d | 0; negative = true }
  if (n < 0) { n = -n | 0; negative = !negative }
  let a = Math.trunc(n / d); n = (n - Math.imul(a, d)) | 0; d = (n - d) | 0
  if (d + n >= 0) a++
  return negative ? -a | 0 : a
}

// etex.ch fract: rounded x*n/d without overflow
export function fract(e: Engine, x: number, n: number, d: number, max_answer: number): number {
  let negative = false, a = 0, f: number, h: number, r: number, t: number
  too_big: {
    done: {
      if (d === 0) break too_big
      if (d < 0) { d = -d | 0; negative = true }
      if (x < 0) { x = -x | 0; negative = !negative }
      else if (x === 0) break done
      if (n < 0) { n = -n | 0; negative = !negative }
      found: {
        t = Math.trunc(n / d)
        if (t > Math.trunc(max_answer / x)) break too_big
        a = Math.imul(t, x); n = (n - Math.imul(t, d)) | 0
        if (n === 0) break found
        t = Math.trunc(x / d)
        if (t > Math.trunc((max_answer - a) / n)) break too_big
        a = (a + Math.imul(t, n)) | 0; x = (x - Math.imul(t, d)) | 0
        if (x === 0) break found
        if (x < n) { t = x; x = n; n = t }
        // Compute f = floor(xn/d + 1/2)
        f = 0; r = Math.trunc(d / 2) - d; h = -r
        for (;;) {
          if (n & 1) { r = r + x; if (r >= 0) { r = r - d; f++ } }
          n = Math.trunc(n / 2)
          if (n === 0) break
          if (x < h) x = x + x
          else {
            t = x - d; x = t + x; f = f + n
            if (x < n) { if (x === 0) break; t = x; x = n; n = t }
          }
        }
        if (f > max_answer - a) break too_big
        a = a + f
      }
      if (negative) a = -a
    }
    return a
  }
  e.arith_error = true; return 0
}

// etex.ch scan_expr
export function scan_expr(e: Engine): void {
  let l = e.cur_val_level; const a = e.arith_error; let b = false
  const p: { l: number, s: number, r: number, e: number, t: number, n: number }[] = []
  if (++e.expand_depth_count >= e.lim.expand_depth) overflow(e, 'expansion depth', e.lim.expand_depth)
  let r = 0, x = 0, s = 0, t = 0, n = 0, o = 0, f = 0
  const sp = (g: number) => e.spec[g]!
  const num_error = () => { e.arith_error = true; return 0 }
  const expr_a = (u: number, v: number) => add_or_sub(e, u, v, max_dimen, r === expr_sub)
  restart: for (;;) {
    r = expr_none; x = 0; s = expr_none; t = 0; n = 0
    cont: for (;;) {
      o = s === expr_none ? l : int_val
      // Scan a factor f of type o or start a subexpression
      do get_x_token(e); while (e.cur_cmd === Cmd.spacer)
      if (e.cur_tok === other_token + 40) { p.push({ l, s, r, e: x, t, n }); l = o; continue restart }
      back_input(e)
      if (o === int_val) scan_int(e)
      else if (o === dimen_val) scan_normal_dimen(e)
      else if (o === glue_val) scan_glue(e, glue_val)
      else scan_glue(e, mu_val)
      f = e.cur_val
      found: for (;;) {
        // Scan the next operator and set o
        do get_x_token(e); while (e.cur_cmd === Cmd.spacer)
        if (e.cur_tok === other_token + 43) o = expr_add
        else if (e.cur_tok === other_token + 45) o = expr_sub
        else if (e.cur_tok === other_token + 42) o = expr_mult
        else if (e.cur_tok === other_token + 47) o = expr_div
        else {
          o = expr_none
          if (p.length === 0) { if (e.cur_cmd !== Cmd.relax) back_input(e) }
          else if (e.cur_tok !== other_token + 41) {
            print_err(e, 'Missing ) inserted for expression')
            help(e, "I was expecting to see `+', `-', `*', `/', or `)'. Didn't.")
            back_error(e)
          }
        }
        e.arith_error = b
        // Make sure that f is in the proper range
        if (l === int_val || s > expr_sub) { if (f > infinity || f < -infinity) f = num_error() }
        else if (l === dimen_val) { if (Math.abs(f) > max_dimen) f = num_error() }
        else if (Math.abs(sp(f).width) > max_dimen || Math.abs(sp(f).stretch) > max_dimen || Math.abs(sp(f).shrink) > max_dimen) {
          e.arith_error = true; delete_glue_ref(e, f); f = new_spec(e, zero_glue)
        }
        // Cases for evaluation of the current term
        switch (s) {
          case expr_none:
            if (l >= glue_val && o !== expr_none) { t = new_spec(e, f); delete_glue_ref(e, f); normalize_glue(e, t) }
            else t = f
            break
          case expr_mult:
            if (o === expr_div) { n = f; o = expr_scale }
            else if (l === int_val) t = mult_integers(e, t, f)
            else if (l === dimen_val) t = nx_plus_y(e, t, f, 0)
            else { const g = sp(t); g.width = nx_plus_y(e, g.width, f, 0); g.stretch = nx_plus_y(e, g.stretch, f, 0); g.shrink = nx_plus_y(e, g.shrink, f, 0) }
            break
          case expr_div:
            if (l < glue_val) t = quotient(e, t, f)
            else { const g = sp(t); g.width = quotient(e, g.width, f); g.stretch = quotient(e, g.stretch, f); g.shrink = quotient(e, g.shrink, f) }
            break
          case expr_scale:
            if (l === int_val) t = fract(e, t, n, f, infinity)
            else if (l === dimen_val) t = fract(e, t, n, f, max_dimen)
            else { const g = sp(t); g.width = fract(e, g.width, n, f, max_dimen); g.stretch = fract(e, g.stretch, n, f, max_dimen); g.shrink = fract(e, g.shrink, n, f, max_dimen) }
            break
        }
        if (o > expr_sub) s = o
        else { // Evaluate the current expression
          s = expr_none
          if (r === expr_none) x = t
          else if (l === int_val) x = add_or_sub(e, x, t, infinity, r === expr_sub)
          else if (l === dimen_val) x = expr_a(x, t)
          else { // Compute the sum or difference of two glue specs
            const g = sp(x), h = sp(t)
            g.width = expr_a(g.width, h.width)
            if (g.stretch_order === h.stretch_order) g.stretch = expr_a(g.stretch, h.stretch)
            else if (g.stretch_order < h.stretch_order && h.stretch !== 0) { g.stretch = h.stretch; g.stretch_order = h.stretch_order }
            if (g.shrink_order === h.shrink_order) g.shrink = expr_a(g.shrink, h.shrink)
            else if (g.shrink_order < h.shrink_order && h.shrink !== 0) { g.shrink = h.shrink; g.shrink_order = h.shrink_order }
            delete_glue_ref(e, t); normalize_glue(e, x)
          }
          r = o
        }
        b = e.arith_error
        if (o !== expr_none) continue cont
        const q = p.pop()
        if (q !== undefined) { f = x; x = q.e; t = q.t; n = q.n; s = q.s; r = q.r; l = q.l; continue found }
        break restart
      }
    }
  }
  e.expand_depth_count--
  if (b) {
    print_err(e, 'Arithmetic overflow')
    help(e, "I can't evaluate this expression,", 'since the result is out of range.')
    error(e)
    if (l >= glue_val) { delete_glue_ref(e, x); x = zero_glue; add_glue_ref(e, x) }
    else x = 0
  }
  e.arith_error = a; e.cur_val = x; e.cur_val_level = l
}

function normalize_glue(e: Engine, g: number): void {
  const s = e.spec[g]!
  if (s.stretch === 0) s.stretch_order = normal
  if (s.shrink === 0) s.shrink_order = normal
}

// ---------------------------------------------------------------- sparse arrays

// An array element (register 256..32767 or mark class 1..32767). TeX's tree of index nodes is a Map per type,
// keyed by the number; only do_marks walks it, in ascending order as the tree walk does.
export const box_val = 4, mark_val = 6
export type SaElem = { t: number, n: number, ref: number, lev: number, int: number, ptr: number, box: Node | null, mark: number[] }
// a saved value on sa_chain
type SaSave = { loc: number, lev: number, int: number, ptr: number, box: Node | null, link: SaSave | null }

// etex.ch find_sa_element: the handle (>= 4, so register chr codes 0..3 stay the primitives) or 0
export function find_sa_element(e: Engine, t: number, n: number, w: boolean): number {
  let q = e.sa_root[t]!.get(n) ?? 0
  if (q !== 0 || !w) return q
  // Create a new array element of type t with index n
  const x: SaElem = { t, n, ref: 0, lev: level_one, int: 0, ptr: 0, box: null, mark: [0, 0, 0, 0, 0] }
  if (t === glue_val || t === mu_val) { x.ptr = zero_glue; add_glue_ref(e, zero_glue) }
  q = e.sa_free.pop() ?? e.sa.length
  e.sa[q] = x; e.sa_root[t]!.set(n, q)
  return q
}
export const sa = (e: Engine, q: number): SaElem => e.sa[q]!
function sa_free_elem(e: Engine, q: number): void {
  const x = e.sa[q]!; e.sa_root[x.t]!.delete(x.n); e.sa[q] = null; e.sa_free.push(q)
}

// etex.ch delete_sa_ref
export function delete_sa_ref(e: Engine, q: number): void {
  const x = e.sa[q]!
  if (--x.ref !== 0) return
  if (x.t <= dimen_val) { if (x.int !== 0) return }
  else if (x.t <= mu_val) { if (x.ptr !== zero_glue) return; delete_glue_ref(e, zero_glue) }
  else if (x.t === box_val ? x.box !== null : x.ptr !== 0) return
  sa_free_elem(e, q)
}
export const add_sa_ref = (e: Engine, q: number): void => { e.sa[q]!.ref++ }

// etex.ch print_sa_num
export const print_sa_num = (e: Engine, q: number): void => print_int(e, e.sa[q]!.n)

// etex.ch show_sa
export function show_sa(e: Engine, p: number, s: string): void {
  begin_diagnostic(e); print_char(e, 123); print(e, s); print_char(e, 32)
  const x = e.sa[p]!, t = x.t
  if (t < box_val) print_cmd_chr(e, Cmd.register, p)
  else if (t === box_val) { print_esc(e, 'box'); print_sa_num(e, p) }
  else print_cmd_chr(e, Cmd.toks_register, p)
  print_char(e, 61)
  if (t === int_val) print_int(e, x.int)
  else if (t === dimen_val) { print_scaled(e, x.int); print(e, 'pt') }
  else if (t === glue_val) print_spec(e, x.ptr, 'pt')
  else if (t === mu_val) print_spec(e, x.ptr, 'mu')
  else if (t === box_val) { if (x.box === null) print(e, 'void'); else { e.depth_threshold = 0; e.breadth_max = 1; show_node_list(e, x.box) } }
  else if (x.ptr !== 0) show_token_list(e, e.link[x.ptr]!, 0, 32)
  print_char(e, 125); end_diagnostic(e, false)
}

// etex.ch fetch_box for n>255 and set_sa_box (change_box)
export function sa_box(e: Engine, n: number): Node | null {
  const q = find_sa_element(e, box_val, n, false)
  return q === 0 ? null : e.sa[q]!.box
}
export function set_sa_box(e: Engine, n: number, p: Node | null): void {
  const q = find_sa_element(e, box_val, n, false)
  if (q !== 0) { e.sa[q]!.box = p; add_sa_ref(e, q); delete_sa_ref(e, q) }
}

// etex.ch sa_save
function sa_save(e: Engine, p: number): void {
  if (e.cur_level !== e.sa_level) {
    if (e.save_ptr > e.max_save_stack) { // check_full_save_stack
      e.max_save_stack = e.save_ptr
      if (e.max_save_stack > e.lim.save_size - 7) overflow(e, 'save size', e.lim.save_size)
    }
    e.save_b0[e.save_ptr] = restore_sa; e.save_b1[e.save_ptr] = e.sa_level; e.save_rh[e.save_ptr] = 0
    e.sa_chain_stack.push(e.sa_chain) // save_index(save_ptr):=sa_chain
    e.save_ptr++; e.sa_chain = null; e.sa_level = e.cur_level
  }
  const x = e.sa[p]!
  e.sa_chain = { loc: p, lev: x.lev, int: x.int, ptr: x.ptr, box: x.box, link: e.sa_chain as SaSave | null }
  add_sa_ref(e, p)
}
export const restore_sa = 4

// etex.ch sa_destroy (x is an element or a saved value)
function sa_destroy(e: Engine, t: number, x: { ptr: number, box: Node | null }): void {
  if (t <= mu_val) delete_glue_ref(e, x.ptr)
  else if (t === box_val) flush_node_list(e, x.box)
  else if (x.ptr !== 0) delete_token_ref(e, x.ptr)
}

// etex.ch sa_def, sa_w_def, gsa_def, gsa_w_def; v is the new pointer value (a glue spec, token list, or a box)
export function sa_def(e: Engine, p: number, v: number, bx: Node | null, global: boolean): void {
  const x = e.sa[p]!
  add_sa_ref(e, p)
  if (global) {
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'globally changing')
    sa_destroy(e, x.t, x); x.lev = level_one; x.ptr = v; x.box = bx
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'into')
  } else if (x.t === box_val ? x.box === bx : x.ptr === v) {
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'reassigning')
    sa_destroy(e, x.t, x)
  } else {
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'changing')
    if (x.lev === e.cur_level) sa_destroy(e, x.t, x); else sa_save(e, p)
    x.lev = e.cur_level; x.ptr = v; x.box = bx
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'into')
  }
  delete_sa_ref(e, p)
}
export function sa_w_def(e: Engine, p: number, w: number, global: boolean): void {
  const x = e.sa[p]!
  add_sa_ref(e, p)
  if (global) {
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'globally changing')
    x.lev = level_one; x.int = w
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'into')
  } else if (x.int === w) {
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'reassigning')
  } else {
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'changing')
    if (x.lev !== e.cur_level) sa_save(e, p)
    x.lev = e.cur_level; x.int = w
    if (int_par(e, tracing_assigns_code) > 0) show_sa(e, p, 'into')
  }
  delete_sa_ref(e, p)
}

// etex.ch sa_restore (unsave's restore_sa case)
export function sa_restore(e: Engine): void {
  let c = e.sa_chain as SaSave | null
  do {
    const p = c!.loc, x = e.sa[p]!
    if (x.lev === level_one) {
      if (x.t >= glue_val) sa_destroy(e, x.t, c!)
      if (int_par(e, tracing_restores_code) > 0) show_sa(e, p, 'retaining')
    } else {
      if (x.t <= dimen_val) x.int = c!.int
      else { sa_destroy(e, x.t, x); x.ptr = c!.ptr; x.box = c!.box }
      x.lev = c!.lev
      if (int_par(e, tracing_restores_code) > 0) show_sa(e, p, 'restoring')
    }
    delete_sa_ref(e, p)
    c = c!.link
  } while (c !== null)
  e.sa_chain = null
}

// etex.ch do_marks over every mark class in ascending order; a=vsplit_init, fire_up_init, fire_up_done, destroy_marks
export const vsplit_init = 0, fire_up_init = 1, fire_up_done = 2, destroy_marks = 3
export function do_marks(e: Engine, a: number): void {
  const root = e.sa_root[mark_val]!
  for (const n of [...root.keys()].sort((u, v) => u - v)) {
    const q = root.get(n)!, m = e.sa[q]!.mark
    switch (a) {
      case vsplit_init:
        if (m[3] !== 0) { delete_token_ref(e, m[3]!); m[3] = 0; delete_token_ref(e, m[4]!); m[4] = 0 }
        break
      case fire_up_init:
        if (m[2] !== 0) {
          if (m[0] !== 0) delete_token_ref(e, m[0]!)
          delete_token_ref(e, m[1]!); m[1] = 0
          if (e.link[m[2]!] === 0) { delete_token_ref(e, m[2]!); m[2] = 0 }
          else e.info[m[2]!]!++ // add_token_ref
          m[0] = m[2]!
        }
        break
      case fire_up_done:
        if (m[0] !== 0 && m[1] === 0) { m[1] = m[0]!; e.info[m[0]!]!++ }
        break
      case destroy_marks:
        for (let i = 0; i < 5; i++) if (m[i] !== 0) { delete_token_ref(e, m[i]!); m[i] = 0 }
        break
    }
    if (m[2] === 0 && m[4] === 0) sa_free_elem(e, q)
  }
}

// ---------------------------------------------------------------- groups, conditionals and files

// etex.ch print_group
export function print_group(e: Engine, ent: boolean): void {
  const g = e.cur_group
  switch (g) {
    case bottom_level: print(e, 'bottom level'); return
    case simple_group: case semi_simple_group: if (g === semi_simple_group) print(e, 'semi '); print(e, 'simple'); break
    case hbox_group: case adjusted_hbox_group: if (g === adjusted_hbox_group) print(e, 'adjusted '); print(e, 'hbox'); break
    case vbox_group: print(e, 'vbox'); break
    case vtop_group: print(e, 'vtop'); break
    case align_group: case no_align_group: if (g === no_align_group) print(e, 'no '); print(e, 'align'); break
    case output_group: print(e, 'output'); break
    case disc_group: print(e, 'disc'); break
    case insert_group: print(e, 'insert'); break
    case vcenter_group: print(e, 'vcenter'); break
    case math_group: case math_choice_group: case math_shift_group: case math_left_group:
      print(e, 'math')
      if (g === math_choice_group) print(e, ' choice')
      else if (g === math_shift_group) print(e, ' shift')
      else if (g === math_left_group) print(e, ' left')
      break
  }
  print(e, ' group (level '); print_int(e, e.cur_level); print_char(e, 41)
  if (saved(e, -1) !== 0) { print(e, ent ? ' entered at line ' : ' at line '); print_int(e, saved(e, -1)) }
}

// etex.ch group_trace
export function group_trace(e: Engine, ent: boolean): void {
  begin_diagnostic(e); print_char(e, 123); print(e, ent ? 'leaving ' : 'entering ')
  print_group(e, ent); print_char(e, 125); end_diagnostic(e, false)
}

// etex.ch show_save_groups
export function show_save_groups(e: Engine): void {
  let p = e.nest_ptr
  e.nest[p] = { mode: e.mode, head: e.head, tail: e.tail, prev_graf: e.prev_graf, mode_line: e.mode_line, prev_depth: e.prev_depth,
    space_factor: e.space_factor, clang: e.clang, incompleat_noad: e.incompleat_noad, eTeX_aux: e.eTeX_aux }
  const v = e.save_ptr, l = e.cur_level, c = e.cur_group
  e.save_ptr = e.cur_boundary; e.cur_level--
  let a = 1, m = 0, s = ''
  print_nl(e, ''); print_ln(e)
  for (;;) {
    print_nl(e, '### '); print_group(e, true)
    if (e.cur_group === bottom_level) break
    do { m = e.nest[p]?.mode ?? 0; if (p > 0) p--; else m = vmode } while (m === hmode) // nest[p] may be stale, as in TeX
    print(e, ' (')
    let to: 'box' | 'found1' | 'found2' | 'found' = 'box'
    switch (e.cur_group) {
      case simple_group: p++; to = 'found2'; break
      case hbox_group: case adjusted_hbox_group: s = 'hbox'; break
      case vbox_group: s = 'vbox'; break
      case vtop_group: s = 'vtop'; break
      case align_group:
        if (a === 0) { s = m === -vmode ? 'halign' : 'valign'; a = 1; to = 'found1' }
        else { if (a === 1) print(e, 'align entry'); else print_esc(e, 'cr'); if (p >= a) p = p - a; a = 0; to = 'found' }
        break
      case no_align_group: p++; a = -1; print_esc(e, 'noalign'); to = 'found2'; break
      case output_group: print_esc(e, 'output'); to = 'found'; break
      case math_group: to = 'found2'; break
      case disc_group: case math_choice_group:
        print_esc(e, e.cur_group === disc_group ? 'discretionary' : 'mathchoice')
        for (let i = 1; i <= 3; i++) if (i <= saved(e, -2)) print(e, '{}')
        to = 'found2'; break
      case insert_group:
        if (saved(e, -2) === 255) print_esc(e, 'vadjust')
        else { print_esc(e, 'insert'); print_int(e, saved(e, -2)) }
        to = 'found2'; break
      case vcenter_group: s = 'vcenter'; to = 'found1'; break
      case semi_simple_group: p++; print_esc(e, 'begingroup'); to = 'found'; break
      case math_shift_group:
        if (m === mmode) print_char(e, 36)
        else if (e.nest[p]?.mode === mmode) { print_cmd_chr(e, Cmd.eq_no, saved(e, -2)); to = 'found'; break }
        print_char(e, 36); to = 'found'; break
      case math_left_group:
        print_esc(e, e.nest[p + 1]!.eTeX_aux!.type === left_noad ? 'left' : 'middle'); to = 'found'; break
    }
    if (to === 'box') { // Show the box context
      let i = saved(e, -4)
      if (i !== 0) {
        if (i < box_flag) {
          const j = Math.abs(e.nest[p]?.mode ?? 0) === vmode ? Cmd.hmove : Cmd.vmove
          print_cmd_chr(e, j, i > 0 ? 0 : 1); print_scaled(e, Math.abs(i)); print(e, 'pt')
        } else if (i < ship_out_flag) {
          if (i >= global_box_flag) { print_esc(e, 'global'); i -= global_box_flag - box_flag }
          print_esc(e, 'setbox'); print_int(e, i - box_flag); print_char(e, 61)
        } else print_cmd_chr(e, Cmd.leader_ship, i - (leader_flag - 100))
      }
    }
    if (to === 'box' || to === 'found1') { // found1: Show the box packaging info
      print_esc(e, s)
      if (saved(e, -2) !== 0) {
        print_char(e, 32); print(e, saved(e, -3) === exactly ? 'to' : 'spread')
        print_scaled(e, saved(e, -2)); print(e, 'pt')
      }
    }
    if (to !== 'found') print_char(e, 123) // found2
    print_char(e, 41); e.cur_level--
    e.cur_group = e.save_b1[e.save_ptr]!; e.save_ptr = e.save_rh[e.save_ptr]!
  }
  e.save_ptr = v; e.cur_level = l; e.cur_group = c
}

// etex.ch Set variable w to indicate if this case should be reported
function report_nesting(e: Engine, i: number): boolean {
  if (int_par(e, tracing_nesting_code) <= 0) return false
  while (e.input_stack[e.base_ptr]!.state === token_list || e.input_stack[e.base_ptr]!.index > i) e.base_ptr--
  return e.input_stack[e.base_ptr]!.name > 17
}

// etex.ch print_if_line
export function print_if_line(e: Engine, l: number): void {
  if (l !== 0) { print(e, ' entered on line '); print_int(e, l) }
}

// etex.ch group_warning
export function group_warning(e: Engine): void {
  e.base_ptr = e.input_ptr; e.input_stack[e.base_ptr] = e.cur_input
  let i = e.in_open, w = false
  while (e.grp_stack[i] === e.cur_boundary && i > 0) {
    if (report_nesting(e, i)) w = true
    e.grp_stack[i] = e.save_rh[e.save_ptr]!; i--
  }
  if (w) {
    print_nl(e, 'Warning: end of '); print_group(e, true); print(e, ' of a different file'); print_ln(e)
    if (int_par(e, tracing_nesting_code) > 1) show_context(e)
    if (e.history === 0) e.history = 1
  }
}

// etex.ch if_warning
export function if_warning(e: Engine): void {
  e.base_ptr = e.input_ptr; e.input_stack[e.base_ptr] = e.cur_input
  let i = e.in_open, w = false
  while (e.if_stack[i] === e.cond_ptr) {
    if (report_nesting(e, i)) w = true
    e.if_stack[i] = e.cond_ptr!.link; i--
  }
  if (w) {
    print_nl(e, 'Warning: end of '); print_cmd_chr(e, Cmd.if_test, e.cur_if)
    print_if_line(e, e.if_line); print(e, ' of a different file'); print_ln(e)
    if (int_par(e, tracing_nesting_code) > 1) show_context(e)
    if (e.history === 0) e.history = 1
  }
}

// etex.ch file_warning
export function file_warning(e: Engine): void {
  const p = e.save_ptr, l = e.cur_level, c = e.cur_group
  e.save_ptr = e.cur_boundary
  while (e.grp_stack[e.in_open] !== e.save_ptr) {
    e.cur_level--
    print_nl(e, 'Warning: end of file when '); print_group(e, true); print(e, ' is incomplete')
    e.cur_group = e.save_b1[e.save_ptr]!; e.save_ptr = e.save_rh[e.save_ptr]!
  }
  e.save_ptr = p; e.cur_level = l; e.cur_group = c
  const cp = e.cond_ptr, il = e.if_limit, ci = e.cur_if, li = e.if_line
  while (e.if_stack[e.in_open] !== e.cond_ptr) {
    print_nl(e, 'Warning: end of file when '); print_cmd_chr(e, Cmd.if_test, e.cur_if)
    if (e.if_limit === fi_code) print_esc(e, 'else')
    print_if_line(e, e.if_line); print(e, ' is incomplete')
    e.if_line = e.cond_ptr!.if_line; e.cur_if = e.cond_ptr!.cur_if; e.if_limit = e.cond_ptr!.if_limit; e.cond_ptr = e.cond_ptr!.link
  }
  e.cond_ptr = cp; e.if_limit = il; e.cur_if = ci; e.if_line = li
  print_ln(e)
  if (int_par(e, tracing_nesting_code) > 1) show_context(e)
  if (e.history === 0) e.history = 1
}

// etex.ch \showifs (show_whatever case)
export function show_ifs(e: Engine): void {
  begin_diagnostic(e); print_nl(e, ''); print_ln(e)
  if (e.cond_ptr === null) { print_nl(e, '### '); print(e, 'no active conditionals'); return }
  let p: CondNode | null = e.cond_ptr, n = 0
  do { n++; p = p!.link } while (p !== null)
  let q: CondNode | null = e.cond_ptr, t = e.cur_if, l = e.if_line, m = e.if_limit
  do {
    print_nl(e, '### level '); print_int(e, n); print(e, ': '); print_cmd_chr(e, Cmd.if_test, t)
    if (m === fi_code) print_esc(e, 'else')
    print_if_line(e, l)
    n--; t = q!.cur_if; l = q!.if_line; m = q!.if_limit; q = q!.link
  } while (q !== null)
}

// etex.ch the value of \currentiftype and \currentifbranch
export function current_if_type(e: Engine): number {
  return e.cond_ptr === null ? 0 : e.cur_if < unless_code ? e.cur_if + 1 : -(e.cur_if - unless_code + 1)
}
export const current_if_branch = (e: Engine): number =>
  e.if_limit === or_code || e.if_limit === else_code ? 1 : e.if_limit === fi_code ? -1 : 0

// ---------------------------------------------------------------- token lists

// etex.ch scan_general_text: the list starts at link(temp_head), cur_val is its tail (temp_head if empty)
export function scan_general_text(e: Engine): void {
  const s = e.scanner_status, w = e.warning_index, d = e.def_ref
  e.scanner_status = absorbing; e.warning_index = e.cur_cs
  e.def_ref = get_avail(e); e.info[e.def_ref] = 0
  let p = e.def_ref, unbalance = 1
  scan_left_brace(e)
  for (;;) {
    get_token(e)
    if (e.cur_tok < right_brace_limit) {
      if (e.cur_cmd < Cmd.right_brace) unbalance++
      else if (--unbalance === 0) break
    }
    const q = get_avail(e); e.link[p] = q; e.info[q] = e.cur_tok; p = q
  }
  const q = e.link[e.def_ref]!; free_avail(e, e.def_ref)
  e.cur_val = q === 0 ? temp_head : p
  e.link[temp_head] = q
  e.scanner_status = s; e.warning_index = w; e.def_ref = d
}

// etex.ch Handle \unexpanded or \detokenize and return (the_toks with odd cur_chr)
export function the_unexpanded(e: Engine, c: number): number {
  scan_general_text(e)
  if (c === 1) return e.cur_val
  const old_setting = e.selector; e.selector = 21 // new_string
  const b = e.cur_str.length
  const p = get_avail(e); e.link[p] = e.link[temp_head]!
  token_show(e, p); flush_list(e, p)
  e.selector = old_setting
  return str_toks(e, b)
}

// etex.ch pseudo_start: \scantokens; a pseudo file is a list of lines (byte arrays)
export function pseudo_start(e: Engine): void {
  scan_general_text(e)
  const old_setting = e.selector; e.selector = 21
  const b = e.cur_str.length
  token_show(e, temp_head); e.selector = old_setting
  flush_list(e, e.link[temp_head]!)
  const str = e.cur_str.splice(b)
  // Convert string s into a new pseudo file
  const nl = int_par(e, 49) // new_line_char
  const lines: number[][] = []
  let l = 0
  while (l < str.length) {
    const m = l
    while (l < str.length && str[l] !== nl) l++
    lines.push(str.slice(m, l))
    if (str[l] === nl) l++
  }
  e.pseudo_files.push(lines)
  // Initiate input from new pseudo file
  begin_file_reading(e)
  e.line = 0; e.cur_input.limit = e.cur_input.start; e.cur_input.loc = e.cur_input.limit + 1
  if (int_par(e, tracing_scan_tokens_code) > 0) {
    if (e.term_offset > e.lim.max_print_line - 3) print_ln(e)
    else if (e.term_offset > 0 || e.file_offset > 0) print_char(e, 32)
    e.cur_input.name = 19; print(e, '( '); e.open_parens++
  } else e.cur_input.name = 18
}

// etex.ch pseudo_input: the next line into buffer, or false
export function pseudo_input(e: Engine): boolean {
  e.last = e.first
  const lines = e.pseudo_files[e.pseudo_files.length - 1]!
  const w = lines.shift()
  if (w === undefined) return false
  // a line occupies whole four-byte words, padded with spaces (TeX's mem words); trailing spaces then go
  const sz = Math.max(2, Math.trunc((w.length + 7) / 4))
  if (4 * sz - 3 >= e.lim.buf_size - e.last) { // Report overflow of the input buffer, and abort
    e.cur_input.loc = e.first; e.cur_input.limit = e.last - 1
    overflow(e, 'buffer size', e.lim.buf_size)
  }
  for (let k = 0; k < 4 * (sz - 1); k++) e.buffer[e.last + k] = w[k] ?? 32
  e.last += 4 * (sz - 1)
  if (e.last >= e.max_buf_stack) e.max_buf_stack = e.last + 1
  while (e.last > e.first && e.buffer[e.last - 1] === 32) e.last--
  return true
}

// etex.ch pseudo_close
export function pseudo_close(e: Engine): void { e.pseudo_files.pop() }

// etex.ch \readline: the rest of the current line as character tokens (catcode 12, spaces 10); returns the list tail
export function read_line_toks(e: Engine, p: number): number {
  const ci = e.cur_input
  while (ci.loc <= ci.limit) {
    e.cur_chr = e.buffer[ci.loc]!; ci.loc++
    e.cur_tok = e.cur_chr === 32 ? 0o5040 : e.cur_chr + other_token
    const q = get_avail(e); e.link[p] = q; e.info[q] = e.cur_tok; p = q
  }
  return p
}

// eTeX_state(TeXXeT_code) and friends are int pars; TeXXeT is not ported
export function no_TeXXeT(e: Engine): void {
  if (TeXXeT_en(e)) fatal_error(e, 'unsupported: TeXXeT')
}
import { fatal_error } from './error.ts'
export { int_base, tok_val }

// etex.ch Handle a glue node for mixed direction typesetting, in hlist_out after rule_wd is known: glue that stretches
// or shrinks becomes a kern of width rule_wd (leaders get a rigid spec instead); SyncTeX then records it as a kern
export function round_mixed_glue(e: Engine, p: GlueNode, b: BoxNode, rule_wd: number): void {
  const g = e.spec[p.glue_ptr]!
  if (!(b.glue_sign === stretching && g.stretch_order === b.glue_order || b.glue_sign === shrinking && g.shrink_order === b.glue_order)) return
  delete_glue_ref(e, p.glue_ptr)
  if (p.subtype < a_leaders) { const k = p as unknown as KernNode; k.type = kern_node; k.width = rule_wd; return }
  const q = new_spec(e, zero_glue), s = e.spec[q]!
  s.stretch_order = s.shrink_order = filll + 1; s.width = rule_wd; s.stretch = 0; s.shrink = 0; p.glue_ptr = q
}
import type { GlueNode, BoxNode, KernNode } from './nodes.ts'
import { stretching, shrinking, a_leaders, kern_node, filll } from './nodes.ts'
