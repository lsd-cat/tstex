// §1171 \nonscript; mmode+non_script
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_glue, zero_glue, cond_math_glue } from '../nodes.ts'
import { tail_append } from '../main.ts'

export const cmd = Cmd.non_script
export const primitives: [string, number][] = [['nonscript', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'nonscript') }
export function run(e: Engine, _chr: number): void { const g = new_glue(e, zero_glue); tail_append(e, g); g.subtype = cond_math_glue }
