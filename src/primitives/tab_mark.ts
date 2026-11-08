// §780 \span (tab_mark, span_code); print_cmd_chr and main_control's align_error handle the command
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.tab_mark
export const primitives: [string, number][] = [['span', 256]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'span') }
