// §1097–1099 \vadjust; hmode+vadjust (vmode is forbidden)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { begin_insert_or_adjust } from '../main.ts'

export const cmd = Cmd.vadjust
export const primitives: [string, number][] = [['vadjust', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'vadjust') }
export function run(e: Engine, _chr: number): void { begin_insert_or_adjust(e) }
