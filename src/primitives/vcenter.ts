// §1167 \vcenter; mmode+vcenter (the group ends in handle_right_brace, §1168)
import type { Engine } from '../engine.ts'
import { Cmd, vmode, local_base, dimen_base } from '../types.ts'
import { print_esc } from '../print.ts'
import { scan_spec } from '../pack.ts'
import { begin_token_list } from '../input.ts'
import { normal_paragraph, push_nest, vcenter_group } from '../main.ts'

const every_vbox_loc = local_base + 6, every_vbox_text = 11
export const cmd = Cmd.vcenter
export const primitives: [string, number][] = [['vcenter', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'vcenter') }
export function run(e: Engine, _chr: number): void {
  scan_spec(e, vcenter_group, false); normal_paragraph(e)
  push_nest(e); e.mode = -vmode; e.prev_depth = e.equiv[dimen_base + 32]! // pdf_ignored_dimen
  if (e.equiv[every_vbox_loc] !== 0) begin_token_list(e, e.equiv[every_vbox_loc]!, every_vbox_text)
}
