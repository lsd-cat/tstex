// §265 \toks, §1226 the assignment
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { assign_toks } from '../main.ts'
import { print_sa_num } from '../etex.ts'

export const cmd = Cmd.toks_register
export const primitives: [string, number][] = [['toks', 0]]
export function print(e: Engine, chr: number): void { print_esc(e, 'toks'); if (chr !== 0) print_sa_num(e, chr) } // etex.ch
export const assign = assign_toks
