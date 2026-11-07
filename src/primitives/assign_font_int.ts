// §1253–1254 \hyphenchar \skewchar (pdftex's \lpcode etc. are registered, not supported)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_optional_equals, scan_int } from '../scan.ts'
import { scan_font_ident } from '../tfm.ts'
import { unsupported } from '../main.ts'

const names: Record<number, string> = { 0: 'hyphenchar', 1: 'skewchar', 2: 'lpcode', 3: 'rpcode', 4: 'efcode', 5: 'tagcode',
  7: 'knbscode', 8: 'stbscode', 9: 'shbscode', 10: 'knbccode', 11: 'knaccode', 6: 'pdfnoligatures' }
export const cmd = Cmd.assign_font_int
export const primitives: [string, number][] = Object.entries(names).map(([k, n]) => [n, +k])
export function print(e: Engine, chr: number): void { if (names[chr] !== undefined) print_esc(e, names[chr]) }
export function assign(e: Engine, _a: number): void {
  const n = e.cur_chr
  if (n > 1) unsupported(e)
  scan_font_ident(e); const f = e.cur_val
  scan_optional_equals(e); scan_int(e)
  if (n === 0) e.hyphen_char[f] = e.cur_val; else e.skew_char[f] = e.cur_val
}
