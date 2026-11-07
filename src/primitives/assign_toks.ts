// §230–231 token list parameters (pdftex.web and etex.ch included), §1226 the assignment
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc, print_int } from '../print.ts'
import { local_base, toks_base, toks_par_names } from '../eqtb.ts'
import { assign_toks } from '../main.ts'

export const cmd = Cmd.assign_toks
export const primitives: [string, number][] = [
  ['output', local_base + 1], ['everypar', local_base + 2], ['everymath', local_base + 3],
  ['everydisplay', local_base + 4], ['everyhbox', local_base + 5], ['everyvbox', local_base + 6],
  ['everyjob', local_base + 7], ['everycr', local_base + 8], ['errhelp', local_base + 9],
  ['pdfpagesattr', local_base + 10], ['pdfpageattr', local_base + 11], ['pdfpageresources', local_base + 12],
  ['pdfpkmode', local_base + 13],
]
export const etex_primitives: [string, number][] = [
  ['everyeof', local_base + 14],
]
// §231
export function print(e: Engine, chr: number): void {
  if (chr >= toks_base) { print_esc(e, 'toks'); print_int(e, chr - toks_base) }
  else print_esc(e, toks_par_names[chr - local_base] ?? 'errhelp')
}
export const assign = assign_toks
