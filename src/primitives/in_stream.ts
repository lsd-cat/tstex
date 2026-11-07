// §1272–1275 \openin \closein
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_four_bit_int, scan_optional_equals } from '../scan.ts'
import { scan_file_name, open_tex_file, closed, just_open } from '../files.ts'

export const cmd = Cmd.in_stream
export const primitives: [string, number][] = [['openin', 1], ['closein', 0]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'closein' : 'openin') }
// §1275 open_or_close_in (tex.ch: no forced `.tex', kpathsea lookup)
export function run(e: Engine, chr: number): void {
  scan_four_bit_int(e); const n = e.cur_val
  if (e.read_open[n] !== closed) { delete e.read_file[n]; e.read_open[n] = closed }
  if (chr !== 0) {
    scan_optional_equals(e); scan_file_name(e)
    const found = open_tex_file(e)
    if (found !== null) { e.read_file[n] = found.file; e.read_open[n] = just_open }
  }
}
