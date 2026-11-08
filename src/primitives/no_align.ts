// §1126 \noalign outside an alignment: any_mode(no_align) no_align_error (align_peek reads the real ones)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { no_align_error } from '../align.ts'

export const cmd = Cmd.no_align
export const primitives: [string, number][] = [['noalign', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'noalign') }
export function run(e: Engine, _chr: number): void { no_align_error(e) }
