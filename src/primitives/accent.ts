// §1122–1125 \accent; hmode+accent: make_accent (vmode starts a paragraph), mmode+accent: math_ac
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { mmode } from '../types.ts'
import { make_accent, math_ac } from '../main.ts'

export const cmd = Cmd.accent
export const primitives: [string, number][] = [['accent', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'accent') }
export function run(e: Engine, _chr: number): void { if (Math.abs(e.mode) === mmode) math_ac(e); else make_accent(e) } // §1165 mmode+accent
