// §1253–1254 \hyphenchar \skewchar; pdftex.web \lpcode \rpcode \efcode \tagcode \knbscode \stbscode \shbscode \knbccode
// \knaccode \pdfnoligatures
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_optional_equals, scan_int, scan_char_num } from '../scan.ts'
import { scan_font_ident, set_no_ligatures, set_tag_code, set_font_code, no_lig_code, lp_code_base, tag_code } from '../tfm.ts'

const names: Record<number, string> = { 0: 'hyphenchar', 1: 'skewchar', 2: 'lpcode', 3: 'rpcode', 4: 'efcode', 5: 'tagcode',
  7: 'knbscode', 8: 'stbscode', 9: 'shbscode', 10: 'knbccode', 11: 'knaccode', 6: 'pdfnoligatures' }
export const cmd = Cmd.assign_font_int
export const primitives: [string, number][] = Object.entries(names).map(([k, n]) => [n, +k])
export function print(e: Engine, chr: number): void { if (names[chr] !== undefined) print_esc(e, names[chr]) }
export function assign(e: Engine, _a: number): void {
  const n = e.cur_chr
  scan_font_ident(e); const f = e.cur_val
  if (n === no_lig_code) set_no_ligatures(e, f)
  else if (n < lp_code_base) {
    scan_optional_equals(e); scan_int(e)
    if (n === 0) e.hyphen_char[f] = e.cur_val; else e.skew_char[f] = e.cur_val
  } else {
    scan_char_num(e); const p = e.cur_val
    scan_optional_equals(e); scan_int(e)
    if (n === tag_code) set_tag_code(e, f, p, e.cur_val); else set_font_code(e, n, f, p, e.cur_val)
  }
}
