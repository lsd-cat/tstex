// §1344–1378 \openout \write \closeout \special \immediate \setlanguage (pdfTeX's extensions are registered, not supported)
import type { Engine } from '../engine.ts'
import { Cmd, hmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { int_par } from '../eqtb.ts'
import { delete_token_ref, new_whatsit_node, flush_node_list, open_node, write_node, close_node, special_node, latespecial_node, language_node, pdf_save_pos_node,
  pdf_literal_node, pdf_lateliteral_node, pdf_refobj_node } from '../nodes.ts'
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
import { pdf_error, pdf_warning, pdf_create_obj, pdf_get_mem, pdf_write_obj, obj_type_obj, set_origin, direct_page, direct_always } from '../pdf.ts'

// pdftex.web check_pdfoutput
function check_pdfoutput(e: Engine, s: string, is_error: boolean): void {
  if (int_par(e, 65) > 0) return
  if (is_error) pdf_error(e, s, 'not allowed in DVI mode (\\pdfoutput <= 0)')
  pdf_warning(e, s, 'not allowed in DVI mode (\\pdfoutput <= 0); ignoring it', true, true)
}

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
        get_x_token(e); if (e.cur_cmd !== Cmd.spacer) back_input(e) // Scan an optional space
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
      scan_int(e)
      let k = e.ps.head_tab[obj_type_obj]! // pdf_check_obj
      while (k !== 0 && k !== e.cur_val) k = e.ps.obj_link[k]!
      if (k === 0) pdf_error(e, 'ext1', 'cannot find referenced object')
      const p = new_whatsit_node(pdf_refobj_node); tail_append(e, p); p.pdf_objnum = e.cur_val
      return
    }
    case reset_timer_code: e.start_ms = performance.now(); return // pdftex.web Implement \pdfresettimer
    default: unsupported(e)
  }
}
