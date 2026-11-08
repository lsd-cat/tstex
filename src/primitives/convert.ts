// §468–471 \number \romannumeral \string \meaning, pdftex.web \expanded \pdfstrcmp \pdffilesize \pdfmdfivesum \pdfescape… \pdf…deviate (the rest of the convert family is unsupported for now)
import type { Engine } from '../engine.ts'
import { Cmd, new_string } from '../types.ts'
import { print as print_str, print_esc, print_int, print_roman_int, print_char } from '../print.ts'
import { sprint_cs } from '../hash.ts'
import { garbage, temp_head } from '../nodes.ts'
import { print_meaning, tokens_to_string } from '../tokens.ts'
import { delete_token_ref, free_avail } from '../nodes.ts'
import { get_token, ins_list } from '../input.ts'
import { scan_int, str_toks, scan_toks, scan_keyword } from '../scan.ts'
import { escapestring, escapename, escapehex, unescapehex, makepdftime, md5, matchstrings, str, append } from '../utils.ts'
import { unsupported } from '../main.ts'
import { open_log_file, find_tex_file } from '../files.ts'
import { print_err, help, int_error, fatal_error } from '../error.ts'
import { scan_font_ident, null_font } from '../tfm.ts'
import { pdf_error, pdf_check_vf, pdf_init_font, pdf_check_obj, get_obj, obj_type_page, obj_type_xform } from '../pdf.ts'
import { print_scaled, unif_rand, norm_rand } from '../arith.ts'

const pdf_font_name_code = 9, pdf_font_objnum_code = 10, pdf_font_size_code = 11, pdf_page_ref_code = 12, pdf_xform_name_code = 13
const number_code = 0, roman_numeral_code = 1, string_code = 2, meaning_code = 3, font_name_code = 4, eTeX_revision_code = 5, expanded_code = 6, pdftex_revision_code = 7, pdftex_banner_code = 8, pdf_creation_date_code = 22, pdf_file_size_code = 24, pdf_file_mod_date_code = 23, pdf_mdfive_sum_code = 25, pdf_strcmp_code = 18, job_name_code = 33, uniform_deviate_code = 29, pdf_match_code = 27, pdf_last_match_code = 28, normal_deviate_code = 30
const names: Record<number, string> = { 0: 'number', 1: 'romannumeral', 2: 'string', 3: 'meaning', 4: 'fontname', 5: 'eTeXrevision',
  6: 'expanded', 7: 'pdftexrevision', 8: 'pdftexbanner', 9: 'pdffontname', 10: 'pdffontobjnum', 11: 'pdffontsize', 12: 'pdfpageref',
  13: 'pdfxformname', 14: 'pdfescapestring', 15: 'pdfescapename', 16: 'leftmarginkern', 17: 'rightmarginkern', 18: 'pdfstrcmp',
  19: 'pdfcolorstackinit', 20: 'pdfescapehex', 21: 'pdfunescapehex', 22: 'pdfcreationdate', 23: 'pdffilemoddate', 24: 'pdffilesize',
  25: 'pdfmdfivesum', 26: 'pdffiledump', 27: 'pdfmatch', 28: 'pdflastmatch', 29: 'pdfuniformdeviate', 30: 'pdfnormaldeviate',
  31: 'pdfinsertht', 32: 'pdfximagebbox', 33: 'jobname' }
export const cmd = Cmd.convert
export const primitives: [string, number][] = Object.entries(names).filter(([k]) => k !== '5').map(([k, n]) => [n, +k])
export const etex_primitives: [string, number][] = [['eTeXrevision', 5]]
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'jobname') }
// pdftex.web conv_toks: scan_pdf_ext_toks and tokens_to_string with scanner_status, warning_index, def_ref saved
function scan_ext_string(e: Engine): number[] {
  const ss = e.scanner_status, wi = e.warning_index, dr = e.def_ref
  scan_toks(e, false, true)
  const s = tokens_to_string(e, e.def_ref); delete_token_ref(e, e.def_ref)
  e.def_ref = dr; e.warning_index = wi; e.scanner_status = ss
  return s
}

// pdftex.web compare_strings: \pdfstrcmp
function compare_strings(e: Engine): void {
  const save_cur_cs = e.cur_cs; scan_toks(e, false, true)
  const s1 = tokens_to_string(e, e.def_ref); delete_token_ref(e, e.def_ref)
  e.cur_cs = save_cur_cs; scan_toks(e, false, true)
  const s2 = tokens_to_string(e, e.def_ref); delete_token_ref(e, e.def_ref)
  let i = 0
  while (i < s1.length && i < s2.length && s1[i] === s2[i]) i++
  e.cur_val = i < s1.length && i < s2.length ? (s1[i]! < s2[i]! ? -1 : 1) : s1.length === s2.length ? 0 : i < s1.length ? 1 : -1
  e.cur_val_level = 0
}

// §470 conv_toks
export function run(e: Engine, chr: number): void {
  const c = chr, old_setting = e.selector, b = e.cur_str.length
  // §471 Scan the argument for command c
  if (c === number_code || c === roman_numeral_code) scan_int(e)
  else if (c === string_code || c === meaning_code) {
    const save_scanner_status = e.scanner_status
    e.scanner_status = 0; get_token(e); e.scanner_status = save_scanner_status
  } else if (c === font_name_code) scan_font_ident(e)
  else if (c === expanded_code) { // pdftex.web; save_cur_string is not needed: cur_str is only spliced from a saved length
    const ss = e.scanner_status, wi = e.warning_index, dr = e.def_ref
    scan_toks(e, false, true)
    e.warning_index = wi; e.scanner_status = ss
    ins_list(e, e.link[e.def_ref]!); free_avail(e, e.def_ref); e.def_ref = dr
    return
  }
  else if (c === job_name_code) { if (e.job_name === '') open_log_file(e) }
  else if (c === pdf_strcmp_code) { // pdftex.web (scanner_status, warning_index and def_ref are restored)
    const ss = e.scanner_status, wi = e.warning_index, dr = e.def_ref
    compare_strings(e)
    e.def_ref = dr; e.warning_index = wi; e.scanner_status = ss
  }
  else if (c === pdf_file_size_code || c === pdf_file_mod_date_code || c === pdf_mdfive_sum_code || (c >= 14 && c <= 21 && c !== 16 && c !== 17 && c !== 18 && c !== 19)) {
    // pdftex.web: scan_pdf_ext_toks, then a utils.c conversion of the string (getfilesize, getfilemoddate, getmd5sum, escape…)
    const file = c === pdf_mdfive_sum_code && scan_keyword(e, 'file'), s = scan_ext_string(e)
    const name = () => str(s).replaceAll('"', '') // makecfilename drops quotes; kpse_find_tex
    let r: number[] | string
    if (c === pdf_file_size_code) { const f = find_tex_file(e, name()); r = f === null ? '' : String(f.length) }
    else if (c === pdf_file_mod_date_code) { // a file this run wrote was modified now
      const n = name(), written = [n, n + '.tex'].some(x => e.outputFiles.has(x.replace(/^(\.\/)+/, '')))
      const t = written ? new Date() : e.fs.stat?.(n, 'tex')?.mtime; r = t ? makepdftime(t) : ''
    }
    else if (c === pdf_mdfive_sum_code) { const f = file ? find_tex_file(e, name()) : s; r = f === null ? '' : md5(f) }
    else r = (c === 14 ? escapestring : c === 15 ? escapename : c === 20 ? escapehex : unescapehex)(s)
    append(e.cur_str, r)
    e.link[garbage] = str_toks(e, b); ins_list(e, e.link[temp_head]!); return
  }
  else if (c === pdf_match_code) { // pdftex.web; utils.c matchstrings: 1, 0, or -1 for a bad pattern (the last match is kept)
    const ss = e.scanner_status, wi = e.warning_index, dr = e.def_ref
    const icase = scan_keyword(e, 'icase')
    let n = -1
    if (scan_keyword(e, 'subcount')) { scan_int(e); n = e.cur_val }
    const pat = str(scan_ext_string(e)), t = str(scan_ext_string(e))
    e.def_ref = dr; e.warning_index = wi; e.scanner_status = ss
    const m = matchstrings(pat, t, icase)
    if (m === null) fatal_error(e, 'unsupported: \\pdfmatch pattern ' + pat) // shortcut: pdftex warns with the C library's regerror text and returns -1
    e.last_match = n < 0 ? m : m.slice(0, n)
    e.cur_str.push(...Array.from(m === null ? '-1' : m.length > 0 ? '1' : '0', ch => ch.charCodeAt(0)))
    e.link[garbage] = str_toks(e, b); ins_list(e, e.link[temp_head]!); return
  }
  else if (c === pdf_last_match_code) { // pdftex.web; utils.c getmatch: `start->text', `-1->' when that subexpression did not match
    scan_int(e)
    if (e.cur_val < 0) {
      print_err(e, 'Bad match number'); help(e, 'Since I expected zero or a positive number,', 'I changed this one to zero.')
      int_error(e, e.cur_val); e.cur_val = 0
    }
    const m = e.last_match[e.cur_val]
    append(e.cur_str, m ? m[0] + '->' + m[1] : '-1->')
    e.link[garbage] = str_toks(e, b); ins_list(e, e.link[temp_head]!); return
  }
  else if (c === pdf_creation_date_code) { // pdftex.web; utils.c makepdftime
    e.selector = new_string; print_str(e, makepdftime(e.date ?? new Date()))
    e.selector = old_setting; e.link[garbage] = str_toks(e, b); ins_list(e, e.link[temp_head]!); return
  }
  else if (c === pdf_font_name_code || c === pdf_font_objnum_code || c === pdf_font_size_code) { // pdftex.web
    scan_font_ident(e)
    if (e.cur_val === null_font) pdf_error(e, 'font', 'invalid font identifier')
    if (c !== pdf_font_size_code) { pdf_check_vf(e, e.cur_val); if (!e.font_used[e.cur_val]) pdf_init_font(e, e.cur_val) }
  }
  else if (c === pdf_page_ref_code) { scan_int(e); if (e.cur_val <= 0) pdf_error(e, 'pageref', 'invalid page number') }
  else if (c === pdf_xform_name_code) { scan_int(e); pdf_check_obj(e, obj_type_xform, e.cur_val) }
  else if (c === uniform_deviate_code) scan_int(e)
  else if (c !== normal_deviate_code && c !== eTeX_revision_code && c !== pdftex_revision_code && c !== pdftex_banner_code) unsupported(e)
  e.selector = new_string
  // §472 Print the result of command c
  if (c === number_code) print_int(e, e.cur_val)
  else if (c === roman_numeral_code) print_roman_int(e, e.cur_val)
  else if (c === string_code) { if (e.cur_cs !== 0) sprint_cs(e, e.cur_cs); else print_char(e, e.cur_chr) }
  else if (c === meaning_code) print_meaning(e)
  else if (c === font_name_code) {
    print_str(e, e.font_name[e.cur_val]!)
    if (e.font_size[e.cur_val] !== e.font_dsize[e.cur_val]) { print_str(e, ' at '); print_scaled(e, e.font_size[e.cur_val]!); print_str(e, 'pt') }
  }
  else if (c === eTeX_revision_code) print_str(e, '.6')
  else if (c === pdftex_revision_code) print_str(e, '29') // pdftex.web pdftex_revision
  else if (c === pdftex_banner_code) print_str(e, 'This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) kpathsea version 6.4.2') // texmfmp.c; pdftex's own, for identical logs
  else if (c === pdf_strcmp_code) print_int(e, e.cur_val)
  else if (c === pdf_font_name_code || c === pdf_font_objnum_code) {
    const f = e.ps.font_num[e.cur_val]! < 0 ? -e.ps.font_num[e.cur_val]! : e.cur_val // set_ff
    print_int(e, c === pdf_font_name_code ? e.ps.obj_info[e.ps.font_num[f]!]! : e.ps.font_num[f]!)
  }
  else if (c === pdf_font_size_code) { print_scaled(e, e.font_size[e.cur_val]!); print_str(e, 'pt') }
  else if (c === pdf_page_ref_code) print_int(e, get_obj(e, obj_type_page, e.cur_val, 0))
  else if (c === pdf_xform_name_code) print_int(e, e.ps.obj_info[e.cur_val]!)
  else if (c === uniform_deviate_code) print_int(e, unif_rand(e, e.cur_val))
  else if (c === normal_deviate_code) print_int(e, norm_rand(e))
  else print_str(e, e.job_name)
  e.selector = old_setting; e.link[garbage] = str_toks(e, b); ins_list(e, e.link[temp_head]!)
}
