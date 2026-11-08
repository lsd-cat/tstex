// §1057–1060 \mskip; mmode+mskip: append_glue
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { append_glue } from '../main.ts'

export const cmd = Cmd.mskip
export const primitives: [string, number][] = [['mskip', 5]] // mskip_code
export function print(e: Engine, _chr: number): void { print_esc(e, 'mskip') }
export function run(e: Engine, _chr: number): void { append_glue(e) }
