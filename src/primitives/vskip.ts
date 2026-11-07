// §1057–1060 \vskip \vfil \vfill \vss \vfilneg; vmode+vskip: append_glue, hmode+vskip: head_for_vmode
import type { Engine } from '../engine.ts'
import { Cmd, hmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { append_glue, head_for_vmode } from '../main.ts'

const names = ['vfil', 'vfill', 'vss', 'vfilneg', 'vskip']
export const cmd = Cmd.vskip
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'vfilneg') }
export function run(e: Engine, _chr: number): void {
  if (Math.abs(e.mode) === hmode) head_for_vmode(e); else append_glue(e)
}
