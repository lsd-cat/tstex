// §1107–1110 \unvbox \unvcopy (e-TeX: \pagediscards \splitdiscards); vmode+un_vbox, hmode+un_vbox: head_for_vmode
import type { Engine } from '../engine.ts'
import { Cmd, hmode } from '../types.ts'
import { print_esc } from '../print.ts'
import { unpackage, head_for_vmode } from '../main.ts'

const names = ['unvbox', 'unvcopy', 'pagediscards', 'splitdiscards']
export const cmd = Cmd.un_vbox
export const primitives: [string, number][] = [['unvbox', 0], ['unvcopy', 1]]
export const etex_primitives: [string, number][] = [['pagediscards', 2], ['splitdiscards', 3]]
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'unvbox') }
export function run(e: Engine, _chr: number): void {
  if (Math.abs(e.mode) === hmode) head_for_vmode(e); else unpackage(e)
}
