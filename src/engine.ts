// §1330–1337 the main program; the Engine owns every TeX global
import type { TexFS } from './platform/fs.ts'
import { Cmd, vmode, batch_mode, fatal_error_stop, spotless, no_print, term_only, int_val, warning_issued, error_stop_mode, term_and_log } from './types.ts'
import type { InState } from './types.ts'
import { tracing_stats_code, pdf_output_code } from './types.ts'
import { print, print_nl, print_char, print_esc, print_int, print_ln } from './print.ts'
import { JumpOut, fatal_error, overflow, print_err, token_list } from './error.ts'
import { init_eqtb, fix_date_and_time, eqtb_size, int_base, new_line_char_code, end_line_char_code, cat_code_base, level_one } from './eqtb.ts'
import { init_prim } from './primitives/index.ts'
import { new_line, end_token_list, end_file_reading, normal, term_line } from './input.ts'
import type { InputFile } from './input.ts'
import { init_specs, new_char, glue_node, delete_token_ref, delete_glue_ref } from './nodes.ts'
import { store_fmt_file, load_fmt_file } from './format.ts'
import type { Format } from './format.ts'
import { new_page_ins_head } from './page.ts'
import type { GlueSpec, Node, CharNode } from './nodes.ts'
import type { ListState } from './main.ts'
import type { AlignState, AlignRecord } from './align.ts'
import type { Movement } from './dvi.ts'
import { init_fonts } from './tfm.ts'
import { init_randoms } from './arith.ts'
import { hyph_state } from './hyphenate.ts'

const contrib_head0 = new_char(0, 0) // replaced per Engine in the constructor
const ignore_depth = -65536000
import type { CondNode } from './conditional.ts'
import type { SaElem } from './etex.ts'
import { show_save_groups, do_marks, destroy_marks } from './etex.ts'
import { flush_node_list } from './nodes.ts'
import { open_log_file, start_input, print_file_name } from './files.ts'
import { print_cmd_chr } from './tokens.ts'
import { main_control } from './main.ts'
import { finish_dvi_file } from './dvi.ts'
import { pdf_state, finish_pdf_file, PdftexFail } from './pdf.ts'
import { font_state } from './backend/fonts.ts'

// The capacities TeX checks (tex.web §11, tex.ch), as TeX Live's texmf.cnf sets them; tripman's trip run passes tex.web's.
// eqtb's layout does not depend on them: hash_size only bounds how many control sequences may be made.
export const default_limits = {
  error_line: 79, half_error_line: 50, max_print_line: 79, stack_size: 10000, max_in_open: 15, buf_size: 200000,
  param_size: 20000, nest_size: 1000, save_size: 200000, font_max: 9000, font_mem_size: 8000000, hash_size: 15000,
  hash_extra: 600000, hyph_size: 8191, trie_size: 1000000, trie_op_size: 35111, dvi_buf_size: 16384, expand_depth: 10000,
  main_memory: 5000000, // shortcut: counts token words + node handles (e.nodes), not pdftex's mem words; node objects reachable only from lists are uncounted, count them if a runaway list OOMs
}
export type Limits = typeof default_limits

export class Engine {
  fs: TexFS
  lim: Limits
  log = ''; terminal = ''
  // §54 printing
  selector = term_only; tally = 0; term_offset = 0; file_offset = 0
  trick_buf: number[] = []; trick_count = 0; first_count = 0; dig: number[] = []; old_setting = 0
  cur_str: number[] = [] // the string being built while selector=new_string
  message_printing = false // enctex1.ch
  // §73–96 errors
  interaction = batch_mode; deletions_allowed = true; history = fatal_error_stop; error_count = 0
  help_line: string[] = []; help_ptr = 0; OK_to_interrupt = true; use_err_help = false; long_help_seen = false
  log_opened = false; job_name = ''; c_job_name = ''; format_ident = ' (INITEX)'
  // §104 arithmetic
  arith_error = false; remainder = 0
  // §116 one-word token memory
  info: number[] = [0, 0, 0, 0, 0, 0, 0]; link: number[] = [0, 0, 0, 0, 0, 0, 0]; avail = 0; mem_end = 6
  // §253 eqtb, §256 hash
  eq_level = new Uint8Array(eqtb_size + 1); eq_type = new Uint8Array(eqtb_size + 1)
  equiv = new Int32Array(eqtb_size + 1); xeq_level = new Uint8Array(eqtb_size + 1)
  hash = new Map<string, number>(); text = new Map<number, string>()
  prim = new Map<string, number>(); prim_text: (string | number)[] = [0] // pdftex.web primitives table; 0 is undefined_primitive
  hash_used = 0; no_new_control_sequence = true; cs_count = 0
  // §271 save stack
  save_b0: number[] = []; save_b1: number[] = []; save_rh: number[] = []
  save_ptr = 0; cur_level = level_one; cur_group = 0; cur_boundary = 0; max_save_stack = 0
  // §213 semantic nest: the fields of cur_list live here, nest[] holds the levels below
  mode = vmode; shown_mode = 0; head: Node = contrib_head0; tail: Node = contrib_head0; prev_graf = 0; mode_line = 0
  prev_depth = ignore_depth; space_factor = 0; clang = 0; incompleat_noad: Node | null = null; eTeX_aux: Node | null = null
  nest: ListState[] = []; nest_ptr = 0; max_nest_stack = 0
  // §162, §980–982 fixed list heads and page builder state
  // type(page_head)=glue_node, so an initial glue node on the current page is not a legal breakpoint
  contrib_head: CharNode = contrib_head0; page_head: Node = { type: glue_node, subtype: 0, link: null, glue_ptr: 0, leader_ptr: null }
  page_tail: Node = this.page_head
  page_contents = 0; output_active = false; output_can_end = false; dead_cycles = 0; insert_penalties = 0
  last_glue = 0o17777777777; last_penalty = 0; last_kern = 0; last_node_type = -1
  page_so_far = [0, 0, 0, 0, 0, 0, 0, 0]; page_max_depth = 0; best_page_break: Node | null = null; least_page_cost = 0; best_size = 0
  page_ins_head = new_page_ins_head(); best_height_plus_depth = 0
  cur_mark = [0, 0, 0, 0, 0] // §382 top, first, bot, split_first, split_bot mark token lists
  // §133 node pointers kept in eqtb (box registers) are handles into nodes[]; §115 temp_ptr
  nodes: (Node | null)[] = [null]; nodes_free: number[] = []; temp_ptr = 0
  // §173, §181 displaying boxes
  font_in_short_display = 0; depth_threshold = 0; breadth_max = 0
  // §549–550 font memory
  font_info: number[] = []; fmem_ptr = 0; font_ptr = 0
  font_check: number[] = []; font_size: number[] = []; font_dsize: number[] = []; font_params: number[] = []
  font_name: string[] = []; font_area: string[] = []; font_bc: number[] = []; font_ec: number[] = []
  font_glue: number[] = []; font_used: boolean[] = []; hyphen_char: number[] = []; skew_char: number[] = []
  bchar_label: number[] = []; font_bchar: number[] = []; font_false_bchar: number[] = []
  char_base: number[] = []; width_base: number[] = []; height_base: number[] = []; depth_base: number[] = []
  italic_base: number[] = []; lig_kern_base: number[] = []; kern_base: number[] = []; exten_base: number[] = []; param_base: number[] = []
  // §646–647, §661 packaging
  total_stretch = [0, 0, 0, 0]; total_shrink = [0, 0, 0, 0]; last_badness = 0; pack_begin_line = 0
  adjust_head: Node = new_char(0, 0); adjust_tail: Node | null = null
  pre_adjust_head: Node = new_char(0, 0); pre_adjust_tail: Node | null = null
  // §814 just_box, §892–965 hyphenation (hyphenate.ts), §1248 \parshape arrays [n, indent1, width1, ...] addressed by eqtb handles
  just_box: Node | null = null; hy = hyph_state(); shapes: (number[] | undefined)[] = [undefined]
  // §719 mlist_to_hlist's implicit parameters, §724 fetch's results
  cur_mlist: Node | null = null; cur_style = 0; cur_size = 0; cur_mu = 0; mlist_penalties = false; cur_f = 0; cur_c = 0; cur_i = 0
  // §770 alignment state; align_stack plays align_ptr's nodes, align_head.link is the preamble
  align_stack: AlignState[] = []; align_head: Node = new_char(0, 0); cur_align: AlignRecord | null = null
  cur_span: AlignRecord | null = null; cur_loop: Node | null = null
  cur_head: Node | null = null; cur_tail: Node | null = null; cur_pre_head: Node | null = null; cur_pre_tail: Node | null = null
  // §1074 cur_box, §1241
  cur_box: Node | null = null; set_box_allowed = true
  // §1032 main loop
  main_f = 0; main_i = 0; main_j = 0; main_k = 0; main_p: Node | null = null; main_s = 0; bchar = 0; false_bchar = 0
  cancel_boundary = false; ins_disc = false; cur_l = 0; cur_r = 0; cur_q: Node = contrib_head0; lig_stack: Node | null = null
  ligature_present = false; lft_hit = false; rt_hit = false
  // §595, §605, §616, §646 DVI output
  dvi_buf = new Uint8Array(1 << 16); dvi_ptr = 0; dvi_limit = 0; dvi_offset = 0; dvi_gone = 0
  down_ptr: Movement | null = null; right_ptr: Movement | null = null
  dvi_h = 0; dvi_v = 0; cur_h = 0; cur_v = 0; dvi_f = 0; cur_s = -1
  total_pages = 0; max_v = 0; max_h = 0; max_push = 0; last_bop = -1; doing_leaders = false
  output_file_name = ''; fixed_pdfoutput: number | null = null
  // pdftex.web [32b]–[32f] PDF output (src/pdf.ts) and the C font back end (src/backend/fonts.ts); tounicode.c's table is dumped
  ps = pdf_state(); fm = font_state(); glyph_unicode = new Map<string, number | string>(); start_time = 0
  get pdf(): Uint8Array | null { return this.fixed_pdfoutput !== null && this.fixed_pdfoutput > 0 && this.total_pages > 0 && this.history !== fatal_error_stop && this.ps.fixed_draftmode === 0 ? this.ps.op_buf.slice(0, this.ps.os_mode ? this.ps.op_ptr : this.ps.ptr) : null }
  last_match: ([number, string] | null)[] = [] // utils.c pmatch for \pdflastmatch
  cur_page_height = 0; pdf_last_x_pos = 0; pdf_last_y_pos = 0 // pdftex.web \pdfsavepos
  // §1342 \write streams; written files are collected here (TexFS is read-only)
  write_open: boolean[] = new Array(18).fill(false); write_name: string[] = []
  outputFiles = new Map<string, string>()
  get dvi(): Uint8Array | null { return this.total_pages > 0 ? this.dvi_buf.slice(0, this.dvi_offset + this.dvi_ptr) : null }
  // §297
  cur_cmd = 0; cur_chr = 0; cur_cs = 0; cur_tok = 0
  // §301–310 input stacks
  input_stack: InState[] = []; input_ptr = 0; max_in_stack = 0
  cur_input: InState = { state: new_line, index: 0, start: 1, loc: 0, limit: 0, name: 0 }
  in_open = 0; open_parens = 0; input_file: InputFile[] = []; line = 0; line_stack: number[] = []
  scanner_status = normal; warning_index = 0; def_ref = 0
  param_stack: number[] = []; param_ptr = 0; max_param_stack = 0; align_state = 1000000; base_ptr = 0
  par_loc = 0; par_token = 0; force_eof = false; write_loc = 0
  buffer: number[] = []; first = 0; last = 0; max_buf_stack = 0
  // §410 scanning
  cur_val = 0; cur_val_level = int_val; radix = 0; cur_order = 0; expand_depth_count = 0
  // §387–388 macro_call
  long_state: number = Cmd.call; pstack: number[] = []
  // §1266
  after_token = 0
  // §150 glue specifications, §287 magnification
  spec: (GlueSpec | undefined)[] = []; spec_avail: number[] = []; mag_set = 0
  // §489 the condition stack, §493
  cond_ptr: CondNode | null = null; if_limit = 0; cur_if = 0; if_line = 0; skip_line = 0
  // §480 \read streams 0..15; 16 is the terminal
  read_file: InputFile[] = []; read_open: number[] = new Array(17).fill(2)
  // §512–520 file names
  name_in_progress = false; cur_name = ''; cur_area = ''; cur_ext = ''
  name_chars: number[] = []; area_delimiter = 0; ext_delimiter = 0; quoted_filename = false; stop_at_space = true
  // etex.ch: compatibility (0) or extended (1) mode, pdftex.ch's -etex switch, scan_register_num's limit
  eTeX_mode = 0; etex_p = false; ini_version = true; max_reg_num = 255; max_reg_help_line = 'A register number must be between 0 and 255.'
  is_in_csname = false // pdftex.web \ifincsname
  get eTeX_ex(): boolean { return this.eTeX_mode === 1 }
  // etex.ch sparse arrays (sa[0..3] unused so register chr codes 0..3 stay the primitives), sa_chain, sa_level
  sa: (SaElem | null)[] = [null, null, null, null]; sa_free: number[] = []; sa_root = [0, 1, 2, 3, 4, 5, 6].map(() => new Map<number, number>())
  sa_chain: unknown = null; sa_chain_stack: unknown[] = []; sa_level = 0
  // etex.ch grp_stack, if_stack, eof_seen per input file; \scantokens pseudo files (lines still to be read); disc_ptr
  grp_stack: number[] = [0]; if_stack: (CondNode | null)[] = [null]; eof_seen: boolean[] = []; pseudo_files: number[][][] = []
  disc_ptr: (Node | null)[] = [null, null, null, null]
  // tex.ch §20–24 xord/xchr identity, xprn printable ASCII; a TCX file (texmfmp.c readtcxfile) changes them
  xord = Uint8Array.from({ length: 256 }, (_, i) => i); xchr = Uint8Array.from({ length: 256 }, (_, i) => i)
  xprn = Uint8Array.from({ length: 256 }, (_, i) => +(i >= 32 && i <= 126)); translate_filename = ''
  // §246
  sys_time = 0; sys_day = 0; sys_month = 0; sys_year = 0
  start_ms = 0; random_seed = 0; randoms: number[] = new Array(55).fill(0); j_random = 0 // pdftex.web: the start time for \pdfelapsedtime, random_seed, [7b]

  // §71 lines the terminal will supply (null: no terminal); §1302 the format made by \dump, §1337 the one `&name' loads
  term_in: string[] = []; fmt_file: Format | null = null; format: Format | Promise<Format> | null; date: Date | undefined

  constructor(opts: { fs: TexFS, limits?: Partial<Limits>, format?: Format | Promise<Format>, tcx?: string }) {
    this.fs = opts.fs; this.format = opts.format ?? null
    if (opts.tcx !== undefined) read_tcx_file(this, opts.tcx)
    this.lim = { ...default_limits, ...opts.limits }; this.dvi_limit = this.lim.dvi_buf_size
    this.contrib_head = new_char(0, 0); this.head = this.tail = this.cur_q = this.contrib_head
  }

  // §1332 the main program. Without `terminal' it is `pdftex -ini -interaction=batchmode <jobname>.tex';
  // with it, the first line comes from `terminal' (init_terminal) and so does every later terminal read.
  // `file' is the first line (default `<jobname>.tex'); `jobname' with `file' is -jobname
  // mode 'pdflatex' is 'latex' with the format's \pdfoutput (TeX Live's pdflatex); `date' is SOURCE_DATE_EPOCH with FORCE_SOURCE_DATE
  async run(opts: { jobname?: string, file?: string, mode: 'ini' | 'etex' | 'latex' | 'pdflatex', terminal?: string[], date?: Date }): Promise<void> {
    this.date = opts.date; this.etex_p = opts.mode === 'etex'; this.ini_version = opts.mode === 'ini' || opts.mode === 'etex' // pdftex -ini (the latex modes load a format)
    this.format = await this.format // loadFormat's result may be passed unawaited
    init_specs(this); init_fonts(this); init_eqtb(this); init_prim(this); fix_date_and_time(this)
    this.terminal += 'This is tstex, Version 3.141592653' + this.format_ident + '\n' // §61
    if (this.translate_filename !== '') this.terminal += ' (' + this.translate_filename + ')\n' // tex.ch
    // §1337 Get the first line of input and prepare to start; §331 Initialize the input routines
    this.first = 1
    if (opts.terminal) {
      this.term_in = [...opts.terminal]; this.interaction = error_stop_mode
      if (!init_terminal(this)) return
    } else {
      const name = opts.file ?? opts.jobname + '.tex'
      if (opts.file !== undefined && opts.jobname !== undefined) this.c_job_name = opts.jobname
      for (let k = 0; k < name.length; k++) this.buffer[this.first + k] = name.charCodeAt(k)
      this.last = this.first + name.length; this.cur_input.loc = this.first
    }
    this.cur_input.limit = this.last; this.first = this.last + 1
    // etex.ch Enable eTeX, if requested (pdftex.ch: or -etex)
    // `if not no_new_control_sequence then no_new_control_sequence:=true else' guards §1337's format load: `*&x' reads `&x' as a file name
    let entered = false
    if ((this.etex_p || this.buffer[this.cur_input.loc] === 42) && this.format_ident === ' (INITEX)') {
      init_prim(this, true)
      if (this.buffer[this.cur_input.loc] === 42) this.cur_input.loc++
      this.eTeX_mode = 1; etex_ext_vars(this); entered = true
    }
    // mode 'latex' is `-fmt pdflatex': the format loads with no `&' (tex.ch dump_name)
    const latex = opts.mode === 'latex' || opts.mode === 'pdflatex'
    if (!entered && (latex || this.buffer[this.cur_input.loc] === 38)) { // §524 open_fmt_file: `&name' names the format
      if (this.buffer[this.cur_input.loc] === 38) {
        let j = ++this.cur_input.loc; this.buffer[this.last] = 32
        while (this.buffer[j] !== 32) j++
        if (this.format === null) throw new Error(`format ${String.fromCharCode(...this.buffer.slice(this.cur_input.loc, j))} was not supplied`)
        this.cur_input.loc = j
      }
      if (this.format === null) throw new Error('mode latex needs a format')
      load_fmt_file(this, this.format)
      while (this.cur_input.loc < this.cur_input.limit && this.buffer[this.cur_input.loc] === 32) this.cur_input.loc++
      fix_date_and_time(this)
    }
    if (latex) { // -interaction=batchmode (tex.ch interaction_option), 'latex': -output-format=dvi (pdftex.web pdf_output_option)
      this.interaction = opts.terminal ? error_stop_mode : batch_mode
      if (opts.mode === 'latex') this.equiv[int_base + pdf_output_code] = 0
    }
    if (this.eTeX_ex) this.terminal += 'entering extended mode\n'
    if (this.equiv[int_base + end_line_char_code]! < 0 || this.equiv[int_base + end_line_char_code]! > 255) this.cur_input.limit--
    else this.buffer[this.cur_input.limit] = this.equiv[int_base + end_line_char_code]!
    const t = (this.date ?? new Date()).getTime(); this.start_ms = performance.now(); this.start_time = t // pdftex.web: random_seed:=(microseconds*1000)+(epochseconds mod 1000000)
    this.random_seed = (t % 1000) * 1000000 + Math.floor(t / 1000) % 1000000
    init_randoms(this, this.random_seed)
    this.selector = this.interaction === batch_mode ? no_print : term_only
    try {
      if (this.cur_input.loc < this.cur_input.limit && this.equiv[cat_code_base + this.buffer[this.cur_input.loc]!] !== Cmd.escape) {
        start_input(this)
      }
      this.history = spotless
      main_control(this)
      final_cleanup(this)
    } catch (x) {
      // shortcut: the JS stack runs out (~1500 nested expansions) before TeX's expand_depth=10000; report it as TeX does, upgrade by making expand iterative if documents need more
      if (x instanceof RangeError && /call stack/.test(x.message)) {
        try { overflow(this, 'expansion depth', this.lim.expand_depth) } catch (y) { if (!(y instanceof JumpOut)) throw y }
      } else if (x instanceof PdftexFail) return // utils.c pdftex_fail exits
      else if (!(x instanceof JumpOut)) throw x
    }
    try { close_files_and_terminate(this) } catch (x) { if (!(x instanceof PdftexFail)) throw x }
  }
}

// texmfmp.c readtcxfile: lines `first [second [printable]]', numbers as strtol base 0, `%' starts a comment
function read_tcx_file(e: Engine, name: string): void {
  if (!/\.[^/]*$/.test(name)) name += '.tcx'
  const f = e.fs.find(name, 'tcx')
  if (f === null) throw new Error(`Could not open char translation file \`${name}'`)
  e.translate_filename = e.fs.path?.(name, 'tcx') ?? name
  const num = (s: string, upb: number): [number, string] => { // tcx_get_num: -1 when absent or out of range
    const m = /^\s*[+-]?(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)/.exec(s)
    if (m === null) return [-1, s]
    const n = parseInt(m[0], /0[xX]/.test(m[1]!) ? 16 : m[1]!.length > 1 && m[1]![0] === '0' ? 8 : 10)
    return [n < 0 || n > upb ? -1 : n, s.slice(m[0].length)]
  }
  for (const raw of String.fromCharCode(...f).split('\n')) {
    const [first, s2] = num(raw.split('%')[0]!, 255)
    if (first < 0) continue
    let [second, s3] = num(s2, 255), printable = 1
    if (second >= 0) {
      e.xord[first] = second; e.xchr[second] = first
      printable = num(s3, 1)[0]; if (printable === -1 || (32 <= second && second <= 126)) printable = 1
    } else second = first
    e.xprn[second] = printable
  }
}

// etex.ch Initialize variables for eTeX extended mode
export function etex_ext_vars(e: Engine): void {
  e.max_reg_num = 32767; e.max_reg_help_line = 'A register number must be between 0 and 32767.'
}

// §37 init_terminal
function init_terminal(e: Engine): boolean {
  for (;;) {
    e.terminal += '**'
    if (!term_line(e)) { e.terminal += '\n! End of file on the terminal... why?\n'; return false }
    e.cur_input.loc = e.first
    while (e.cur_input.loc < e.last && e.buffer[e.cur_input.loc] === 32) e.cur_input.loc++
    if (e.cur_input.loc < e.last) return true
    e.terminal += 'Please type the name of your input file.\n'
  }
}

// §1335 final_cleanup
function final_cleanup(e: Engine): void {
  const c = e.cur_chr
  if (c !== 1) e.equiv[int_base + new_line_char_code] = -1
  if (e.job_name === '') open_log_file(e)
  while (e.input_ptr > 0) {
    if (e.cur_input.state === token_list) end_token_list(e); else end_file_reading(e)
  }
  while (e.open_parens > 0) { print(e, ' )'); e.open_parens-- }
  if (e.cur_level > level_one) {
    print_nl(e, '('); print_esc(e, 'end occurred ')
    print(e, 'inside a group at level ')
    print_int(e, e.cur_level - level_one); print_char(e, 41)
    if (e.eTeX_ex) show_save_groups(e) // etex.ch
  }
  while (e.cond_ptr !== null) {
    print_nl(e, '('); print_esc(e, 'end occurred ')
    print(e, 'when '); print_cmd_chr(e, Cmd.if_test, e.cur_if)
    if (e.if_line !== 0) { print(e, ' on line '); print_int(e, e.if_line) }
    print(e, ' was incomplete)')
    e.if_line = e.cond_ptr.if_line; e.cur_if = e.cond_ptr.cur_if; e.cond_ptr = e.cond_ptr.link
  }
  if (e.history !== spotless && (e.history === warning_issued || e.interaction < error_stop_mode) && e.selector === term_and_log) {
    e.selector = term_only
    print_nl(e, '(see the transcript file for additional information)')
    e.selector = term_and_log
  }
  if (c === 1) {
    for (let k = 0; k < 5; k++) if (e.cur_mark[k] !== 0) delete_token_ref(e, e.cur_mark[k]!)
    do_marks(e, destroy_marks) // etex.ch
    for (let k = 2; k <= 3; k++) { flush_node_list(e, e.disc_ptr[k]!); e.disc_ptr[k] = null }
    if (e.last_glue !== 0o17777777777) delete_glue_ref(e, e.last_glue)
    store_fmt_file(e)
  }
}

// §1333 close_files_and_terminate
function close_files_and_terminate(e: Engine): void {
  e.equiv[int_base + new_line_char_code] = -1
  if (e.equiv[int_base + tracing_stats_code]! > 0 && e.log_opened) { // §1334 Output statistics about this job
    // shortcut: no string pool, mem or font arrays, so strings/pool/memory are this engine's own counts against TeX Live's sizes
    e.log += ` \nHere is how much of TeX's memory you used:\n 0 strings out of 500000\n 0 string characters out of 6250000\n`
      + ` ${e.mem_end + 1} words of memory out of 5000000\n ${e.cs_count} multiletter control sequences out of ${e.lim.hash_size}+${e.lim.hash_extra}\n`
      + ` ${e.fmem_ptr} words of font info for ${e.font_ptr} font${e.font_ptr !== 1 ? 's' : ''}, out of ${e.lim.font_mem_size} for ${e.lim.font_max}\n ${e.hy.hyph_count} hyphenation exception${e.hy.hyph_count !== 1 ? "s" : ""} out of ${e.lim.hyph_size}\n`
      + ` ${e.max_in_stack}i,${e.max_nest_stack}n,${e.max_param_stack}p,${e.max_buf_stack + 1}b,${e.max_save_stack + 6}s stack positions out of `
      + `${e.lim.stack_size}i,${e.lim.nest_size}n,${e.lim.param_size}p,${e.lim.buf_size}b,${e.lim.save_size}s\n`
  }
  if (e.fixed_pdfoutput === null) e.fixed_pdfoutput = e.equiv[int_base + pdf_output_code]! // pdftex: fix_pdfoutput
  if (e.fixed_pdfoutput > 0) {
    if (e.history === fatal_error_stop) print_err(e, ' ==> Fatal error occurred, no output PDF file produced!')
    else finish_pdf_file(e) // Finish the PDF file, and the PDF statistics
  } else finish_dvi_file(e) // §642
  if (e.log_opened) {
    e.log += '\n'; e.selector -= 2
    if (e.selector === term_only) { print_nl(e, 'Transcript written on '); print_file_name(e, e.job_name + '.log', '', ''); print_char(e, 46) }
  }
  print_ln(e) // tex.ch
}
