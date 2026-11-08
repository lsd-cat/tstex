// §1045 \ignorespaces; chr=1 is the frozen \pdfprimitive (pdftex.web). main_control and scan_something_internal act on it.
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.ignore_spaces
export const primitives: [string, number][] = [['ignorespaces', 0]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 0 ? 'ignorespaces' : 'pdfprimitive') }
