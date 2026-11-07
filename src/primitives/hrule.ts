// §1056 \hrule: vmode+hrule appends a rule, hmode+hrule: head_for_vmode
import type { Engine } from '../engine.ts'
import { Cmd, hmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { dimen_base } from '../eqtb.ts'
import { tail_append, scan_rule_spec, head_for_vmode } from '../main.ts'

export const cmd = Cmd.hrule
export const primitives: [string, number][] = [['hrule', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'hrule') }
export function run(e: Engine, _chr: number): void {
  if (Math.abs(e.mode) === hmode) { head_for_vmode(e); return }
  tail_append(e, scan_rule_spec(e)); e.prev_depth = e.equiv[dimen_base + 32]! // \pdfignoreddimen
}
