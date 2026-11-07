// §265 \begingroup, §1063 any_mode(begin_group)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_save_level } from '../eqtb.ts'
import { semi_simple_group } from '../main.ts'

export const cmd = Cmd.begin_group
export const primitives: [string, number][] = [['begingroup', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'begingroup') }
export function run(e: Engine, _chr: number): void { new_save_level(e, semi_simple_group) }
