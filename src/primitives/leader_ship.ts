// §1071–1073 \shipout \leaders \cleaders \xleaders; any_mode(leader_ship)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { a_leaders, c_leaders, x_leaders } from '../nodes.ts'
import { scan_box, leader_flag } from '../main.ts'

export const cmd = Cmd.leader_ship
export const primitives: [string, number][] = [['shipout', a_leaders - 1], ['leaders', a_leaders], ['cleaders', c_leaders], ['xleaders', x_leaders]]
export function print(e: Engine, chr: number): void {
  print_esc(e, chr === a_leaders ? 'leaders' : chr === c_leaders ? 'cleaders' : chr === x_leaders ? 'xleaders' : 'shipout')
}
export function run(e: Engine, chr: number): void { scan_box(e, leader_flag - a_leaders + chr) }
