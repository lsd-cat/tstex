// §553 \nullfont, §1261 print_cmd_chr for set_font (only the null font exists until M2)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print, slow_print } from '../print.ts'

export const cmd = Cmd.set_font
export const primitives: [string, number][] = [['nullfont', 0]]
export function print_(e: Engine, _chr: number): void { print(e, 'select font '); slow_print(e, 'nullfont') }
export { print_ as print }
