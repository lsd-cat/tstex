// §1052–1054 \end, \dump; vmode+stop
import type { Engine } from '../engine.ts'
import { Cmd, vmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { its_all_over, unsupported } from '../main.ts'

export const cmd = Cmd.stop
export const primitives: [string, number][] = [['end', 0], ['dump', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 1 ? 'dump' : 'end') }
export function run(e: Engine, _chr: number): boolean {
  if (Math.abs(e.mode) !== vmode) unsupported(e)
  return its_all_over(e)
}
