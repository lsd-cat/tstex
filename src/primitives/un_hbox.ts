// §1107–1110 \unhbox \unhcopy; hmode+un_hbox (vmode starts a paragraph)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { unpackage } from '../main.ts'

export const cmd = Cmd.un_hbox
export const primitives: [string, number][] = [['unhbox', 0], ['unhcopy', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 1 ? 'unhcopy' : 'unhbox') }
export function run(e: Engine, _chr: number): void { unpackage(e) }
