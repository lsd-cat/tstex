// §1248 \parshape, etex.ch \interlinepenalties \clubpenalties \widowpenalties \displaywidowpenalties ([n, p1..pn])
import type { Engine } from '../engine.ts'
import { Cmd, par_shape_loc, etex_pen_base } from '../types.ts'
import { print_esc } from '../print.ts'
import { define } from '../main.ts'
import { scan_optional_equals, scan_int, scan_normal_dimen } from '../scan.ts'

const etex_names = ['interlinepenalties', 'clubpenalties', 'widowpenalties', 'displaywidowpenalties']
export const cmd = Cmd.set_shape
export const primitives: [string, number][] = [['parshape', par_shape_loc]]
export const etex_primitives: [string, number][] = etex_names.map((n, i) => [n, etex_pen_base + i])
export function print(e: Engine, chr: number): void { print_esc(e, chr === par_shape_loc ? 'parshape' : etex_names[chr - etex_pen_base]!) }
export function assign(e: Engine, a: number): void {
  const q = e.cur_chr
  scan_optional_equals(e); scan_int(e)
  const n = e.cur_val
  let p = 0
  if (n > 0 && q > par_shape_loc) {
    const s = [n]
    for (let j = 1; j <= n; j++) { scan_int(e); s[j] = e.cur_val }
    p = e.shapes.length; e.shapes.push(s)
  } else if (n > 0) {
    const s = [n]
    for (let j = 1; j <= n; j++) { scan_normal_dimen(e); s[2 * j - 1] = e.cur_val; scan_normal_dimen(e); s[2 * j] = e.cur_val }
    p = e.shapes.length; e.shapes.push(s)
  }
  define(e, a, q, Cmd.shape_ref, p)
}
