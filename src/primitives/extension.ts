// §1344–1378 \openout \write \closeout \special \immediate \setlanguage (pdfTeX's extensions are registered, not supported)
import type { Engine } from '../engine.ts'
import { Cmd, hmode, vmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { int_par } from '../eqtb.ts'
import { delete_token_ref, new_whatsit_node, flush_node_list, open_node, write_node, close_node, special_node, latespecial_node, language_node, pdf_save_pos_node,
  pdf_literal_node, pdf_lateliteral_node, pdf_refobj_node, pdf_setmatrix_node, pdf_save_node, pdf_restore_node } from '../nodes.ts'
import type { WhatsitNode } from '../nodes.ts'
import { scan_int, scan_four_bit_int, scan_optional_equals, scan_toks, scan_keyword } from '../scan.ts'
import { scan_file_name } from '../files.ts'
import { get_x_token } from '../expand.ts'
import { back_input } from '../input.ts'
import { out_what } from '../dvi.ts'
import { init_randoms } from '../arith.ts'
import { unsupported, report_illegal_case, tail_append, norm_min } from '../main.ts'
import { tokens_to_string } from '../tokens.ts'
import { str } from '../utils.ts'
import { def_tounicode } from '../backend/fonts.ts'
import { pdf_error, pdf_warning, pdf_create_obj, pdf_get_mem, pdf_write_obj, obj_type_obj, obj_type_others, set_origin, direct_page, direct_always,
  pdf_new_obj, pdf_end_obj, write_action, pdf_check_obj, pdf_new_objnum, find_obj, warn_dest_dup, pdf_print_str_ln,
  obj_type_dest, obj_type_struct_dest, obj_type_outline, colorstackused, pdf_check_vf, pdf_init_font, pdf_mark_char } from '../pdf.ts'
import type { PdfAction } from '../nodes.ts'
import { pdf_action_user, pdf_action_goto, pdf_action_thread, pdf_action_page, free_avail, delete_action_ref, pdf_annot_node, pdf_start_link_node,
  pdf_end_link_node, pdf_dest_node, pdf_thread_node, pdf_start_thread_node, pdf_end_thread_node, null_flag, pdf_null, pdf_dest_xyz, pdf_dest_fit,
  pdf_dest_fith, pdf_dest_fitv, pdf_dest_fitb, pdf_dest_fitbh, pdf_dest_fitbv, pdf_dest_fitr, pdf_colorstack_node, colorstack_set,
  colorstack_push, colorstack_pop, colorstack_current, colorstack_data } from '../nodes.ts'
import { print_err, help, error } from '../error.ts'
import { print_int } from '../print.ts'
import { scan_normal_dimen } from '../scan.ts'
import { scan_font_ident, null_font } from '../tfm.ts'

// pdftex.web check_pdfoutput
function check_pdfoutput(e: Engine, s: string, is_error: boolean): void {
  if (int_par(e, 65) > 0) return
  if (is_error) pdf_error(e, s, 'not allowed in DVI mode (\\pdfoutput <= 0)')
  pdf_warning(e, s, 'not allowed in DVI mode (\\pdfoutput <= 0); ignoring it', true, true)
}

const max_halfword = 0xFFFFFFF, pdf_outline_code = 18
const pdf_info_code = 24, pdf_catalog_code = 25, pdf_names_code = 26, pdf_include_chars_code = 28, pdf_trailer_code = 31, pdf_trailer_id_code = 32
const pdf_obj_code = 9, immediate_code = 5, set_language_code = 6, pdf_glyph_to_unicode_code = 39, set_random_seed_code = 35, reset_timer_code = 33
const names: Record<number, string> = { 0: 'openout', 1: 'write', 2: 'closeout', 3: 'special', 5: 'immediate', 6: 'setlanguage',
  7: 'pdfliteral', 40: 'pdfcolorstack', 41: 'pdfsetmatrix', 42: 'pdfsave', 43: 'pdfrestore', 9: 'pdfobj', 10: 'pdfrefobj',
  11: 'pdfxform', 12: 'pdfrefxform', 13: 'pdfximage', 14: 'pdfrefximage', 15: 'pdfannot', 16: 'pdfstartlink', 17: 'pdfendlink',
  18: 'pdfoutline', 19: 'pdfdest', 20: 'pdfthread', 21: 'pdfstartthread', 22: 'pdfendthread', 23: 'pdfsavepos',
  36: 'pdfsnaprefpoint', 37: 'pdfsnapy', 38: 'pdfsnapycomp', 24: 'pdfinfo', 25: 'pdfcatalog', 26: 'pdfnames', 28: 'pdfincludechars',
  27: 'pdffontattr', 29: 'pdfmapfile', 30: 'pdfmapline', 31: 'pdftrailer', 32: 'pdftrailerid', 33: 'pdfresettimer',
  35: 'pdfsetrandomseed', 34: 'pdffontexpand', 39: 'pdfglyphtounicode', 44: 'pdfnobuiltintounicode', 45: 'pdfinterwordspaceon',
  46: 'pdfinterwordspaceoff', 47: 'pdffakespace', 48: 'pdfrunninglinkoff', 49: 'pdfrunninglinkon', 50: 'pdfspacefont' }
export const cmd = Cmd.extension
export const primitives: [string, number][] = Object.entries(names).map(([k, n]) => [n, +k])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? '[unknown extension!]') }

// pdftex.web concat_tokens
function concat_tokens(e: Engine, q: number, r: number): number {
  if (q === 0) return r
  let p = q
  while (e.link[p] !== 0) p = e.link[p]!
  e.link[p] = e.link[r]!; free_avail(e, r)
  return q
}

// pdftex.web scan_action
function scan_action(e: Engine): PdfAction {
  const p: PdfAction = { type: 0, named_id: 0, id: 0, file: 0, new_window: 0, tokens: 0, struct_id: 0, refcount: 0 }
  if (scan_keyword(e, 'user')) p.type = pdf_action_user
  else if (scan_keyword(e, 'goto')) p.type = pdf_action_goto
  else if (scan_keyword(e, 'thread')) p.type = pdf_action_thread
  else pdf_error(e, 'ext1', 'action type missing')
  if (p.type === pdf_action_user) { scan_toks(e, false, true); p.tokens = e.def_ref; return p }
  if (scan_keyword(e, 'file')) { scan_toks(e, false, true); p.file = e.def_ref }
  if (scan_keyword(e, 'struct')) {
    if (p.type !== pdf_action_goto) pdf_error(e, 'ext1', "only GoTo action can be used with `struct'")
    if (p.file !== 0 || scan_keyword(e, 'name')) { scan_toks(e, false, true); p.named_id += 2; p.struct_id = e.def_ref }
    else if (scan_keyword(e, 'num')) {
      scan_int(e); if (e.cur_val <= 0) pdf_error(e, 'ext1', 'num identifier must be positive')
      p.struct_id = e.cur_val
    } else pdf_error(e, 'ext1', 'identifier type missing')
  }
  if (scan_keyword(e, 'page')) {
    if (p.type !== pdf_action_goto) pdf_error(e, 'ext1', "only GoTo action can be used with `page'")
    p.type = pdf_action_page
    scan_int(e); if (e.cur_val <= 0) pdf_error(e, 'ext1', 'page number must be positive')
    p.id = e.cur_val
    scan_toks(e, false, true); p.tokens = e.def_ref
  } else if (scan_keyword(e, 'name')) { scan_toks(e, false, true); p.named_id += 1; p.id = e.def_ref }
  else if (scan_keyword(e, 'num')) {
    if (p.type === pdf_action_goto && p.file !== 0) pdf_error(e, 'ext1', "`goto' option cannot be used with both `file' and `num'")
    scan_int(e); if (e.cur_val <= 0) pdf_error(e, 'ext1', 'num identifier must be positive')
    p.id = e.cur_val
  } else pdf_error(e, 'ext1', 'identifier type missing')
  if (scan_keyword(e, 'newwindow')) { p.new_window = 1; scan_optional_space(e) }
  else if (scan_keyword(e, 'nonewwindow')) { p.new_window = 2; scan_optional_space(e) }
  if (p.new_window > 0 && ((p.type !== pdf_action_goto && p.type !== pdf_action_page) || p.file === 0))
    pdf_error(e, 'ext1', "`newwindow'/`nonewwindow' must be used with `goto' and `file' option")
  return p
}
// pdftex.web scan_alt_rule into the whatsit's pdf_width/height/depth (pdf_left/top/right)
function scan_alt_rule(e: Engine, p: WhatsitNode): void {
  p.pdf_left = null_flag; p.pdf_top = null_flag; p.pdf_right = null_flag
  for (;;) {
    if (scan_keyword(e, 'width')) { scan_normal_dimen(e); p.pdf_left = e.cur_val }
    else if (scan_keyword(e, 'height')) { scan_normal_dimen(e); p.pdf_top = e.cur_val }
    else if (scan_keyword(e, 'depth')) { scan_normal_dimen(e); p.pdf_right = e.cur_val }
    else return
  }
}
// pdftex.web new_annot_whatsit
function new_annot_whatsit(e: Engine, w: number): WhatsitNode {
  const p = new_whatsit_node(w); tail_append(e, p)
  scan_alt_rule(e, p)
  if ((w === pdf_start_link_node || w === pdf_thread_node || w === pdf_start_thread_node) && scan_keyword(e, 'attr')) { scan_toks(e, false, true); p.pdf_data = e.def_ref }
  return p
}
function scan_optional_space(e: Engine): void { get_x_token(e); if (e.cur_cmd !== Cmd.spacer) back_input(e) }

// §1350 new_write_whatsit (tex.ch: \write18 is a stream of its own)
function new_write_whatsit(e: Engine, open: boolean): WhatsitNode {
  const p = new_whatsit_node(e.cur_chr); tail_append(e, p)
  if (open) scan_four_bit_int(e)
  else {
    scan_int(e)
    if (e.cur_val < 0) e.cur_val = 17
    else if (e.cur_val > 15 && e.cur_val !== 18) e.cur_val = 16
  }
  p.write_stream = e.cur_val
  return p
}

// §1348 do_extension
export function run(e: Engine, chr: number): void {
  switch (chr) {
    case open_node: { // §1351
      const p = new_write_whatsit(e, true)
      scan_optional_equals(e); scan_file_name(e)
      p.open_name = e.cur_name; p.open_area = e.cur_area; p.open_ext = e.cur_ext
      return
    }
    case write_node: { // §1352
      const k = e.cur_cs, p = new_write_whatsit(e, false)
      e.cur_cs = k; scan_toks(e, false, false); p.write_tokens = e.def_ref
      return
    }
    case close_node: new_write_whatsit(e, false).write_tokens = 0; return // §1353
    case special_node: { // §1354 (pdftex: \special shipout{...} expands at shipout)
      const late = scan_keyword(e, 'shipout')
      const p = new_whatsit_node(late ? latespecial_node : special_node); tail_append(e, p)
      scan_toks(e, false, !late); p.write_tokens = e.def_ref
      return
    }
    case immediate_code: // §1375
      get_x_token(e)
      if (e.cur_cmd === Cmd.extension && e.cur_chr <= close_node) {
        const p = e.tail
        run(e, e.cur_chr)
        out_what(e, e.tail as WhatsitNode)
        flush_node_list(e, e.tail); e.tail = p; p.link = null
      } else if (e.cur_cmd === Cmd.extension && e.cur_chr === pdf_obj_code) { // pdftex.web Implement \immediate
        run(e, pdf_obj_code)
        if (e.ps.obj_aux[e.ps.last_obj] === 0) pdf_error(e, 'ext1', "`\\pdfobj reserveobjnum' cannot be used with \\immediate")
        pdf_write_obj(e, e.ps.last_obj)
      } else if (e.cur_cmd === Cmd.extension && (e.cur_chr === 11 || e.cur_chr === 13)) unsupported(e)
      else back_input(e)
      return
    case set_language_code: { // §1377
      if (Math.abs(e.mode) !== hmode) { report_illegal_case(e); return }
      const p = new_whatsit_node(language_node); tail_append(e, p)
      scan_int(e)
      e.clang = e.cur_val <= 0 || e.cur_val > 255 ? 0 : e.cur_val
      p.what_lang = e.clang
      p.what_lhm = norm_min(int_par(e, 51)); p.what_rhm = norm_min(int_par(e, 52))
      return
    }
    case pdf_glyph_to_unicode_code: { // pdftex.web glyph_to_unicode
      scan_toks(e, false, true); const s1 = str(tokens_to_string(e, e.def_ref)); delete_token_ref(e, e.def_ref)
      scan_toks(e, false, true); const s2 = str(tokens_to_string(e, e.def_ref)); delete_token_ref(e, e.def_ref)
      def_tounicode(e, s1, s2)
      return
    }
    case set_random_seed_code: // pdftex.web Implement \pdfsetrandomseed
      scan_int(e); if (e.cur_val < 0) e.cur_val = -e.cur_val
      e.random_seed = e.cur_val; init_randoms(e, e.random_seed)
      return
    case pdf_save_pos_node: tail_append(e, new_whatsit_node(pdf_save_pos_node)); return // pdftex.web Implement \pdfsavepos
    case pdf_literal_node: { // pdftex.web Implement \pdfliteral
      check_pdfoutput(e, '\\pdfliteral', true)
      const p = new_whatsit_node(scan_keyword(e, 'shipout') ? pdf_lateliteral_node : pdf_literal_node); tail_append(e, p)
      p.pdf_mode = scan_keyword(e, 'direct') ? direct_always : scan_keyword(e, 'page') ? direct_page : set_origin
      scan_toks(e, false, p.subtype === pdf_literal_node); p.pdf_data = e.def_ref
      return
    }
    case pdf_obj_code: { // pdftex.web Implement \pdfobj
      check_pdfoutput(e, '\\pdfobj', true)
      const s = e.ps
      if (scan_keyword(e, 'reserveobjnum')) {
        scan_optional_space(e)
        pdf_create_obj(e, obj_type_obj, ++s.obj_count); s.last_obj = s.obj_ptr
        return
      }
      let k = -1
      if (scan_keyword(e, 'useobjnum')) {
        scan_int(e); k = e.cur_val
        if (k <= 0 || k > s.obj_ptr || s.obj_aux[k] !== 0) {
          pdf_warning(e, '\\pdfobj', 'invalid object number being ignored', true, true); s.retval = -1; k = -1
        }
      }
      if (k < 0) { pdf_create_obj(e, obj_type_obj, ++s.obj_count); k = s.obj_ptr }
      const d = s.obj_aux[k] = pdf_get_mem(e, 4) // obj_obj_data, obj_obj_is_stream, obj_obj_stream_attr, obj_obj_is_file
      if (scan_keyword(e, 'stream')) {
        s.mem[d + 1] = 1
        if (scan_keyword(e, 'attr')) { scan_toks(e, false, true); s.mem[d + 2] = e.def_ref } else s.mem[d + 2] = 0
      } else s.mem[d + 1] = 0
      s.mem[d + 3] = scan_keyword(e, 'file') ? 1 : 0
      scan_toks(e, false, true); s.mem[d] = e.def_ref
      s.last_obj = k
      return
    }
    case pdf_refobj_node: { // pdftex.web Implement \pdfrefobj
      check_pdfoutput(e, '\\pdfrefobj', true)
      scan_int(e); pdf_check_obj(e, obj_type_obj, e.cur_val)
      const p = new_whatsit_node(pdf_refobj_node); tail_append(e, p); p.pdf_objnum = e.cur_val
      return
    }
    case pdf_setmatrix_node: // pdftex.web Implement \pdfsetmatrix
      check_pdfoutput(e, '\\pdfsetmatrix', true)
      tail_append(e, new_whatsit_node(pdf_setmatrix_node)); scan_toks(e, false, true); (e.tail as WhatsitNode).pdf_data = e.def_ref
      return
    case pdf_save_node: check_pdfoutput(e, '\\pdfsave', true); tail_append(e, new_whatsit_node(pdf_save_node)); return
    case pdf_restore_node: check_pdfoutput(e, '\\pdfrestore', true); tail_append(e, new_whatsit_node(pdf_restore_node)); return
    case pdf_info_code: case pdf_catalog_code: case pdf_trailer_code: case pdf_trailer_id_code: case pdf_names_code: { // pdftex.web Implement \pdfinfo …
      check_pdfoutput(e, '\\' + names[chr], chr === pdf_names_code)
      scan_toks(e, false, true)
      const ps = e.ps, key = chr === pdf_info_code ? 'info_toks' : chr === pdf_catalog_code ? 'catalog_toks' : chr === pdf_trailer_code ? 'trailer_toks'
        : chr === pdf_trailer_id_code ? 'trailer_id_toks' : 'names_toks'
      if (int_par(e, 65) > 0 || chr === pdf_names_code) ps[key] = concat_tokens(e, ps[key], e.def_ref)
      if (chr === pdf_catalog_code && scan_keyword(e, 'openaction')) {
        if (ps.catalog_openaction !== 0) pdf_error(e, 'ext1', 'duplicate of openaction')
        const a = scan_action(e)
        pdf_new_obj(e, obj_type_others, 0, 1)
        if (int_par(e, 65) > 0) ps.catalog_openaction = ps.obj_ptr
        write_action(e, a); pdf_end_obj(e); delete_action_ref(e, a)
      }
      return
    }
    case pdf_include_chars_code: { // pdftex.web pdf_include_chars
      check_pdfoutput(e, '\\pdfincludechars', true)
      scan_font_ident(e); const f = e.cur_val
      if (f === null_font) pdf_error(e, 'font', 'invalid font identifier')
      pdf_check_vf(e, f)
      if (!e.font_used[f]) pdf_init_font(e, f)
      scan_toks(e, false, true); const t = tokens_to_string(e, e.def_ref); delete_token_ref(e, e.def_ref)
      for (const c of t) pdf_mark_char(e, f, c)
      return
    }
    case pdf_annot_node: { // pdftex.web Implement \pdfannot
      check_pdfoutput(e, '\\pdfannot', true)
      const ps = e.ps
      if (scan_keyword(e, 'reserveobjnum')) { ps.last_annot = pdf_new_objnum(e); scan_optional_space(e); return }
      let k: number
      if (scan_keyword(e, 'useobjnum')) {
        scan_int(e); k = e.cur_val
        if (k <= 0 || k > ps.obj_ptr || ps.obj_aux[k] !== 0 || ps.obj_node[k]) pdf_error(e, 'ext1', 'invalid object number')
      } else k = pdf_new_objnum(e)
      const p = new_annot_whatsit(e, pdf_annot_node)
      p.pdf_objnum = k
      scan_toks(e, false, true); p.pdf_data = e.def_ref
      ps.last_annot = k
      return
    }
    case pdf_start_link_node: { // pdftex.web Implement \pdfstartlink
      check_pdfoutput(e, '\\pdfstartlink', true)
      if (Math.abs(e.mode) === vmode) pdf_error(e, 'ext1', '\\pdfstartlink cannot be used in vertical mode')
      const k = pdf_new_objnum(e), p = new_annot_whatsit(e, pdf_start_link_node)
      p.pdf_action = scan_action(e); p.pdf_objnum = k; e.ps.last_link = k
      return
    }
    case pdf_end_link_node: // pdftex.web Implement \pdfendlink
      check_pdfoutput(e, '\\pdfendlink', true)
      if (Math.abs(e.mode) === vmode) pdf_error(e, 'ext1', '\\pdfendlink cannot be used in vertical mode')
      tail_append(e, new_whatsit_node(pdf_end_link_node))
      return
    case pdf_outline_code: { // pdftex.web Implement \pdfoutline
      check_pdfoutput(e, '\\pdfoutline', true)
      const ps = e.ps
      let r = 0
      if (scan_keyword(e, 'attr')) { scan_toks(e, false, true); r = e.def_ref }
      const p = scan_action(e)
      let i = 0
      if (scan_keyword(e, 'count')) { scan_int(e); i = e.cur_val }
      scan_toks(e, false, true); const q = e.def_ref
      pdf_new_obj(e, obj_type_others, 0, 1)
      let j = ps.obj_ptr
      write_action(e, p); pdf_end_obj(e); delete_action_ref(e, p)
      pdf_create_obj(e, obj_type_outline, 0)
      const k = ps.obj_ptr, d = ps.obj_aux[k] = pdf_get_mem(e, 8), m = ps.mem, o = (x: number) => ps.obj_aux[x]!
      m[d + 6] = j; ps.obj_info[k] = i
      pdf_new_obj(e, obj_type_others, 0, 1)
      pdf_print_str_ln(e, str(tokens_to_string(e, q))); delete_token_ref(e, q)
      pdf_end_obj(e)
      m[d] = ps.obj_ptr; m[d + 2] = 0; m[d + 3] = 0; m[d + 4] = 0; m[d + 5] = 0; m[d + 1] = ps.parent_outline; m[d + 7] = r
      if (ps.first_outline === 0) ps.first_outline = k
      if (ps.last_outline === 0) { if (ps.parent_outline !== 0) m[o(ps.parent_outline) + 4] = k }
      else { m[o(ps.last_outline) + 3] = k; m[d + 2] = ps.last_outline }
      ps.last_outline = k
      const outline_list_count = (x: number) => { let n = 1; while (m[o(x) + 2] !== 0) { n++; x = m[o(x) + 2]! } return n }
      if (ps.obj_info[k] !== 0) { ps.parent_outline = k; ps.last_outline = 0 }
      else if (ps.parent_outline !== 0 && outline_list_count(k) === Math.abs(ps.obj_info[ps.parent_outline]!)) {
        j = ps.last_outline
        do {
          m[o(ps.parent_outline) + 5] = j; j = ps.parent_outline; ps.parent_outline = m[o(ps.parent_outline) + 1]!
        } while (!(ps.parent_outline === 0 || outline_list_count(j) < Math.abs(ps.obj_info[ps.parent_outline]!)))
        ps.last_outline = ps.parent_outline === 0 ? ps.first_outline : m[o(ps.parent_outline) + 4]!
        while (m[o(ps.last_outline) + 3] !== 0) ps.last_outline = m[o(ps.last_outline) + 3]!
      }
      return
    }
    case pdf_dest_node: { // pdftex.web Implement \pdfdest
      check_pdfoutput(e, '\\pdfdest', true)
      const q = e.tail, p = new_whatsit_node(pdf_dest_node); tail_append(e, p)
      let j = obj_type_dest
      if (scan_keyword(e, 'struct')) {
        scan_int(e); if (e.cur_val <= 0) pdf_error(e, 'ext1', 'struct identifier must be positive')
        p.pdf_objnum = e.cur_val; j = obj_type_struct_dest
      }
      if (scan_keyword(e, 'num')) {
        scan_int(e)
        if (e.cur_val <= 0) pdf_error(e, 'ext1', 'num identifier must be positive')
        if (e.cur_val > max_halfword) pdf_error(e, 'ext1', 'number too big')
        p.pdf_id = e.cur_val; p.pdf_named_id = 0
      } else if (scan_keyword(e, 'name')) { scan_toks(e, false, true); p.pdf_id = e.def_ref; p.pdf_named_id = 1 }
      else pdf_error(e, 'ext1', 'identifier type missing')
      if (scan_keyword(e, 'xyz')) {
        p.pdf_mode = pdf_dest_xyz
        if (scan_keyword(e, 'zoom')) { scan_int(e); if (e.cur_val > max_halfword) pdf_error(e, 'ext1', 'number too big'); p.pdf_zoom = e.cur_val }
        else p.pdf_zoom = pdf_null
      }
      else if (scan_keyword(e, 'fitbh')) p.pdf_mode = pdf_dest_fitbh
      else if (scan_keyword(e, 'fitbv')) p.pdf_mode = pdf_dest_fitbv
      else if (scan_keyword(e, 'fitb')) p.pdf_mode = pdf_dest_fitb
      else if (scan_keyword(e, 'fith')) p.pdf_mode = pdf_dest_fith
      else if (scan_keyword(e, 'fitv')) p.pdf_mode = pdf_dest_fitv
      else if (scan_keyword(e, 'fitr')) p.pdf_mode = pdf_dest_fitr
      else if (scan_keyword(e, 'fit')) p.pdf_mode = pdf_dest_fit
      else pdf_error(e, 'ext1', 'destination type missing')
      scan_optional_space(e)
      if (p.pdf_mode === pdf_dest_fitr) scan_alt_rule(e, p)
      const k = find_obj(e, j, p.pdf_named_id !== 0 ? str(tokens_to_string(e, p.pdf_id)) : p.pdf_id)
      if (k !== 0 && e.ps.obj_node[k]) {
        warn_dest_dup(e, p.pdf_id, p.pdf_named_id, 'ext4', 'has been already used, duplicate ignored')
        flush_node_list(e, p); e.tail = q; q.link = null
      }
      return
    }
    case pdf_thread_node: case pdf_start_thread_node: { // pdftex.web Implement \pdfthread, \pdfstartthread
      check_pdfoutput(e, chr === pdf_thread_node ? '\\pdfthread' : '\\pdfstartthread', true)
      const p = new_annot_whatsit(e, chr)
      if (scan_keyword(e, 'num')) { // scan_thread_id
        scan_int(e)
        if (e.cur_val <= 0) pdf_error(e, 'ext1', 'num identifier must be positive')
        if (e.cur_val > max_halfword) pdf_error(e, 'ext1', 'number too big')
        p.pdf_id = e.cur_val; p.pdf_named_id = 0
      } else if (scan_keyword(e, 'name')) { scan_toks(e, false, true); p.pdf_id = e.def_ref; p.pdf_named_id = 1 }
      else pdf_error(e, 'ext1', 'identifier type missing')
      return
    }
    case pdf_colorstack_node: { // pdftex.web Implement \pdfcolorstack
      check_pdfoutput(e, '\\pdfcolorstack', true)
      scan_int(e)
      if (e.cur_val >= colorstackused(e)) {
        print_err(e, 'Unknown color stack number '); print_int(e, e.cur_val)
        help(e, 'Allocate and initialize a color stack with \\pdfcolorstackinit.', "I'll use default color stack 0 here.", 'Proceed, with fingers crossed.')
        error(e); e.cur_val = 0
      }
      if (e.cur_val < 0) {
        print_err(e, 'Invalid negative color stack number')
        help(e, "I'll use default color stack 0 here.", 'Proceed, with fingers crossed.')
        error(e); e.cur_val = 0
      }
      const i = scan_keyword(e, 'set') ? colorstack_set : scan_keyword(e, 'push') ? colorstack_push : scan_keyword(e, 'pop') ? colorstack_pop
        : scan_keyword(e, 'current') ? colorstack_current : -1
      if (i >= 0) {
        const p = new_whatsit_node(pdf_colorstack_node); tail_append(e, p)
        p.pdf_objnum = e.cur_val; p.pdf_mode = i
        if (i <= colorstack_data) { scan_toks(e, false, true); p.pdf_data = e.def_ref }
      } else {
        print_err(e, 'Color stack action is missing')
        help(e, 'The expected actions for \\pdfcolorstack:', '    set, push, pop, current', "I'll ignore the color stack command.")
        error(e)
      }
      return
    }
    case pdf_end_thread_node: check_pdfoutput(e, '\\pdfendthread', true); tail_append(e, new_whatsit_node(pdf_end_thread_node)); return
    case reset_timer_code: e.start_ms = performance.now(); return // pdftex.web Implement \pdfresettimer
    default: unsupported(e)
  }
}
