// Every TeX82, e-TeX and pdfTeX primitive whose command code has no file yet (§226–1344, etex.ch, pdftex.web).
// print gives print_cmd_chr's text (the escaped name); main_control, expand and prefixed_command call
// unsupported() for a command without run/assign, which stops with "unsupported: \name".
import type { Engine } from '../engine.ts'
import { Cmd, par_shape_loc, etex_pen_base } from '../types.ts'
import { print_esc } from '../print.ts'
import type { Prim } from './index.ts'
// [name, cmd, chr, 1 if e-TeX mode only, 2 if print-only]
const table: [string, number, number, number?][] = [
  ['letterspacefont', Cmd.letterspace_font, 0], ['pdfcopyfont', Cmd.pdf_copy_font, 0],
  ['halign', Cmd.halign, 0], 
  ['ignorespaces', Cmd.ignore_spaces, 0], 
  ['noalign', Cmd.no_align, 0], ['omit', Cmd.omit, 0],
  ['valign', Cmd.valign, 0],
  ['span', Cmd.tab_mark, 256], ['cr', Cmd.car_ret, 257], ['crcr', Cmd.car_ret, 258],
  ['batchmode', Cmd.set_interaction, 0],
  ['nonstopmode', Cmd.set_interaction, 1], ['scrollmode', Cmd.set_interaction, 2],
  ['errorstopmode', Cmd.set_interaction, 3],
  ['beginL', Cmd.valign, 6, 1],
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
