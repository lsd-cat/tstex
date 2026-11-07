// §265 \endgroup, §1063 any_mode(end_group)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { end_group } from '../main.ts'

export const cmd = Cmd.end_group
export const primitives: [string, number][] = [['endgroup', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'endgroup') }
export function run(e: Engine, _chr: number): void { end_group(e) }
