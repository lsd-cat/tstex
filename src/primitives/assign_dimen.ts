// §248–250 dimension parameters (pdftex.web included), §1228 assign_dimen
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc, print_int } from '../print.ts'
import { dimen_base, scaled_base, print_length_param } from '../eqtb.ts'
import { word_define } from '../main.ts'
import { scan_optional_equals, scan_normal_dimen } from '../scan.ts'

export const cmd = Cmd.assign_dimen
export const primitives: [string, number][] = [
  ['parindent', dimen_base], ['mathsurround', dimen_base + 1], ['lineskiplimit', dimen_base + 2],
  ['hsize', dimen_base + 3], ['vsize', dimen_base + 4], ['maxdepth', dimen_base + 5],
  ['splitmaxdepth', dimen_base + 6], ['boxmaxdepth', dimen_base + 7], ['hfuzz', dimen_base + 8],
  ['vfuzz', dimen_base + 9], ['delimitershortfall', dimen_base + 10], ['nulldelimiterspace', dimen_base + 11],
  ['scriptspace', dimen_base + 12], ['predisplaysize', dimen_base + 13], ['displaywidth', dimen_base + 14],
  ['displayindent', dimen_base + 15], ['overfullrule', dimen_base + 16], ['hangindent', dimen_base + 17],
  ['hoffset', dimen_base + 18], ['voffset', dimen_base + 19], ['emergencystretch', dimen_base + 20],
  ['pdfhorigin', dimen_base + 21], ['pdfvorigin', dimen_base + 22], ['pdfpagewidth', dimen_base + 23],
  ['pdfpageheight', dimen_base + 24], ['pdflinkmargin', dimen_base + 25], ['pdfdestmargin', dimen_base + 26],
  ['pdfthreadmargin', dimen_base + 27], ['pdffirstlineheight', dimen_base + 28],
  ['pdflastlinedepth', dimen_base + 29], ['pdfeachlineheight', dimen_base + 30],
  ['pdfeachlinedepth', dimen_base + 31], ['pdfignoreddimen', dimen_base + 32], ['pdfpxdimen', dimen_base + 33],
]
// §251
export function print(e: Engine, chr: number): void {
  if (chr < scaled_base) print_length_param(e, chr - dimen_base)
  else { print_esc(e, 'dimen'); print_int(e, chr - scaled_base) }
}
export function assign(e: Engine, a: number): void {
  const p = e.cur_chr; scan_optional_equals(e); scan_normal_dimen(e)
  word_define(e, a, p, e.cur_val)
}
