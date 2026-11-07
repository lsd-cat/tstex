// §115–123 one-word token nodes, §150–153 and §177–178 glue specifications, §162 fixed list heads, §200–203 reference counts
// Token lists keep TeX's numeric pointers (info/link arrays, null=0) so that equiv, cur_chr,
// loc and cur_val stay integers as in tex.web; box/glue nodes will be objects (M2).
import type { Engine } from './engine.ts'
import { print, print_char } from './print.ts'
import { print_scaled } from './arith.ts'

export const temp_head = 1, hold_head = 2, backup_head = 3, garbage = 4, null_list = 5

// §120 get_avail
export function get_avail(e: Engine): number {
  let p = e.avail
  if (p !== 0) e.avail = e.link[p]!
  else p = ++e.mem_end
  e.link[p] = 0; e.info[p] = 0
  return p
}

// §121 free_avail
export function free_avail(e: Engine, p: number): void {
  e.link[p] = e.avail; e.avail = p
}

// §123 flush_list
export function flush_list(e: Engine, p: number): void {
  if (p === 0) return
  let r = p, q = p
  do { q = r; r = e.link[r]! } while (r !== 0)
  e.link[q] = e.avail; e.avail = p
}

// §203 add_token_ref
export function add_token_ref(e: Engine, p: number): void {
  e.info[p]!++
}

// §200 delete_token_ref
export function delete_token_ref(e: Engine, p: number): void {
  if (e.info[p] === 0) flush_list(e, p)
  else e.info[p]!--
}

// §150 glue specifications are objects; a glue pointer is an index into Engine.spec so that eqtb,
// the save stack and cur_val stay integers. As in tex.web, zero_glue=mem_bot=0 coincides with null.
export type GlueSpec = { glue_ref_count: number, width: number, stretch: number, shrink: number, stretch_order: number, shrink_order: number }
export const normal = 0, fil = 1, fill = 2, filll = 3
// §162
export const zero_glue = 0, fil_glue = 1, fill_glue = 2, ss_glue = 3, fil_neg_glue = 4

// §125 get_node(glue_spec_size)
function get_spec(e: Engine): number {
  const q = e.spec_avail.pop() ?? e.spec.length
  e.spec[q] = { glue_ref_count: 0, width: 0, stretch: 0, shrink: 0, stretch_order: normal, shrink_order: normal }
  return q
}

// §151 new_spec
export function new_spec(e: Engine, p: number): number {
  const q = get_spec(e), s = e.spec[p]!
  e.spec[q] = { ...s, glue_ref_count: 0 }
  return q
}

// §164 Initialize the special list heads and constant nodes (the glue part)
export function init_specs(e: Engine): void {
  e.spec = []; e.spec_avail = []
  for (let k = zero_glue; k <= fil_neg_glue; k++) { get_spec(e); e.spec[k]!.glue_ref_count = 1 }
  e.spec[fil_glue]!.stretch = 0o200000; e.spec[fil_glue]!.stretch_order = fil
  e.spec[fill_glue]!.stretch = 0o200000; e.spec[fill_glue]!.stretch_order = fill
  e.spec[ss_glue]!.stretch = 0o200000; e.spec[ss_glue]!.stretch_order = fil
  e.spec[ss_glue]!.shrink = 0o200000; e.spec[ss_glue]!.shrink_order = fil
  e.spec[fil_neg_glue]!.stretch = -0o200000; e.spec[fil_neg_glue]!.stretch_order = fil
}

// §203 add_glue_ref
export function add_glue_ref(e: Engine, p: number): void {
  e.spec[p]!.glue_ref_count++
}

// §201 delete_glue_ref
export function delete_glue_ref(e: Engine, p: number): void {
  const s = e.spec[p]!
  if (s.glue_ref_count === 0) { e.spec[p] = undefined; e.spec_avail.push(p) }
  else s.glue_ref_count--
}

// §177 print_glue
export function print_glue(e: Engine, d: number, order: number, s: string): void {
  print_scaled(e, d)
  if (order < normal || order > filll) print(e, 'foul')
  else if (order > normal) {
    print(e, 'fil')
    while (order > fil) { print_char(e, 108); order-- }
  } else if (s !== '') print(e, s)
}

// §178 print_spec
export function print_spec(e: Engine, p: number, s: string): void {
  const g = e.spec[p]
  if (g === undefined) { print_char(e, 42); return }
  print_scaled(e, g.width)
  if (s !== '') print(e, s)
  if (g.stretch !== 0) { print(e, ' plus '); print_glue(e, g.stretch, g.stretch_order, s) }
  if (g.shrink !== 0) { print(e, ' minus '); print_glue(e, g.shrink, g.shrink_order, s) }
}
