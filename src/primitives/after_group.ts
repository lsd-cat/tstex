// §1270–1271 \aftergroup
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { get_token } from '../input.ts'
import { save_for_after } from '../eqtb.ts'

export const cmd = Cmd.after_group
export const primitives: [string, number][] = [['aftergroup', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'aftergroup') }
export function run(e: Engine, _chr: number): void { get_token(e); save_for_after(e, e.cur_tok) }
