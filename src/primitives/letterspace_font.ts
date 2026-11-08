// pdftex.web \letterspacefont: new_letterspaced_font
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_letterspaced_font } from '../tfm.ts'

export const cmd = Cmd.letterspace_font
export const primitives: [string, number][] = [['letterspacefont', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'letterspacefont') }
export function assign(e: Engine, a: number): void { new_letterspaced_font(e, a, false) }
