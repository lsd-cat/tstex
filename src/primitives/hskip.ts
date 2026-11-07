// §1057–1060 \hskip \hfil \hfill \hss \hfilneg; hmode+hskip: append_glue (vmode starts a paragraph)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { append_glue } from '../main.ts'

const names = ['hfil', 'hfill', 'hss', 'hfilneg', 'hskip']
export const cmd = Cmd.hskip
export const primitives: [string, number][] = names.map((n, i) => [n, i])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'hfilneg') }
export function run(e: Engine, _chr: number): void { append_glue(e) }
