// §265 \relax, §1045 any_mode(relax): do_nothing
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.relax
export const primitives: [string, number][] = [['relax', 256]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'relax') }
export function run(_e: Engine, _chr: number): void { }
