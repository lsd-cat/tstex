// §491–492 \fi \or \else, §510
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { fi_or_else, fi_code, or_code } from '../conditional.ts'

export const cmd = Cmd.fi_or_else
export const primitives: [string, number][] = [['fi', 2], ['or', 4], ['else', 3]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === fi_code ? 'fi' : chr === or_code ? 'or' : 'else') }
export function run(e: Engine, _chr: number): void { fi_or_else(e) }
