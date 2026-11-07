// §416–417 \lastpenalty \lastkern \lastskip \inputlineno \badness and pdfTeX's \pdf... items; fetched by §424 in scan.ts
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

const names: Record<number, string> = { 0: 'lastpenalty', 1: 'lastkern', 2: 'lastskip', 3: 'lastnodetype', 4: 'inputlineno', 5: 'badness',
  6: 'pdftexversion', 7: 'pdflastobj', 8: 'pdflastxform', 9: 'pdflastximage', 10: 'pdflastximagepages', 11: 'pdflastannot',
  12: 'pdflastxpos', 13: 'pdflastypos', 14: 'pdfretval', 15: 'pdflastximagecolordepth', 16: 'pdfelapsedtime', 17: 'pdfshellescape',
  18: 'pdfrandomseed', 19: 'pdflastlink', 20: 'eTeXversion', 21: 'currentgrouplevel', 22: 'currentgrouptype', 23: 'currentiflevel',
  24: 'currentiftype', 25: 'currentifbranch', 26: 'gluestretchorder', 27: 'glueshrinkorder', 28: 'fontcharwd', 29: 'fontcharht',
  30: 'fontchardp', 31: 'fontcharic', 32: 'parshapelength', 33: 'parshapeindent', 34: 'parshapedimen', 35: 'gluestretch',
  36: 'glueshrink', 37: 'mutoglue', 38: 'gluetomu', 39: 'numexpr', 40: 'dimexpr', 41: 'glueexpr', 42: 'muexpr' }
export const cmd = Cmd.last_item
export const primitives: [string, number][] = Object.entries(names).filter(([k]) => +k <= 19 && k !== '3').map(([k, n]) => [n, +k])
export const etex_primitives: [string, number][] = Object.entries(names).filter(([k]) => +k > 19 || k === '3').map(([k, n]) => [n, +k])
export function print(e: Engine, chr: number): void { print_esc(e, names[chr] ?? 'badness') }
