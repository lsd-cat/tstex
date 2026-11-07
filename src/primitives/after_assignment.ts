// §1266–1268 \afterassignment
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { get_token } from '../input.ts'

export const cmd = Cmd.after_assignment
export const primitives: [string, number][] = [['afterassignment', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'afterassignment') }
export function run(e: Engine, _chr: number): void { get_token(e); e.after_token = e.cur_tok }
