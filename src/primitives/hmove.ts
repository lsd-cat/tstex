// §1071–1073 \moveleft \moveright; vmode+hmove
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_normal_dimen } from '../scan.ts'
import { scan_box } from '../main.ts'

export const cmd = Cmd.hmove
export const primitives: [string, number][] = [['moveleft', 1], ['moveright', 0]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 1 ? 'moveleft' : 'moveright') }
export function run(e: Engine, chr: number): void { scan_normal_dimen(e); scan_box(e, chr === 0 ? e.cur_val : -e.cur_val | 0) }
