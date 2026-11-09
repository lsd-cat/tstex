// §207–210 command codes, §211 modes, §300 input state record

// §207 catcode commands, §208 ordinary commands, §209 assignment commands, §210 expandable commands
// (pdftex.web numbering: letterspace_font and pdf_copy_font raise max_command to 102, partoken-102.ch to 103)
// a class instance, not an object literal: V8 keeps a literal of more than 128 properties in dictionary mode, which made
// every Cmd.x a hash lookup on the hot path (get_next's comparisons)
export const Cmd = new class {
  readonly relax = 0; readonly escape = 0; readonly left_brace = 1; readonly right_brace = 2; readonly math_shift = 3; readonly tab_mark = 4;
  readonly car_ret = 5; readonly out_param = 5; readonly mac_param = 6; readonly sup_mark = 7; readonly sub_mark = 8; readonly ignore = 9; readonly endv = 9;
  readonly spacer = 10; readonly letter = 11; readonly other_char = 12; readonly active_char = 13; readonly par_end = 13; readonly match = 13;
  readonly comment = 14; readonly end_match = 14; readonly stop = 14; readonly invalid_char = 15; readonly delim_num = 15; readonly max_char_code = 15;
  readonly char_num = 16; readonly math_char_num = 17; readonly mark = 18; readonly xray = 19; readonly make_box = 20; readonly hmove = 21; readonly vmove = 22;
  readonly un_hbox = 23; readonly un_vbox = 24; readonly remove_item = 25; readonly hskip = 26; readonly vskip = 27; readonly mskip = 28; readonly kern = 29;
  readonly mkern = 30; readonly leader_ship = 31; readonly halign = 32; readonly valign = 33; readonly no_align = 34; readonly vrule = 35; readonly hrule = 36;
  readonly insert = 37; readonly vadjust = 38; readonly ignore_spaces = 39; readonly after_assignment = 40; readonly after_group = 41;
  readonly break_penalty = 42; readonly start_par = 43; readonly ital_corr = 44; readonly accent = 45; readonly math_accent = 46;
  readonly discretionary = 47; readonly eq_no = 48; readonly left_right = 49; readonly math_comp = 50; readonly limit_switch = 51; readonly above = 52;
  readonly math_style = 53; readonly math_choice = 54; readonly non_script = 55; readonly vcenter = 56; readonly case_shift = 57; readonly message = 58;
  readonly extension = 59; readonly in_stream = 60; readonly begin_group = 61; readonly end_group = 62; readonly omit = 63; readonly ex_space = 64;
  readonly no_boundary = 65; readonly radical = 66; readonly end_cs_name = 67; readonly min_internal = 68; readonly char_given = 68;
  readonly math_given = 69; readonly last_item = 70; readonly max_non_prefixed_command = 70;
  readonly toks_register = 71; readonly assign_toks = 72; readonly assign_int = 73; readonly assign_dimen = 74; readonly assign_glue = 75;
  readonly assign_mu_glue = 76; readonly assign_font_dimen = 77; readonly assign_font_int = 78; readonly set_aux = 79;
  readonly set_prev_graf = 80; readonly set_page_dimen = 81; readonly set_page_int = 82; readonly set_box_dimen = 83; readonly set_shape = 84;
  readonly def_code = 85; readonly def_family = 86; readonly set_font = 87; readonly def_font = 88; readonly register = 89; readonly max_internal = 89;
  readonly advance = 90; readonly multiply = 91; readonly divide = 92; readonly prefix = 93; readonly let = 94; readonly shorthand_def = 95;
  readonly read_to_cs = 96; readonly def = 97; readonly set_box = 98; readonly hyph_data = 99; readonly set_interaction = 100; readonly letterspace_font = 101;
  readonly pdf_copy_font = 102; readonly partoken_name = 103; readonly max_command = 103; // partoken-102.ch
  readonly undefined_cs = 104; readonly expand_after = 105; readonly no_expand = 106; readonly input = 107; readonly if_test = 108;
  readonly fi_or_else = 109; readonly cs_name = 110; readonly convert = 111; readonly the = 112; readonly top_bot_mark = 113; readonly call = 114;
  readonly long_call = 115; readonly outer_call = 116; readonly long_outer_call = 117; readonly end_template = 118; readonly dont_expand = 119;
  readonly glue_ref = 120; readonly shape_ref = 121; readonly box_ref = 122; readonly data = 123;
}()

// §211
export const vmode = 1
export const hmode = vmode + Cmd.max_command + 1
export const mmode = hmode + Cmd.max_command + 1

// §300 in_state_record; |name| is a string number in TeX: 0..17 terminal/\read,
// >17 a file (we store 20 and keep the file in |input_file[index]|), or an eqtb pointer for macros
// synctex-def.ch0: synctex_tag, the SyncTeX tag of the file this level reads (0 for the terminal, \read and pseudo files)
export type InState = { state: number, index: number, start: number, loc: number, limit: number, name: number, synctex_tag: number }

// §410 value levels
export const int_val = 0, dimen_val = 1, glue_val = 2, mu_val = 3, ident_val = 4, tok_val = 5

// §73 interaction, §76 history
export const batch_mode = 0, nonstop_mode = 1, scroll_mode = 2, error_stop_mode = 3
export const spotless = 0, warning_issued = 1, error_message_issued = 2, fatal_error_stop = 3

// §54 selector settings
export const no_print = 16, term_only = 17, log_only = 18, term_and_log = 19, pseudo = 20, new_string = 21

// §11 (pdftex/TeX Live values)

// §289 token constants
export const cs_token_flag = 0o7777
export const left_brace_token = 0o400, left_brace_limit = 0o1000, right_brace_token = 0o1000,
  right_brace_limit = 0o1400, math_shift_token = 0o1400, tab_token = 0o2000, out_param_token = 0o2400,
  space_token = 0o5040, letter_token = 0o5400, other_token = 0o6000, match_token = 0o6400,
  end_match_token = 0o7000, protected_token = 0o7001 // etex.ch

// §221–247 eqtb layout
export const level_zero = 0, level_one = 1

// §222 region 1 and 2; hash_size is tex.ch's 15000 plus TeX Live's hash_extra=600000 in one block
export const active_base = 1
export const single_base = active_base + 256
export const null_cs = single_base + 256
export const hash_base = null_cs + 1
export const hash_extra = 600000, hash_size = 15000 + hash_extra
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
export const frozen_special = frozen_control_sequence + 10 // tex.ch: source specials (unused)
export const frozen_primitive = frozen_control_sequence + 11 // pdftex.web: permanent \pdfprimitive
export const prim_eqtb_base = frozen_primitive + 1, prim_size = 2100 // pdftex.web: the primitives' permanent eqtb copies
export const frozen_null_font = prim_eqtb_base + prim_size // pdftex.ch
export const font_id_base = frozen_null_font
export const undefined_control_sequence = frozen_null_font + 9000 + 1 // tex.ch: max_font_max+1
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
export const tex_toks = local_base + 10 // pdftex: \pdfpagesattr \pdfpageattr \pdfpageresources \pdfpkmode
export const every_eof_loc = tex_toks + 4 // e-TeX
export const toks_base = every_eof_loc + 1
export const etex_pen_base = toks_base + 256 // e-TeX \interlinepenalties etc.
export const box_base = etex_pen_base + 4
export const cur_font_loc = box_base + 256
export const math_font_base = cur_font_loc + 4 // enctex1.ch: xord_code_base, xchr_code_base, xprn_code_base sit between
export const cat_code_base = math_font_base + 48
export const lc_code_base = cat_code_base + 256
export const uc_code_base = lc_code_base + 256
export const sf_code_base = uc_code_base + 256
export const math_code_base = sf_code_base + 256
export const int_base = math_code_base + 256
// §236 region 5: TeX's 55, web2c's 10 (tex.ch, tracingstacklevels.ch, partoken.ch, showstream.ch, enctex-pdftex.ch), pdfTeX's 37, e-TeX's 10, one e-TeX state, synctex's 1 (synctex-e-mem.ch1)
export const int_pars = 114
export const count_base = int_base + int_pars
export const del_code_base = count_base + 256
export const dimen_base = del_code_base + 256
// §247 region 6: TeX's 21 and pdfTeX's 13
export const dimen_pars = 34
export const scaled_base = dimen_base + dimen_pars
export const eqtb_size = scaled_base + 255

// §236 integer parameter codes used by the program
export const mag_code = 17, time_code = 20, day_code = 21, month_code = 22, year_code = 23,
  pausing_code = 28, tracing_online_code = 29, tracing_macros_code = 30, tracing_commands_code = 36,
  tracing_restores_code = 37, max_dead_cycles_code = 40, hang_after_code = 41, global_defs_code = 43,
  escape_char_code = 45, end_line_char_code = 48, new_line_char_code = 49, error_context_lines_code = 54,
  tolerance_code = 1, looseness_code = 19, tracing_stats_code = 31, pdf_output_code = 65,
  tracing_stack_levels_code = 58, partoken_context_code = 59, show_stream_code = 60, synctex_code = 113
// §247
export const hang_indent_code = 17

// §237 print_param's case list (pdftex.web and etex.ch included), indexed by code
export const int_par_names = ['pretolerance', 'tolerance', 'linepenalty', 'hyphenpenalty', 'exhyphenpenalty', 'clubpenalty', 'widowpenalty', 'displaywidowpenalty', 'brokenpenalty', 'binoppenalty', 'relpenalty', 'predisplaypenalty', 'postdisplaypenalty', 'interlinepenalty', 'doublehyphendemerits', 'finalhyphendemerits', 'adjdemerits', 'mag', 'delimiterfactor', 'looseness', 'time', 'day', 'month', 'year', 'showboxbreadth', 'showboxdepth', 'hbadness', 'vbadness', 'pausing', 'tracingonline', 'tracingmacros', 'tracingstats', 'tracingparagraphs', 'tracingpages', 'tracingoutput', 'tracinglostchars', 'tracingcommands', 'tracingrestores', 'uchyph', 'outputpenalty', 'maxdeadcycles', 'hangafter', 'floatingpenalty', 'globaldefs', 'fam', 'escapechar', 'defaulthyphenchar', 'defaultskewchar', 'endlinechar', 'newlinechar', 'language', 'lefthyphenmin', 'righthyphenmin', 'holdinginserts', 'errorcontextlines',
  'charsubdefmin', 'charsubdefmax', 'tracingcharsubdef', 'tracingstacklevels', 'partokencontext', 'showstream', 'mubytein', 'mubyteout', 'mubytelog', 'specialout',
  'pdfoutput', 'pdfcompresslevel', 'pdfdecimaldigits', 'pdfmovechars', 'pdfimageresolution', 'pdfpkresolution', 'pdfuniqueresname', 'pdfoptionalwaysusepdfpagebox', 'pdfoptionpdfinclusionerrorlevel', 'pdfmajorversion', 'pdfminorversion', 'pdfforcepagebox', 'pdfpagebox', 'pdfinclusionerrorlevel', 'pdfgamma', 'pdfimagegamma', 'pdfimagehicolor', 'pdfimageapplygamma', 'pdfadjustspacing', 'pdfprotrudechars', 'pdftracingfonts', 'pdfobjcompresslevel', 'pdfadjustinterwordglue', 'pdfprependkern', 'pdfappendkern', 'pdfgentounicode', 'pdfdraftmode', 'pdfinclusioncopyfonts', 'pdfsuppresswarningdupdest', 'pdfsuppresswarningdupmap', 'pdfsuppresswarningpagegroup', 'pdfinfoomitdate', 'pdfsuppressptexinfo', 'pdfomitcharset', 'pdfomitinfodict', 'pdfomitprocset', 'pdfptexuseunderscore',
  'tracingassigns', 'tracinggroups', 'tracingifs', 'tracingscantokens', 'tracingnesting', 'predisplaydirection', 'lastlinefit', 'savingvdiscards', 'savinghyphcodes', 'ignoreprimitiveerror', 'TeXXeTstate', 'synctex']
// §247 print_length_param's case list, indexed by code
export const dimen_par_names = ['parindent', 'mathsurround', 'lineskiplimit', 'hsize', 'vsize', 'maxdepth', 'splitmaxdepth', 'boxmaxdepth', 'hfuzz', 'vfuzz', 'delimitershortfall', 'nulldelimiterspace', 'scriptspace', 'predisplaysize', 'displaywidth', 'displayindent', 'overfullrule', 'hangindent', 'hoffset', 'voffset', 'emergencystretch',
  'pdfhorigin', 'pdfvorigin', 'pdfpagewidth', 'pdfpageheight', 'pdflinkmargin', 'pdfdestmargin', 'pdfthreadmargin', 'pdffirstlineheight', 'pdflastlinedepth', 'pdfeachlineheight', 'pdfeachlinedepth', 'pdfignoreddimen', 'pdfpxdimen']
// §225 print_skip_param's case list, indexed by code
export const glue_par_names = ['lineskip', 'baselineskip', 'parskip', 'abovedisplayskip', 'belowdisplayskip', 'abovedisplayshortskip', 'belowdisplayshortskip', 'leftskip', 'rightskip', 'topskip', 'splittopskip', 'tabskip', 'spaceskip', 'xspaceskip', 'parfillskip', 'thinmuskip', 'medmuskip', 'thickmuskip']
export const thin_mu_skip_code = 15
// §231 the token list parameters, indexed by location-local_base
export const toks_par_names = ['', 'output', 'everypar', 'everymath', 'everydisplay', 'everyhbox', 'everyvbox', 'everyjob', 'everycr', 'errhelp', 'pdfpagesattr', 'pdfpageattr', 'pdfpageresources', 'pdfpkmode', 'everyeof']

