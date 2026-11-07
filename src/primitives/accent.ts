// §1122–1125 \accent; hmode+accent: make_accent (vmode starts a paragraph)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { make_accent } from '../main.ts'

export const cmd = Cmd.accent
export const primitives: [string, number][] = [['accent', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'accent') }
export function run(e: Engine, _chr: number): void { make_accent(e) }
