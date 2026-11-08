// pdftex.web [32b]–[32f], [53] PDF output: the output buffer, object table, page description, pdf_ship_out, finishing the file
// The file lives in one growable buffer (nothing is flushed early), so pdf_gone stays 0 and the /Length placeholder is
// overwritten in place; with \pdfcompresslevel>0 a stream's bytes are deflated by the platform when it ends.
import type { Engine } from './engine.ts'
import { int_base, dimen_base, tex_toks, spotless, warning_issued, fatal_error_stop } from './types.ts'
import { print, print_char, print_nl, print_ln, print_int, begin_diagnostic, end_diagnostic } from './print.ts'
import { error, print_err, help, confusion, fatal_error, normalize_selector, succumb, int_error, overflow, show_context } from './error.ts'
import { int_par, prepare_mag, count_base, mag_code } from './eqtb.ts'
import { tokens_to_string } from './tokens.ts'
import { flush_node_list, show_box, zround, is_char_node, hlist_node, vlist_node, rule_node, whatsit_node, glue_node, kern_node,
  math_node, ligature_node, normal, stretching, a_leaders, c_leaders, null_flag, special_node, latespecial_node, pdf_save_pos_node,
  flush_list, delete_token_ref } from './nodes.ts'
import type { BoxNode, Node, WhatsitNode, PdfAction } from './nodes.ts'
import { colorstack_set, colorstack_push, colorstack_pop, colorstack_current } from './nodes.ts'
import { pdf_action_user, pdf_action_page, pdf_action_goto, pdf_action_thread, copy_node_list, add_token_ref, new_whatsit_node, print_mark,
  pdf_dest_xyz, pdf_dest_fit, pdf_dest_fith, pdf_dest_fitv, pdf_dest_fitb, pdf_dest_fitbh, pdf_dest_fitbv, pdf_dest_fitr, pdf_null } from './nodes.ts'
import { char_info, char_width, char_exists, null_font, param, space_code, space_shrink_code } from './tfm.ts'
import { char_warning } from './tfm.ts'
import { open_log_file, print_file_name } from './files.ts'
import { out_what, expand_write_tokens } from './dvi.ts'
import { makepdftime, md5, str } from './utils.ts'
import { write_image } from './backend/images.ts'
import type { Img } from './backend/images.ts'
import { isscalable, hasspacechar, do_pdf_font, write_fontstuff, hasfmentry } from './backend/fonts.ts'

// pdftex.web §236/§247 parameter codes (pdftex_first_integer_code = 65, pdftex_first_dimen_code = 21)
const pdf_output_code = 65, pdf_compress_level_code = 66, pdf_decimal_digits_code = 67, pdf_unique_resname_code = 71,
  pdf_major_version_code = 74, pdf_minor_version_code = 75, pdf_objcompresslevel_code = 86, pdf_gen_tounicode_code = 90,
  pdf_draftmode_code = 91, pdf_info_omit_date_code = 96, pdf_suppress_ptex_info_code = 97, pdf_omit_info_dict_code = 99,
  pdf_omit_procset_code = 100, pdf_ptex_use_underscore_code = 101
const pdf_image_resolution_code = 69, pdf_image_hicolor_code = 81, pdf_image_apply_gamma_code = 82, one_hundred_inch = 473628672
const pdf_h_origin_code = 21, pdf_v_origin_code = 22, pdf_page_width_code = 23, pdf_page_height_code = 24,
  h_offset_code = 18, v_offset_code = 19
const pdf_pages_attr_loc = tex_toks, pdf_page_attr_loc = tex_toks + 1, pdf_page_resources_loc = tex_toks + 2
const tracing_output_code = 34, tracing_stats_code = 31
const max_dimen = 0o7777777777

// [32b] constants
const pdf_os_max_objs = 100, inf_obj_tab_size = 1000, sup_obj_tab_size = 8388607, inf_dest_names_size = 1000,
  sup_dest_names_size = 500000, inf_pdf_mem_size = 10000, sup_pdf_mem_size = 10000000
const one_bp = 65782, one_hundred_bp = 6578176
const ten_pow = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000]
// [32d] object types, pages tree arity
export const obj_type_others = 0, obj_type_page = 1, obj_type_pages = 2, obj_type_font = 3, obj_type_outline = 4, obj_type_dest = 5,
  obj_type_struct_dest = 6, obj_type_obj = 7, obj_type_xform = 8, obj_type_ximage = 9, obj_type_thread = 10
const pages_tree_kids_max = 6
// literal modes
export const set_origin = 0, direct_page = 1, direct_always = 2, scan_special = 3
// [53] pdfTeX whatsit subtypes (pdftex_first_extension_code = 7)
export const pdf_literal_node = 7, pdf_lateliteral_node = 8, pdf_refobj_node = 10, pdf_refxform_node = 12, pdf_refximage_node = 14,
  pdf_annot_node = 15, pdf_start_link_node = 16, pdf_end_link_node = 17, pdf_dest_node = 19, pdf_thread_node = 20,
  pdf_start_thread_node = 21, pdf_end_thread_node = 22, pdf_snap_ref_point_node = 36, pdf_snapy_node = 37, pdf_snapy_comp_node = 38,
  pdf_colorstack_node = 40, pdf_setmatrix_node = 41, pdf_save_node = 42, pdf_restore_node = 43, pdf_interword_space_on_node = 45,
  pdf_interword_space_off_node = 46, pdf_fake_space_node = 47, pdf_running_link_off_node = 48, pdf_running_link_on_node = 49

// The PDF globals of [32b]–[32f]; the per-font arrays are indexed by internal font number
export function pdf_state() {
  const op_buf = new Uint8Array(1 << 16)
  return {
    op_buf, buf: op_buf, ptr: 0, op_ptr: 0, os_buf: new Uint8Array(1 << 12), os_ptr: 0,
    os_mode: false, os_enable: false, os_cur_objnum: 0, os_cntr: 0, os_objidx: 0, os_objnum: [] as number[], os_objoff: [] as number[],
    zip_start: -1, save_offset: 0, stream_length_offset: 0, seek_write_length: false,
    version_written: false, fixed_major: 0, fixed_minor: 0, fixed_objcompresslevel: 0, fixed_decimal_digits: 0, min_bp_val: 0,
    scaled_out: 0, init_output: false, output_file_name: '',
    f: null_font, h: 0, v: 0, tj_start_h: 0, delta_h: 0, origin_h: 0, origin_v: 0, doing_string: false, doing_text: false,
    last_f: null_font, last_fs: 0, gen_faked_interword_space: false, gen_running_link: true,
    // [32d] obj_tab
    obj_info: [0], obj_link: [0], obj_offset: [0], obj_os_idx: [0], obj_aux: [0], head_tab: new Array<number>(11).fill(0),
    obj_ptr: 0, sys_obj_ptr: 0, obj_tab_size: inf_obj_tab_size, objs: new Map<string, number>(), // avl_put_obj/find_obj
    pages_tail: 0, last_pages: 0, last_page: 0, last_stream: 0,
    dest_names_size: inf_dest_names_size, dest_names_ptr: 0, dest_names: [] as { objname: number, objnum: number }[], mem: [0], mem_ptr: 1, mem_size: inf_pdf_mem_size,
    font_list: [] as number[], obj_list: [] as number[], xform_list: [] as number[], ximage_list: [] as number[],
    text_procset: false, image_procset: 0,
    char_used: [] as (Uint8Array | undefined)[], font_size: [] as number[], font_num: [] as number[], font_has_space_char: [] as boolean[],
    font_nobuiltin_tounicode: [] as boolean[], vf_checked: [] as boolean[],
    obj_count: 0, last_obj: 0, retval: 0, // \pdfobj's counters, \pdflastobj, \pdfretval
    xform_count: 0, ximage_count: 0, last_xform: 0, last_ximage: 0, last_ximage_pages: 0, last_ximage_colordepth: 0, last_annot: 0, last_link: 0,
    cur_page_width: 0, cur_h_offset: 0, cur_v_offset: 0, is_shipping_page: false, fixed_gen_tounicode: 0,
    // utils.c: the \pdfsetmatrix stack ([a, b, c, d, e, f] each), the \pdfsave positions, page_mode
    matrix_stack: [] as number[][], pos_stack: [] as { h: number, v: number, m: number }[], page_mode: false,
    // [53] token lists of \pdfinfo, \pdfcatalog, \pdfnames, \pdftrailer, \pdftrailerid; the openaction object
    info_toks: 0, catalog_toks: 0, names_toks: 0, trailer_toks: 0, trailer_id_toks: 0, catalog_openaction: 0,
    strs: [''] as string[], // the string pool for named objects: obj_info = -k names strs[k]
    // [32f] PDF mark lists; obj_node holds obj_annot_ptr/obj_dest_ptr/obj_bead_data (a node, where pdftex keeps a pointer)
    annot_list: [] as number[], link_list: [] as number[], dest_list: [] as number[], bead_list: [] as number[],
    obj_node: [] as (WhatsitNode | null | undefined)[],
    link_stack: [] as { nesting_level: number, link_node: WhatsitNode, ref_link_node: WhatsitNode }[],
    last_rect: [0, 0, 0, 0], // utils.c last_llx … last_ury for matrixrecalculate
    last_thread: null as WhatsitNode | null, thread_wd: 0, thread_ht: 0, thread_dp: 0, last_thread_id: 0, last_thread_named_id: false,
    thread_level: 0, first_outline: 0, last_outline: 0, parent_outline: 0,
    colstacks: [] as Colstack[], // utils.c colstacks (created with stack 0 on first use)
    cur_form: 0, xform_width: 0, xform_height: 0, xform_depth: 0, page_group_val: 0,
    obj_box: [] as (BoxNode | null | undefined)[], // obj_xform_box
    images: [] as Img[], // writeimg.c image_array; obj_ximage_data indexes it
    fixed_image_hicolor: 0, fixed_image_apply_gamma: 0, warn_pdfpagebox: true,
  }
}
export type PdfState = ReturnType<typeof pdf_state>
type Colstack = { page_stack: (string | null)[], form_stack: (string | null)[], page_current: string | null, form_current: string | null,
  form_init: string | null, literal_mode: number, page_start: boolean }

// utils.c colstacks_first_init, colorstackused, newcolorstack, colorstackset/current/push/pop, colorstackskippagestart; a null
// string stands for C's NULL
const COLOR_DEFAULT = '0 g 0 G'
function colstacks(e: Engine): Colstack[] {
  const c = e.ps.colstacks
  if (c.length === 0) c.push({ page_stack: [], form_stack: [], page_current: COLOR_DEFAULT, form_current: COLOR_DEFAULT, form_init: COLOR_DEFAULT,
    literal_mode: direct_always, page_start: true })
  return c
}
export const colorstackused = (e: Engine) => colstacks(e).length
export function newcolorstack(e: Engine, s: string, literal_mode: number, page_start: boolean): number {
  const c = colstacks(e)
  if (c.length === 32768) return -1 // MAX_COLORSTACKS
  const v = s === '' ? null : s
  c.push({ page_stack: [], form_stack: [], page_current: v, form_current: v, form_init: v, literal_mode, page_start })
  return c.length - 1
}
// the result is the literal mode and the string the C code leaves on the pool (null: nothing)
function colorstack_cmd(e: Engine, n: number, cmd: number, s: string): [number, string | null] {
  const c = colstacks(e)[n]!, page = e.ps.page_mode, v = s === '' ? null : s
  switch (cmd) {
    case colorstack_set: if (page) c.page_current = s; else c.form_current = s; return [c.literal_mode, null]
    case colorstack_push:
      if (page) { c.page_stack.push(c.page_current); c.page_current = v } else { c.form_stack.push(c.form_current); c.form_current = v }
      return [c.literal_mode, null]
    case colorstack_pop:
      if ((page ? c.page_stack : c.form_stack).length === 0) {
        pdftex_warn(e, null, `pop empty color ${page ? 'page' : 'form'} stack ${n}`); return [c.literal_mode, null]
      }
      if (page) c.page_current = c.page_stack.pop()!; else c.form_current = c.form_stack.pop()!
      return [c.literal_mode, page ? c.page_current : c.form_current]
    default: return [c.literal_mode, page ? c.page_current : c.form_current] // colorstack_current
  }
}

// [32f] pdf_out_colorstack, pdf_out_colorstack_startpage
const to_bytes = (t: string) => Array.from(t, c => c.charCodeAt(0))
function pdf_out_colorstack(e: Engine, p: WhatsitNode): void {
  const cmd = p.pdf_mode, n = p.pdf_objnum
  if (n >= colorstackused(e)) {
    print_nl(e, ''); print(e, 'Color stack '); print_int(e, n); print(e, ' is not initialized for use!'); print_nl(e, ''); return
  }
  if (cmd === colorstack_set || cmd === colorstack_push) {
    const s = tokens_to_string(e, p.pdf_data), [mode] = colorstack_cmd(e, n, cmd, str(s))
    if (s.length > 0) literal(e, s, mode, false)
    return
  }
  if (cmd !== colorstack_pop && cmd !== colorstack_current) confusion(e, 'pdfcolorstack')
  const [mode, t] = colorstack_cmd(e, n, cmd, '')
  if (t !== null && t !== '') literal(e, to_bytes(t), mode, false)
}
function pdf_out_colorstack_startpage(e: Engine): void {
  const c = colstacks(e)
  for (let i = 0; i < c.length; i++) {
    const k = c[i]!
    if (!k.page_start || k.page_current === null || k.page_current === COLOR_DEFAULT) continue // colorstackskippagestart <> 0
    if (k.page_current !== '') literal(e, to_bytes(k.page_current), k.literal_mode, false)
  }
}

// [32b] pdf_room, pdf_out: the buffer only grows
function pdf_room(s: PdfState, n: number): void {
  if (s.ptr + n <= s.buf.length) return
  const b = new Uint8Array(Math.max(s.buf.length * 2, s.ptr + n)); b.set(s.buf.subarray(0, s.ptr))
  if (s.os_mode) s.os_buf = b; else s.op_buf = b
  s.buf = b
}
export function pdf_out(e: Engine, c: number): void { const s = e.ps; pdf_room(s, 1); s.buf[s.ptr++] = c }
const pdf_offset = (e: Engine) => e.ps.ptr // pdf_gone is always 0
export function pdf_print(e: Engine, t: string | number[]): void {
  const s = e.ps; pdf_room(s, t.length)
  for (let i = 0; i < t.length; i++) s.buf[s.ptr++] = typeof t === 'string' ? t.charCodeAt(i) : t[i]!
}
export function pdf_print_ln(e: Engine, t: string | number[]): void { pdf_print(e, t); pdf_out(e, 10) }
const pdf_print_nl = (e: Engine) => pdf_out(e, 10)
export function pdf_print_int(e: Engine, n: number): void { pdf_print(e, String(n)) } // longinteger: JS prints it exactly
function pdf_print_int_ln(e: Engine, n: number): void { pdf_print_int(e, n); pdf_print_nl(e) }

// [32b] pdf_error, pdf_warning
export function pdf_error(e: Engine, t: string, p: string): never {
  normalize_selector(e); print_err(e, 'pdfTeX error')
  if (t !== '') { print(e, ' ('); print(e, t); print(e, ')') }
  print(e, ': '); print(e, p); succumb(e)
}
export function pdf_warning(e: Engine, t: string, p: string, prepend_nl: boolean, append_nl: boolean): void {
  if (prepend_nl) print_ln(e)
  print(e, 'pdfTeX warning')
  if (t !== '') { print(e, ' ('); print(e, t); print(e, ')') }
  print(e, ': '); print(e, p)
  if (append_nl) print_ln(e)
  if (e.history === spotless) e.history = warning_issued
}

// utils.c pdftex_warn and pdftex_fail (the C back end's messages; kpse_invocation_name is `pdftex')
export function pdftex_warn(e: Engine, file: string | null, msg: string): void {
  print_ln(e); print_ln(e); print(e, 'pdfTeX warning: pdftex')
  if (file !== null) print(e, ` (file ${file})`)
  print(e, ': '); print(e, msg); print_ln(e)
}
export class PdftexFail { }
export function pdftex_fail(e: Engine, file: string | null, msg: string): never {
  print_ln(e); print(e, '!pdfTeX error: pdftex')
  if (file !== null) print(e, ` (file ${file})`)
  print(e, ': '); print(e, msg); print_ln(e)
  print(e, ' ==> Fatal error occurred, no output PDF file produced!'); print_ln(e)
  e.history = fatal_error_stop
  throw new PdftexFail() // exit(EXIT_FAILURE): no close_files_and_terminate
}

function remove_last_space(e: Engine): void { const s = e.ps; if (s.ptr > 0 && s.buf[s.ptr - 1] === 32) s.ptr-- }

// [32b] pdf_print_octal, pdf_print_char
function pdf_print_octal(e: Engine, n: number): void { pdf_print(e, n.toString(8).padStart(3, '0')) }
function pdf_print_char(e: Engine, f: number, c: number): void {
  pdf_mark_char(e, f, c)
  if (c <= 32 || c === 92 || c === 40 || c === 41 || c > 127) { pdf_out(e, 92); pdf_print_octal(e, c) }
  else pdf_out(e, c)
}
export function pdf_mark_char(e: Engine, f: number, c: number): void {
  const u = e.ps.char_used[f] ?? (e.ps.char_used[f] = new Uint8Array(256)); u[c] = 1
}
export const pdf_char_marked = (e: Engine, f: number, c: number): boolean => e.ps.char_used[f]?.[c] === 1

// [32b] divide_scaled: (s/m)*10^dd rounded; the remainder's complement goes to scaled_out
export function divide_scaled(e: Engine, s: number, m: number, dd: number): number {
  let sign = 1
  if (s < 0) { sign = -sign; s = -s }
  if (m < 0) { sign = -sign; m = -m }
  if (m === 0) pdf_error(e, 'arithmetic', 'divided by zero')
  else if (m >= Math.trunc(0x7fffffff / 10)) pdf_error(e, 'arithmetic', 'number too big')
  let q = Math.trunc(s / m), r = s % m
  for (let i = 1; i <= dd; i++) { q = (10 * q + Math.trunc(10 * r / m)) | 0; r = (10 * r) % m }
  if (2 * r >= m) { q++; r -= m }
  e.ps.scaled_out = (sign * (s - Math.trunc(r / ten_pow[dd]!))) | 0
  return (sign * q) | 0
}
export function round_xn_over_d(e: Engine, x: number, n: number, d: number): number {
  let positive = true
  if (x < 0) { x = -x; positive = false }
  const t = (x % 0o100000) * n
  let u = Math.trunc(x / 0o100000) * n + Math.trunc(t / 0o100000)
  let v = (u % d) * 0o100000 + (t % 0o100000)
  if (Math.trunc(u / d) >= 0o100000) e.arith_error = true
  else u = 0o100000 * Math.trunc(u / d) + Math.trunc(v / d)
  v = v % d
  if (2 * v >= d) u++
  return positive ? u : -u
}

// [32b] pdf_print_real, pdf_print_bp, pdf_print_mag_bp
export function pdf_print_real(e: Engine, m: number, d: number): void {
  if (m < 0) { pdf_out(e, 45); m = -m }
  pdf_print_int(e, Math.trunc(m / ten_pow[d]!))
  m = m % ten_pow[d]!
  if (m > 0) {
    pdf_out(e, 46); d--
    while (m < ten_pow[d]!) { pdf_out(e, 48); d-- }
    while (m % 10 === 0) m = Math.trunc(m / 10)
    pdf_print_int(e, m)
  }
}
export function pdf_print_bp(e: Engine, s: number): void {
  const d = e.ps.fixed_decimal_digits
  pdf_print_real(e, divide_scaled(e, s, one_hundred_bp, d + 2), d)
}
export function pdf_print_mag_bp(e: Engine, s: number): void {
  prepare_mag(e)
  if (int_par(e, mag_code) !== 1000) s = round_xn_over_d(e, s, int_par(e, mag_code), 1000)
  pdf_print_bp(e, s)
}

// [32b] fix_int, check_pdfversion, ensure_pdf_open
const fix_int = (v: number, min: number, max: number) => v < min ? min : v > max ? max : v
export function check_pdfversion(e: Engine): void {
  const s = e.ps
  if (!s.version_written) {
    s.version_written = true
    if (int_par(e, pdf_major_version_code) < 1) {
      print_err(e, 'pdfTeX error (invalid pdfmajorversion)'); print_ln(e)
      help(e, 'The pdfmajorversion must be 1 or greater.', 'I changed this to 1.')
      int_error(e, int_par(e, pdf_major_version_code)); e.equiv[int_base + pdf_major_version_code] = 1
    }
    if (int_par(e, pdf_minor_version_code) < 0 || int_par(e, pdf_minor_version_code) > 9) {
      print_err(e, 'pdfTeX error (invalid pdfminorversion)'); print_ln(e)
      help(e, 'The pdfminorversion must be between 0 and 9.', 'I changed this to 4.')
      int_error(e, int_par(e, pdf_minor_version_code)); e.equiv[int_base + pdf_minor_version_code] = 4
    }
    s.fixed_major = int_par(e, pdf_major_version_code); s.fixed_minor = int_par(e, pdf_minor_version_code)
    s.fixed_image_hicolor = fix_int(int_par(e, pdf_image_hicolor_code), 0, 1)
    s.fixed_image_apply_gamma = fix_int(int_par(e, pdf_image_apply_gamma_code), 0, 1)
    s.fixed_objcompresslevel = fix_int(int_par(e, pdf_objcompresslevel_code), 0, 3)
    if (int_par(e, pdf_draftmode_code) > 0) fatal_error(e, 'unsupported: \\pdfdraftmode') // pass B
    if ((s.fixed_major > 1 || s.fixed_minor >= 5) && s.fixed_objcompresslevel > 0) s.os_enable = true
    else {
      if (s.fixed_objcompresslevel > 0) {
        pdf_warning(e, 'Object streams', '\\pdfobjcompresslevel > 0 requires PDF-1.5 or greater. Object streams disabled now.', true, true)
        s.fixed_objcompresslevel = 0
      }
      s.os_enable = false
    }
    ensure_pdf_open(e); fix_pdfoutput(e)
    pdf_print(e, '%PDF-'); pdf_print_int(e, s.fixed_major); pdf_print(e, '.'); pdf_print_int_ln(e, s.fixed_minor)
    pdf_print(e, '%'); pdf_out(e, 208); pdf_out(e, 212); pdf_out(e, 197); pdf_out(e, 216); pdf_print_nl(e)
  } else if (s.fixed_minor !== int_par(e, pdf_minor_version_code) || s.fixed_major !== int_par(e, pdf_major_version_code)) {
    pdf_error(e, 'setup', 'PDF version cannot be changed after data is written to the PDF file')
  }
}
function ensure_pdf_open(e: Engine): void {
  if (e.ps.output_file_name !== '') return
  if (e.job_name === '') open_log_file(e)
  e.ps.output_file_name = e.job_name + '.pdf'
}

// [32f] fix_pdfoutput (fix_pdf_draftmode: \pdfdraftmode is unsupported)
export function fix_pdfoutput(e: Engine): void {
  const v = int_par(e, pdf_output_code - 0)
  if (e.fixed_pdfoutput === null) e.fixed_pdfoutput = v
  else if (e.fixed_pdfoutput !== v) pdf_error(e, 'setup', '\\pdfoutput can only be changed before anything is written to the output')
}

// [32b] pdf_begin_stream, pdf_end_stream; the zip states become one deflate of the stream's bytes
export function pdf_begin_stream(e: Engine): void {
  const s = e.ps
  pdf_print_ln(e, '/Length           ')
  s.seek_write_length = true; s.stream_length_offset = pdf_offset(e) - 11
  if (int_par(e, pdf_compress_level_code) > 0) {
    pdf_print_ln(e, '/Filter /FlateDecode'); pdf_print_ln(e, '>>'); pdf_print_ln(e, 'stream')
    s.zip_start = s.ptr
  } else {
    pdf_print_ln(e, '>>'); pdf_print_ln(e, 'stream')
    s.save_offset = pdf_offset(e)
  }
}
export function pdf_end_stream(e: Engine): void {
  const s = e.ps
  let length: number
  if (s.zip_start >= 0) {
    if (e.fs.compress === undefined) fatal_error(e, 'unsupported: \\pdfcompresslevel>0 without a compressor')
    const z = e.fs.compress(s.buf.slice(s.zip_start, s.ptr), Math.min(int_par(e, pdf_compress_level_code), 9))
    s.ptr = s.zip_start; s.zip_start = -1; pdf_print(e, Array.from(z)); length = z.length
  } else length = pdf_offset(e) - s.save_offset
  if (s.seek_write_length) { const t = String(length); for (let i = 0; i < t.length; i++) s.buf[s.stream_length_offset + i] = t.charCodeAt(i) }
  s.seek_write_length = false
  pdf_out(e, 10); pdf_print_ln(e, 'endstream'); pdf_end_obj(e)
}

// [32d] append_dest_name (dest_names holds string numbers)
function append_dest_name(e: Engine, k: number, n: number): void {
  const s = e.ps
  if (s.dest_names_ptr === sup_dest_names_size) overflow(e, 'number of destination names (dest_names_size)', s.dest_names_size)
  if (s.dest_names_ptr === s.dest_names_size) {
    const a = Math.trunc(0.2 * s.dest_names_size)
    s.dest_names_size = s.dest_names_size < sup_dest_names_size - a ? s.dest_names_size + a : sup_dest_names_size
  }
  s.dest_names[s.dest_names_ptr++] = { objname: k, objnum: n }
}

// [32d] pdf_create_obj, pdf_new_objnum
export function pdf_create_obj(e: Engine, t: number, i: number): void {
  const s = e.ps
  if (s.sys_obj_ptr === sup_obj_tab_size) overflow(e, 'indirect objects table size', s.obj_tab_size)
  if (s.sys_obj_ptr === s.obj_tab_size) {
    const a = Math.trunc(0.2 * s.obj_tab_size)
    s.obj_tab_size = s.obj_tab_size < sup_obj_tab_size - a ? s.obj_tab_size + a : sup_obj_tab_size
  }
  const p0 = ++s.sys_obj_ptr; s.obj_ptr = p0
  s.obj_info[p0] = i; s.obj_offset[p0] = -2; s.obj_aux[p0] = 0; s.obj_link[p0] = 0; s.obj_os_idx[p0] = 0
  const key = obj_key(e, t, i)
  if (!s.objs.has(key)) s.objs.set(key, p0) // avl_put_obj keeps the first object with a type and identifier
  if (t === obj_type_page) {
    let p = s.head_tab[t]!, q = 0
    if (p === 0 || s.obj_info[p]! < i) { s.obj_link[p0] = p; s.head_tab[t] = p0 }
    else {
      while (p !== 0) { if (s.obj_info[p]! < i) break; q = p; p = s.obj_link[p]! }
      s.obj_link[q] = p0; s.obj_link[p0] = p
    }
  } else if (t !== obj_type_others) {
    s.obj_link[p0] = s.head_tab[t]!; s.head_tab[t] = p0
    if (t === obj_type_dest && i < 0) append_dest_name(e, -i, p0)
  }
}
export function pdf_new_objnum(e: Engine): number { pdf_create_obj(e, obj_type_others, 0); return e.ps.obj_ptr }
const is_obj_written = (e: Engine, k: number) => e.ps.obj_offset[k]! > -1

// [53] pdf_check_obj
export function pdf_check_obj(e: Engine, t: number, n: number): void {
  let k = e.ps.head_tab[t]!
  while (k !== 0 && k !== n) k = e.ps.obj_link[k]!
  if (k === 0) pdf_error(e, 'ext1', 'cannot find referenced object')
}

// [53] find_obj, get_obj (avl_find_obj: a named object is found by its string)
const obj_key = (e: Engine, t: number, i: number) => i < 0 ? t + ':n:' + e.ps.strs[-i] : t + ':' + i
export function find_obj(e: Engine, t: number, i: number | string): number {
  return e.ps.objs.get(typeof i === 'string' ? t + ':n:' + i : t + ':' + i) ?? 0
}
export function get_obj(e: Engine, t: number, i: number, byname: number): number {
  const s = byname > 0 ? str(tokens_to_string(e, i)) : ''
  let r = find_obj(e, t, byname > 0 ? s : i)
  if (r === 0) {
    if (byname > 0) { e.ps.strs.push(s); pdf_create_obj(e, t, -(e.ps.strs.length - 1)) }
    else pdf_create_obj(e, t, i)
    r = e.ps.obj_ptr
    if (t === obj_type_dest || t === obj_type_struct_dest) e.ps.obj_aux[r] = 0 // obj_dest_ptr := null
  }
  return r
}

// [32d] object streams
function pdf_os_switch(e: Engine, pdf_os: boolean): void {
  const s = e.ps
  if (pdf_os && s.os_enable) {
    if (!s.os_mode) { s.op_ptr = s.ptr; s.ptr = s.os_ptr; s.buf = s.os_buf; s.os_mode = true }
  } else if (s.os_mode) { s.os_ptr = s.ptr; s.ptr = s.op_ptr; s.buf = s.op_buf; s.os_mode = false }
}
function pdf_os_prepare_obj(e: Engine, i: number, pdf_os_level: number): void {
  const s = e.ps
  pdf_os_switch(e, pdf_os_level > 0 && s.fixed_objcompresslevel >= pdf_os_level)
  if (s.os_mode) {
    if (s.os_cur_objnum === 0) {
      s.os_cur_objnum = pdf_new_objnum(e); s.obj_ptr--; s.os_cntr++; s.os_objidx = 0; s.ptr = 0
    } else s.os_objidx++
    s.obj_os_idx[i] = s.os_objidx; s.obj_offset[i] = s.os_cur_objnum
    s.os_objnum[s.os_objidx] = i; s.os_objoff[s.os_objidx] = s.ptr
  } else { s.obj_offset[i] = pdf_offset(e); s.obj_os_idx[i] = -1 }
}
export function pdf_begin_obj(e: Engine, i: number, pdf_os_level: number): void {
  check_pdfversion(e); pdf_os_prepare_obj(e, i, pdf_os_level)
  if (!e.ps.os_mode) { pdf_print_int(e, i); pdf_print_ln(e, ' 0 obj') }
  else if (int_par(e, pdf_compress_level_code) === 0) { pdf_print(e, '% '); pdf_print_int(e, i); pdf_print_ln(e, ' 0 obj') }
}
export function pdf_new_obj(e: Engine, t: number, i: number, pdf_os: number): void { pdf_create_obj(e, t, i); pdf_begin_obj(e, e.ps.obj_ptr, pdf_os) }
export function pdf_end_obj(e: Engine): void {
  if (e.ps.os_mode) { if (e.ps.os_objidx === pdf_os_max_objs - 1) pdf_os_write_objstream(e) }
  else pdf_print_ln(e, 'endobj')
}
export function pdf_begin_dict(e: Engine, i: number, pdf_os_level: number): void { pdf_begin_obj(e, i, pdf_os_level); pdf_print_ln(e, '<<') }
export function pdf_new_dict(e: Engine, t: number, i: number, pdf_os: number): void { pdf_create_obj(e, t, i); pdf_begin_dict(e, e.ps.obj_ptr, pdf_os) }
export function pdf_end_dict(e: Engine): void {
  pdf_print_ln(e, '>>')
  if (e.ps.os_mode) { if (e.ps.os_objidx === pdf_os_max_objs - 1) pdf_os_write_objstream(e) }
  else pdf_print_ln(e, 'endobj')
}
function pdf_os_write_objstream(e: Engine): void {
  const s = e.ps
  if (s.os_cur_objnum === 0) return
  const p = s.ptr
  for (let i = 0, j = 0; i <= s.os_objidx; i++) {
    pdf_print_int(e, s.os_objnum[i]!); pdf_print(e, ' '); pdf_print_int(e, s.os_objoff[i]!)
    if (j === 9) { pdf_out(e, 10); j = 0 } else { pdf_print(e, ' '); j++ }
  }
  s.buf[s.ptr - 1] = 10
  const q = s.ptr, os = s.os_buf
  pdf_begin_dict(e, s.os_cur_objnum, 0)
  pdf_print_ln(e, '/Type /ObjStm'); pdf_print(e, '/N '); pdf_print_int_ln(e, s.os_objidx + 1)
  pdf_print(e, '/First '); pdf_print_int_ln(e, q - p)
  pdf_begin_stream(e)
  pdf_print(e, Array.from(os.subarray(p, q))); pdf_print(e, Array.from(os.subarray(0, p)))
  pdf_end_stream(e)
  s.os_cur_objnum = 0
}

// [32d] printing dictionary entries
function pdf_print_fw_int(e: Engine, n: number, w: number): void { pdf_print(e, String(n % 10 ** w).padStart(w, '0')) }
function pdf_int_entry_ln(e: Engine, s: string, v: number): void { pdf_out(e, 47); pdf_print(e, s); pdf_out(e, 32); pdf_print_int(e, v); pdf_print_nl(e) }
export function pdf_indirect_ln(e: Engine, s: string, o: number): void { pdf_out(e, 47); pdf_print(e, s); pdf_out(e, 32); pdf_print_int(e, o); pdf_print_ln(e, ' 0 R') }
function pdf_print_str(e: Engine, t: string): void {
  if (t.length === 0) { pdf_print(e, '()'); return }
  if (t[0] === '(' && t[t.length - 1] === ')') { pdf_print(e, t); return }
  const hex = (c: string) => /[0-9A-Fa-f]/.test(c)
  let is_hex = false
  if (t[0] === '<' && t[t.length - 1] === '>' && t.length % 2 === 0) {
    let i = 1
    while (i < t.length - 2 && hex(t[i]!) && hex(t[i + 1]!)) i += 2
    is_hex = i >= t.length - 2
  }
  if (is_hex) pdf_print(e, t); else { pdf_out(e, 40); pdf_print(e, t); pdf_out(e, 41) }
}
export function pdf_print_str_ln(e: Engine, t: string): void { pdf_print_str(e, t); pdf_print_nl(e) }
function pdf_str_entry_ln(e: Engine, s: string, v: string): void { pdf_out(e, 47); pdf_print(e, s); pdf_out(e, 32); pdf_print_str(e, v); pdf_print_nl(e) }

// [32d] pdf_indirect, pdf_int_entry, pdf_str_entry (no newline)
function pdf_indirect(e: Engine, s: string, o: number): void { pdf_out(e, 47); pdf_print(e, s); pdf_out(e, 32); pdf_print_int(e, o); pdf_print(e, ' 0 R') }
function pdf_int_entry(e: Engine, s: string, v: number): void { pdf_out(e, 47); pdf_print(e, s); pdf_out(e, 32); pdf_print_int(e, v) }
function pdf_str_entry(e: Engine, s: string, v: string): void { pdf_out(e, 47); pdf_print(e, s); pdf_out(e, 32); pdf_print_str(e, v) }

// [53] write_action
export function write_action(e: Engine, p: PdfAction): void {
  if (p.type === pdf_action_user) { pdf_print_toks_ln(e, p.tokens); return }
  const toks = (t: number) => str(tokens_to_string(e, t))
  pdf_print(e, '<< ')
  if (p.file !== 0) {
    pdf_print(e, '/F ')
    const s = toks(p.file)
    if (s[0] === '(' && s[s.length - 1] === ')') pdf_print(e, s); else pdf_print_str(e, s)
    pdf_print(e, ' ')
    if (p.new_window > 0) { pdf_print(e, '/NewWindow '); pdf_print(e, p.new_window === 1 ? 'true ' : 'false ') }
  }
  let d = 0
  switch (p.type) {
    case pdf_action_page:
      if (p.file === 0) { pdf_print(e, '/S /GoTo /D ['); pdf_print_int(e, get_obj(e, obj_type_page, p.id, 0)); pdf_print(e, ' 0 R') }
      else { pdf_print(e, '/S /GoToR /D ['); pdf_print_int(e, p.id - 1) }
      pdf_out(e, 32); pdf_print(e, toks(p.tokens)); pdf_out(e, 93)
      break
    case pdf_action_goto:
      if (p.file === 0) { pdf_print(e, '/S /GoTo '); d = get_obj(e, obj_type_dest, p.id, p.named_id % 2) }
      else pdf_print(e, '/S /GoToR ')
      if (p.named_id % 2 === 1) pdf_str_entry(e, 'D', toks(p.id))
      else if (p.file === 0) pdf_indirect(e, 'D', d)
      else pdf_error(e, 'ext4', "`goto' option cannot be used with both `file' and `num'")
      break
    case pdf_action_thread:
      pdf_print(e, '/S /Thread ')
      if (p.file === 0) d = get_obj(e, obj_type_thread, p.id, p.named_id % 2)
      if (p.named_id % 2 === 1) pdf_str_entry(e, 'D', toks(p.id))
      else if (p.file === 0) pdf_indirect(e, 'D', d)
      else pdf_int_entry(e, 'D', p.id)
      break
  }
  if (p.struct_id !== 0) {
    pdf_out(e, 32)
    if (p.file === 0) pdf_indirect(e, 'SD', get_obj(e, obj_type_struct_dest, p.struct_id, Math.trunc(p.named_id / 2) % 2))
    else { pdf_print(e, '/SD '); pdf_print(e, toks(p.struct_id)) }
  }
  pdf_print_ln(e, ' >>')
}

// [32f] pdf_print_toks_ln
function pdf_print_toks_ln(e: Engine, p: number): void { const s = tokens_to_string(e, p); if (s.length > 0) pdf_print_ln(e, s) }

// [32c] pdf_set_origin, pdf_set_origin_temp, pdf_end_string
function pdf_set_origin(e: Engine, h: number, v: number): void {
  const s = e.ps
  if (Math.abs(h - s.origin_h) >= s.min_bp_val || Math.abs(v - s.origin_v) >= s.min_bp_val) {
    pdf_print(e, '1 0 0 1 '); pdf_print_bp(e, h - s.origin_h); s.origin_h = (s.origin_h + s.scaled_out) | 0
    pdf_out(e, 32); pdf_print_bp(e, s.origin_v - v); s.origin_v = (s.origin_v - s.scaled_out) | 0
    pdf_print_ln(e, ' cm')
  }
  s.h = s.origin_h; s.tj_start_h = s.h; s.v = s.origin_v
}
function pdf_set_origin_temp(e: Engine, h: number, v: number): void {
  const s = e.ps
  if (Math.abs(h - s.origin_h) >= s.min_bp_val || Math.abs(v - s.origin_v) >= s.min_bp_val) {
    pdf_print(e, '1 0 0 1 '); pdf_print_bp(e, h - s.origin_h); pdf_out(e, 32); pdf_print_bp(e, s.origin_v - v); pdf_print_ln(e, ' cm')
  }
}
function pdf_end_string(e: Engine): void { if (e.ps.doing_string) { pdf_print(e, ')]TJ'); e.ps.doing_string = false } }
function pdf_end_string_nl(e: Engine): void { if (e.ps.doing_string) { pdf_print_ln(e, ')]TJ'); e.ps.doing_string = false } }

// [32c] pdf_set_text_pos; font expansion is unsupported, so pdf_cur_Tm_a stays 0 and the Td branch is the only one
function pdf_set_text_pos(e: Engine, v: number, v_out: number): void {
  const s = e.ps
  pdf_out(e, 32)
  pdf_print_bp(e, e.cur_h - s.tj_start_h); s.h = (s.tj_start_h + s.scaled_out) | 0
  pdf_out(e, 32); pdf_print_real(e, v, s.fixed_decimal_digits); s.v = (s.v - v_out) | 0
  pdf_print(e, ' Td')
  s.tj_start_h = s.h; s.delta_h = 0
}

// [32c] pdf_use_font, pdf_init_font, pdf_set_font
function pdf_use_font(e: Engine, f: number, fontnum: number): void {
  divide_scaled(e, e.font_size[f]!, one_hundred_bp, 6)
  e.ps.font_size[f] = e.ps.scaled_out; e.font_used[f] = true; e.ps.font_num[f] = fontnum
}
export function pdf_init_font(e: Engine, f: number): void {
  const s = e.ps
  if (isscalable(e, f)) {
    for (let i = s.head_tab[obj_type_font]!; i !== 0; i = s.obj_link[i]!) {
      const k = s.obj_info[i]!
      if (isscalable(e, k) && e.fm.font_map[k] === e.fm.font_map[f] && e.font_name[k] === e.font_name[f]) {
        pdf_use_font(e, f, s.font_num[k]! < 0 ? s.font_num[k]! : -k); return
      }
    }
  }
  pdf_create_obj(e, obj_type_font, f)
  s.font_has_space_char[f] = hasspacechar(e, f) && char_width(e, f, char_info(e, f, 32)) > one_bp
  pdf_use_font(e, f, s.obj_ptr)
}
const set_ff = (e: Engine, f: number) => e.ps.font_num[f]! < 0 ? -e.ps.font_num[f]! : f
function pdf_set_font(e: Engine, f: number): void {
  const s = e.ps
  s.f = f
  if (!e.font_used[f]) pdf_init_font(e, f)
  const k = set_ff(e, f)
  if (!s.font_list.some(x => set_ff(e, x) === k)) s.font_list.push(f)
  if (k === s.last_f && e.font_size[f] === s.last_fs) return
  pdf_print(e, '/F'); pdf_print_int(e, k); pdf_out(e, 32)
  pdf_print_real(e, divide_scaled(e, e.font_size[f]!, one_hundred_bp, 6), 4)
  pdf_print(e, ' Tf')
  s.last_f = k; s.last_fs = e.font_size[f]!
}

// [32c] pdf_begin_text
function pdf_begin_text(e: Engine): void {
  const s = e.ps
  pdf_set_origin(e, 0, e.cur_page_height)
  pdf_print_ln(e, 'BT')
  s.doing_text = true; s.f = null_font; s.last_f = null_font; s.last_fs = 0; s.doing_string = false
}

// [32b] adv_char_width (pdf_cur_Tm_a = 0; PK fonts are unsupported)
function adv_char_width(e: Engine, f: number, c: number): number {
  const w = char_width(e, f, char_info(e, f, c))
  const s = divide_scaled(e, w, e.ps.font_size[f]!, 4)
  e.ps.delta_h = (e.ps.delta_h + e.ps.scaled_out) | 0
  return s
}

// [32c] pdf_begin_string
function pdf_begin_string(e: Engine, f: number): void {
  const st = e.ps
  let must_end_string = false, must_insert_space = false, must_set_text_pos = false
  if (!st.doing_text) { pdf_begin_text(e); must_set_text_pos = true }
  if ((!st.gen_faked_interword_space && st.f !== f) || (st.gen_faked_interword_space && !(e.font_used[f] && e.font_used[st.f])))
    { pdf_end_string(e); pdf_set_font(e, f) }
  let s = divide_scaled(e, e.cur_h - (st.tj_start_h + st.delta_h), st.font_size[f]!, 3), s_out = st.scaled_out
  let v = 0, v_out = 0
  if (Math.abs(e.cur_v - st.v) >= st.min_bp_val) { v = divide_scaled(e, st.v - e.cur_v, one_hundred_bp, st.fixed_decimal_digits + 2); v_out = st.scaled_out }
  if (!must_set_text_pos) must_set_text_pos = v !== 0 || Math.abs(s) >= 0o100000
  if (must_set_text_pos) must_end_string = true
  const space = param(e, space_code, f)
  const move_looks_like_interword_space = space > one_bp && s_out > space - param(e, space_shrink_code, f) - Math.trunc(one_bp / 10) && v === 0
  if (st.gen_faked_interword_space && move_looks_like_interword_space) must_insert_space = true
  if (must_insert_space) fatal_error(e, 'unsupported: \\pdfinterwordspaceon') // pass B
  if (must_end_string) { pdf_end_string(e); pdf_set_font(e, f); pdf_set_text_pos(e, v, v_out); s = 0 }
  if (!st.doing_string) { pdf_print(e, ' ['); if (s === 0) pdf_out(e, 40) }
  if (s !== 0) {
    if (st.doing_string) pdf_out(e, 41)
    pdf_print_int(e, -s); pdf_out(e, 40)
    st.delta_h = (st.delta_h + s_out) | 0
  }
  st.doing_string = true
}

// [32c] pdf_end_text, pdf_set_rule
function pdf_end_text(e: Engine): void {
  if (e.ps.doing_text) { pdf_end_string_nl(e); pdf_print_ln(e, 'ET'); e.ps.doing_text = false }
}
function pdf_set_rule(e: Engine, x: number, y: number, w: number, h: number): void {
  pdf_end_text(e)
  pdf_print_ln(e, 'q')
  if (h <= one_bp) { // `(h + 1)/2' is real division in Pascal; web2c converts the argument to an integer by truncation
    pdf_set_origin_temp(e, x, Math.trunc(y - (h + 1) / 2))
    pdf_print(e, '[]0 d 0 J '); pdf_print_bp(e, h); pdf_print(e, ' w 0 0 m '); pdf_print_bp(e, w); pdf_print_ln(e, ' 0 l S')
  } else if (w <= one_bp) {
    pdf_set_origin_temp(e, Math.trunc(x + (w + 1) / 2), y)
    pdf_print(e, '[]0 d 0 J '); pdf_print_bp(e, w); pdf_print(e, ' w 0 0 m 0 '); pdf_print_bp(e, h); pdf_print_ln(e, ' l S')
  } else {
    pdf_set_origin_temp(e, x, y)
    pdf_print(e, '0 0 '); pdf_print_bp(e, w); pdf_out(e, 32); pdf_print_bp(e, h); pdf_print_ln(e, ' re f')
  }
  pdf_print_ln(e, 'Q')
}

// [32c] literal
export function literal(e: Engine, s: number[], literal_mode: number, warn: boolean): void {
  let j = 0
  const prefix = (t: string, i: number) => s.length >= i + t.length && t.split('').every((c, k) => s[i + k] === c.charCodeAt(0))
  if (literal_mode === scan_special) {
    if (!(prefix('PDF:', 0) || prefix('pdf:', 0))) {
      if (warn && !(prefix('SRC:', 0) || prefix('src:', 0) || s.length === 0)) {
        print_nl(e, 'Non-PDF special ignored!'); print_nl(e, '<special> ')
        for (let k = 0; k < s.length && k <= 64; k++) print(e, s[k]!) // slow_print_substr(s, 64)
        if (s.length > 65) print(e, '...')
        print_ln(e)
      }
      return
    }
    j += 4
    if (prefix('direct:', 4)) { j += 7; literal_mode = direct_always }
    else if (prefix('page:', 4)) { j += 5; literal_mode = direct_page }
    else literal_mode = set_origin
  }
  switch (literal_mode) {
    case set_origin: pdf_end_text(e); pdf_set_origin(e, e.cur_h, e.cur_v); break
    case direct_page: pdf_end_text(e); break
    case direct_always: pdf_end_string_nl(e); break
    default: confusion(e, 'literal1')
  }
  pdf_print(e, s.slice(j)); pdf_print_nl(e)
}

// [32f] pdf_out_literal, pdf_special
function pdf_out_literal(e: Engine, p: WhatsitNode): void {
  let h: number
  if (p.subtype === pdf_lateliteral_node) { expand_write_tokens(e, p, p.pdf_data); h = e.def_ref } else h = p.pdf_data
  const s = tokens_to_string(e, h)
  literal(e, s, p.pdf_mode, false)
  if (p.subtype === pdf_lateliteral_node) flush_list(e, e.def_ref)
}
function pdf_special(e: Engine, p: WhatsitNode): void {
  let h: number
  if (p.subtype === latespecial_node) { expand_write_tokens(e, p, p.write_tokens); h = e.def_ref } else h = p.write_tokens
  const s = tokens_to_string(e, h)
  literal(e, s, scan_special, true)
  if (p.subtype === latespecial_node) flush_list(e, e.def_ref)
}

// utils.c pdfsetmatrix: parse `a b c d' as sscanf(" %lf %lf %lf %lf %c") == 4 and push the matrix (page mode only)
function pdfsetmatrix(e: Engine, t: string, cur_h: number, cur_v: number): boolean {
  const s = e.ps
  if (!s.page_mode) return true
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*$/.exec(t)
  if (m === null) return false // shortcut: strtod's inf/nan/hex forms are not recognised, upgrade if a package writes them
  const [a, b, c, d] = [+m[1]!, +m[2]!, +m[3]!, +m[4]!]
  const xe = cur_h * (1.0 - a) - cur_v * c, xf = cur_v * (1.0 - d) - cur_h * b
  const y = s.matrix_stack[s.matrix_stack.length - 1]
  s.matrix_stack.push(y === undefined ? [a, b, c, d, xe, xf]
    : [a * y[0]! + b * y[2]!, a * y[1]! + b * y[3]!, c * y[0]! + d * y[2]!, c * y[1]! + d * y[3]!, xe * y[0]! + xf * y[2]! + y[4]!, xe * y[1]! + xf * y[3]! + y[5]!])
  return true
}
// [32f] pdf_out_setmatrix, pdf_out_save, pdf_out_restore (utils.c checkpdfsave, checkpdfrestore)
function pdf_out_setmatrix(e: Engine, p: WhatsitNode): void {
  const t = tokens_to_string(e, p.pdf_data)
  if (!pdfsetmatrix(e, str(t), e.cur_h, (e.cur_page_height - e.cur_v) | 0)) pdf_error(e, '\\pdfsetmatrix', 'Unrecognized format.')
  literal(e, t.concat(Array.from(' 0 0 cm', c => c.charCodeAt(0))), set_origin, false)
}
function pdf_out_save(e: Engine): void {
  const s = e.ps
  s.pos_stack.push({ h: e.cur_h, v: e.cur_v, m: s.page_mode ? s.matrix_stack.length : 0 })
  literal(e, [113], set_origin, false)
}
function pdf_out_restore(e: Engine): void {
  const s = e.ps, q = s.pos_stack.pop()
  if (q === undefined) pdftex_warn(e, null, '\\pdfrestore: missing \\pdfsave')
  else {
    const dh = (e.cur_h - q.h) | 0, dv = (e.cur_v - q.v) | 0
    if (dh !== 0 || dv !== 0) pdftex_warn(e, null, `Misplaced \\pdfrestore by (${dh >>> 0}sp, ${dv >>> 0}sp)`) // C's %u
    if (s.page_mode) s.matrix_stack.length = q.m
  }
  literal(e, [81], set_origin, false)
}

// [32f] the whatsit cases of pdf_hlist_out/pdf_vlist_out; (x, y) is (left_edge, base_line) or (left_edge, top_edge + height)
function pdf_out_whatsit(e: Engine, p: WhatsitNode, vlist: boolean, b: BoxNode, x: number, y: number): void {
  switch (p.subtype) {
    case pdf_literal_node: case pdf_lateliteral_node: pdf_out_literal(e, p); return
    case pdf_refobj_node: e.ps.obj_list.push(p.pdf_objnum); return
    case pdf_save_pos_node: // Save current position to pdf_last_x_pos, pdf_last_y_pos
      e.pdf_last_x_pos = e.cur_h
      e.pdf_last_y_pos = e.ps.is_shipping_page ? (e.cur_page_height - e.cur_v) | 0 : (e.ps.xform_height + e.ps.xform_depth - e.cur_v) | 0
      return
    case pdf_refxform_node: { // Output a Form node in a vlist / hlist
      if (vlist) {
        e.cur_v = (e.cur_v + p.pdf_top) | 0; const save_v = e.cur_v
        e.cur_h = x; out_form(e, p); e.cur_v = (save_v + p.pdf_right) | 0; e.cur_h = x
      } else {
        e.cur_v = y; const edge = e.cur_h
        out_form(e, p); e.cur_h = (edge + p.pdf_left) | 0; e.cur_v = y
      }
      return
    }
    case special_node: case latespecial_node: pdf_special(e, p); return
    case pdf_snapy_comp_node: case pdf_snapy_node: if (!vlist) return; break
    case pdf_interword_space_on_node: e.ps.gen_faked_interword_space = true; return
    case pdf_interword_space_off_node: e.ps.gen_faked_interword_space = false; return
    case pdf_running_link_off_node: e.ps.gen_running_link = false; return
    case pdf_running_link_on_node: e.ps.gen_running_link = true; return
    case pdf_setmatrix_node: pdf_out_setmatrix(e, p); return
    case pdf_save_node: pdf_out_save(e); return
    case pdf_restore_node: pdf_out_restore(e); return
    case pdf_annot_node: do_annot(e, p, b, x, y); return
    case pdf_start_link_node: if (vlist) pdf_error(e, 'ext4', '\\pdfstartlink ended up in vlist'); do_link(e, p, b, x, y); return
    case pdf_end_link_node: if (vlist) pdf_error(e, 'ext4', '\\pdfendlink ended up in vlist'); end_link(e); return
    case pdf_dest_node: do_dest(e, p, b, x, y); return
    case pdf_thread_node: do_thread(e, p, b, x, y); return
    case pdf_start_thread_node: if (!vlist) pdf_error(e, 'ext4', '\\pdfstartthread ended up in hlist'); do_thread(e, p, b, x, y); return
    case pdf_end_thread_node: if (!vlist) pdf_error(e, 'ext4', '\\pdfendthread ended up in hlist'); end_thread(e); return
    case pdf_colorstack_node: pdf_out_colorstack(e, p); return
    case pdf_refximage_node: // Output an Image node in a vlist / hlist
      if (vlist) { e.cur_v = (e.cur_v + p.pdf_top + p.pdf_right) | 0; const save_v = e.cur_v; e.cur_h = x; out_image(e, p); e.cur_v = save_v; e.cur_h = x }
      else { e.cur_v = (y + p.pdf_right) | 0; const edge = e.cur_h; out_image(e, p); e.cur_h = (edge + p.pdf_left) | 0; e.cur_v = y }
      return
    case pdf_snap_ref_point_node: case pdf_fake_space_node:
      break
    default: out_what(e, p); return
  }
  fatal_error(e, `unsupported: PDF whatsit ${p.subtype} in shipout`) // pass B
}

// utils.c matrixtransformrect, matrixtransformpoint, matrixrecalculate (the results are returned, not kept in ret_llx …)
function do_matrixtransform(e: Engine, x: number, y: number): [number, number] {
  const m = e.ps.matrix_stack[e.ps.matrix_stack.length - 1]!
  const r = (v: number) => Math.trunc(v > 0 ? v + 0.5 : v - 0.5) // DO_ROUND, then (scaled)
  return [r(x * m[0]! + y * m[2]! + m[4]!), r(x * m[1]! + y * m[3]! + m[5]!)]
}
function matrixtransformrect(e: Engine, llx: number, lly: number, urx: number, ury: number): number[] {
  const s = e.ps
  if (!(s.page_mode && s.matrix_stack.length > 0)) return [llx, lly, urx, ury]
  s.last_rect = [llx, lly, urx, ury]
  const [x1, y1] = do_matrixtransform(e, llx, lly), [x2, y2] = do_matrixtransform(e, llx, ury)
  const [x3, y3] = do_matrixtransform(e, urx, lly), [x4, y4] = do_matrixtransform(e, urx, ury)
  return [Math.min(x1, x2, x3, x4), Math.min(y1, y2, y3, y4), Math.max(x1, x2, x3, x4), Math.max(y1, y2, y3, y4)]
}
const matrixused = (e: Engine) => e.ps.matrix_stack.length > 0

// [53] set_rect_dimens: pdf_left/top/right are pdf_width/height/depth, so w, h, d are read before they are overwritten
function set_rect_dimens(e: Engine, p: WhatsitNode, b: BoxNode, x: number, y: number, w: number, h: number, d: number, margin: number): void {
  p.pdf_left = e.cur_h
  p.pdf_right = w === null_flag ? (x + b.width) | 0 : (e.cur_h + w) | 0
  p.pdf_top = h === null_flag ? (y - b.height) | 0 : (e.cur_v - h) | 0
  p.pdf_bottom = d === null_flag ? (y + b.depth) | 0 : (e.cur_v + d) | 0
  if (e.ps.is_shipping_page && matrixused(e)) {
    const H = e.cur_page_height
    const [llx, lly, urx, ury] = matrixtransformrect(e, p.pdf_left, (H - p.pdf_bottom) | 0, p.pdf_right, (H - p.pdf_top) | 0)
    p.pdf_left = llx!; p.pdf_bottom = (H - lly!) | 0; p.pdf_right = urx!; p.pdf_top = (H - ury!) | 0
  }
  p.pdf_left = (p.pdf_left - margin) | 0; p.pdf_top = (p.pdf_top - margin) | 0
  p.pdf_right = (p.pdf_right + margin) | 0; p.pdf_bottom = (p.pdf_bottom + margin) | 0
}
const dimen_par = (e: Engine, c: number) => e.equiv[dimen_base + c]!
const pdf_link_margin_code = 25, pdf_dest_margin_code = 26, pdf_thread_margin_code = 27, pdf_suppress_warning_dup_dest_code = 93
const is_obj_scheduled = (e: Engine, k: number) => e.ps.obj_offset[k]! > -2
const set_obj_scheduled = (e: Engine, k: number) => { if (e.ps.obj_offset[k] === -2) e.ps.obj_offset[k] = -1 }

// [53] do_annot
function do_annot(e: Engine, p: WhatsitNode, b: BoxNode, x: number, y: number): void {
  if (!e.ps.is_shipping_page) pdf_error(e, 'ext4', 'annotations cannot be inside an XForm')
  if (e.doing_leaders) return
  if (is_obj_scheduled(e, p.pdf_objnum)) p.pdf_objnum = pdf_new_objnum(e)
  set_rect_dimens(e, p, b, x, y, p.pdf_left, p.pdf_top, p.pdf_right, 0)
  e.ps.obj_node[p.pdf_objnum] = p
  e.ps.annot_list.push(p.pdf_objnum)
  set_obj_scheduled(e, p.pdf_objnum)
}

// [53] push_link_level, pop_link_level, do_link, end_link, append_link (copy_node_list copies the node alone here: pdftex
// copies the rest of the list too and drops it, which only costs memory)
const pdf_max_link_level = 10
function copy_one(e: Engine, p: WhatsitNode): WhatsitNode { return copy_node_list(e, { ...p, link: null }) as WhatsitNode }
function do_link(e: Engine, p: WhatsitNode, b: BoxNode, x: number, y: number): void {
  const s = e.ps
  if (!s.is_shipping_page) pdf_error(e, 'ext4', 'link annotations cannot be inside an XForm')
  if (is_obj_scheduled(e, p.pdf_objnum)) p.pdf_objnum = pdf_new_objnum(e)
  if (s.link_stack.length >= pdf_max_link_level) overflow(e, 'pdf link stack size', pdf_max_link_level)
  s.link_stack.push({ nesting_level: e.cur_s, link_node: copy_one(e, p), ref_link_node: p })
  set_rect_dimens(e, p, b, x, y, p.pdf_left, p.pdf_top, p.pdf_right, dimen_par(e, pdf_link_margin_code))
  s.obj_node[p.pdf_objnum] = p
  s.link_list.push(p.pdf_objnum)
  set_obj_scheduled(e, p.pdf_objnum)
}
function end_link(e: Engine): void {
  const s = e.ps, top = s.link_stack[s.link_stack.length - 1]
  if (top === undefined) pdf_error(e, 'ext4', 'pdf_link_stack empty, \\pdfendlink used without \\pdfstartlink?')
  if (top.nesting_level !== e.cur_s) pdf_warning(e, '', '\\pdfendlink ended up in different nesting level than \\pdfstartlink', true, true)
  if (top.link_node.pdf_left === null_flag) {
    const p = top.ref_link_node, m = dimen_par(e, pdf_link_margin_code)
    if (s.is_shipping_page && matrixused(e)) {
      const [llx, lly, urx, ury] = matrixtransformrect(e, s.last_rect[0]!, s.last_rect[1]!, (e.cur_h + m) | 0, s.last_rect[3]!) // matrixrecalculate
      p.pdf_left = (llx! - m) | 0; p.pdf_top = (e.cur_page_height - ury! - m) | 0
      p.pdf_right = (urx! + m) | 0; p.pdf_bottom = (e.cur_page_height - lly! + m) | 0
    } else p.pdf_right = (e.cur_h + m) | 0
  }
  flush_node_list(e, top.link_node); s.link_stack.pop() // pop_link_level
}
function append_link(e: Engine, b: BoxNode, x: number, y: number, i: number): void {
  const s = e.ps, p = copy_one(e, s.link_stack[i]!.link_node)
  s.link_stack[i]!.ref_link_node = p
  p.pdf_synthetic = true // info(p) := max_halfword: not linked in any list
  set_rect_dimens(e, p, b, x, y, p.pdf_left, p.pdf_top, p.pdf_right, dimen_par(e, pdf_link_margin_code))
  pdf_create_obj(e, obj_type_others, 0)
  s.obj_node[s.obj_ptr] = p
  s.link_list.push(s.obj_ptr)
}

// [53] append_bead, do_thread, append_thread, end_thread
function append_bead(e: Engine, p: WhatsitNode): void {
  const s = e.ps, m = s.mem
  if (!s.is_shipping_page) pdf_error(e, 'ext4', 'threads cannot be inside an XForm')
  const t = get_obj(e, obj_type_thread, p.pdf_id, p.pdf_named_id)
  const b = pdf_new_objnum(e), d = s.obj_aux[b] = pdf_get_mem(e, 5) // obj_bead_rect/data, page, next, prev, attr
  m[d + 1] = s.last_page; s.obj_node[b] = p
  if (p.pdf_data !== 0) { s.strs.push(str(tokens_to_string(e, p.pdf_data))); m[d + 4] = s.strs.length - 1 } else m[d + 4] = 0
  if (s.obj_aux[t] === 0) { s.obj_aux[t] = b; m[d + 2] = b; m[d + 3] = b }
  else {
    const a = s.obj_aux[t]!, c = m[s.obj_aux[a]! + 3]!
    m[d + 3] = c; m[d + 2] = a; m[s.obj_aux[a]! + 3] = b; m[s.obj_aux[c]! + 2] = b
  }
  s.bead_list.push(b)
}
function do_thread(e: Engine, p: WhatsitNode, b: BoxNode, x: number, y: number): void {
  const s = e.ps
  if (e.doing_leaders) return
  if (p.subtype === pdf_start_thread_node) {
    s.thread_wd = p.pdf_left; s.thread_ht = p.pdf_top; s.thread_dp = p.pdf_right
    s.last_thread_id = p.pdf_id; s.last_thread_named_id = p.pdf_named_id > 0
    if (s.last_thread_named_id) add_token_ref(e, p.pdf_id)
    s.thread_level = e.cur_s
  }
  set_rect_dimens(e, p, b, x, y, p.pdf_left, p.pdf_top, p.pdf_right, dimen_par(e, pdf_thread_margin_code))
  append_bead(e, p)
  s.last_thread = p
}
function append_thread(e: Engine, b: BoxNode, x: number, y: number): void {
  const s = e.ps, p = new_whatsit_node(pdf_start_thread_node)
  p.pdf_synthetic = true
  p.pdf_left = s.thread_wd; p.pdf_top = s.thread_ht; p.pdf_right = s.thread_dp
  p.pdf_id = s.last_thread_id
  if (s.last_thread_named_id) { add_token_ref(e, p.pdf_id); p.pdf_named_id = 1 }
  set_rect_dimens(e, p, b, x, y, p.pdf_left, p.pdf_top, p.pdf_right, dimen_par(e, pdf_thread_margin_code))
  append_bead(e, p)
  s.last_thread = p
}
function end_thread(e: Engine): void {
  const s = e.ps
  if (s.thread_level !== e.cur_s) pdf_error(e, 'ext4', '\\pdfendthread ended up in different nesting level than \\pdfstartthread')
  if (s.thread_dp === null_flag && s.last_thread !== null) s.last_thread.pdf_bottom = (e.cur_v + dimen_par(e, pdf_thread_margin_code)) | 0
  if (s.last_thread_named_id) delete_token_ref(e, s.last_thread_id)
  s.last_thread = null
}

// [53] warn_dest_dup
export function warn_dest_dup(e: Engine, id: number, byname: number, s1: string, s2: string): void {
  if (int_par(e, pdf_suppress_warning_dup_dest_code) > 0) return
  pdf_warning(e, s1, 'destination with the same identifier (', true, false)
  if (byname > 0) { print(e, 'name'); print_mark(e, id) } else { print(e, 'num'); print_int(e, id) }
  print(e, ') '); print(e, s2); print_ln(e)
  show_context(e)
}

// [53] do_dest
function do_dest(e: Engine, p: WhatsitNode, b: BoxNode, x: number, y: number): void {
  const s = e.ps
  if (!s.is_shipping_page) pdf_error(e, 'ext4', 'destinations cannot be inside an XForm')
  if (e.doing_leaders) return
  const k = get_obj(e, p.pdf_objnum === 0 ? obj_type_dest : obj_type_struct_dest, p.pdf_id, p.pdf_named_id)
  if (s.obj_node[k]) { warn_dest_dup(e, p.pdf_id, p.pdf_named_id, 'ext4', 'has been already used, duplicate ignored'); return }
  s.obj_node[k] = p
  s.dest_list.push(k)
  const margin = dimen_par(e, pdf_dest_margin_code), rect = () => set_rect_dimens(e, p, b, x, y, p.pdf_left, p.pdf_top, p.pdf_right, margin)
  switch (p.pdf_mode) {
    case pdf_dest_xyz: if (matrixused(e)) rect(); else { p.pdf_left = e.cur_h; p.pdf_top = e.cur_v } break
    case pdf_dest_fith: case pdf_dest_fitbh: if (matrixused(e)) rect(); else p.pdf_top = e.cur_v; break
    case pdf_dest_fitv: case pdf_dest_fitbv: if (matrixused(e)) rect(); else p.pdf_left = e.cur_h; break
    case pdf_dest_fitr: rect(); break
  }
}

// [32f] glue in pdf_hlist_out/pdf_vlist_out: vet_glue and round
function glue_amount(e: Engine, st: { cur_g: number, cur_glue: number }, b: BoxNode, gp: number): void {
  const g = e.spec[gp]!
  if (b.glue_sign === normal) return
  if (b.glue_sign === stretching) { if (g.stretch_order !== b.glue_order) return; st.cur_glue += g.stretch }
  else { if (g.shrink_order !== b.glue_order) return; st.cur_glue -= g.shrink }
  let t = b.glue_set * st.cur_glue
  if (t > 1000000000) t = 1000000000; else if (t < -1000000000) t = -1000000000
  st.cur_g = zround(t)
}

// [32f] pdf_hlist_out
function pdf_hlist_out(e: Engine, this_box: BoxNode): void {
  const st = { cur_g: 0, cur_glue: 0 }
  let p = this_box.list_ptr
  e.cur_s++
  const base_line = e.cur_v, left_edge = e.cur_h
  // Create link annotations for the current hbox if needed
  for (let i = 0; i < e.ps.link_stack.length; i++)
    if (e.ps.link_stack[i]!.nesting_level === e.cur_s && e.ps.gen_running_link) append_link(e, this_box, left_edge, base_line, i)
  while (p !== null) {
    if (is_char_node(p) || p.type === ligature_node) { // a ligature looks like a char_node
      do {
        const f = p.font, c = p.character
        if (e.font_bc[f]! <= c && c <= e.font_ec[f]! && char_exists(char_info(e, f, c))) output_one_char(e, f, c)
        else char_warning(e, f, c)
        e.cur_h = (e.cur_h + char_width(e, f, char_info(e, f, c))) | 0
        p = p.link
      } while (p !== null && (is_char_node(p) || p.type === ligature_node))
      continue
    }
    let rule_ht = 0, rule_dp = 0, rule_wd = 0
    fin_rule: {
      move_past: {
        switch (p.type) {
          case hlist_node: case vlist_node: // (pdfTeX) Output a box in an hlist
            if (p.list_ptr === null) e.cur_h = (e.cur_h + p.width) | 0
            else {
              e.cur_v = (base_line + p.shift_amount) | 0
              const edge = (e.cur_h + p.width) | 0
              if (p.type === vlist_node) pdf_vlist_out(e, p); else pdf_hlist_out(e, p)
              e.cur_h = edge; e.cur_v = base_line
            }
            break
          case rule_node: rule_ht = p.height; rule_dp = p.depth; rule_wd = p.width; break fin_rule
          case whatsit_node: pdf_out_whatsit(e, p, false, this_box, left_edge, base_line); break
          case glue_node: { // (pdfTeX) Move right or output leaders
            rule_wd = (e.spec[p.glue_ptr]!.width - st.cur_g) | 0
            glue_amount(e, st, this_box, p.glue_ptr)
            rule_wd = (rule_wd + st.cur_g) | 0
            if (p.subtype >= a_leaders) {
              const leader_box = p.leader_ptr!
              if (leader_box.type === rule_node) { rule_ht = leader_box.height; rule_dp = leader_box.depth; break fin_rule }
              const lb = leader_box as BoxNode, leader_wd = lb.width
              if (leader_wd > 0 && rule_wd > 0) {
                rule_wd = (rule_wd + 10) | 0
                const edge = (e.cur_h + rule_wd) | 0
                let lx = 0
                if (p.subtype === a_leaders) { // §627
                  const save_h = e.cur_h
                  e.cur_h = (left_edge + leader_wd * Math.trunc((e.cur_h - left_edge) / leader_wd)) | 0
                  if (e.cur_h < save_h) e.cur_h = (e.cur_h + leader_wd) | 0
                } else {
                  const lq = Math.trunc(rule_wd / leader_wd), lr = rule_wd % leader_wd
                  if (p.subtype === c_leaders) e.cur_h = (e.cur_h + Math.trunc(lr / 2)) | 0
                  else { lx = Math.trunc(lr / (lq + 1)); e.cur_h = (e.cur_h + Math.trunc((lr - (lq - 1) * lx) / 2)) | 0 }
                }
                while (e.cur_h + leader_wd <= edge) { // (pdfTeX) Output a leader box at cur_h
                  e.cur_v = (base_line + lb.shift_amount) | 0
                  const save_h = e.cur_h
                  const outer_doing_leaders = e.doing_leaders; e.doing_leaders = true
                  if (lb.type === vlist_node) pdf_vlist_out(e, lb); else pdf_hlist_out(e, lb)
                  e.doing_leaders = outer_doing_leaders
                  e.cur_v = base_line; e.cur_h = (save_h + leader_wd + lx) | 0
                }
                e.cur_h = (edge - 10) | 0
                p = p.link; continue
              }
            }
            break move_past
          }
          case kern_node: case math_node: e.cur_h = (e.cur_h + p.width) | 0; break // margin_kern_node: protrusion is unsupported
        }
        p = p.link; continue
      }
      e.cur_h = (e.cur_h + rule_wd) | 0 // move_past
      p = p.link; continue
    }
    // fin_rule: (pdfTeX) Output a rule in an hlist
    if (rule_ht === null_flag) rule_ht = this_box.height
    if (rule_dp === null_flag) rule_dp = this_box.depth
    rule_ht = (rule_ht + rule_dp) | 0
    if (rule_ht > 0 && rule_wd > 0) {
      e.cur_v = (base_line + rule_dp) | 0
      pdf_set_rule(e, e.cur_h, e.cur_v, rule_wd, rule_ht)
      e.cur_v = base_line
    }
    e.cur_h = (e.cur_h + rule_wd) | 0 // move_past
    p = p.link
  }
  e.cur_s--
}

// [32e] do_vf: a virtual font is refused (pdf_check_vf_cur_val's error would follow it)
export function pdf_check_vf(e: Engine, f: number): void {
  if (!e.ps.vf_checked[f]) {
    e.ps.vf_checked[f] = true
    if (e.fs.find(e.font_name[f] + '.vf', 'vf') !== null) fatal_error(e, `unsupported: virtual font ${e.font_name[f]}`)
  }
}
// [32e] output_one_char
function output_one_char(e: Engine, f: number, c: number): void {
  pdf_check_vf(e, f)
  pdf_begin_string(e, f); pdf_print_char(e, f, c)
  if (!isscalable(e, f)) fatal_error(e, `unsupported: bitmap (PK) font ${e.font_name[f]}`) // adv_char_width's get_pk_char_width
  adv_char_width(e, f, c)
}

// [32f] pdf_vlist_out
function pdf_vlist_out(e: Engine, this_box: BoxNode): void {
  const st = { cur_g: 0, cur_glue: 0 }
  let p = this_box.list_ptr
  e.cur_s++
  const left_edge = e.cur_h
  e.cur_v = (e.cur_v - this_box.height) | 0
  const top_edge = e.cur_v
  // Create thread for the current vbox if needed
  if (e.ps.last_thread !== null && e.ps.thread_dp === null_flag && e.ps.thread_level === e.cur_s)
    append_thread(e, this_box, left_edge, (top_edge + this_box.height) | 0)
  for (; p !== null; p = p.link) {
    if (is_char_node(p)) confusion(e, 'pdfvlistout')
    let rule_ht = 0, rule_dp = 0, rule_wd = 0
    fin_rule: {
      switch (p.type) {
        case hlist_node: case vlist_node: // (pdfTeX) Output a box in a vlist
          if (p.list_ptr === null) e.cur_v = (e.cur_v + p.height + p.depth) | 0
          else {
            e.cur_v = (e.cur_v + p.height) | 0; const save_v = e.cur_v
            e.cur_h = (left_edge + p.shift_amount) | 0
            if (p.type === vlist_node) pdf_vlist_out(e, p); else pdf_hlist_out(e, p)
            e.cur_v = (save_v + p.depth) | 0; e.cur_h = left_edge
          }
          continue
        case rule_node: rule_ht = p.height; rule_dp = p.depth; rule_wd = p.width; break fin_rule
        case whatsit_node: pdf_out_whatsit(e, p, true, this_box, left_edge, (top_edge + this_box.height) | 0); continue
        case glue_node: { // (pdfTeX) Move down or output leaders
          rule_ht = (e.spec[p.glue_ptr]!.width - st.cur_g) | 0
          glue_amount(e, st, this_box, p.glue_ptr)
          rule_ht = (rule_ht + st.cur_g) | 0
          if (p.subtype >= a_leaders) {
            const leader_box = p.leader_ptr!
            if (leader_box.type === rule_node) { rule_wd = leader_box.width; rule_dp = 0; break fin_rule }
            const lb = leader_box as BoxNode, leader_ht = (lb.height + lb.depth) | 0
            if (leader_ht > 0 && rule_ht > 0) {
              rule_ht = (rule_ht + 10) | 0
              const edge = (e.cur_v + rule_ht) | 0
              let lx = 0
              if (p.subtype === a_leaders) { // §636
                const save_v = e.cur_v
                e.cur_v = (top_edge + leader_ht * Math.trunc((e.cur_v - top_edge) / leader_ht)) | 0
                if (e.cur_v < save_v) e.cur_v = (e.cur_v + leader_ht) | 0
              } else {
                const lq = Math.trunc(rule_ht / leader_ht), lr = rule_ht % leader_ht
                if (p.subtype === c_leaders) e.cur_v = (e.cur_v + Math.trunc(lr / 2)) | 0
                else { lx = Math.trunc(lr / (lq + 1)); e.cur_v = (e.cur_v + Math.trunc((lr - (lq - 1) * lx) / 2)) | 0 }
              }
              while (e.cur_v + leader_ht <= edge) { // (pdfTeX) Output a leader box at cur_v
                e.cur_h = (left_edge + lb.shift_amount) | 0
                e.cur_v = (e.cur_v + lb.height) | 0; const save_v = e.cur_v
                const outer_doing_leaders = e.doing_leaders; e.doing_leaders = true
                if (lb.type === vlist_node) pdf_vlist_out(e, lb); else pdf_hlist_out(e, lb)
                e.doing_leaders = outer_doing_leaders
                e.cur_h = left_edge; e.cur_v = (save_v - lb.height + leader_ht + lx) | 0
              }
              e.cur_v = (edge - 10) | 0
              continue
            }
          }
          e.cur_v = (e.cur_v + rule_ht) | 0 // move_past
          continue
        }
        case kern_node: e.cur_v = (e.cur_v + p.width) | 0; continue
        default: continue
      }
    }
    // fin_rule: (pdfTeX) Output a rule in a vlist
    if (rule_wd === null_flag) rule_wd = this_box.width
    rule_ht = (rule_ht + rule_dp) | 0
    e.cur_v = (e.cur_v + rule_ht) | 0
    if (rule_ht > 0 && rule_wd > 0) { pdf_set_rule(e, e.cur_h, e.cur_v, rule_wd, rule_ht); e.cur_h = left_edge }
  }
  e.cur_s--
}

// [32f] Initialize variables for PDF output
function init_pdf_output(e: Engine): void {
  const s = e.ps
  check_pdfversion(e); prepare_mag(e)
  s.fixed_decimal_digits = fix_int(int_par(e, pdf_decimal_digits_code), 0, 4)
  s.min_bp_val = divide_scaled(e, one_hundred_bp, ten_pow[s.fixed_decimal_digits + 2]!, 0)
  if (int_par(e, pdf_unique_resname_code) > 0) fatal_error(e, 'unsupported: \\pdfuniqueresname') // pass B
}

// [32f] pdf_ship_out: a page, or the form pdf_cur_form when shipping_page is false
export function pdf_ship_out(e: Engine, p: BoxNode, shipping_page: boolean): void {
  const s = e.ps
  if (int_par(e, tracing_output_code) > 0) { print_nl(e, ''); print_ln(e); print(e, 'Completed box being shipped out') }
  if (!s.init_output) { init_pdf_output(e); s.init_output = true }
  s.is_shipping_page = shipping_page
  if (shipping_page) {
    if (e.term_offset > e.lim.max_print_line - 9) print_ln(e)
    else if (e.term_offset > 0 || e.file_offset > 0) print_char(e, 32)
    print_char(e, 91)
    let j = 9
    while (e.equiv[count_base + j] === 0 && j > 0) j--
    for (let k = 0; k <= j; k++) { print_int(e, e.equiv[count_base + k]!); if (k < j) print_char(e, 46) }
  }
  if (int_par(e, tracing_output_code) > 0) { if (shipping_page) print_char(e, 93); begin_diagnostic(e); show_box(e, p); end_diagnostic(e, true) }
  // (pdfTeX) Ship box p out
  const h_offset = e.equiv[dimen_base + h_offset_code]!, v_offset = e.equiv[dimen_base + v_offset_code]!
  done: {
    // §641 Update the values of max_h and max_v; but if the page is too large, goto done
    const hdv = ((p.height + p.depth | 0) + v_offset) | 0, wh = (p.width + h_offset) | 0
    if (p.height > max_dimen || p.depth > max_dimen || hdv > max_dimen || wh > max_dimen) {
      print_err(e, 'Huge page cannot be shipped out')
      help(e, 'The page just created is more than 18 feet tall or', 'more than 18 feet wide, so I suspect something went wrong.')
      error(e)
      if (int_par(e, tracing_output_code) <= 0) {
        begin_diagnostic(e); print_nl(e, 'The following box has been deleted:'); show_box(e, p); end_diagnostic(e, true)
      }
      break done
    }
    if (hdv > e.max_v) e.max_v = hdv
    if (wh > e.max_h) e.max_h = wh
    // Initialize variables as pdf_ship_out begins
    fix_pdfoutput(e); prepare_mag(e)
    const pdf_last_resources = pdf_new_objnum(e)
    s.page_group_val = 0
    s.font_list = []; s.obj_list = []; s.xform_list = []; s.ximage_list = []; s.text_procset = false; s.image_procset = 0
    if (!shipping_page) {
      s.xform_width = p.width; s.xform_height = p.height; s.xform_depth = p.depth
      pdf_begin_dict(e, s.cur_form, 0)
      s.last_stream = s.cur_form
      e.cur_v = p.height; e.cur_h = 0
      s.origin_h = 0; s.origin_v = (s.xform_height + s.xform_depth) | 0
      // Write out Form stream header
      const d = s.obj_aux[s.cur_form]!
      pdf_print_ln(e, '/Type /XObject'); pdf_print_ln(e, '/Subtype /Form')
      if (s.mem[d + 4] !== 0) { pdf_print_toks_ln(e, s.mem[d + 4]!); delete_token(e, s.mem[d + 4]!); s.mem[d + 4] = 0 }
      pdf_print(e, '/BBox ['); pdf_print(e, '0 0 '); pdf_print_bp(e, s.xform_width); pdf_out(e, 32)
      pdf_print_bp(e, (s.xform_height + s.xform_depth) | 0); pdf_print_ln(e, ']')
      pdf_print_ln(e, '/FormType 1'); pdf_print_ln(e, '/Matrix [1 0 0 1 0 0]')
      pdf_indirect_ln(e, 'Resources', pdf_last_resources)
    } else {
      // Calculate page dimensions and margins
      s.cur_h_offset = (e.equiv[dimen_base + pdf_h_origin_code]! + h_offset) | 0
      s.cur_v_offset = (e.equiv[dimen_base + pdf_v_origin_code]! + v_offset) | 0
      s.cur_page_width = e.equiv[dimen_base + pdf_page_width_code]! !== 0 ? e.equiv[dimen_base + pdf_page_width_code]! : (p.width + 2 * s.cur_h_offset) | 0
      e.cur_page_height = e.equiv[dimen_base + pdf_page_height_code]! !== 0 ? e.equiv[dimen_base + pdf_page_height_code]!
        : (p.height + p.depth + 2 * s.cur_v_offset) | 0
      s.last_page = get_obj(e, obj_type_page, e.total_pages + 1, 0)
      s.obj_aux[s.last_page] = 1
      pdf_new_dict(e, obj_type_others, 0, 0)
      s.last_stream = s.obj_ptr
      e.cur_h = s.cur_h_offset; e.cur_v = (p.height + s.cur_v_offset) | 0
      s.origin_h = 0; s.origin_v = e.cur_page_height
      s.annot_list = []; s.link_list = []; s.dest_list = []; s.bead_list = []; s.last_thread = null // Reset PDF mark lists
    }
    // Start stream of page/form contents
    pdf_begin_stream(e)
    if (shipping_page) {
      prepare_mag(e)
      if (int_par(e, mag_code) !== 1000) {
        pdf_print_real(e, int_par(e, mag_code), 3); pdf_print(e, ' 0 0 '); pdf_print_real(e, int_par(e, mag_code), 3); pdf_print_ln(e, ' 0 0 cm')
      }
    }
    s.pos_stack = []; s.page_mode = shipping_page // pdfshipoutbegin (colorstackpagestart returns at once in page mode)
    if (shipping_page) pdf_out_colorstack_startpage(e)
    if (p.type === vlist_node) pdf_vlist_out(e, p); else pdf_hlist_out(e, p)
    if (shipping_page) e.total_pages++
    e.cur_s = -1
    // Finish shipping: Finish stream of page/form contents
    pdf_end_text(e)
    if (s.pos_stack.length > 0) // pdfshipoutend
      pdftex_fail(e, null, `${s.pos_stack.length} unmatched \\pdfsave after ${shipping_page ? 'page' : 'form'} shipout`)
    pdf_end_stream(e)
    if (shipping_page) {
      // Write out page object
      pdf_begin_dict(e, s.last_page, 1)
      pdf_print_ln(e, '/Type /Page')
      pdf_indirect_ln(e, 'Contents', s.last_stream); pdf_indirect_ln(e, 'Resources', pdf_last_resources)
      const page_attr = e.equiv[pdf_page_attr_loc]!
      const mediabox_given = page_attr !== 0 && str(tokens_to_string(e, page_attr)).slice(0, -1).includes('/MediaBox')
      if (!mediabox_given) {
        pdf_print(e, '/MediaBox [0 0 '); pdf_print_mag_bp(e, s.cur_page_width); pdf_out(e, 32)
        pdf_print_mag_bp(e, e.cur_page_height); pdf_print_ln(e, ']')
      }
      if (page_attr !== 0) pdf_print_toks_ln(e, page_attr)
      if (e.total_pages % pages_tree_kids_max === 1) { pdf_create_obj(e, obj_type_pages, pages_tree_kids_max); s.last_pages = s.obj_ptr }
      pdf_indirect_ln(e, 'Parent', s.last_pages)
      if (s.page_group_val > 0) { pdf_print(e, '/Group '); pdf_print_int(e, s.page_group_val); pdf_print_ln(e, ' 0 R') }
      // Generate array of annotations or beads in page
      if (s.annot_list.length > 0 || s.link_list.length > 0) {
        pdf_print(e, '/Annots [ ')
        for (const k of s.annot_list.concat(s.link_list)) { pdf_print_int(e, k); pdf_print(e, ' 0 R ') }
        pdf_print_ln(e, ']')
      }
      if (s.bead_list.length > 0) {
        pdf_print(e, '/B [ ')
        for (const k of s.bead_list) { pdf_print_int(e, k); pdf_print(e, ' 0 R ') }
        pdf_print_ln(e, ']')
      }
      pdf_end_dict(e)
    }
    // Write out resource lists: pending raw objects, images, forms (forms last: the recursive ship_out resets the page group)
    for (const k of s.obj_list) if (!is_obj_written(e, k)) pdf_write_obj(e, k)
    for (const k of s.ximage_list) if (!is_obj_written(e, k)) pdf_write_image(e, k)
    for (const k of s.xform_list) {
      if (is_obj_written(e, k)) continue
      const saved_cur_form = s.cur_form, fl = s.font_list, ol = s.obj_list, xl = s.xform_list, il = s.ximage_list, tp: boolean = s.text_procset, ip: number = s.image_procset
      s.cur_form = k
      s.font_list = []; s.obj_list = []; s.xform_list = []; s.ximage_list = []; s.text_procset = false; s.image_procset = 0
      pdf_ship_out(e, s.obj_box[k]!, false)
      s.cur_form = saved_cur_form
      s.font_list = fl; s.obj_list = ol; s.xform_list = xl; s.ximage_list = il; s.text_procset = tp; s.image_procset = ip
    }
    if (shipping_page) write_pdf_marks(e)
    // Write out resources dictionary
    pdf_begin_dict(e, pdf_last_resources, 1)
    if (shipping_page) { // Print additional resources
      const page_resources = e.equiv[pdf_page_resources_loc]!
      if (page_resources !== 0) pdf_print_toks_ln(e, page_resources)
    } else {
      const d = s.obj_aux[s.cur_form]!
      if (s.mem[d + 5] !== 0) { pdf_print_toks_ln(e, s.mem[d + 5]!); delete_token(e, s.mem[d + 5]!); s.mem[d + 5] = 0 }
    }
    if (s.font_list.length > 0) { // Generate font resources
      pdf_print(e, '/Font << ')
      for (const k of s.font_list) {
        const ff = set_ff(e, k)
        pdf_print(e, '/F'); pdf_print_int(e, ff); pdf_out(e, 32); pdf_print_int(e, s.font_num[ff]!); pdf_print(e, ' 0 R ')
      }
      pdf_print_ln(e, '>>')
      s.text_procset = true
    }
    if (s.xform_list.length > 0 || s.ximage_list.length > 0) { // Generate XObject resources
      pdf_print(e, '/XObject << ')
      for (const k of s.xform_list) { pdf_print(e, '/Fm'); pdf_print_int(e, s.obj_info[k]!); pdf_out(e, 32); pdf_print_int(e, k); pdf_print(e, ' 0 R ') }
      for (const k of s.ximage_list) {
        pdf_print(e, '/Im'); pdf_print_int(e, s.obj_info[k]!); pdf_out(e, 32); pdf_print_int(e, k); pdf_print(e, ' 0 R ')
        s.image_procset |= s.images[s.mem[s.obj_aux[k]! + 4]!]!.color // update_image_procset
      }
      pdf_print_ln(e, '>>')
    }
    // Generate ProcSet if desired
    if (int_par(e, pdf_omit_procset_code) < 0 || (int_par(e, pdf_omit_procset_code) === 0 && int_par(e, pdf_major_version_code) < 2)) {
      pdf_print(e, '/ProcSet [ /PDF')
      if (s.text_procset) pdf_print(e, ' /Text')
      if (s.image_procset & 1) pdf_print(e, ' /ImageB')
      if (s.image_procset & 2) pdf_print(e, ' /ImageC')
      if (s.image_procset & 4) pdf_print(e, ' /ImageI')
      pdf_print_ln(e, ' ]')
    }
    pdf_end_dict(e)
  }
  if (int_par(e, tracing_output_code) <= 0 && shipping_page) print_char(e, 93)
  e.dead_cycles = 0
  // §639 Flush the box from memory, showing statistics if requested (see dvi.ts: no mem array)
  if (int_par(e, tracing_stats_code) > 1) { print_nl(e, 'Memory usage before: '); print(e, '0&0;') }
  flush_node_list(e, p)
  if (int_par(e, tracing_stats_code) > 1) { print(e, ' after: 0&0; still untouched: 0'); print_ln(e) }
}

// [32f] pdf_write_image
export function pdf_write_image(e: Engine, n: number): void {
  const s = e.ps, d = s.obj_aux[n]!
  pdf_begin_dict(e, n, 0)
  if (s.mem[d + 3] !== 0) { pdf_print_toks_ln(e, s.mem[d + 3]!); delete_token(e, s.mem[d + 3]!); s.mem[d + 3] = 0 }
  write_image(e, s.images[s.mem[d + 4]!]!) // fixed_pdf_draftmode is 0: \pdfdraftmode is unsupported
}

// utils.c extxnoverd
export function ext_xn_over_d(e: Engine, x: number, n: number, d: number): number {
  let r = x * n / d
  if (r > Number.EPSILON) r += 0.5; else r -= 0.5
  if (r >= 0x7fffffff || r <= -0x7fffffff) pdftex_warn(e, null, 'arithmetic: number too big')
  return Math.trunc(r) | 0
}

// [53] scale_image (one_inch is pdftex's 226, i.e. (1in in sp)/maxdimen)
export function scale_image(e: Engine, n: number): void {
  const s = e.ps, m = s.mem, d = s.obj_aux[n]!, img = s.images[m[d + 4]!]!
  let x = img.width, y = img.height, xr = img.xres, yr = img.yres, w = 0, h = 0
  if (img.rotate === 90 || img.rotate === 270) { y = img.width; x = img.height; yr = img.xres; xr = img.yres }
  if (xr > 65535 || yr > 65535) { xr = 0; yr = 0; pdf_warning(e, 'ext1', 'too large image resolution ignored', true, true) }
  if (x <= 0 || y <= 0 || xr < 0 || yr < 0) pdf_error(e, 'ext1', 'invalid image dimensions')
  if (xr === 0 && yr === 0) { /* missing resolution: no warning */ }
  else if (x / 226 >= xr || y / 226 >= yr) { xr = 0; yr = 0; pdf_warning(e, 'ext1', 'too small image resolution ignored', true, true) }
  const default_res = fix_int(int_par(e, pdf_image_resolution_code), 0, 65535)
  if (default_res > 0 && (xr === 0 || yr === 0)) { xr = default_res; yr = default_res }
  const run = (k: number) => m[d + k] === null_flag
  if (run(0) && run(1)) {
    if (xr > 0 && yr > 0) { w = ext_xn_over_d(e, one_hundred_inch, x, 100 * xr); h = ext_xn_over_d(e, one_hundred_inch, y, 100 * yr) }
    else { w = ext_xn_over_d(e, one_hundred_inch, x, 7200); h = ext_xn_over_d(e, one_hundred_inch, y, 7200) }
  }
  if (run(0) && run(1) && run(2)) { m[d] = w; m[d + 1] = h; m[d + 2] = 0 }
  else if (run(0)) {
    if (run(1)) { m[d] = ext_xn_over_d(e, h, x, y); m[d + 1] = (h - m[d + 2]!) | 0 }
    else if (run(2)) { m[d] = ext_xn_over_d(e, m[d + 1]!, x, y); m[d + 2] = 0 }
    else m[d] = ext_xn_over_d(e, (m[d + 1]! + m[d + 2]!) | 0, x, y)
  } else {
    if (run(1) && run(2)) { m[d + 1] = ext_xn_over_d(e, m[d]!, y, x); m[d + 2] = 0 }
    else if (run(1)) m[d + 1] = (ext_xn_over_d(e, m[d]!, y, x) - m[d + 2]!) | 0
    else if (run(2)) m[d + 2] = 0
  }
}

// [53] out_image (PNG and JPEG only: no page group, no PDF images)
function out_image(e: Engine, p: WhatsitNode): void {
  const s = e.ps, n = p.pdf_objnum
  pdf_end_text(e)
  pdf_print_ln(e, 'q')
  if (!s.ximage_list.includes(n)) s.ximage_list.push(n) // pdf_lookup_list
  pdf_print_real(e, ext_xn_over_d(e, p.pdf_left, ten_pow[6]!, one_hundred_bp), 4); pdf_print(e, ' 0 0 ')
  pdf_print_real(e, ext_xn_over_d(e, (p.pdf_top + p.pdf_right) | 0, ten_pow[6]!, one_hundred_bp), 4); pdf_out(e, 32)
  pdf_print_bp(e, e.cur_h - s.origin_h); pdf_out(e, 32); pdf_print_bp(e, s.origin_v - e.cur_v)
  pdf_print_ln(e, ' cm')
  pdf_print(e, '/Im'); pdf_print_int(e, s.obj_info[n]!); pdf_print_ln(e, ' Do')
  pdf_print_ln(e, 'Q')
}

// [53] out_form
function out_form(e: Engine, p: WhatsitNode): void {
  const s = e.ps, n = p.pdf_objnum
  pdf_end_text(e)
  pdf_print_ln(e, 'q')
  if (!s.xform_list.includes(n)) s.xform_list.push(n) // pdf_lookup_list
  e.cur_v = (e.cur_v + s.mem[s.obj_aux[n]! + 2]!) | 0
  pdf_print(e, '1 0 0 1 '); pdf_print_bp(e, e.cur_h - s.origin_h); pdf_out(e, 32); pdf_print_bp(e, s.origin_v - e.cur_v); pdf_print_ln(e, ' cm')
  pdf_print(e, '/Fm'); pdf_print_int(e, s.obj_info[n]!); pdf_print_ln(e, ' Do')
  pdf_print_ln(e, 'Q')
}

// [32f] Write out pending PDF marks (the start-link and thread nodes made by append_link/append_thread are garbage afterwards)
function pdf_rectangle(e: Engine, p: WhatsitNode): void {
  const s = e.ps
  prepare_mag(e)
  pdf_print(e, '/Rect [')
  pdf_print_mag_bp(e, p.pdf_left - s.origin_h); pdf_out(e, 32); pdf_print_mag_bp(e, s.origin_v - p.pdf_bottom); pdf_out(e, 32)
  pdf_print_mag_bp(e, p.pdf_right - s.origin_h); pdf_out(e, 32); pdf_print_mag_bp(e, s.origin_v - p.pdf_top)
  pdf_print_ln(e, ']')
}
function pdf_print_rect_spec(e: Engine, p: WhatsitNode): void {
  const s = e.ps
  pdf_print_mag_bp(e, p.pdf_left - s.origin_h); pdf_out(e, 32); pdf_print_mag_bp(e, s.origin_v - p.pdf_bottom); pdf_out(e, 32)
  pdf_print_mag_bp(e, p.pdf_right - s.origin_h); pdf_out(e, 32); pdf_print_mag_bp(e, s.origin_v - p.pdf_top)
}
function write_pdf_marks(e: Engine): void {
  const s = e.ps
  s.origin_h = 0; s.origin_v = e.cur_page_height
  for (const k of s.annot_list) { // Write out PDF annotations
    const i = s.obj_node[k]!
    pdf_begin_dict(e, k, 1); pdf_print_ln(e, '/Type /Annot'); pdf_print_toks_ln(e, i.pdf_data); pdf_rectangle(e, i); pdf_end_dict(e)
  }
  for (const k of s.link_list) { // Write out PDF link annotations
    const i = s.obj_node[k]!, user = i.pdf_action!.type === pdf_action_user
    pdf_begin_dict(e, k, 1); pdf_print_ln(e, '/Type /Annot')
    if (!user) pdf_print_ln(e, '/Subtype /Link')
    if (i.pdf_data !== 0) pdf_print_toks_ln(e, i.pdf_data)
    pdf_rectangle(e, i)
    if (!user) pdf_print(e, '/A ')
    write_action(e, i.pdf_action!)
    pdf_end_dict(e)
  }
  for (const k of s.link_list) { const i = s.obj_node[k]!; if (i.pdf_synthetic) flush_node_list(e, i) }
  for (const k of s.dest_list) { // Write out PDF mark destinations
    if (is_obj_written(e, k)) { pdf_error(e, 'ext5', "destination has been already written (this shouldn't happen)") }
    const i = s.obj_node[k]!, dict = i.pdf_named_id > 0 && i.pdf_objnum === 0
    if (dict) { pdf_begin_dict(e, k, 1); pdf_print(e, '/D ') } else pdf_begin_obj(e, k, 1)
    pdf_out(e, 91); pdf_print_int(e, i.pdf_objnum === 0 ? s.last_page : i.pdf_objnum); pdf_print(e, ' 0 R ')
    const x = () => pdf_print_mag_bp(e, i.pdf_left - s.origin_h), y = () => pdf_print_mag_bp(e, s.origin_v - i.pdf_top)
    switch (i.pdf_mode) {
      case pdf_dest_xyz:
        pdf_print(e, '/XYZ '); x(); pdf_out(e, 32); y(); pdf_out(e, 32)
        if (i.pdf_zoom === pdf_null) pdf_print(e, 'null')
        else { pdf_print_int(e, Math.trunc(i.pdf_zoom / 1000)); pdf_out(e, 46); pdf_print_int(e, i.pdf_zoom % 1000) }
        break
      case pdf_dest_fit: pdf_print(e, '/Fit'); break
      case pdf_dest_fith: pdf_print(e, '/FitH '); y(); break
      case pdf_dest_fitv: pdf_print(e, '/FitV '); x(); break
      case pdf_dest_fitb: pdf_print(e, '/FitB'); break
      case pdf_dest_fitbh: pdf_print(e, '/FitBH '); y(); break
      case pdf_dest_fitbv: pdf_print(e, '/FitBV '); x(); break
      case pdf_dest_fitr: pdf_print(e, '/FitR '); pdf_print_rect_spec(e, i); break
      default: pdf_error(e, 'ext5', 'unknown dest type')
    }
    pdf_print_ln(e, ']')
    if (dict) pdf_end_dict(e); else pdf_end_obj(e)
  }
  for (const k of s.bead_list) { // Write out PDF bead rectangle specifications
    pdf_new_obj(e, obj_type_others, 0, 1)
    pdf_out(e, 91)
    const i = s.obj_node[k]!
    pdf_print_rect_spec(e, i)
    if (i.pdf_synthetic) flush_node_list(e, i)
    pdf_print_ln(e, ']')
    s.mem[s.obj_aux[k]!] = s.obj_ptr // obj_bead_rect
    pdf_end_obj(e)
  }
}

// [32f] pdf_write_obj (raw objects from \pdfobj; files are pass B)
export function pdf_write_obj(e: Engine, n: number): void {
  const s = e.ps, d = s.obj_aux[n]!
  const t = tokens_to_string(e, s.mem[d]!)
  delete_toks(e, d)
  if (s.mem[d + 1]! > 0) {
    pdf_begin_dict(e, n, 0)
    if (s.mem[d + 2]! !== 0) { pdf_print_toks_ln(e, s.mem[d + 2]!); delete_token(e, s.mem[d + 2]!); s.mem[d + 2] = 0 }
    pdf_begin_stream(e)
  } else pdf_begin_obj(e, n, 1)
  if (s.mem[d + 3]! > 0) fatal_error(e, 'unsupported: \\pdfobj file') // pass B
  if (s.mem[d + 1]! > 0) pdf_print(e, t); else pdf_print_ln(e, t)
  if (s.mem[d + 1]! > 0) pdf_end_stream(e); else pdf_end_obj(e)
}
function delete_toks(e: Engine, d: number): void { delete_token(e, e.ps.mem[d]!); e.ps.mem[d] = 0 }
function delete_token(e: Engine, p: number): void { if (p !== 0) delete_token_ref(e, p) }

// [32b] pdf_get_mem
export function pdf_get_mem(e: Engine, n: number): number {
  const s = e.ps
  if (n > sup_pdf_mem_size - s.mem_ptr) overflow(e, 'PDF memory size (pdf_mem_size)', s.mem_size)
  if (s.mem_ptr + n > s.mem_size) {
    const a = Math.trunc(0.2 * s.mem_size)
    if (s.mem_ptr + n > s.mem_size + a) s.mem_size = s.mem_ptr + n
    else if (s.mem_size < sup_pdf_mem_size - a) s.mem_size += a
    else s.mem_size = sup_pdf_mem_size
  }
  const r = s.mem_ptr; s.mem_ptr += n
  for (let k = r; k < s.mem_ptr; k++) s.mem[k] = 0
  return r
}

// [32f] Finish the PDF file; [51] the PDF statistics in close_files_and_terminate
export function finish_pdf_file(e: Engine): void {
  const s = e.ps
  if (e.total_pages === 0) {
    print_nl(e, 'No pages of output.')
    if (s.ptr > 0) { // garbage_warning
      print_ln(e); print_ln(e); print(e, 'pdfTeX warning: pdftex: dangling objects discarded, no output file produced.'); print_ln(e)
      s.ptr = 0
    }
  } else {
    if (e.total_pages % pages_tree_kids_max !== 0) s.obj_info[s.last_pages] = e.total_pages % pages_tree_kids_max
    // Check for non-existing pages
    let k = s.head_tab[obj_type_page]!
    while (s.obj_aux[k] === 0) {
      pdf_warning(e, 'dest', 'Page ', true, false); print_int(e, s.obj_info[k]!)
      print(e, ' has been referenced but does not exist!'); print_ln(e); print_ln(e)
      k = s.obj_link[k]!
    }
    s.head_tab[obj_type_page] = k
    // Reverse the linked list of Page and Pages objects
    let l = 0
    k = s.head_tab[obj_type_page]!
    do { const i = s.obj_link[k]!; s.obj_link[k] = l; l = k; k = i } while (k !== 0)
    s.head_tab[obj_type_page] = l
    k = s.head_tab[obj_type_pages]!; s.pages_tail = k; l = 0
    do { const i = s.obj_link[k]!; s.obj_link[k] = l; l = k; k = i } while (k !== 0)
    s.head_tab[obj_type_pages] = l
    // Check for non-existing destinations, structure destinations (pdf_fix_dest, pdf_fix_struct_dest)
    for (k = s.head_tab[obj_type_dest]!; k !== 0; k = s.obj_link[k]!) {
      if (s.obj_node[k]) continue
      pdf_warning(e, 'dest', '', true, false); print_obj_id(e, k)
      print(e, ' has been referenced but does not exist, replaced by a fixed one'); print_ln(e); print_ln(e)
      pdf_begin_obj(e, k, 1); pdf_out(e, 91); pdf_print_int(e, s.head_tab[obj_type_page]!); pdf_print_ln(e, ' 0 R /Fit]'); pdf_end_obj(e)
    }
    for (k = s.head_tab[obj_type_struct_dest]!; k !== 0; k = s.obj_link[k]!) {
      if (s.obj_node[k]) continue
      pdf_warning(e, 'structure dest', '', false, false); print_obj_id(e, k)
      print(e, ' has been referenced but does not exist'); print_ln(e); print_ln(e)
    }
    // Output fonts definition (fonts sharing an object merge their used characters; \pdffontattr is pass B)
    for (let f = 1; f <= e.font_ptr; f++) {
      if (e.font_used[f] && hasfmentry(e, f) && s.font_num[f]! < 0) {
        const i = -s.font_num[f]!
        for (let c = 0; c <= 255; c++) if (pdf_char_marked(e, f, c)) pdf_mark_char(e, i, c)
      }
    }
    s.fixed_gen_tounicode = int_par(e, pdf_gen_tounicode_code)
    for (k = s.head_tab[obj_type_font]!; k !== 0; k = s.obj_link[k]!) do_pdf_font(e, k, s.obj_info[k]!)
    write_fontstuff(e)
    // Output pages tree
    const a = s.sys_obj_ptr + 1
    l = s.head_tab[obj_type_pages]!; k = s.head_tab[obj_type_page]!
    let b = 0
    for (;;) {
      let i = 0, c = 0
      const is_root = s.obj_link[l] === 0
      do {
        if (!is_root) {
          if (i % pages_tree_kids_max === 0) {
            s.last_pages = pdf_new_objnum(e)
            if (c === 0) c = s.last_pages
            s.obj_link[s.pages_tail] = s.last_pages; s.pages_tail = s.last_pages
            s.obj_link[s.last_pages] = 0; s.obj_info[s.last_pages] = s.obj_info[l]!
          } else s.obj_info[s.last_pages] = s.obj_info[s.last_pages]! + s.obj_info[l]!
        }
        // Output the current Pages object in this level
        pdf_begin_dict(e, l, 1)
        pdf_print_ln(e, '/Type /Pages'); pdf_int_entry_ln(e, 'Count', s.obj_info[l]!)
        if (!is_root) pdf_indirect_ln(e, 'Parent', s.last_pages)
        pdf_print(e, '/Kids [')
        let jj = 0
        do { pdf_print_int(e, k); pdf_print(e, ' 0 R '); k = s.obj_link[k]!; jj++ }
        while (!((l < a && jj === s.obj_info[l]) || k === 0 || (k === b && b !== 0) || jj === pages_tree_kids_max))
        remove_last_space(e); pdf_print_ln(e, ']')
        if (k === 0) { k = s.head_tab[obj_type_pages]!; s.head_tab[obj_type_pages] = 0 }
        if (is_root && e.equiv[pdf_pages_attr_loc]! !== 0) pdf_print_toks_ln(e, e.equiv[pdf_pages_attr_loc]!)
        pdf_end_dict(e)
        i++; l = s.obj_link[l]!
      } while (l !== c)
      b = c
      if (l === 0) break
    }
    const outlines = output_outlines(e), names_tree = output_name_tree(e), threads = output_threads(e)
    // Output the catalog object
    pdf_new_dict(e, obj_type_others, 0, 1)
    const root = s.obj_ptr
    pdf_print_ln(e, '/Type /Catalog'); pdf_indirect_ln(e, 'Pages', s.last_pages)
    if (threads !== 0) pdf_indirect_ln(e, 'Threads', threads)
    if (outlines !== 0) pdf_indirect_ln(e, 'Outlines', outlines)
    if (names_tree !== 0) pdf_indirect_ln(e, 'Names', names_tree)
    if (s.catalog_toks !== 0) { pdf_print_toks_ln(e, s.catalog_toks); delete_token_ref(e, s.catalog_toks); s.catalog_toks = 0 }
    if (s.catalog_openaction !== 0) pdf_indirect_ln(e, 'OpenAction', s.catalog_openaction)
    pdf_end_dict(e)
    if (int_par(e, pdf_omit_info_dict_code) === 0) pdf_print_info(e)
    if (s.os_enable) {
      pdf_os_switch(e, true); pdf_os_write_objstream(e); pdf_os_switch(e, false)
      // Output the cross-reference stream dictionary
      pdf_new_dict(e, obj_type_others, 0, 0)
      const last = s.obj_offset[s.sys_obj_ptr]!
      const w = last / 256 > 16777215 ? 5 : last > 16777215 ? 4 : last > 65535 ? 3 : 2
      build_free_list(e)
      pdf_print_ln(e, '/Type /XRef'); pdf_print(e, '/Index [0 '); pdf_print_int(e, s.obj_ptr + 1); pdf_print_ln(e, ']')
      pdf_int_entry_ln(e, 'Size', s.obj_ptr + 1)
      pdf_print(e, '/W [1 '); pdf_print_int(e, w); pdf_print_ln(e, ' 1]')
      pdf_indirect_ln(e, 'Root', root)
      if (int_par(e, pdf_omit_info_dict_code) === 0) pdf_indirect_ln(e, 'Info', s.obj_ptr - 1)
      print_trailer_toks_and_ID(e); pdf_print_nl(e)
      pdf_begin_stream(e)
      const bytes = (n: number) => { for (let q = w - 1; q >= 0; q--) pdf_out(e, Math.floor(n / 256 ** q) % 256) }
      for (k = 0; k <= s.sys_obj_ptr; k++) {
        if (!is_obj_written(e, k)) { pdf_out(e, 0); bytes(s.obj_link[k]!); pdf_out(e, 255) }
        else if (s.obj_os_idx[k] === -1) { pdf_out(e, 1); bytes(s.obj_offset[k]!); pdf_out(e, 0) }
        else { pdf_out(e, 2); bytes(s.obj_offset[k]!); pdf_out(e, s.obj_os_idx[k]!) }
      }
      pdf_end_stream(e)
    } else {
      // Output the obj_tab
      build_free_list(e)
      s.save_offset = pdf_offset(e)
      pdf_print_ln(e, 'xref'); pdf_print(e, '0 '); pdf_print_int_ln(e, s.obj_ptr + 1)
      pdf_print_fw_int(e, s.obj_link[0]!, 10); pdf_print_ln(e, ' 65535 f ')
      for (k = 1; k <= s.obj_ptr; k++) {
        if (!is_obj_written(e, k)) { pdf_print_fw_int(e, s.obj_link[k]!, 10); pdf_print_ln(e, ' 00000 f ') }
        else { pdf_print_fw_int(e, s.obj_offset[k]!, 10); pdf_print_ln(e, ' 00000 n ') }
      }
    }
    // Output the trailer
    if (!s.os_enable) {
      pdf_print_ln(e, 'trailer'); pdf_print(e, '<< ')
      pdf_int_entry_ln(e, 'Size', s.sys_obj_ptr + 1); pdf_indirect_ln(e, 'Root', root)
      if (int_par(e, pdf_omit_info_dict_code) === 0) pdf_indirect_ln(e, 'Info', s.sys_obj_ptr)
      print_trailer_toks_and_ID(e); pdf_print_ln(e, ' >>')
    }
    pdf_print_ln(e, 'startxref')
    pdf_print_int_ln(e, s.os_enable ? s.obj_offset[s.sys_obj_ptr]! : s.save_offset)
    pdf_print_ln(e, '%%EOF')
    print_nl(e, 'Output written on '); print_file_name(e, s.output_file_name, '', '')
    print(e, ' ('); print_int(e, e.total_pages); print(e, ' page')
    if (e.total_pages !== 1) print_char(e, 115)
    print(e, ', '); print_int(e, pdf_offset(e)); print(e, ' bytes).')
  }
  if (e.log_opened) {
    e.log += '\nPDF statistics:\n' + ` ${s.obj_ptr} PDF objects out of ${s.obj_tab_size} (max. ${sup_obj_tab_size})\n`
    if (s.os_cntr > 0) e.log += ` ${(s.os_cntr - 1) * pdf_os_max_objs + s.os_objidx + 1} compressed objects within ${s.os_cntr} object stream${s.os_cntr > 1 ? 's' : ''}\n`
    e.log += ` ${s.dest_names_ptr} named destinations out of ${s.dest_names_size} (max. ${sup_dest_names_size})\n`
      + ` ${s.mem_ptr} words of extra memory for PDF output out of ${s.mem_size} (max. ${sup_pdf_mem_size})\n`
  }
}

// [32f] `name{…}' or `num…' of a dest/thread object
function print_obj_id(e: Engine, k: number): void {
  const i = e.ps.obj_info[k]!
  if (i < 0) { print(e, 'name{'); print(e, e.ps.strs[-i]!); print(e, '}') } else { print(e, 'num'); print_int(e, i) }
}

// [32f] Output outlines (the outline fields live in pdf_mem: title, parent, prev, next, first, last, action, attr)
function open_subentries(e: Engine, p: number): number {
  const s = e.ps, m = s.mem, o = (q: number) => s.obj_aux[q]!
  let k = 0
  if (m[o(p) + 4] !== 0) {
    let l = m[o(p) + 4]!
    do {
      k++
      const c = open_subentries(e, l)
      if (s.obj_info[l]! > 0) k += c
      m[o(l) + 1] = p
      const r = m[o(l) + 3]!
      if (r === 0) m[o(p) + 5] = l
      l = r
    } while (l !== 0)
  }
  s.obj_info[p] = s.obj_info[p]! > 0 ? k : -k
  return k
}
function output_outlines(e: Engine): number {
  const s = e.ps, m = s.mem, o = (q: number) => s.obj_aux[q]!
  if (s.first_outline === 0) return 0
  pdf_new_dict(e, obj_type_others, 0, 1)
  const outlines = s.obj_ptr
  let l = s.first_outline, k = 0
  do {
    k++
    const a = open_subentries(e, l)
    if (s.obj_info[l]! > 0) k += a
    m[o(l) + 1] = s.obj_ptr
    l = m[o(l) + 3]!
  } while (l !== 0)
  pdf_print_ln(e, '/Type /Outlines')
  pdf_indirect_ln(e, 'First', s.first_outline); pdf_indirect_ln(e, 'Last', s.last_outline)
  pdf_int_entry_ln(e, 'Count', k)
  pdf_end_dict(e)
  for (k = s.head_tab[obj_type_outline]!; k !== 0; k = s.obj_link[k]!) { // Output PDF outline entries
    const d = o(k)
    if (m[d + 1] === s.parent_outline) {
      if (m[d + 2] === 0) s.first_outline = k
      if (m[d + 3] === 0) s.last_outline = k
    }
    pdf_begin_dict(e, k, 1)
    pdf_indirect_ln(e, 'Title', m[d]!); pdf_indirect_ln(e, 'A', m[d + 6]!)
    if (m[d + 1] !== 0) pdf_indirect_ln(e, 'Parent', m[d + 1]!)
    if (m[d + 2] !== 0) pdf_indirect_ln(e, 'Prev', m[d + 2]!)
    if (m[d + 3] !== 0) pdf_indirect_ln(e, 'Next', m[d + 3]!)
    if (m[d + 4] !== 0) pdf_indirect_ln(e, 'First', m[d + 4]!)
    if (m[d + 5] !== 0) pdf_indirect_ln(e, 'Last', m[d + 5]!)
    if (s.obj_info[k] !== 0) pdf_int_entry_ln(e, 'Count', s.obj_info[k]!)
    if (m[d + 7] !== 0) { pdf_print_toks_ln(e, m[d + 7]!); delete_token_ref(e, m[d + 7]!); m[d + 7] = 0 }
    pdf_end_dict(e)
  }
  return outlines
}

// [32f] str_less_str: compare two PDF strings after their escapes (get_next_char)
function str_less_str(a: string, b: string): boolean {
  let j1 = 0, j2 = 0
  const next = (t: string, j: number): [number, number] => {
    let c = t.charCodeAt(j++)
    if (c === 92 && j < t.length) {
      c = t.charCodeAt(j++)
      if (c >= 48 && c <= 55) {
        c -= 48
        if (j < t.length && t.charCodeAt(j) >= 48 && t.charCodeAt(j) <= 55) {
          c = 8 * c + t.charCodeAt(j++) - 48
          if (j < t.length && t.charCodeAt(j) >= 48 && t.charCodeAt(j) <= 55 && c < 32) c = 8 * c + t.charCodeAt(j++) - 48
        }
      } else c = c === 98 ? 8 : c === 102 ? 12 : c === 110 ? 10 : c === 114 ? 13 : c === 116 ? 9 : c
    }
    return [c, j]
  }
  while (j1 < a.length && j2 < b.length) {
    let c1, c2
    [c1, j1] = next(a, j1); [c2, j2] = next(b, j2)
    if (c1 < c2) return true
    if (c1 > c2) return false
  }
  return j1 >= a.length && j2 < b.length
}
// [32f] sort_dest_names (Hoare's quicksort as pdftex has it; equal names keep pdftex's order)
function sort_dest_names(e: Engine, l: number, r: number): void {
  const d = e.ps.dest_names, nm = (k: number) => e.ps.strs[d[k]!.objname]!
  let i = l, j = r
  const s = nm(Math.trunc((l + r) / 2))
  do {
    while (str_less_str(nm(i), s)) i++
    while (str_less_str(s, nm(j))) j--
    if (i <= j) { const t = d[i]!; d[i] = d[j]!; d[j] = t; i++; j-- }
  } while (i <= j)
  if (l < j) sort_dest_names(e, l, j)
  if (i < r) sort_dest_names(e, i, r)
}
// [32f] Output name tree (obj_info/obj_aux of a node hold the string numbers of its /Limits)
const name_tree_kids_max = 6
function output_name_tree(e: Engine): number {
  const s = e.ps, dn = s.dest_names
  let dests = 0
  if (s.dest_names_ptr > 0) {
    sort_dest_names(e, 0, s.dest_names_ptr - 1)
    let names_head = 0, names_tail = 0, k = 0, is_names = true, b = 0, l = 0
    for (;;) {
      do {
        pdf_create_obj(e, obj_type_others, 0); l = s.obj_ptr
        if (b === 0) b = l
        if (names_head === 0) { names_head = l; names_tail = l } else { s.obj_link[names_tail] = l; names_tail = l }
        s.obj_link[names_tail] = 0
        // Output the current node in this level
        pdf_begin_dict(e, l, 1)
        let j = 0
        if (is_names) {
          s.obj_info[l] = dn[k]!.objname
          pdf_print(e, '/Names [')
          do {
            pdf_print_str(e, s.strs[dn[k]!.objname]!); pdf_out(e, 32); pdf_print_int(e, dn[k]!.objnum); pdf_print(e, ' 0 R ')
            j++; k++
          } while (j !== name_tree_kids_max && k !== s.dest_names_ptr)
          remove_last_space(e); pdf_print_ln(e, ']')
          s.obj_aux[l] = dn[k - 1]!.objname
          if (k === s.dest_names_ptr) { is_names = false; k = names_head; b = 0 }
        } else {
          s.obj_info[l] = s.obj_info[k]!
          pdf_print(e, '/Kids [')
          do {
            pdf_print_int(e, k); pdf_print(e, ' 0 R ')
            j++; s.obj_aux[l] = s.obj_aux[k]!; k = s.obj_link[k]!
          } while (j !== name_tree_kids_max && k !== b && s.obj_link[k] !== 0)
          remove_last_space(e); pdf_print_ln(e, ']')
          if (k === b) b = 0
        }
        pdf_print(e, '/Limits ['); pdf_print_str(e, s.strs[s.obj_info[l]!]!); pdf_out(e, 32); pdf_print_str(e, s.strs[s.obj_aux[l]!]!)
        pdf_print_ln(e, ']')
        pdf_end_dict(e)
      } while (b !== 0)
      if (k === l) { dests = l; break }
    }
  }
  if (dests === 0 && s.names_toks === 0) return 0
  pdf_new_dict(e, obj_type_others, 0, 1)
  if (dests !== 0) pdf_indirect_ln(e, 'Dests', dests)
  if (s.names_toks !== 0) { pdf_print_toks_ln(e, s.names_toks); delete_token_ref(e, s.names_toks); s.names_toks = 0 }
  pdf_end_dict(e)
  return s.obj_ptr
}

// [53] thread_title, pdf_fix_thread, out_thread; [32f] Output article threads (beads: rect, page, next, prev, attr in pdf_mem)
function thread_title(e: Engine, t: number): void {
  const i = e.ps.obj_info[t]!
  pdf_print(e, '/Title ('); if (i < 0) pdf_print(e, e.ps.strs[-i]!); else pdf_print_int(e, i); pdf_print_ln(e, ')')
}
function output_threads(e: Engine): number {
  const s = e.ps, m = s.mem, o = (q: number) => s.obj_aux[q]!
  if (s.head_tab[obj_type_thread] === 0) return 0
  pdf_new_obj(e, obj_type_others, 0, 1)
  const threads = s.obj_ptr
  pdf_out(e, 91)
  for (let k = s.head_tab[obj_type_thread]!; k !== 0; k = s.obj_link[k]!) { pdf_print_int(e, k); pdf_print(e, ' 0 R ') }
  remove_last_space(e); pdf_print_ln(e, ']'); pdf_end_obj(e)
  for (let t = s.head_tab[obj_type_thread]!; t !== 0; t = s.obj_link[t]!) {
    if (s.obj_aux[t] === 0) { // pdf_fix_thread
      pdf_warning(e, 'thread', 'destination ', true, false); print_obj_id(e, t)
      print(e, ' has been referenced but does not exist, replaced by a fixed one'); print_ln(e); print_ln(e)
      pdf_new_dict(e, obj_type_others, 0, 0)
      const a = s.obj_ptr
      pdf_indirect_ln(e, 'T', t); pdf_indirect_ln(e, 'V', a); pdf_indirect_ln(e, 'N', a); pdf_indirect_ln(e, 'P', s.head_tab[obj_type_page]!)
      pdf_print(e, '/R [0 0 '); pdf_print_bp(e, dimen_par(e, pdf_page_width_code)); pdf_out(e, 32); pdf_print_bp(e, dimen_par(e, pdf_page_height_code))
      pdf_print_ln(e, ']'); pdf_end_dict(e)
      pdf_begin_dict(e, t, 1); pdf_print_ln(e, '/I << '); thread_title(e, t); pdf_print_ln(e, '>>'); pdf_indirect_ln(e, 'F', a); pdf_end_dict(e)
      continue
    }
    pdf_begin_dict(e, t, 1)
    let a = s.obj_aux[t]!, last_attr = 0
    const b = a
    do { if (m[o(a) + 4] !== 0) last_attr = m[o(a) + 4]!; a = m[o(a) + 2]! } while (a !== b)
    if (last_attr !== 0) pdf_print_ln(e, s.strs[last_attr]!)
    else { pdf_print_ln(e, '/I << '); thread_title(e, t); pdf_print_ln(e, '>>') }
    pdf_indirect_ln(e, 'F', a); pdf_end_dict(e)
    do {
      pdf_begin_dict(e, a, 1)
      if (a === b) pdf_indirect_ln(e, 'T', t)
      pdf_indirect_ln(e, 'V', m[o(a) + 3]!); pdf_indirect_ln(e, 'N', m[o(a) + 2]!)
      pdf_indirect_ln(e, 'P', m[o(a) + 1]!); pdf_indirect_ln(e, 'R', m[o(a)]!)
      pdf_end_dict(e)
      a = m[o(a) + 2]!
    } while (a !== b)
  }
  return threads
}

// Build a linked list of free objects
function build_free_list(e: Engine): void {
  const s = e.ps
  let l = 0
  s.obj_offset[0] = -2
  for (let k = 1; k <= s.sys_obj_ptr; k++) if (!is_obj_written(e, k)) { s.obj_link[l] = k; l = k }
  s.obj_link[l] = 0
}

// utils.c start_time_str (texmfmp.c initstarttime: with SOURCE_DATE_EPOCH, i.e. run({ date }), in UTC)
const start_time_str = (e: Engine) => makepdftime(new Date(e.start_time), e.date !== undefined)

// [32f] Output the trailer: \pdftrailer's tokens, then utils.c printIDalt (MD5 of \pdftrailerid, nothing if empty) or printID
// (MD5 of the start time and the output file name)
function print_trailer_toks_and_ID(e: Engine): void {
  const s = e.ps
  if (s.trailer_toks !== 0) { pdf_print_toks_ln(e, s.trailer_toks); delete_token_ref(e, s.trailer_toks); s.trailer_toks = 0 }
  if (s.trailer_id_toks !== 0) {
    const t = tokens_to_string(e, s.trailer_id_toks)
    if (t.length > 0) { const id = md5(t); pdf_print(e, `/ID [<${id}> <${id}>]`) }
  } else {
    const id = md5(Array.from(start_time_str(e) + s.output_file_name, c => c.charCodeAt(0)))
    pdf_print(e, `/ID [<${id}> <${id}>]`)
  }
}

// [32f] pdf_print_info
function pdf_print_info(e: Engine): void {
  const st = e.ps
  pdf_new_dict(e, obj_type_others, 0, 3)
  let s = ''
  if (st.info_toks !== 0) s = str(tokens_to_string(e, st.info_toks))
  const given = (k: string) => s.includes(k) // substr_of_str
  if (!given('/Producer')) pdf_print_ln(e, '/Producer (pdfTeX-1.40.29)') // Print the Producer key: pdftex_version div 100 . mod 100 . pdftex_revision
  if (st.info_toks !== 0) {
    if (s.length > 0) pdf_print_ln(e, s)
    delete_token_ref(e, st.info_toks); st.info_toks = 0
  }
  if (!given('/Creator')) pdf_str_entry_ln(e, 'Creator', 'TeX')
  if (int_par(e, pdf_info_omit_date_code) === 0) {
    if (!given('/CreationDate')) pdf_print_ln(e, `/CreationDate (${start_time_str(e)})`)
    if (!given('/ModDate')) pdf_print_ln(e, `/ModDate (${start_time_str(e)})`)
  }
  if (!given('/Trapped')) pdf_print_ln(e, '/Trapped /False')
  if (int_par(e, pdf_suppress_ptex_info_code) % 2 === 0) {
    const key = int_par(e, pdf_ptex_use_underscore_code) > 0 || int_par(e, pdf_major_version_code) >= 2 ? 'PTEX_Fullbanner' : 'PTEX.Fullbanner'
    pdf_str_entry_ln(e, key, 'This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) kpathsea version 6.4.2')
  }
  pdf_end_dict(e)
}
