// §1250–1252 \hyphenation \patterns
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { new_hyph_exceptions, new_patterns } from '../hyphenate.ts'

export const cmd = Cmd.hyph_data
export const primitives: [string, number][] = [['hyphenation', 0], ['patterns', 1]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === 1 ? 'patterns' : 'hyphenation') }
export function assign(e: Engine, _a: number): void {
  if (e.cur_chr === 1) new_patterns(e) // INITEX
  else new_hyph_exceptions(e)
}
