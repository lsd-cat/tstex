// §1208–1209 \long \outer \global (e-TeX \protected); prefixed_command §1211 consumes them
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.prefix
export const primitives: [string, number][] = [['long', 1], ['outer', 2], ['global', 4]]
export const etex_primitives: [string, number][] = [['protected', 8]]
export function print(e: Engine, chr: number): void {
  print_esc(e, chr === 1 ? 'long' : chr === 2 ? 'outer' : chr === 8 ? 'protected' : 'global')
}
