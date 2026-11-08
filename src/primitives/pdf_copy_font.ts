// pdftex.web \pdfcopyfont: make_font_copy
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_letterspaced_font } from '../tfm.ts'

export const cmd = Cmd.pdf_copy_font
export const primitives: [string, number][] = [['pdfcopyfont', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'pdfcopyfont') }
export function assign(e: Engine, a: number): void { new_letterspaced_font(e, a, true) }
