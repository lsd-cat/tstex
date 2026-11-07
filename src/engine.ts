// §1330–1337 the main program; the Engine owns every TeX global
import type { TexFS } from './platform/fs.ts'
import { Cmd, vmode, batch_mode, fatal_error_stop, spotless, no_print, term_only, int_val, warning_issued, error_stop_mode, term_and_log } from './types.ts'
import type { InState } from './types.ts'
import { print, print_nl, print_char, print_esc, print_int } from './print.ts'
import { JumpOut, fatal_error, token_list } from './error.ts'
import { init_eqtb, fix_date_and_time, eqtb_size, int_base, new_line_char_code, end_line_char_code, cat_code_base, level_one } from './eqtb.ts'
import { init_prim } from './primitives/index.ts'
import { new_line, end_token_list, end_file_reading, normal } from './input.ts'
import type { InputFile } from './input.ts'
import { init_specs } from './nodes.ts'
import type { GlueSpec } from './nodes.ts'
import type { CondNode } from './conditional.ts'
import { open_log_file, start_input } from './files.ts'
import { main_control } from './main.ts'

export class Engine {
  fs: TexFS
  log = ''
  // §54 printing
  selector = term_only; tally = 0; term_offset = 0; file_offset = 0
  trick_buf: number[] = []; trick_count = 0; first_count = 0; dig: number[] = []; old_setting = 0
  cur_str: number[] = [] // the string being built while selector=new_string
  // §73–96 errors
  interaction = batch_mode; deletions_allowed = true; history = fatal_error_stop; error_count = 0
  help_line: string[] = []; help_ptr = 0; OK_to_interrupt = true
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
  // §213 semantic nest (only the mode exists so far)
  mode = vmode; shown_mode = 0
  // §297
  cur_cmd = 0; cur_chr = 0; cur_cs = 0; cur_tok = 0
  // §301–310 input stacks
  input_stack: InState[] = []; input_ptr = 0; max_in_stack = 0
  cur_input: InState = { state: new_line, index: 0, start: 1, loc: 0, limit: 0, name: 0 }
  in_open = 0; open_parens = 0; input_file: InputFile[] = []; line = 0; line_stack: number[] = []
  scanner_status = normal; warning_index = 0; def_ref = 0
  param_stack: number[] = []; param_ptr = 0; max_param_stack = 0; align_state = 1000000; base_ptr = 0
  par_loc = 0; par_token = 0; force_eof = false
  buffer: number[] = []; first = 0; last = 0
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
  // §246
  sys_time = 0; sys_day = 0; sys_month = 0; sys_year = 0

  constructor(opts: { fs: TexFS }) { this.fs = opts.fs }

  // §1332 the main program, as `pdftex -ini -interaction=batchmode <jobname>.tex`
  async run(opts: { jobname: string, mode: 'ini' | 'etex' | 'latex' }): Promise<void> {
    if (opts.mode !== 'ini') throw new Error(`unsupported mode: ${opts.mode}`)
    const name = opts.jobname + '.tex'
    const data = this.fs.find(name, 'tex')
    if (data === null) throw new Error(`file not found: ${name}`) // shortcut: TeX would prompt_file_name and stop with a fatal error
    init_specs(this); init_eqtb(this); init_prim(this); fix_date_and_time(this)
    // §1337 Get the first line of input and prepare to start; init_terminal reads the command line
    this.first = 1
    for (let k = 0; k < name.length; k++) this.buffer[this.first + k] = name.charCodeAt(k)
    this.last = this.first + name.length; this.cur_input.loc = this.first
    this.cur_input.limit = this.last; this.first = this.last + 1
    this.buffer[this.cur_input.limit] = this.equiv[int_base + end_line_char_code]!
    this.selector = this.interaction === batch_mode ? no_print : term_only
    try {
      if (this.cur_input.loc < this.cur_input.limit && this.equiv[cat_code_base + this.buffer[this.cur_input.loc]!] !== Cmd.escape) {
        this.cur_input.loc = this.cur_input.limit + 1 // scan_file_name has consumed the line
        start_input(this, name, data)
      }
      this.history = spotless
      main_control(this)
      final_cleanup(this)
    } catch (x) {
      if (!(x instanceof JumpOut)) throw x
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
  // §642 Finish the DVI file (no pages can exist yet)
  print_nl(e, 'No pages of output.')
  if (e.log_opened) { e.log += '\n'; e.selector -= 2 }
}
