// §468–471 \number \romannumeral \string \meaning (and the rest of the convert family, unsupported for now)
import type { Engine } from '../engine.ts'
import { Cmd, new_string } from '../types.ts'
import { print as print_str, print_esc, print_int, print_roman_int, print_char } from '../print.ts'
import { sprint_cs } from '../hash.ts'
import { garbage, temp_head } from '../nodes.ts'
import { print_meaning } from '../tokens.ts'
import { get_token, ins_list } from '../input.ts'
import { scan_int, str_toks } from '../scan.ts'
import { unsupported } from '../main.ts'
import { open_log_file } from '../files.ts'

const number_code = 0, roman_numeral_code = 1, string_code = 2, meaning_code = 3, job_name_code = 33
const names: Record<number, string> = { 0: 'number', 1: 'romannumeral', 2: 'string', 3: 'meaning', 4: 'fontname', 5: 'eTeXrevision',
  6: 'expanded', 7: 'pdftexrevision', 8: 'pdftexbanner', 9: 'pdffontname', 10: 'pdffontobjnum', 11: 'pdffontsize', 12: 'pdfpageref',
  13: 'pdfxformname', 14: 'pdfescapestring', 15: 'pdfescapename', 16: 'leftmarginkern', 17: 'rightmarginkern', 18: 'pdfstrcmp',
  19: 'pdfcolorstackinit', 20: 'pdfescapehex', 21: 'pdfunescapehex', 22: 'pdfcreationdate', 23: 'pdffilemoddate', 24: 'pdffilesize',
  25: 'pdfmdfivesum', 26: 'pdffiledump', 27: 'pdfmatch', 28: 'pdflastmatch', 29: 'pdfuniformdeviate', 30: 'pdfnormaldeviate',
  31: 'pdfinsertht', 32: 'pdfximagebbox', 33: 'jobname' }
export const cmd = Cmd.convert
export const primitives: [string, number][] = Object.entries(names).filter(([k]) => k !== '5').map(([k, n]) => [n, +k])
export const etex_primitives: [string, number][] = [['eTeXrevision', 5]]
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'jobname') }
// §470 conv_toks
export function run(e: Engine, chr: number): void {
  const c = chr
  // §471 Scan the argument for command c
  if (c === number_code || c === roman_numeral_code) scan_int(e)
  else if (c === string_code || c === meaning_code) {
    const save_scanner_status = e.scanner_status
    e.scanner_status = 0; get_token(e); e.scanner_status = save_scanner_status
  } else if (c === job_name_code) { if (e.job_name === '') open_log_file(e) }
  else unsupported(e)
  const old_setting = e.selector; e.selector = new_string
  const b = e.cur_str.length
  // §472 Print the result of command c
  if (c === number_code) print_int(e, e.cur_val)
  else if (c === roman_numeral_code) print_roman_int(e, e.cur_val)
  else if (c === string_code) { if (e.cur_cs !== 0) sprint_cs(e, e.cur_cs); else print_char(e, e.cur_chr) }
  else if (c === meaning_code) print_meaning(e)
  else print_str(e, e.job_name)
  e.selector = old_setting; e.link[garbage] = str_toks(e, b); ins_list(e, e.link[temp_head]!)
}
