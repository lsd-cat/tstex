// §1156–1159 \displaylimits \limits \nolimits; mmode+limit_switch: math_limit_switch
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { error, print_err, help } from '../error.ts'
import { op_noad, limits, no_limits } from '../nodes.ts'

export const cmd = Cmd.limit_switch
export const primitives: [string, number][] = [['displaylimits', 0], ['limits', limits], ['nolimits', no_limits]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === limits ? 'limits' : chr === no_limits ? 'nolimits' : 'displaylimits') }
// §1159 math_limit_switch
export function run(e: Engine, chr: number): void {
  if (e.head !== e.tail && e.tail.type === op_noad) { e.tail.subtype = chr; return }
  print_err(e, 'Limit controls must follow a math operator')
  help(e, "I'm ignoring this misplaced \\limits or \\nolimits command."); error(e)
}
