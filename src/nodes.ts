// §115–123 one-word token nodes, §162 fixed list heads, §200 token reference counts
// Token lists keep TeX's numeric pointers (info/link arrays, null=0) so that equiv, cur_chr,
// loc and cur_val stay integers as in tex.web; box/glue nodes will be objects (M2).
import type { Engine } from './engine.ts'

export const temp_head = 1, hold_head = 2, backup_head = 3, garbage = 4

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
