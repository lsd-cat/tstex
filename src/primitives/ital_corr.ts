// §1111–1113 \/ ; hmode+ital_corr (vmode is forbidden)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { append_italic_correction } from '../main.ts'

export const cmd = Cmd.ital_corr
export const primitives: [string, number][] = [['/', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, '/') }
export function run(e: Engine, _chr: number): void { append_italic_correction(e) }
