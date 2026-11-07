// §1056 \vrule: hmode+vrule (vmode starts a paragraph)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { tail_append, scan_rule_spec } from '../main.ts'

export const cmd = Cmd.vrule
export const primitives: [string, number][] = [['vrule', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'vrule') }
export function run(e: Engine, _chr: number): void { tail_append(e, scan_rule_spec(e)); e.space_factor = 1000 }
