// Every TeX82, e-TeX and pdfTeX primitive whose command code has no file yet (§226–1344, etex.ch, pdftex.web).
// print gives print_cmd_chr's text (the escaped name); main_control, expand and prefixed_command call
// unsupported() for a command without run/assign, which stops with "unsupported: \name".
import type { Engine } from '../engine.ts'
import { Cmd, vmode, hmode, par_shape_loc, math_font_base, etex_pen_base } from '../types.ts'
import { print_esc } from '../print.ts'
import type { Prim } from './index.ts'

const vtop_code = 4
// [name, cmd, chr, 1 if e-TeX mode only, 2 if print-only]
const table: [string, number, number, number?][] = [
  [' ', Cmd.ex_space, 0], ['/', Cmd.ital_corr, 0], ['accent', Cmd.accent, 0], ['char', Cmd.char_num, 0],
  ['csname', Cmd.cs_name, 0], ['delimiter', Cmd.delim_num, 0], ['endcsname', Cmd.end_cs_name, 0],
  ['font', Cmd.def_font, 0], ['letterspacefont', Cmd.letterspace_font, 0], ['pdfcopyfont', Cmd.pdf_copy_font, 0],
  ['fontdimen', Cmd.assign_font_dimen, 0], ['halign', Cmd.halign, 0], ['hrule', Cmd.hrule, 0],
  ['ignorespaces', Cmd.ignore_spaces, 0], ['insert', Cmd.insert, 0], ['mark', Cmd.mark, 0],
  ['mathaccent', Cmd.math_accent, 0], ['mathchar', Cmd.math_char_num, 0], ['mathchoice', Cmd.math_choice, 0],
  ['noalign', Cmd.no_align, 0], ['noboundary', Cmd.no_boundary, 0], ['noexpand', Cmd.no_expand, 0],
  ['pdfprimitive', Cmd.no_expand, 1], ['nonscript', Cmd.non_script, 0], ['omit', Cmd.omit, 0],
  ['parshape', Cmd.set_shape, par_shape_loc], ['penalty', Cmd.break_penalty, 0], ['prevgraf', Cmd.set_prev_graf, 0],
  ['radical', Cmd.radical, 0], ['read', Cmd.read_to_cs, 0], ['setbox', Cmd.set_box, 0], ['vadjust', Cmd.vadjust, 0],
  ['valign', Cmd.valign, 0], ['vcenter', Cmd.vcenter, 0], ['vrule', Cmd.vrule, 0], ['input', Cmd.input, 0],
  ['endinput', Cmd.input, 1], ['topmark', Cmd.top_bot_mark, 0], ['firstmark', Cmd.top_bot_mark, 1],
  ['botmark', Cmd.top_bot_mark, 2], ['splitfirstmark', Cmd.top_bot_mark, 3], ['splitbotmark', Cmd.top_bot_mark, 4],
  ['spacefactor', Cmd.set_aux, hmode], ['prevdepth', Cmd.set_aux, vmode], ['deadcycles', Cmd.set_page_int, 0],
  ['insertpenalties', Cmd.set_page_int, 1], ['wd', Cmd.set_box_dimen, 1], ['ht', Cmd.set_box_dimen, 3],
  ['dp', Cmd.set_box_dimen, 2], ['span', Cmd.tab_mark, 256], ['cr', Cmd.car_ret, 257], ['crcr', Cmd.car_ret, 258],
  ['pagegoal', Cmd.set_page_dimen, 0], ['pagetotal', Cmd.set_page_dimen, 1], ['pagestretch', Cmd.set_page_dimen, 2],
  ['pagefilstretch', Cmd.set_page_dimen, 3], ['pagefillstretch', Cmd.set_page_dimen, 4],
  ['pagefilllstretch', Cmd.set_page_dimen, 5], ['pageshrink', Cmd.set_page_dimen, 6], ['pagedepth', Cmd.set_page_dimen, 7],
  ['hskip', Cmd.hskip, 4], ['hfil', Cmd.hskip, 0], ['hfill', Cmd.hskip, 1], ['hss', Cmd.hskip, 2],
  ['hfilneg', Cmd.hskip, 3], ['vskip', Cmd.vskip, 4], ['vfil', Cmd.vskip, 0], ['vfill', Cmd.vskip, 1],
  ['vss', Cmd.vskip, 2], ['vfilneg', Cmd.vskip, 3], ['mskip', Cmd.mskip, 5], ['kern', Cmd.kern, 1],
  ['mkern', Cmd.mkern, 99], ['moveleft', Cmd.hmove, 1], ['moveright', Cmd.hmove, 0], ['raise', Cmd.vmove, 1],
  ['lower', Cmd.vmove, 0], ['box', Cmd.make_box, 0], ['copy', Cmd.make_box, 1], ['lastbox', Cmd.make_box, 2],
  ['vsplit', Cmd.make_box, 3], ['vtop', Cmd.make_box, 4], ['vbox', Cmd.make_box, vtop_code + vmode],
  ['hbox', Cmd.make_box, vtop_code + hmode], ['shipout', Cmd.leader_ship, 99], ['leaders', Cmd.leader_ship, 100],
  ['cleaders', Cmd.leader_ship, 101], ['xleaders', Cmd.leader_ship, 102], ['indent', Cmd.start_par, 1],
  ['noindent', Cmd.start_par, 0], ['quitvmode', Cmd.start_par, 2], ['unpenalty', Cmd.remove_item, 12],
  ['unkern', Cmd.remove_item, 11], ['unskip', Cmd.remove_item, 10], ['unhbox', Cmd.un_hbox, 0],
  ['unhcopy', Cmd.un_hbox, 1], ['unvbox', Cmd.un_vbox, 0], ['unvcopy', Cmd.un_vbox, 1], ['-', Cmd.discretionary, 1],
  ['discretionary', Cmd.discretionary, 0], ['eqno', Cmd.eq_no, 0], ['leqno', Cmd.eq_no, 1], ['mathord', Cmd.math_comp, 16],
  ['mathop', Cmd.math_comp, 17], ['mathbin', Cmd.math_comp, 18], ['mathrel', Cmd.math_comp, 19],
  ['mathopen', Cmd.math_comp, 20], ['mathclose', Cmd.math_comp, 21], ['mathpunct', Cmd.math_comp, 22],
  ['mathinner', Cmd.math_comp, 23], ['underline', Cmd.math_comp, 26], ['overline', Cmd.math_comp, 27],
  ['displaylimits', Cmd.limit_switch, 0], ['limits', Cmd.limit_switch, 1], ['nolimits', Cmd.limit_switch, 2],
  ['displaystyle', Cmd.math_style, 0], ['textstyle', Cmd.math_style, 2], ['scriptstyle', Cmd.math_style, 4],
  ['scriptscriptstyle', Cmd.math_style, 6], ['above', Cmd.above, 0], ['over', Cmd.above, 1], ['atop', Cmd.above, 2],
  ['abovewithdelims', Cmd.above, 3], ['overwithdelims', Cmd.above, 4], ['atopwithdelims', Cmd.above, 5],
  ['left', Cmd.left_right, 30], ['right', Cmd.left_right, 31], ['textfont', Cmd.def_family, math_font_base],
  ['scriptfont', Cmd.def_family, math_font_base + 16], ['scriptscriptfont', Cmd.def_family, math_font_base + 32],
  ['hyphenation', Cmd.hyph_data, 0], ['patterns', Cmd.hyph_data, 1], ['hyphenchar', Cmd.assign_font_int, 0],
  ['skewchar', Cmd.assign_font_int, 1], ['lpcode', Cmd.assign_font_int, 2], ['rpcode', Cmd.assign_font_int, 3],
  ['efcode', Cmd.assign_font_int, 4], ['tagcode', Cmd.assign_font_int, 5], ['knbscode', Cmd.assign_font_int, 7],
  ['stbscode', Cmd.assign_font_int, 8], ['shbscode', Cmd.assign_font_int, 9], ['knbccode', Cmd.assign_font_int, 10],
  ['knaccode', Cmd.assign_font_int, 11], ['pdfnoligatures', Cmd.assign_font_int, 6], ['batchmode', Cmd.set_interaction, 0],
  ['nonstopmode', Cmd.set_interaction, 1], ['scrollmode', Cmd.set_interaction, 2],
  ['errorstopmode', Cmd.set_interaction, 3], ['openin', Cmd.in_stream, 1], ['closein', Cmd.in_stream, 0],
  ['openout', Cmd.extension, 0], ['write', Cmd.extension, 1], ['closeout', Cmd.extension, 2],
  ['special', Cmd.extension, 3], ['immediate', Cmd.extension, 5], ['setlanguage', Cmd.extension, 6],
  ['pdfliteral', Cmd.extension, 7], ['pdfcolorstack', Cmd.extension, 40], ['pdfsetmatrix', Cmd.extension, 41],
  ['pdfsave', Cmd.extension, 42], ['pdfrestore', Cmd.extension, 43], ['pdfobj', Cmd.extension, 9],
  ['pdfrefobj', Cmd.extension, 10], ['pdfxform', Cmd.extension, 11], ['pdfrefxform', Cmd.extension, 12],
  ['pdfximage', Cmd.extension, 13], ['pdfrefximage', Cmd.extension, 14], ['pdfannot', Cmd.extension, 15],
  ['pdfstartlink', Cmd.extension, 16], ['pdfendlink', Cmd.extension, 17], ['pdfoutline', Cmd.extension, 18],
  ['pdfdest', Cmd.extension, 19], ['pdfthread', Cmd.extension, 20], ['pdfstartthread', Cmd.extension, 21],
  ['pdfendthread', Cmd.extension, 22], ['pdfsavepos', Cmd.extension, 23], ['pdfsnaprefpoint', Cmd.extension, 36],
  ['pdfsnapy', Cmd.extension, 37], ['pdfsnapycomp', Cmd.extension, 38], ['pdfinfo', Cmd.extension, 24],
  ['pdfcatalog', Cmd.extension, 25], ['pdfnames', Cmd.extension, 26], ['pdfincludechars', Cmd.extension, 28],
  ['pdffontattr', Cmd.extension, 27], ['pdfmapfile', Cmd.extension, 29], ['pdfmapline', Cmd.extension, 30],
  ['pdftrailer', Cmd.extension, 31], ['pdftrailerid', Cmd.extension, 32], ['pdfresettimer', Cmd.extension, 33],
  ['pdfsetrandomseed', Cmd.extension, 35], ['pdffontexpand', Cmd.extension, 34], ['pdfglyphtounicode', Cmd.extension, 39],
  ['pdfnobuiltintounicode', Cmd.extension, 44], ['pdfinterwordspaceon', Cmd.extension, 45],
  ['pdfinterwordspaceoff', Cmd.extension, 46], ['pdffakespace', Cmd.extension, 47],
  ['pdfrunninglinkoff', Cmd.extension, 48], ['pdfrunninglinkon', Cmd.extension, 49], ['pdfspacefont', Cmd.extension, 50],
  ['interactionmode', Cmd.set_page_int, 2, 1], ['middle', Cmd.left_right, 1, 1], ['beginL', Cmd.valign, 6, 1],
  ['endL', Cmd.valign, 7, 1], ['beginR', Cmd.valign, 10, 1], ['endR', Cmd.valign, 11, 1], ['scantokens', Cmd.input, 2, 1],
  ['readline', Cmd.read_to_cs, 1, 1], ['marks', Cmd.mark, 5, 1], ['topmarks', Cmd.top_bot_mark, 5, 1],
  ['firstmarks', Cmd.top_bot_mark, 6, 1], ['botmarks', Cmd.top_bot_mark, 7, 1],
  ['splitfirstmarks', Cmd.top_bot_mark, 8, 1], ['splitbotmarks', Cmd.top_bot_mark, 9, 1],
  ['pagediscards', Cmd.un_vbox, 2, 1], ['splitdiscards', Cmd.un_vbox, 3, 1],
  ['interlinepenalties', Cmd.set_shape, etex_pen_base + 0, 1], ['clubpenalties', Cmd.set_shape, etex_pen_base + 1, 1],
  ['widowpenalties', Cmd.set_shape, etex_pen_base + 2, 1], ['displaywidowpenalties', Cmd.set_shape, etex_pen_base + 3, 1],
  ['pdfprimitive', Cmd.ignore_spaces, 1, 2], // eq_type of frozen_primitive (pdftex.web §258)
]

export const prims: Prim[] = []
const names = new Map<number, string>()
for (const [name, cmd, chr, flag] of table) {
  names.set(cmd * 0x10000 + chr, name)
  if (flag === 2) continue
  let p = prims.find(p => p.cmd === cmd)
  if (!p) {
    p = { cmd, primitives: [], etex_primitives: [], print: (e: Engine, chr: number) => print_esc(e, names.get(cmd * 0x10000 + chr) ?? '???') }
    prims.push(p)
  }
  ;(flag === 1 ? p.etex_primitives! : p.primitives).push([name, chr])
}
