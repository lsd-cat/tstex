// §207–210 command codes, §211 modes, §300 input state record

// §207 catcode commands, §208 ordinary commands, §209 assignment commands, §210 expandable commands
export const Cmd = {
  relax: 0, escape: 0, left_brace: 1, right_brace: 2, math_shift: 3, tab_mark: 4,
  car_ret: 5, out_param: 5, mac_param: 6, sup_mark: 7, sub_mark: 8, ignore: 9, endv: 9,
  spacer: 10, letter: 11, other_char: 12, active_char: 13, par_end: 13, match: 13,
  comment: 14, end_match: 14, stop: 14, invalid_char: 15, delim_num: 15, max_char_code: 15,
  char_num: 16, math_char_num: 17, mark: 18, xray: 19, make_box: 20, hmove: 21, vmove: 22,
  un_hbox: 23, un_vbox: 24, remove_item: 25, hskip: 26, vskip: 27, mskip: 28, kern: 29,
  mkern: 30, leader_ship: 31, halign: 32, valign: 33, no_align: 34, vrule: 35, hrule: 36,
  insert: 37, vadjust: 38, ignore_spaces: 39, after_assignment: 40, after_group: 41,
  break_penalty: 42, start_par: 43, ital_corr: 44, accent: 45, math_accent: 46,
  discretionary: 47, eq_no: 48, left_right: 49, math_comp: 50, limit_switch: 51, above: 52,
  math_style: 53, math_choice: 54, non_script: 55, vcenter: 56, case_shift: 57, message: 58,
  extension: 59, in_stream: 60, begin_group: 61, end_group: 62, omit: 63, ex_space: 64,
  no_boundary: 65, radical: 66, end_cs_name: 67, min_internal: 68, char_given: 68,
  math_given: 69, last_item: 70, max_non_prefixed_command: 70,
  toks_register: 71, assign_toks: 72, assign_int: 73, assign_dimen: 74, assign_glue: 75,
  assign_mu_glue: 76, assign_font_dimen: 77, assign_font_int: 78, set_aux: 79,
  set_prev_graf: 80, set_page_dimen: 81, set_page_int: 82, set_box_dimen: 83, set_shape: 84,
  def_code: 85, def_family: 86, set_font: 87, def_font: 88, register: 89, max_internal: 89,
  advance: 90, multiply: 91, divide: 92, prefix: 93, let: 94, shorthand_def: 95,
  read_to_cs: 96, def: 97, set_box: 98, hyph_data: 99, set_interaction: 100, max_command: 100,
  undefined_cs: 101, expand_after: 102, no_expand: 103, input: 104, if_test: 105,
  fi_or_else: 106, cs_name: 107, convert: 108, the: 109, top_bot_mark: 110, call: 111,
  long_call: 112, outer_call: 113, long_outer_call: 114, end_template: 115, dont_expand: 116,
  glue_ref: 117, shape_ref: 118, box_ref: 119, data: 120,
} as const

// §211
export const vmode = 1
export const hmode = vmode + Cmd.max_command + 1
export const mmode = hmode + Cmd.max_command + 1

// §300 in_state_record; |name| is a string number in TeX: 0..17 terminal/\read,
// >17 a file (we store 20 and keep the file in |input_file[index]|), or an eqtb pointer for macros
export type InState = { state: number, index: number, start: number, loc: number, limit: number, name: number }

// §410 value levels
export const int_val = 0, dimen_val = 1, glue_val = 2, mu_val = 3, ident_val = 4, tok_val = 5

// §73 interaction, §76 history
export const batch_mode = 0, nonstop_mode = 1, scroll_mode = 2, error_stop_mode = 3
export const spotless = 0, warning_issued = 1, error_message_issued = 2, fatal_error_stop = 3

// §54 selector settings
export const no_print = 16, term_only = 17, log_only = 18, term_and_log = 19, pseudo = 20, new_string = 21

// §11 (pdftex/TeX Live values)
export const max_print_line = 79, error_line = 79, half_error_line = 50

// §289 token constants
export const cs_token_flag = 0o7777
export const left_brace_token = 0o400, left_brace_limit = 0o1000, right_brace_token = 0o1000,
  right_brace_limit = 0o1400, math_shift_token = 0o1400, tab_token = 0o2000, out_param_token = 0o2400,
  space_token = 0o5040, letter_token = 0o5400, other_token = 0o6000, match_token = 0o6400,
  end_match_token = 0o7000

// §221–247 eqtb layout
export const level_zero = 0, level_one = 1

// §222 region 1 and 2; hash_size is tex.ch's 15000 plus TeX Live's hash_extra=600000 in one block
export const active_base = 1
export const single_base = active_base + 256
export const null_cs = single_base + 256
export const hash_base = null_cs + 1
export const hash_size = 615000
export const frozen_control_sequence = hash_base + hash_size
export const frozen_protection = frozen_control_sequence
export const frozen_cr = frozen_control_sequence + 1
export const frozen_end_group = frozen_control_sequence + 2
export const frozen_right = frozen_control_sequence + 3
export const frozen_fi = frozen_control_sequence + 4
export const frozen_end_template = frozen_control_sequence + 5
export const frozen_endv = frozen_control_sequence + 6
export const frozen_relax = frozen_control_sequence + 7
export const end_write = frozen_control_sequence + 8
export const frozen_dont_expand = frozen_control_sequence + 9
export const frozen_null_font = frozen_control_sequence + 10
export const font_id_base = frozen_null_font
export const undefined_control_sequence = frozen_null_font + 257
// §224 region 3
export const glue_base = undefined_control_sequence + 1
export const glue_pars = 18
export const skip_base = glue_base + glue_pars
export const mu_skip_base = skip_base + 256
export const local_base = mu_skip_base + 256
// §230 region 4
export const par_shape_loc = local_base
export const output_routine_loc = local_base + 1
export const every_par_loc = local_base + 2
export const every_job_loc = local_base + 7
export const err_help_loc = local_base + 9
export const toks_base = local_base + 10
export const box_base = toks_base + 256
export const cur_font_loc = box_base + 256
export const math_font_base = cur_font_loc + 1
export const cat_code_base = math_font_base + 48
export const lc_code_base = cat_code_base + 256
export const uc_code_base = lc_code_base + 256
export const sf_code_base = uc_code_base + 256
export const math_code_base = sf_code_base + 256
export const int_base = math_code_base + 256
// §236 region 5
export const int_pars = 55
export const count_base = int_base + int_pars
export const del_code_base = count_base + 256
export const dimen_base = del_code_base + 256
// §247 region 6
export const dimen_pars = 21
export const scaled_base = dimen_base + dimen_pars
export const eqtb_size = scaled_base + 255

// §236 integer parameter codes used by the program
export const mag_code = 17, time_code = 20, day_code = 21, month_code = 22, year_code = 23,
  pausing_code = 28, tracing_online_code = 29, tracing_macros_code = 30, tracing_commands_code = 36,
  tracing_restores_code = 37, max_dead_cycles_code = 40, hang_after_code = 41, global_defs_code = 43,
  escape_char_code = 45, end_line_char_code = 48, new_line_char_code = 49, error_context_lines_code = 54,
  tolerance_code = 1, looseness_code = 19
// §247
export const hang_indent_code = 17

// §236–237 the names of the integer parameters, indexed by code (print_param's case list)
export const int_par_names = ['pretolerance', 'tolerance', 'linepenalty', 'hyphenpenalty',
  'exhyphenpenalty', 'clubpenalty', 'widowpenalty', 'displaywidowpenalty', 'brokenpenalty',
  'binoppenalty', 'relpenalty', 'predisplaypenalty', 'postdisplaypenalty', 'interlinepenalty',
  'doublehyphendemerits', 'finalhyphendemerits', 'adjdemerits', 'mag', 'delimiterfactor',
  'looseness', 'time', 'day', 'month', 'year', 'showboxbreadth', 'showboxdepth', 'hbadness',
  'vbadness', 'pausing', 'tracingonline', 'tracingmacros', 'tracingstats', 'tracingparagraphs',
  'tracingpages', 'tracingoutput', 'tracinglostchars', 'tracingcommands', 'tracingrestores',
  'uchyph', 'outputpenalty', 'maxdeadcycles', 'hangafter', 'floatingpenalty', 'globaldefs', 'fam',
  'escapechar', 'defaulthyphenchar', 'defaultskewchar', 'endlinechar', 'newlinechar', 'language',
  'lefthyphenmin', 'righthyphenmin', 'holdinginserts', 'errorcontextlines']

