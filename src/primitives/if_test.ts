// §487–488 \if... primitives, §498 conditional
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { conditional, unless_code } from '../conditional.ts'

const names = ['if', 'ifcat', 'ifnum', 'ifdim', 'ifodd', 'ifvmode', 'ifhmode', 'ifmmode', 'ifinner', 'ifvoid', 'ifhbox', 'ifvbox',
  'ifx', 'ifeof', 'iftrue', 'iffalse', 'ifcase', 'ifdefined', 'ifcsname', 'iffontchar', 'ifincsname', 'ifpdfprimitive', 'ifpdfabsnum', 'ifpdfabsdim']
export const cmd = Cmd.if_test
export const primitives: [string, number][] = [...names.slice(0, 17).map((n, i): [string, number] => [n, i]), ['ifpdfprimitive', 21]]
export const etex_primitives: [string, number][] = [['ifdefined', 17], ['ifcsname', 18], ['iffontchar', 19], ['ifincsname', 20],
  ['ifpdfabsnum', 22], ['ifpdfabsdim', 23]]
export function print(e: Engine, chr: number): void {
  if (chr >= unless_code) print_esc(e, 'unless')
  print_esc(e, names[chr % unless_code] ?? 'if')
}
export function run(e: Engine, _chr: number): void { conditional(e) }
