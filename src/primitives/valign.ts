// §1130 \valign: hmode+valign init_align (vmode+valign starts a paragraph, mmode+valign inserts a $: main_control)
// etex.ch: \beginL \endL \beginR \endR share the code (TeXXeT, e-TeX mode only)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { init_align } from '../align.ts'
import { unsupported } from '../main.ts'

const names: Record<number, string> = { 0: 'valign', 6: 'beginL', 7: 'endL', 10: 'beginR', 11: 'endR' }
export const cmd = Cmd.valign
export const primitives: [string, number][] = [['valign', 0]]
export const etex_primitives: [string, number][] = [['beginL', 6], ['endL', 7], ['beginR', 10], ['endR', 11]]
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'valign') }
export function run(e: Engine, chr: number): void {
  if (chr > 0) unsupported(e) // TeXXeT
  init_align(e)
}
