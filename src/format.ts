// §1299–1329 \dump and undump: the format is an in-memory snapshot of the tables TeX dumps
import type { Engine } from './engine.ts'
import { batch_mode, log_only, term_and_log, new_string } from './types.ts'
import { print, print_char, print_nl, print_ln, print_int, print_esc, slow_print } from './print.ts'
import { print_scaled } from './arith.ts'
import { print_err, help, succumb } from './error.ts'
import { int_par, year_code, month_code, day_code, tracing_stats_code, int_base, dimen_base, font_id_base } from './eqtb.ts'
import { print_file_name } from './files.ts'
import { init_trie } from './hyphenate.ts'
import { etex_ext_vars } from './engine.ts'

// What §1307–1327 dump: dynamic memory (token lists, nodes, glue specs, \parshape arrays), eqtb (xeq_level is constant
// at level one), par_loc/write_loc, the hash and primitive tables, the fonts, the hyphenation tables, interaction, format_ident.
// The string pool has no counterpart: names live in `text`/`hash`, file names are JS strings.
const fmt_keys = [
  'info', 'link', 'avail', 'mem_end', 'nodes', 'nodes_free', 'spec', 'spec_avail', 'shapes',
  'eq_level', 'eq_type', 'equiv', 'par_loc', 'par_token', 'write_loc',
  'hash', 'text', 'prim', 'prim_text', 'hash_used', 'cs_count',
  'font_info', 'fmem_ptr', 'font_ptr', 'font_check', 'font_size', 'font_dsize', 'font_params', 'font_name', 'font_area',
  'font_bc', 'font_ec', 'font_glue', 'hyphen_char', 'skew_char', 'bchar_label', 'font_bchar', 'font_false_bchar',
  'char_base', 'width_base', 'height_base', 'depth_base', 'italic_base', 'lig_kern_base', 'kern_base', 'exten_base', 'param_base',
  'hy', 'interaction', 'format_ident',
  'eTeX_mode', 'sa', 'sa_free', 'sa_root', // etex.ch Dump the eTeX state, sa_root
] as const
export type Format = Pick<Engine, typeof fmt_keys[number]>

// The snapshot; structuredClone-able, so it can be kept, copied, or (M5) serialised
export function dump_format(e: Engine): Format {
  const f: Partial<Record<keyof Format, unknown>> = {}
  for (const k of fmt_keys) f[k] = e[k]
  return structuredClone(f) as Format
}

// §1303 load_fmt_file (pdftex: prev_depth:=pdf_ignored_dimen afterwards)
export function load_fmt_file(e: Engine, f: Format): void {
  Object.assign(e, structuredClone(f))
  if (e.eTeX_ex) etex_ext_vars(e) // etex.ch Undump the eTeX state
  e.prev_depth = e.equiv[dimen_base + 32]! // \pdfignoreddimen
}

// §1302 store_fmt_file
export function store_fmt_file(e: Engine): void {
  if (e.save_ptr !== 0) { // §1304 If dumping is not allowed, abort
    print_err(e, "You can't dump inside a group"); help(e, "`{...\\dump}' is a no-no."); succumb(e)
  }
  // §1328 Create the format_ident, open the format file, and inform the user that dumping has begun
  e.selector = new_string; e.cur_str = []
  print(e, ' (preloaded format='); print(e, e.job_name); print_char(e, 32)
  print_int(e, int_par(e, year_code)); print_char(e, 46)
  print_int(e, int_par(e, month_code)); print_char(e, 46); print_int(e, int_par(e, day_code)); print_char(e, 41)
  e.selector = e.interaction === batch_mode ? log_only : term_and_log
  e.format_ident = String.fromCharCode(...e.cur_str); e.cur_str = []
  print_nl(e, 'Beginning to dump on file '); slow_print(e, e.job_name + '.fmt')
  print_nl(e, ''); slow_print(e, e.format_ident)
  // §1309 the string pool: there is none (AUDIT.md)
  print_ln(e); print_int(e, 0); print(e, ' strings of total length '); print_int(e, 0)
  // §1311 dynamic memory: token memory words and those in use (no variable-size memory)
  let dyn_used = e.mem_end + 1
  for (let p = e.avail; p !== 0; p = e.link[p]!) dyn_used--
  print_ln(e); print_int(e, e.mem_end + 1); print(e, ' memory locations dumped; current usage is ')
  print_int(e, 0); print_char(e, 38); print_int(e, dyn_used)
  // §1318
  print_ln(e); print_int(e, e.cs_count); print(e, ' multiletter control sequences')
  // §1320, §1322 the fonts
  for (let k = 0; k <= e.font_ptr; k++) {
    print_nl(e, '\\font'); print_esc(e, e.text.get(font_id_base + k) ?? 0); print_char(e, 61)
    print_file_name(e, e.font_name[k]!, e.font_area[k]!, '')
    if (e.font_size[k] !== e.font_dsize[k]) { print(e, ' at '); print_scaled(e, e.font_size[k]!); print(e, 'pt') }
  }
  print_ln(e); print_int(e, e.fmem_ptr - 7); print(e, ' words of font info for ')
  print_int(e, e.font_ptr); print(e, ' preloaded font'); if (e.font_ptr !== 1) print_char(e, 115)
  // §1324 the hyphenation tables
  const h = e.hy
  print_ln(e); print_int(e, h.hyph_count); print(e, ' hyphenation exception'); if (h.hyph_count !== 1) print_char(e, 115)
  if (h.trie_not_ready) init_trie(e)
  print_nl(e, 'Hyphenation trie of length '); print_int(e, h.trie_max)
  print(e, ' has '); print_int(e, h.trie_op_ptr); print(e, ' op'); if (h.trie_op_ptr !== 1) print_char(e, 115)
  print(e, ' out of '); print_int(e, e.lim.trie_op_size)
  for (let k = 255; k >= 0; k--) if (h.trie_used[k]! > 0) {
    print_nl(e, '  '); print_int(e, h.trie_used[k]!); print(e, ' for language '); print_int(e, k)
  }
  // pdftex: Dump pdftex data (nothing PDF-related can exist yet)
  print_ln(e); print_int(e, 0); print(e, ' words of pdfTeX memory')
  print_ln(e); print_int(e, 0); print(e, ' indirect objects')
  // §1326 Dump a couple more things and the closing check word
  e.equiv[int_base + 112] = 0; e.pseudo_files = [] // etex.ch Dump the eTeX state: eTeX_state(j):=0, flush pseudo files
  e.fmt_file = dump_format(e)
  e.equiv[int_base + tracing_stats_code] = 0
}
