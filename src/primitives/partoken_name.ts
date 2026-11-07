// partoken.ch \partokenname: the next token's control sequence becomes the global par token
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { get_token } from '../input.ts'

export const cmd = Cmd.partoken_name
export const primitives: [string, number][] = [['partokenname', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'partokenname') }
export function run(e: Engine, _chr: number): void {
  get_token(e)
  if (e.cur_cs > 0) { e.par_loc = e.cur_cs; e.par_token = e.cur_tok }
}
