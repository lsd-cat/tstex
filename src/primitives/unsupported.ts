// Every TeX82, e-TeX and pdfTeX primitive whose command code has no file yet (§226–1344, etex.ch, pdftex.web).
// print gives print_cmd_chr's text (the escaped name); main_control, expand and prefixed_command call
// unsupported() for a command without run/assign, which stops with "unsupported: \name".
import type { Engine } from '../engine.ts'
import { Cmd, par_shape_loc, etex_pen_base } from '../types.ts'
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
  ['radical', Cmd.radical, 0], 
  ['valign', Cmd.valign, 0], ['vcenter', Cmd.vcenter, 0],
  ['span', Cmd.tab_mark, 256], ['cr', Cmd.car_ret, 257], ['crcr', Cmd.car_ret, 258],
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
  ['left', Cmd.left_right, 30], ['right', Cmd.left_right, 31], 
  ['batchmode', Cmd.set_interaction, 0],
  ['nonstopmode', Cmd.set_interaction, 1], ['scrollmode', Cmd.set_interaction, 2],
  ['errorstopmode', Cmd.set_interaction, 3],
  ['middle', Cmd.left_right, 1, 1], ['beginL', Cmd.valign, 6, 1],
  ['endL', Cmd.valign, 7, 1], ['beginR', Cmd.valign, 10, 1], ['endR', Cmd.valign, 11, 1],
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
