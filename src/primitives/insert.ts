// §1097–1099 \insert; any_mode(insert)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { begin_insert_or_adjust } from '../main.ts'

export const cmd = Cmd.insert
export const primitives: [string, number][] = [['insert', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'insert') }
export function run(e: Engine, _chr: number): void { begin_insert_or_adjust(e) }
