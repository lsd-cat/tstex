// §115–123 one-word token nodes, §150–153 and §177–178 glue specifications, §162 fixed list heads, §200–203 reference counts
// Token lists keep TeX's numeric pointers (info/link arrays, null=0) so that equiv, cur_chr,
// loc and cur_val stay integers as in tex.web; box/glue nodes are objects.
import type { Engine } from './engine.ts'
import { print, print_char, print_esc, print_int, print_ln, print_current_string, print_hex } from './print.ts'
import { print_scaled } from './arith.ts'
import { confusion, overflow } from './error.ts'
import { runaway } from './input.ts'
import { show_token_list } from './tokens.ts'
import { print_file_name } from './files.ts'
import { print_skip_param } from './eqtb.ts'
import { glue_base, box_base, int_base, font_id_base } from './types.ts'
import { sa_box, set_sa_box } from './etex.ts'

const show_box_breadth_code = 24, show_box_depth_code = 25, pdf_tracing_fonts_code = 85

export const temp_head = 1, hold_head = 2, backup_head = 3, garbage = 4, null_list = 5, omit_template = 6

// §120 get_avail
export function get_avail(e: Engine): number {
  let p = e.avail
  if (p !== 0) e.avail = e.link[p]!
  else if ((p = ++e.mem_end) + e.nodes.length > e.lim.main_memory) mem_overflow(e)
  e.link[p] = 0; e.info[p] = 0
  return p
}

function mem_overflow(e: Engine): never { e.mem_end--; runaway(e); overflow(e, 'main memory size', e.lim.main_memory) } // kept out of get_avail, which stays small enough to inline

// §121 free_avail
export function free_avail(e: Engine, p: number): void {
  e.link[p] = e.avail; e.avail = p
}

// §123 flush_list
export function flush_list(e: Engine, p: number): void {
  if (p === 0) return
  let r = p, q = p
  do { q = r; r = e.link[r]! } while (r !== 0)
  e.link[q] = e.avail; e.avail = p
}

// §203 add_token_ref
export function add_token_ref(e: Engine, p: number): void {
  e.info[p]!++
}

// §200 delete_token_ref
export function delete_token_ref(e: Engine, p: number): void {
  if (e.info[p] === 0) flush_list(e, p)
  else e.info[p]!--
}

// §150 glue specifications are objects; a glue pointer is an index into Engine.spec so that eqtb,
// the save stack and cur_val stay integers. As in tex.web, zero_glue=mem_bot=0 coincides with null.
export type GlueSpec = { glue_ref_count: number, width: number, stretch: number, shrink: number, stretch_order: number, shrink_order: number }
export const normal = 0, fil = 1, fill = 2, filll = 3
// §162
export const zero_glue = 0, fil_glue = 1, fill_glue = 2, ss_glue = 3, fil_neg_glue = 4

// §125 get_node(glue_spec_size)
function get_spec(e: Engine): number {
  const q = e.spec_avail.pop() ?? e.spec.length
  e.spec[q] = { glue_ref_count: 0, width: 0, stretch: 0, shrink: 0, stretch_order: normal, shrink_order: normal }
  return q
}

// §151 new_spec
export function new_spec(e: Engine, p: number): number {
  const q = get_spec(e), s = e.spec[p]!
  e.spec[q] = { ...s, glue_ref_count: 0 }
  return q
}

// §164 Initialize the special list heads and constant nodes (the glue part)
export function init_specs(e: Engine): void {
  e.spec = []; e.spec_avail = []
  for (let k = zero_glue; k <= fil_neg_glue; k++) { get_spec(e); e.spec[k]!.glue_ref_count = 1 }
  e.spec[fil_glue]!.stretch = 0o200000; e.spec[fil_glue]!.stretch_order = fil
  e.spec[fill_glue]!.stretch = 0o200000; e.spec[fill_glue]!.stretch_order = fill
  e.spec[ss_glue]!.stretch = 0o200000; e.spec[ss_glue]!.stretch_order = fil
  e.spec[ss_glue]!.shrink = 0o200000; e.spec[ss_glue]!.shrink_order = fil
  e.spec[fil_neg_glue]!.stretch = -0o200000; e.spec[fil_neg_glue]!.stretch_order = fil
}

// §203 add_glue_ref
export function add_glue_ref(e: Engine, p: number): void {
  e.spec[p]!.glue_ref_count++
}

// §201 delete_glue_ref
export function delete_glue_ref(e: Engine, p: number): void {
  const s = e.spec[p]!
  if (s.glue_ref_count === 0) { e.spec[p] = undefined; e.spec_avail.push(p) }
  else s.glue_ref_count--
}

// §177 print_glue
export function print_glue(e: Engine, d: number, order: number, s: string): void {
  print_scaled(e, d)
  if (order < normal || order > filll) print(e, 'foul')
  else if (order > normal) {
    print(e, 'fil')
    while (order > fil) { print_char(e, 108); order-- }
  } else if (s !== '') print(e, s)
}

// §178 print_spec
export function print_spec(e: Engine, p: number, s: string): void {
  const g = e.spec[p]
  if (g === undefined) { print_char(e, 42); return }
  print_scaled(e, g.width)
  if (s !== '') print(e, s)
  if (g.stretch !== 0) { print(e, ' plus '); print_glue(e, g.stretch, g.stretch_order, s) }
  if (g.shrink !== 0) { print(e, ' minus '); print_glue(e, g.shrink, g.shrink_order, s) }
}

// §133–161 box nodes are objects with a |type| discriminant; |link| is an object reference (null for TeX's null).
// Glue specs and token lists stay numeric (indices into Engine.spec and the info/link arrays).
export const char_node = -1, hlist_node = 0, vlist_node = 1, rule_node = 2, ins_node = 3, mark_node = 4, adjust_node = 5,
  ligature_node = 6, disc_node = 7, whatsit_node = 8, math_node = 9, glue_node = 10, kern_node = 11, penalty_node = 12,
  unset_node = 13
export const stretching = 1, shrinking = 2 // §135
export const null_flag = -0o10000000000 // §138
export const before = 0, after = 1, L_code = 4 // §147
export const cond_math_glue = 98, mu_glue = 99, a_leaders = 100, c_leaders = 101, x_leaders = 102 // §149
export const explicit = 1, acc_kern = 2, auto_kern = 3 // §155 (pdftex)
export const inf_penalty = 10000, eject_penalty = -10000 // §157
// §1341 whatsit subtypes (pdftex numbering)
export const open_node = 0, write_node = 1, close_node = 2, special_node = 3, latespecial_node = 4, language_node = 5, pdf_save_pos_node = 23,
  pdf_literal_node = 7, pdf_lateliteral_node = 8, pdf_refobj_node = 10, pdf_refxform_node = 12, pdf_refximage_node = 14, // pdftex.web pdftex_first_extension_code = 7
  pdf_annot_node = 15, pdf_start_link_node = 16, pdf_end_link_node = 17, pdf_dest_node = 19, pdf_thread_node = 20, pdf_start_thread_node = 21,
  pdf_end_thread_node = 22, pdf_colorstack_node = 40, pdf_setmatrix_node = 41, pdf_save_node = 42, pdf_restore_node = 43,
  pdf_interword_space_on_node = 45, pdf_interword_space_off_node = 46, pdf_fake_space_node = 47, pdf_running_link_off_node = 48,
  pdf_running_link_on_node = 49
export const colorstack_set = 0, colorstack_push = 1, colorstack_data = 1, colorstack_pop = 2, colorstack_current = 3
export const pdf_action_page = 0, pdf_action_goto = 1, pdf_action_thread = 2, pdf_action_user = 3
export const pdf_null = -0xFFFFFFF // web2c's null (min_halfword), a value \pdfdest's zoom can hold
export const pdf_dest_xyz = 0, pdf_dest_fit = 1, pdf_dest_fith = 2, pdf_dest_fitv = 3, pdf_dest_fitb = 4, pdf_dest_fitbh = 5,
  pdf_dest_fitbv = 6, pdf_dest_fitr = 7
// pdftex.web [32d] an action; `id' is a token list when named_id is odd, a number otherwise; `tokens' are the page or user tokens
export type PdfAction = { type: number, named_id: number, id: number, file: number, new_window: number, tokens: number,
  struct_id: number, refcount: number }

type Link = { link: Node | null }
// §134 a char_node; list heads are char nodes too (TeX's get_avail), so is_char_node(head) holds as in tex.web
export type CharNode = Link & { type: typeof char_node, font: number, character: number }
// §135 hlist/vlist; an unset node (§159) keeps glue_stretch in glue_set and glue_shrink in shift_amount
export type BoxNode = Link & { type: typeof hlist_node | typeof vlist_node | typeof unset_node, subtype: number, width: number,
  depth: number, height: number, shift_amount: number, list_ptr: Node | null, glue_order: number, glue_sign: number, glue_set: number }
export type RuleNode = Link & { type: typeof rule_node, subtype: number, width: number, depth: number, height: number }
export type InsNode = Link & { type: typeof ins_node, subtype: number, height: number, depth: number, split_top_ptr: number,
  float_cost: number, ins_ptr: Node | null }
export type MarkNode = Link & { type: typeof mark_node, subtype: number, mark_ptr: number, mark_class: number }
export type AdjustNode = Link & { type: typeof adjust_node, subtype: number, adjust_ptr: Node | null } // subtype = adjust_pre
// §143 a ligature; new_lig_item (§144) makes the same shape with font=0 for the main loop's lig_stack
export type LigNode = Link & { type: typeof ligature_node, subtype: number, font: number, character: number, lig_ptr: Node | null }
export type DiscNode = Link & { type: typeof disc_node, replace_count: number, pre_break: Node | null, post_break: Node | null }
export type WhatsitNode = Link & { type: typeof whatsit_node, subtype: number, write_stream: number, write_tokens: number,
  open_name: string, open_area: string, open_ext: string, what_lang: number, what_lhm: number, what_rhm: number,
  // pdftex.web: pdf_data = literal/colorstack/setmatrix data, annot data, link attr, thread attr; pdf_mode = literal mode, colorstack
  // command, dest type; pdf_objnum = refobj/xform/ximage/annot/link/dest-struct object, colorstack stack number; pdf_left/top/right
  // share words 1..3 with pdf_width/height/depth, so they are one field each here: pdf_left is pdf_width, pdf_top is pdf_height,
  // pdf_right is pdf_depth; pdf_named_id/pdf_id the dest/thread identifier, pdf_zoom the xyz zoom (pdf_null when absent)
  pdf_data: number, pdf_mode: number, pdf_objnum: number, pdf_left: number, pdf_top: number, pdf_right: number, pdf_bottom: number,
  pdf_action: PdfAction | null, pdf_named_id: number, pdf_id: number, pdf_zoom: number, pdf_synthetic: boolean }
export type MathNode = Link & { type: typeof math_node, subtype: number, width: number }
export type GlueNode = Link & { type: typeof glue_node, subtype: number, glue_ptr: number, leader_ptr: Node | null }
export type KernNode = Link & { type: typeof kern_node, subtype: number, width: number }
export type PenaltyNode = Link & { type: typeof penalty_node, subtype: number, penalty: number }
export type Node = CharNode | BoxNode | RuleNode | InsNode | MarkNode | AdjustNode | LigNode | DiscNode | WhatsitNode | MathNode
  | GlueNode | KernNode | PenaltyNode | StyleNode | ChoiceNode | Noad

// §681–688 noads. A noad field (nucleus, supscr, subscr, accent_chr) is an object so that scan_math and the
// save stack can point at it; new_hlist, which TeX overlays on the nucleus word, is a field of its own.
export const style_node = 14, choice_node = 15, ord_noad = 16, op_noad = 17, bin_noad = 18, rel_noad = 19, open_noad = 20,
  close_noad = 21, punct_noad = 22, inner_noad = 23, radical_noad = 24, fraction_noad = 25, under_noad = 26, over_noad = 27,
  accent_noad = 28, vcenter_noad = 29, left_noad = 30, right_noad = 31
export const math_char = 1, sub_box = 2, sub_mlist = 3, math_text_char = 4 // §681 math_type; empty = 0
export const limits = 1, no_limits = 2 // §682
export const default_code = 0o10000000000 // §683
export const display_style = 0, text_style = 2, script_style = 4, script_script_style = 6, cramped = 1 // §688
export type Field = { math_type: number, fam: number, character: number, info: Node | null }
export type Delim = { small_fam: number, small_char: number, large_fam: number, large_char: number }
// numerator==supscr, denominator==subscr (§683); a left/right noad keeps delimiter(p) in left_delimiter
type NoadType = typeof ord_noad | typeof op_noad | typeof bin_noad | typeof rel_noad | typeof open_noad | typeof close_noad
  | typeof punct_noad | typeof inner_noad | typeof radical_noad | typeof fraction_noad | typeof under_noad | typeof over_noad
  | typeof accent_noad | typeof vcenter_noad | typeof left_noad | typeof right_noad
export type Noad = Link & { type: NoadType, subtype: number, nucleus: Field, supscr: Field, subscr: Field, new_hlist: Node | null,
  left_delimiter: Delim, right_delimiter: Delim, accent_chr: Field, thickness: number }
export type StyleNode = Link & { type: typeof style_node, subtype: number, width: number, depth: number }
export type ChoiceNode = Link & { type: typeof choice_node, subtype: number, display_mlist: Node | null, text_mlist: Node | null,
  script_mlist: Node | null, script_script_mlist: Node | null }
export const empty_field = (): Field => ({ math_type: 0, fam: 0, character: 0, info: null }) // §684
export const null_delimiter = (): Delim => ({ small_fam: 0, small_char: 0, large_fam: 0, large_char: 0 })

// §686 new_noad (also the radical, fraction and accent noads of §1163, §1165, §1181)
export function new_noad(): Noad {
  return { type: ord_noad, link: null, subtype: normal, nucleus: empty_field(), supscr: empty_field(), subscr: empty_field(),
    new_hlist: null, left_delimiter: null_delimiter(), right_delimiter: null_delimiter(), accent_chr: empty_field(), thickness: 0 }
}
// §688 new_style
export const new_style = (s: number): StyleNode => ({ type: style_node, link: null, subtype: s, width: 0, depth: 0 })
// §689 new_choice
export const new_choice = (): ChoiceNode => ({ type: choice_node, link: null, subtype: 0, display_mlist: null, text_mlist: null,
  script_mlist: null, script_script_mlist: null })

export const is_char_node = (p: Node): p is CharNode => p.type === char_node

// §120 get_avail as a list head or char node
export const new_char = (f: number, c: number): CharNode => ({ type: char_node, link: null, font: f, character: c })

// §136 new_null_box
export function new_null_box(): BoxNode {
  return { type: hlist_node, link: null, subtype: 0, width: 0, depth: 0, height: 0, shift_amount: 0, list_ptr: null,
    glue_order: normal, glue_sign: normal, glue_set: 0 }
}

// §139 new_rule
export function new_rule(): RuleNode {
  return { type: rule_node, link: null, subtype: 0, width: null_flag, depth: null_flag, height: null_flag }
}

// §144 new_ligature, new_lig_item
export function new_ligature(f: number, c: number, q: Node | null): LigNode {
  return { type: ligature_node, link: null, subtype: 0, font: f, character: c, lig_ptr: q }
}
export const new_lig_item = (c: number): LigNode => new_ligature(0, c, null)

// §145 new_disc
export const new_disc = (): DiscNode => ({ type: disc_node, link: null, replace_count: 0, pre_break: null, post_break: null })

// §147 new_math
export const new_math = (w: number, s: number): MathNode => ({ type: math_node, link: null, subtype: s, width: w })

// §1341 a whatsit with every field present
export function new_whatsit_node(s: number): WhatsitNode {
  return { type: whatsit_node, link: null, subtype: s, write_stream: 0, write_tokens: 0, open_name: '', open_area: '', open_ext: '',
    what_lang: 0, what_lhm: 0, what_rhm: 0, pdf_data: 0, pdf_mode: 0, pdf_objnum: 0, pdf_left: 0, pdf_top: 0, pdf_right: 0, pdf_bottom: 0,
    pdf_action: null, pdf_named_id: 0, pdf_id: 0, pdf_zoom: 0, pdf_synthetic: false }
}

// §152 new_param_glue
export function new_param_glue(e: Engine, n: number): GlueNode {
  const q = e.equiv[glue_base + n]!
  e.spec[q]!.glue_ref_count++
  return { type: glue_node, link: null, subtype: n + 1, glue_ptr: q, leader_ptr: null }
}

// §153 new_glue
export function new_glue(e: Engine, q: number): GlueNode {
  e.spec[q]!.glue_ref_count++
  return { type: glue_node, link: null, subtype: normal, glue_ptr: q, leader_ptr: null }
}

// §154 new_skip_param; e.temp_ptr is the new spec
export function new_skip_param(e: Engine, n: number): GlueNode {
  e.temp_ptr = new_spec(e, e.equiv[glue_base + n]!)
  const p = new_glue(e, e.temp_ptr); e.spec[e.temp_ptr]!.glue_ref_count = 0; p.subtype = n + 1
  return p
}

// §156 new_kern
export const new_kern = (w: number): KernNode => ({ type: kern_node, link: null, subtype: normal, width: w })

// §158 new_penalty
export const new_penalty = (m: number): PenaltyNode => ({ type: penalty_node, link: null, subtype: 0, penalty: m })

// eqtb holds integers, so a box register (or any node pointer kept in eqtb or the save stack) holds a handle into
// Engine.nodes; 0 is null. Each define allocates a fresh handle, and eq_destroy or change_box releases it.
export function node_ref(e: Engine, p: Node | null): number {
  if (p === null) return 0
  const h = e.nodes_free.pop() ?? e.nodes.length
  if (h === e.nodes.length && e.mem_end + h >= e.lim.main_memory) overflow(e, 'main memory size', e.lim.main_memory)
  e.nodes[h] = p
  return h
}
export const node_at = (e: Engine, h: number): Node | null => h === 0 ? null : e.nodes[h]!
export function node_free(e: Engine, h: number): void {
  if (h !== 0) { e.nodes[h] = null; e.nodes_free.push(h) }
}
// §230 box(n), and change_box (etex.ch) which sets box(n) at the same level without saving
// (etex.ch fetch_box: registers above 255 are sparse array elements)
export const box = (e: Engine, n: number): BoxNode | null =>
  (n > 255 ? sa_box(e, n) : node_at(e, e.equiv[box_base + n]!)) as BoxNode | null
export function change_box(e: Engine, n: number, p: Node | null): void {
  if (n > 255) { set_sa_box(e, n, p); return }
  node_free(e, e.equiv[box_base + n]!); e.equiv[box_base + n] = node_ref(e, p)
}

// §202 flush_node_list
export function flush_node_list(e: Engine, p: Node | null): void {
  while (p !== null) {
    const q: Node | null = p.link
    switch (p.type) {
      case char_node: case rule_node: case kern_node: case math_node: case penalty_node: break
      case hlist_node: case vlist_node: case unset_node: flush_node_list(e, p.list_ptr); break
      case ins_node: flush_node_list(e, p.ins_ptr); delete_glue_ref(e, p.split_top_ptr); break
      case whatsit_node: // §1358
        whatsit_refs(e, p, -1); break
      case glue_node: delete_glue_ref(e, p.glue_ptr); flush_node_list(e, p.leader_ptr); break
      case ligature_node: flush_node_list(e, p.lig_ptr); break
      case mark_node: delete_token_ref(e, p.mark_ptr); break
      case disc_node: flush_node_list(e, p.pre_break); flush_node_list(e, p.post_break); break
      case adjust_node: flush_node_list(e, p.adjust_ptr); break
      case style_node: break // §698
      case choice_node:
        flush_node_list(e, p.display_mlist); flush_node_list(e, p.text_mlist)
        flush_node_list(e, p.script_mlist); flush_node_list(e, p.script_script_mlist)
        break
      case ord_noad: case op_noad: case bin_noad: case rel_noad: case open_noad: case close_noad: case punct_noad: case inner_noad:
      case radical_noad: case over_noad: case under_noad: case vcenter_noad: case accent_noad:
        if (p.nucleus.math_type >= sub_box) flush_node_list(e, p.nucleus.info)
        if (p.supscr.math_type >= sub_box) flush_node_list(e, p.supscr.info)
        if (p.subscr.math_type >= sub_box) flush_node_list(e, p.subscr.info)
        break
      case left_noad: case right_noad: break
      case fraction_noad: flush_node_list(e, p.supscr.info); flush_node_list(e, p.subscr.info); break
      default: confusion(e, 'flushing')
    }
    p = q
  }
}

// pdftex.web delete_action_ref
export function delete_action_ref(e: Engine, a: PdfAction): void {
  if (a.refcount > 0) { a.refcount--; return }
  const del = (t: number) => { if (t !== 0) delete_token_ref(e, t) }
  if (a.type === pdf_action_user) del(a.tokens)
  else {
    del(a.file)
    if (a.type === pdf_action_page) del(a.tokens); else if ((a.named_id & 1) === 1) del(a.id)
    if ((a.named_id & 2) === 2) del(a.struct_id)
  }
}

// §1357/§1358 (pdftex.web) the token lists and actions a whatsit holds: d = 1 adds a reference (copy), d = -1 deletes one (flush)
function whatsit_refs(e: Engine, p: WhatsitNode, d: number): void {
  const ref = (t: number) => { if (t !== 0) { if (d > 0) add_token_ref(e, t); else delete_token_ref(e, t) } }
  switch (p.subtype) {
    case write_node: case special_node: case latespecial_node: ref(p.write_tokens); return
    case pdf_literal_node: case pdf_lateliteral_node: case pdf_setmatrix_node: case pdf_annot_node: ref(p.pdf_data); return
    case pdf_colorstack_node: if (p.pdf_mode <= colorstack_data) ref(p.pdf_data); return
    case pdf_start_link_node: {
      ref(p.pdf_data)
      if (d > 0) p.pdf_action!.refcount++; else delete_action_ref(e, p.pdf_action!)
      return
    }
    case pdf_dest_node: if (p.pdf_named_id > 0) ref(p.pdf_id); return
    case pdf_thread_node: case pdf_start_thread_node: if (p.pdf_named_id > 0) ref(p.pdf_id); ref(p.pdf_data); return
    case open_node: case close_node: case language_node: case pdf_save_pos_node: case pdf_refobj_node: case pdf_save_node: case pdf_restore_node:
    case pdf_refxform_node: case pdf_refximage_node: case pdf_end_link_node: case pdf_end_thread_node: case pdf_interword_space_on_node:
    case pdf_interword_space_off_node: case pdf_fake_space_node: case pdf_running_link_off_node: case pdf_running_link_on_node: return
    default: confusion(e, d > 0 ? 'ext2' : 'ext3')
  }
}

// §204 copy_node_list
export function copy_node_list(e: Engine, p: Node | null): Node | null {
  const h = new_char(0, 0)
  let q: Node = h
  while (p !== null) {
    // §205 Make a copy of node p in node r
    let r: Node
    switch (p.type) {
      case hlist_node: case vlist_node: case unset_node: r = { ...p, list_ptr: copy_node_list(e, p.list_ptr) }; break
      case ins_node: add_glue_ref(e, p.split_top_ptr); r = { ...p, ins_ptr: copy_node_list(e, p.ins_ptr) }; break
      case whatsit_node: // §1357
        whatsit_refs(e, p, 1); r = { ...p }; break
      case glue_node: add_glue_ref(e, p.glue_ptr); r = { ...p, leader_ptr: copy_node_list(e, p.leader_ptr) }; break
      case ligature_node: r = { ...p, lig_ptr: copy_node_list(e, p.lig_ptr) }; break
      case disc_node: r = { ...p, pre_break: copy_node_list(e, p.pre_break), post_break: copy_node_list(e, p.post_break) }; break
      case mark_node: add_token_ref(e, p.mark_ptr); r = { ...p }; break
      case adjust_node: r = { ...p, adjust_ptr: copy_node_list(e, p.adjust_ptr) }; break
      case char_node: case rule_node: case kern_node: case math_node: case penalty_node: r = { ...p }; break
      default: confusion(e, 'copying')
    }
    q.link = r; q = r; p = p.link
  }
  q.link = null
  return h.link
}

// §174 print_font_identifier (pdftex.web: an expanded font shows its base font's name, and its ratio unless \pdftracingfonts>0)
export function print_font_identifier(e: Engine, f: number): void {
  print_esc(e, e.text.get(font_id_base + (e.pdf_font_blink[f] === 0 ? f : e.pdf_font_blink[f]!)) ?? 0)
  if (e.equiv[int_base + pdf_tracing_fonts_code]! > 0) {
    print(e, ' ('); print(e, e.font_name[f]!)
    if (e.font_size[f] !== e.font_dsize[f]) { print(e, '@'); print_scaled(e, e.font_size[f]!); print(e, 'pt') }
    print(e, ')')
  } else if (e.pdf_font_expand_ratio[f] !== 0) {
    print(e, ' ('); if (e.pdf_font_expand_ratio[f]! > 0) print(e, '+'); print_int(e, e.pdf_font_expand_ratio[f]!); print(e, ')')
  }
}

// §174 short_display
export function short_display(e: Engine, p: Node | null): void {
  while (p !== null) {
    if (is_char_node(p)) {
      if (p.font !== e.font_in_short_display) {
        if (p.font < 0 || p.font > e.font_ptr) print_char(e, 42)
        else print_font_identifier(e, p.font)
        print_char(e, 32); e.font_in_short_display = p.font
      }
      print(e, p.character)
    } else switch (p.type) { // §175 Print a short indication of the contents of node p
      case hlist_node: case vlist_node: case ins_node: case whatsit_node: case mark_node: case adjust_node: case unset_node:
        print(e, '[]'); break
      case rule_node: print_char(e, 124); break
      case glue_node: if (p.glue_ptr !== zero_glue) print_char(e, 32); break
      case math_node: if (p.subtype >= L_code) print(e, '[]'); else print_char(e, 36); break
      case ligature_node: short_display(e, p.lig_ptr); break
      case disc_node: {
        short_display(e, p.pre_break); short_display(e, p.post_break)
        let n = p.replace_count
        while (n > 0) { if (p.link !== null) p = p.link; n-- }
        break
      }
    }
    p = p.link
  }
}

// §176 print_font_and_char, print_mark, print_rule_dimen
export function print_font_and_char(e: Engine, f: number, c: number): void {
  if (f < 0 || f > e.font_ptr) print_char(e, 42)
  else print_font_identifier(e, f)
  print_char(e, 32); print(e, c)
}
export function print_mark(e: Engine, p: number): void {
  print_char(e, 123); show_token_list(e, e.link[p]!, 0, e.lim.max_print_line - 10); print_char(e, 125)
}
export function print_rule_dimen(e: Engine, d: number): void {
  if (d === null_flag) print_char(e, 42); else print_scaled(e, d)
}

// pdftex.web Display <rule spec> for whatsit node created by pdfTeX
function print_rule_spec(e: Engine, p: WhatsitNode): void {
  print(e, '('); print_rule_dimen(e, p.pdf_top); print_char(e, 43); print_rule_dimen(e, p.pdf_right); print(e, ')x'); print_rule_dimen(e, p.pdf_left)
}

// §1356 print_write_whatsit
function print_write_whatsit(e: Engine, s: string, p: WhatsitNode): void {
  print_esc(e, s)
  if (p.write_stream < 16) print_int(e, p.write_stream)
  else if (p.write_stream === 16) print_char(e, 42)
  else print_char(e, 45)
}

// glue_set's high 32 bits, which tex.web's mem[p+glue_offset].int reads on a little-endian web2c build
const gr = new Float64Array(1), gr_int = new Int32Array(gr.buffer)
// web2c zround
export function zround(r: number): number {
  if (r > 2147483647) return 2147483647
  if (r < -2147483647) return -2147483647
  return r >= 0 ? Math.floor(r + 0.5) : Math.ceil(r - 0.5)
}

// §182 show_node_list; node_list_display appends '.' to the current string
function node_list_display(e: Engine, p: Node | null, c = 46): void {
  e.cur_str.push(c); show_node_list(e, p); e.cur_str.pop()
}
export function show_node_list(e: Engine, p: Node | null): void {
  if (e.cur_str.length > e.depth_threshold) {
    if (p !== null) print(e, ' []')
    return
  }
  let n = 0
  while (p !== null) {
    print_ln(e); print_current_string(e)
    if (++n > e.breadth_max) { print(e, 'etc.'); return }
    // §183 Display node p
    switch (p.type) {
      case char_node: print_font_and_char(e, p.font, p.character); break
      case hlist_node: case vlist_node: case unset_node: { // §184 Display box p
        if (p.type === hlist_node) print_esc(e, 'h')
        else if (p.type === vlist_node) print_esc(e, 'v')
        else print_esc(e, 'unset')
        print(e, 'box('); print_scaled(e, p.height); print_char(e, 43)
        print_scaled(e, p.depth); print(e, ')x'); print_scaled(e, p.width)
        if (p.type === unset_node) { // §185
          if (p.subtype !== 0) { print(e, ' ('); print_int(e, p.subtype + 1); print(e, ' columns)') }
          if (p.glue_set !== 0) { print(e, ', stretch '); print_glue(e, p.glue_set, p.glue_order, '') }
          if (p.shift_amount !== 0) { print(e, ', shrink '); print_glue(e, p.shift_amount, p.glue_sign, '') }
        } else {
          const g = p.glue_set // §186 Display the value of glue_set(p)
          if (g !== 0 && p.glue_sign !== normal) {
            print(e, ', glue set ')
            if (p.glue_sign === shrinking) print(e, '- ')
            gr[0] = g
            if (Math.abs(gr_int[1]!) < 0o4000000) print(e, '?.?')
            else if (Math.abs(g) > 20000) {
              if (g > 0) print_char(e, 62); else print(e, '< -')
              print_glue(e, 20000 * 0o200000, p.glue_order, '')
            } else print_glue(e, zround(0o200000 * g), p.glue_order, '')
          }
          if (p.shift_amount !== 0) { print(e, ', shifted '); print_scaled(e, p.shift_amount) }
          if (e.eTeX_ex && p.type === hlist_node && p.subtype === 2) print(e, ', display') // etex.ch: box_lr(p)=dlist
        }
        node_list_display(e, p.list_ptr)
        break
      }
      case rule_node: // §187
        print_esc(e, 'rule('); print_rule_dimen(e, p.height); print_char(e, 43)
        print_rule_dimen(e, p.depth); print(e, ')x'); print_rule_dimen(e, p.width)
        break
      case ins_node: // §188
        print_esc(e, 'insert'); print_int(e, p.subtype); print(e, ', natural size '); print_scaled(e, p.height)
        print(e, '; split('); print_spec(e, p.split_top_ptr, ''); print_char(e, 44); print_scaled(e, p.depth)
        print(e, '); float cost '); print_int(e, p.float_cost)
        node_list_display(e, p.ins_ptr)
        break
      case whatsit_node: // §1356 Display the whatsit node p
        switch (p.subtype) {
          case open_node: print_write_whatsit(e, 'openout', p); print_char(e, 61); print_file_name(e, p.open_name, p.open_area, p.open_ext); break
          case write_node: print_write_whatsit(e, 'write', p); print_mark(e, p.write_tokens); break
          case close_node: print_write_whatsit(e, 'closeout', p); break
          case special_node: print_esc(e, 'special'); print_mark(e, p.write_tokens); break
          case latespecial_node: print_esc(e, 'special'); print(e, ' shipout'); print_mark(e, p.write_tokens); break
          case language_node:
            print_esc(e, 'setlanguage'); print_int(e, p.what_lang); print(e, ' (hyphenmin ')
            print_int(e, p.what_lhm); print_char(e, 44); print_int(e, p.what_rhm); print_char(e, 41)
            break
          case pdf_save_pos_node: print_esc(e, 'pdfsavepos'); break
          case pdf_literal_node: case pdf_lateliteral_node: // pdftex.web
            print_esc(e, 'pdfliteral')
            if (p.subtype === pdf_lateliteral_node) print(e, ' shipout')
            if (p.pdf_mode === 1) print(e, ' page'); else if (p.pdf_mode === 2) print(e, ' direct'); else if (p.pdf_mode !== 0) confusion(e, 'literal2')
            print_mark(e, p.pdf_data); break
          case pdf_refobj_node: { // pdftex.web; the object's data lives in pdf_mem
            const d = e.ps.obj_aux[p.pdf_objnum]!, m = e.ps.mem
            print_esc(e, 'pdfrefobj')
            if (m[d + 1]! > 0) { if (m[d + 2]! !== 0) { print(e, ' attr'); print_mark(e, m[d + 2]!) } print(e, ' stream') }
            if (m[d + 3]! > 0) print(e, ' file')
            print_mark(e, m[d]!); break
          }
          case pdf_colorstack_node:
            print_esc(e, 'pdfcolorstack '); print_int(e, p.pdf_objnum)
            switch (p.pdf_mode) {
              case colorstack_set: print(e, ' set '); break
              case colorstack_push: print(e, ' push '); break
              case colorstack_pop: print(e, ' pop'); break
              case colorstack_current: print(e, ' current'); break
              default: confusion(e, 'pdfcolorstack')
            }
            if (p.pdf_mode <= colorstack_data) print_mark(e, p.pdf_data)
            break
          case pdf_setmatrix_node: print_esc(e, 'pdfsetmatrix'); print_mark(e, p.pdf_data); break
          case pdf_save_node: print_esc(e, 'pdfsave'); break
          case pdf_restore_node: print_esc(e, 'pdfrestore'); break
          case pdf_refxform_node: case pdf_refximage_node: { // the form's/image's dimensions live in pdf_mem
            const m = e.ps.mem, d = e.ps.obj_aux[p.pdf_objnum]!
            print_esc(e, p.subtype === pdf_refxform_node ? 'pdfrefxform' : 'pdfrefximage')
            print(e, '('); print_scaled(e, m[d + 1]!); print_char(e, 43); print_scaled(e, m[d + 2]!); print(e, ')x'); print_scaled(e, m[d]!)
            break
          }
          case pdf_annot_node: print_esc(e, 'pdfannot'); print_rule_spec(e, p); print_mark(e, p.pdf_data); break
          case pdf_start_link_node: {
            print_esc(e, 'pdfstartlink'); print_rule_spec(e, p)
            if (p.pdf_data !== 0) { print(e, ' attr'); print_mark(e, p.pdf_data) }
            print(e, ' action')
            const a = p.pdf_action!
            if (a.type === pdf_action_user) { print(e, ' user'); print_mark(e, a.tokens) }
            else {
              if (a.file !== 0) { print(e, ' file'); print_mark(e, a.file) }
              if (a.type === pdf_action_goto) {
                if (a.named_id % 2 === 1) { print(e, ' goto name'); print_mark(e, a.id) } else { print(e, ' goto num'); print_int(e, a.id) }
              } else if (a.type === pdf_action_page) { print(e, ' page'); print_int(e, a.id); print_mark(e, a.tokens) }
              else if (a.named_id % 2 === 1) { print(e, ' thread name'); print_mark(e, a.id) } else { print(e, ' thread num'); print_int(e, a.id) }
            }
            break
          }
          case pdf_end_link_node: print_esc(e, 'pdfendlink'); break
          case pdf_dest_node:
            print_esc(e, 'pdfdest')
            if (p.pdf_objnum !== 0) { print(e, ' struct'); print_int(e, p.pdf_objnum) }
            if (p.pdf_named_id > 0) { print(e, ' name'); print_mark(e, p.pdf_id) } else { print(e, ' num'); print_int(e, p.pdf_id) }
            print(e, ' ')
            switch (p.pdf_mode) {
              case pdf_dest_xyz: print(e, 'xyz'); if (p.pdf_zoom !== pdf_null) { print(e, ' zoom'); print_int(e, p.pdf_zoom) } break
              case pdf_dest_fitbh: print(e, 'fitbh'); break
              case pdf_dest_fitbv: print(e, 'fitbv'); break
              case pdf_dest_fitb: print(e, 'fitb'); break
              case pdf_dest_fith: print(e, 'fith'); break
              case pdf_dest_fitv: print(e, 'fitv'); break
              case pdf_dest_fitr: print(e, 'fitr'); print_rule_spec(e, p); break
              case pdf_dest_fit: print(e, 'fit'); break
              default: print(e, 'unknown!')
            }
            break
          case pdf_thread_node: case pdf_start_thread_node:
            print_esc(e, p.subtype === pdf_thread_node ? 'pdfthread' : 'pdfstartthread'); print_rule_spec(e, p)
            if (p.pdf_data !== 0) { print(e, ' attr'); print_mark(e, p.pdf_data) }
            if (p.pdf_named_id > 0) { print(e, ' name'); print_mark(e, p.pdf_id) } else { print(e, ' num'); print_int(e, p.pdf_id) }
            break
          case pdf_end_thread_node: print_esc(e, 'pdfendthread'); break
          case pdf_interword_space_on_node: print_esc(e, 'pdfinterwordspaceon'); break
          case pdf_interword_space_off_node: print_esc(e, 'pdfinterwordspaceoff'); break
          case pdf_fake_space_node: print_esc(e, 'pdffakespace'); break
          case pdf_running_link_off_node: print_esc(e, 'pdfrunninglinkoff'); break
          case pdf_running_link_on_node: print_esc(e, 'pdfrunninglinkon'); break
          default: print(e, 'whatsit?')
        }
        break
      case glue_node: // §189
        if (p.subtype >= a_leaders) { // §190 Display leaders p
          print_esc(e, '')
          if (p.subtype === c_leaders) print_char(e, 99)
          else if (p.subtype === x_leaders) print_char(e, 120)
          print(e, 'leaders '); print_spec(e, p.glue_ptr, '')
          node_list_display(e, p.leader_ptr)
        } else {
          print_esc(e, 'glue')
          if (p.subtype !== normal) {
            print_char(e, 40)
            if (p.subtype < cond_math_glue) print_skip_param(e, p.subtype - 1)
            else if (p.subtype === cond_math_glue) print_esc(e, 'nonscript')
            else print_esc(e, 'mskip')
            print_char(e, 41)
          }
          if (p.subtype !== cond_math_glue) {
            print_char(e, 32)
            print_spec(e, p.glue_ptr, p.subtype < cond_math_glue ? '' : 'mu')
          }
        }
        break
      case kern_node: // §191
        if (p.subtype !== mu_glue) {
          print_esc(e, 'kern')
          if (p.subtype !== normal) print_char(e, 32)
          print_scaled(e, p.width)
          if (p.subtype === acc_kern) print(e, ' (for accent)')
          if (p.subtype === auto_kern) print(e, ' (for \\pdfprependkern/\\pdfappendkern)')
        } else { print_esc(e, 'mkern'); print_scaled(e, p.width); print(e, 'mu') }
        break
      case math_node: // §192
        if (p.subtype > after) {
          print_esc(e, (p.subtype & 1) !== 0 ? 'end' : 'begin')
          print_char(e, p.subtype > 2 * L_code ? 82 : p.subtype > L_code ? 76 : 77)
        } else {
          print_esc(e, 'math'); print(e, p.subtype === before ? 'on' : 'off')
          if (p.width !== 0) { print(e, ', surrounded '); print_scaled(e, p.width) }
        }
        break
      case ligature_node: // §193
        print_font_and_char(e, p.font, p.character); print(e, ' (ligature ')
        if (p.subtype > 1) print_char(e, 124)
        e.font_in_short_display = p.font; short_display(e, p.lig_ptr)
        if ((p.subtype & 1) !== 0) print_char(e, 124)
        print_char(e, 41)
        break
      case penalty_node: print_esc(e, 'penalty '); print_int(e, p.penalty); break // §194
      case disc_node: // §195
        print_esc(e, 'discretionary')
        if (p.replace_count > 0) { print(e, ' replacing '); print_int(e, p.replace_count) }
        node_list_display(e, p.pre_break)
        node_list_display(e, p.post_break, 124)
        break
      case mark_node: // §196
        print_esc(e, 'mark')
        if (p.mark_class !== 0) { print_char(e, 115); print_int(e, p.mark_class) }
        print_mark(e, p.mark_ptr)
        break
      case adjust_node: // §197
        print_esc(e, 'vadjust'); if (p.subtype !== 0) print(e, ' pre ')
        node_list_display(e, p.adjust_ptr)
        break
      case style_node: print_style(e, p.subtype); break // §690
      case choice_node: // §695 Display choice node p
        print_esc(e, 'mathchoice')
        node_list_display(e, p.display_mlist, 68); node_list_display(e, p.text_mlist, 84)
        node_list_display(e, p.script_mlist, 83); node_list_display(e, p.script_script_mlist, 115)
        break
      case fraction_noad: { // §697 Display fraction noad p
        print_esc(e, 'fraction, thickness ')
        if (p.thickness === default_code) print(e, '= default'); else print_scaled(e, p.thickness)
        const l = p.left_delimiter, r = p.right_delimiter
        if (l.small_fam !== 0 || l.small_char !== 0 || l.large_fam !== 0 || l.large_char !== 0) {
          print(e, ', left-delimiter '); print_delimiter(e, l)
        }
        if (r.small_fam !== 0 || r.small_char !== 0 || r.large_fam !== 0 || r.large_char !== 0) {
          print(e, ', right-delimiter '); print_delimiter(e, r)
        }
        print_subsidiary_data(e, p.supscr, 92); print_subsidiary_data(e, p.subscr, 47)
        break
      }
      case ord_noad: case op_noad: case bin_noad: case rel_noad: case open_noad: case close_noad: case punct_noad: case inner_noad:
      case radical_noad: case over_noad: case under_noad: case vcenter_noad: case accent_noad: case left_noad: case right_noad: // §696
        switch (p.type) {
          case ord_noad: print_esc(e, 'mathord'); break
          case op_noad: print_esc(e, 'mathop'); break
          case bin_noad: print_esc(e, 'mathbin'); break
          case rel_noad: print_esc(e, 'mathrel'); break
          case open_noad: print_esc(e, 'mathopen'); break
          case close_noad: print_esc(e, 'mathclose'); break
          case punct_noad: print_esc(e, 'mathpunct'); break
          case inner_noad: print_esc(e, 'mathinner'); break
          case over_noad: print_esc(e, 'overline'); break
          case under_noad: print_esc(e, 'underline'); break
          case vcenter_noad: print_esc(e, 'vcenter'); break
          case radical_noad: print_esc(e, 'radical'); print_delimiter(e, p.left_delimiter); break
          case accent_noad: print_esc(e, 'accent'); print_fam_and_char(e, p.accent_chr); break
          case left_noad: print_esc(e, 'left'); print_delimiter(e, p.left_delimiter); break
          case right_noad: print_esc(e, p.subtype === normal ? 'right' : 'middle'); print_delimiter(e, p.left_delimiter); break
        }
        if (p.type < left_noad) {
          if (p.subtype !== normal) print_esc(e, p.subtype === limits ? 'limits' : 'nolimits')
          print_subsidiary_data(e, p.nucleus, 46)
        }
        print_subsidiary_data(e, p.supscr, 94); print_subsidiary_data(e, p.subscr, 95)
        break
      default: print(e, 'Unknown node type!')
    }
    p = p.link
  }
}

// §691 print_fam_and_char, print_delimiter
export function print_fam_and_char(e: Engine, p: Field): void {
  print_esc(e, 'fam'); print_int(e, p.fam); print_char(e, 32); print(e, p.character)
}
export function print_delimiter(e: Engine, p: Delim): void {
  let a = p.small_fam * 256 + p.small_char
  a = a * 0x1000 + p.large_fam * 256 + p.large_char
  if (a < 0) print_int(e, a); else print_hex(e, a)
}

// §692 print_subsidiary_data
function print_subsidiary_data(e: Engine, p: Field, c: number): void {
  if (e.cur_str.length >= e.depth_threshold) {
    if (p.math_type !== 0) print(e, ' []')
    return
  }
  e.cur_str.push(c)
  switch (p.math_type) {
    case math_char: print_ln(e); print_current_string(e); print_fam_and_char(e, p); break
    case sub_box: show_node_list(e, p.info); break
    case sub_mlist:
      if (p.info === null) { print_ln(e); print_current_string(e); print(e, '{}') }
      else show_node_list(e, p.info)
      break
  }
  e.cur_str.pop()
}

// §694 print_style
export function print_style(e: Engine, c: number): void {
  switch (Math.trunc(c / 2)) {
    case 0: print_esc(e, 'displaystyle'); break
    case 1: print_esc(e, 'textstyle'); break
    case 2: print_esc(e, 'scriptstyle'); break
    case 3: print_esc(e, 'scriptscriptstyle'); break
    default: print(e, 'Unknown style!')
  }
}

// §198 show_box
export function show_box(e: Engine, p: Node | null): void {
  e.depth_threshold = e.equiv[int_base + show_box_depth_code]!
  e.breadth_max = e.equiv[int_base + show_box_breadth_code]!
  if (e.breadth_max <= 0) e.breadth_max = 5
  show_node_list(e, p)
  print_ln(e)
}
