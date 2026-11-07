// Every TeX82, e-TeX and pdfTeX primitive whose command code has no file yet (§226–1344, etex.ch, pdftex.web).
// print gives print_cmd_chr's text (the escaped name); main_control, expand and prefixed_command call
// unsupported() for a command without run/assign, which stops with "unsupported: \name".
import type { Engine } from '../engine.ts'
import { Cmd, par_shape_loc, math_font_base, etex_pen_base } from '../types.ts'
import { print_esc } from '../print.ts'
import type { Prim } from './index.ts'
// [name, cmd, chr, 1 if e-TeX mode only, 2 if print-only]
const table: [string, number, number, number?][] = [
  ['delimiter', Cmd.delim_num, 0], 
  ['letterspacefont', Cmd.letterspace_font, 0], ['pdfcopyfont', Cmd.pdf_copy_font, 0],
  ['halign', Cmd.halign, 0], 
  ['ignorespaces', Cmd.ignore_spaces, 0], 
  ['mathaccent', Cmd.math_accent, 0], ['mathchar', Cmd.math_char_num, 0], ['mathchoice', Cmd.math_choice, 0],
  ['noalign', Cmd.no_align, 0], ['nonscript', Cmd.non_script, 0], ['omit', Cmd.omit, 0],
  ['parshape', Cmd.set_shape, par_shape_loc], 
  ['radical', Cmd.radical, 0], 
  ['valign', Cmd.valign, 0], ['vcenter', Cmd.vcenter, 0], ['topmark', Cmd.top_bot_mark, 0], ['firstmark', Cmd.top_bot_mark, 1],
  ['botmark', Cmd.top_bot_mark, 2], ['splitfirstmark', Cmd.top_bot_mark, 3], ['splitbotmark', Cmd.top_bot_mark, 4],
  ['deadcycles', Cmd.set_page_int, 0],
  ['insertpenalties', Cmd.set_page_int, 1], 
  ['span', Cmd.tab_mark, 256], ['cr', Cmd.car_ret, 257], ['crcr', Cmd.car_ret, 258],
  ['pagegoal', Cmd.set_page_dimen, 0], ['pagetotal', Cmd.set_page_dimen, 1], ['pagestretch', Cmd.set_page_dimen, 2],
  ['pagefilstretch', Cmd.set_page_dimen, 3], ['pagefillstretch', Cmd.set_page_dimen, 4],
  ['pagefilllstretch', Cmd.set_page_dimen, 5], ['pageshrink', Cmd.set_page_dimen, 6], ['pagedepth', Cmd.set_page_dimen, 7],
  ['mskip', Cmd.mskip, 5], 
  ['mkern', Cmd.mkern, 99], 
  ['eqno', Cmd.eq_no, 0], ['leqno', Cmd.eq_no, 1], ['mathord', Cmd.math_comp, 16],
  ['mathop', Cmd.math_comp, 17], ['mathbin', Cmd.math_comp, 18], ['mathrel', Cmd.math_comp, 19],
  ['mathopen', Cmd.math_comp, 20], ['mathclose', Cmd.math_comp, 21], ['mathpunct', Cmd.math_comp, 22],
  ['mathinner', Cmd.math_comp, 23], ['underline', Cmd.math_comp, 26], ['overline', Cmd.math_comp, 27],
  ['displaylimits', Cmd.limit_switch, 0], ['limits', Cmd.limit_switch, 1], ['nolimits', Cmd.limit_switch, 2],
  ['displaystyle', Cmd.math_style, 0], ['textstyle', Cmd.math_style, 2], ['scriptstyle', Cmd.math_style, 4],
  ['scriptscriptstyle', Cmd.math_style, 6], ['above', Cmd.above, 0], ['over', Cmd.above, 1], ['atop', Cmd.above, 2],
  ['abovewithdelims', Cmd.above, 3], ['overwithdelims', Cmd.above, 4], ['atopwithdelims', Cmd.above, 5],
  ['left', Cmd.left_right, 30], ['right', Cmd.left_right, 31], ['textfont', Cmd.def_family, math_font_base],
  ['scriptfont', Cmd.def_family, math_font_base + 16], ['scriptscriptfont', Cmd.def_family, math_font_base + 32],
  ['hyphenation', Cmd.hyph_data, 0], ['patterns', Cmd.hyph_data, 1], 
  ['batchmode', Cmd.set_interaction, 0],
  ['nonstopmode', Cmd.set_interaction, 1], ['scrollmode', Cmd.set_interaction, 2],
  ['errorstopmode', Cmd.set_interaction, 3],
  ['interactionmode', Cmd.set_page_int, 2, 1], ['middle', Cmd.left_right, 1, 1], ['beginL', Cmd.valign, 6, 1],
  ['endL', Cmd.valign, 7, 1], ['beginR', Cmd.valign, 10, 1], ['endR', Cmd.valign, 11, 1], ['topmarks', Cmd.top_bot_mark, 5, 1],
  ['firstmarks', Cmd.top_bot_mark, 6, 1], ['botmarks', Cmd.top_bot_mark, 7, 1],
  ['splitfirstmarks', Cmd.top_bot_mark, 8, 1], ['splitbotmarks', Cmd.top_bot_mark, 9, 1],
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
