// §1210 \read (e-TeX \readline), §1225 the read_to_cs assignment
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { error, print_err, help } from '../error.ts'
import { scan_int, scan_keyword, read_toks } from '../scan.ts'
import { get_r_token, define } from '../main.ts'

export const cmd = Cmd.read_to_cs
export const primitives: [string, number][] = [['read', 0]]
export const etex_primitives: [string, number][] = [['readline', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'read' : 'readline') }
export function assign(e: Engine, a: number): void {
  const j = e.cur_chr
  scan_int(e); const n = e.cur_val
  if (!scan_keyword(e, 'to')) {
    print_err(e, "Missing `to' inserted")
    help(e, "You should have said `\\read<number> to \\cs'.", "I'm going to look for the \\cs now."); error(e)
  }
  get_r_token(e)
  const p = e.cur_cs; read_toks(e, n, p, j); define(e, a, p, Cmd.call, e.cur_val)
}
