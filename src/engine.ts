// §1330–1337 the main program; the Engine owns every TeX global
import type { TexFS } from './platform/fs.ts'
import { Cmd, vmode, batch_mode, fatal_error_stop, spotless, no_print, term_only, int_val, warning_issued, error_stop_mode, term_and_log } from './types.ts'
import type { InState } from './types.ts'
import { hash_size, hash_extra, tracing_stats_code, pdf_output_code } from './types.ts'
import { print, print_nl, print_char, print_esc, print_int } from './print.ts'
import { JumpOut, fatal_error, overflow, print_err, token_list } from './error.ts'
import { init_eqtb, fix_date_and_time, eqtb_size, save_size, int_base, new_line_char_code, end_line_char_code, cat_code_base, level_one } from './eqtb.ts'
import { init_prim } from './primitives/index.ts'
import { new_line, end_token_list, end_file_reading, normal, stack_size, buf_size } from './input.ts'
import type { InputFile } from './input.ts'
import { init_specs, new_char, glue_node } from './nodes.ts'
import { new_page_ins_head } from './page.ts'
import type { GlueSpec, Node, CharNode } from './nodes.ts'
import type { ListState } from './main.ts'
import type { Movement } from './dvi.ts'
import { dvi_buf_size } from './dvi.ts'
import { init_fonts } from './tfm.ts'
import { hyph_state } from './hyphenate.ts'

const contrib_head0 = new_char(0, 0) // replaced per Engine in the constructor
const ignore_depth = -65536000
import type { CondNode } from './conditional.ts'
import { open_log_file, start_input } from './files.ts'
import { print_cmd_chr } from './tokens.ts'
import { main_control } from './main.ts'
import { finish_dvi_file } from './dvi.ts'
import { expand_depth, param_size } from './expand.ts'

export class Engine {
  fs: TexFS
  log = ''; terminal = ''
  // §54 printing
  selector = term_only; tally = 0; term_offset = 0; file_offset = 0
  trick_buf: number[] = []; trick_count = 0; first_count = 0; dig: number[] = []; old_setting = 0
  cur_str: number[] = [] // the string being built while selector=new_string
  // §73–96 errors
  interaction = batch_mode; deletions_allowed = true; history = fatal_error_stop; error_count = 0
  help_line: string[] = []; help_ptr = 0; OK_to_interrupt = true; use_err_help = false; long_help_seen = false
  log_opened = false; job_name = ''; format_ident = ' (INITEX)'
  // §104 arithmetic
  arith_error = false; remainder = 0
  // §116 one-word token memory
  info: number[] = [0, 0, 0, 0, 0, 0]; link: number[] = [0, 0, 0, 0, 0, 0]; avail = 0; mem_end = 5
  // §253 eqtb, §256 hash
  eq_level = new Uint8Array(eqtb_size + 1); eq_type = new Uint8Array(eqtb_size + 1)
  equiv = new Int32Array(eqtb_size + 1); xeq_level = new Uint8Array(eqtb_size + 1)
  hash = new Map<string, number>(); text = new Map<number, string>()
  hash_used = 0; no_new_control_sequence = true; cs_count = 0
  // §271 save stack
  save_b0: number[] = []; save_b1: number[] = []; save_rh: number[] = []
  save_ptr = 0; cur_level = level_one; cur_group = 0; cur_boundary = 0; max_save_stack = 0
  // §213 semantic nest: the fields of cur_list live here, nest[] holds the levels below
  mode = vmode; shown_mode = 0; head: Node = contrib_head0; tail: Node = contrib_head0; prev_graf = 0; mode_line = 0
  prev_depth = ignore_depth; space_factor = 0; clang = 0
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
  // §1074 cur_box, §1241
  cur_box: Node | null = null; set_box_allowed = true
  // §1032 main loop
  main_f = 0; main_i = 0; main_j = 0; main_k = 0; main_p: Node | null = null; main_s = 0; bchar = 0; false_bchar = 0
  cancel_boundary = false; ins_disc = false; cur_l = 0; cur_r = 0; cur_q: Node = contrib_head0; lig_stack: Node | null = null
  ligature_present = false; lft_hit = false; rt_hit = false
  // §595, §605, §616, §646 DVI output
  dvi_buf = new Uint8Array(1 << 16); dvi_ptr = 0; dvi_limit = dvi_buf_size; dvi_offset = 0; dvi_gone = 0
  down_ptr: Movement | null = null; right_ptr: Movement | null = null
  dvi_h = 0; dvi_v = 0; cur_h = 0; cur_v = 0; dvi_f = 0; cur_s = -1
  total_pages = 0; max_v = 0; max_h = 0; max_push = 0; last_bop = -1; doing_leaders = false
  output_file_name = ''; fixed_pdfoutput: number | null = null
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
  name_chars: number[] = []; area_delimiter = 0; ext_delimiter = 0; quoted_filename = false
  // §246
  sys_time = 0; sys_day = 0; sys_month = 0; sys_year = 0

  constructor(opts: { fs: TexFS }) {
    this.fs = opts.fs
    this.contrib_head = new_char(0, 0); this.head = this.tail = this.cur_q = this.contrib_head
  }

  // §1332 the main program, as `pdftex -ini -interaction=batchmode <jobname>.tex`
  async run(opts: { jobname: string, mode: 'ini' | 'etex' | 'latex' }): Promise<void> {
    if (opts.mode !== 'ini') throw new Error(`unsupported mode: ${opts.mode}`)
    const name = opts.jobname + '.tex'
    init_specs(this); init_fonts(this); init_eqtb(this); init_prim(this); fix_date_and_time(this)
    // §1337 Get the first line of input and prepare to start; init_terminal reads the command line
    this.first = 1
    for (let k = 0; k < name.length; k++) this.buffer[this.first + k] = name.charCodeAt(k)
    this.last = this.first + name.length; this.cur_input.loc = this.first
    this.cur_input.limit = this.last; this.first = this.last + 1
    this.buffer[this.cur_input.limit] = this.equiv[int_base + end_line_char_code]!
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
        try { overflow(this, 'expansion depth', expand_depth) } catch (y) { if (!(y instanceof JumpOut)) throw y }
      } else if (!(x instanceof JumpOut)) throw x
    }
    close_files_and_terminate(this)
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
  if (c === 1) fatal_error(e, 'unsupported: \\dump')
}

// §1333 close_files_and_terminate
function close_files_and_terminate(e: Engine): void {
  e.equiv[int_base + new_line_char_code] = -1
  if (e.equiv[int_base + tracing_stats_code]! > 0 && e.log_opened) { // §1334 Output statistics about this job
    // shortcut: no string pool, mem or font arrays, so strings/pool/memory are this engine's own counts against TeX Live's sizes
    e.log += ` \nHere is how much of TeX's memory you used:\n 0 strings out of 500000\n 0 string characters out of 6250000\n`
      + ` ${e.mem_end + 1} words of memory out of 5000000\n ${e.cs_count} multiletter control sequences out of ${hash_size - hash_extra}+${hash_extra}\n`
      + ` ${e.fmem_ptr} words of font info for ${e.font_ptr} font${e.font_ptr !== 1 ? 's' : ''}, out of 8000000 for 9000\n 0 hyphenation exceptions out of 8191\n`
      + ` ${e.max_in_stack}i,${e.max_nest_stack}n,${e.max_param_stack}p,${e.max_buf_stack + 1}b,${e.max_save_stack + 6}s stack positions out of `
      + `${stack_size}i,1000n,${param_size}p,${buf_size}b,${save_size}s\n`
  }
  if (e.fixed_pdfoutput === null) e.fixed_pdfoutput = e.equiv[int_base + pdf_output_code]! // pdftex: fix_pdfoutput
  if (e.fixed_pdfoutput > 0) { // no page can be shipped in PDF mode yet
    if (e.history === fatal_error_stop) print_err(e, ' ==> Fatal error occurred, no output PDF file produced!')
    else { // Finish the PDF file, total_pages=0
      print_nl(e, 'No pages of output.')
      if (e.log_opened) e.log += '\nPDF statistics:\n 0 PDF objects out of 1000 (max. 8388607)\n 0 named destinations out of 1000 (max. 500000)\n'
        + ' 1 words of extra memory for PDF output out of 10000 (max. 10000000)\n'
    }
  } else finish_dvi_file(e) // §642
  if (e.log_opened) { e.log += '\n'; e.selector -= 2 }
}
