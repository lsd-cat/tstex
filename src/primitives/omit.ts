// §1126 \omit outside a column start: any_mode(omit) omit_error (init_col reads the real ones)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { omit_error } from '../align.ts'

export const cmd = Cmd.omit
export const primitives: [string, number][] = [['omit', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'omit') }
export function run(e: Engine, _chr: number): void { omit_error(e) }
