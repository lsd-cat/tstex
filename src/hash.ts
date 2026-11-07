// §256–264 the hash table: names live in a Map instead of str_pool and coalesced lists
import type { Engine } from './engine.ts'
import { print, print_char, print_esc } from './print.ts'
import { overflow } from './error.ts'
import { hash_base, single_base, active_base, null_cs, undefined_control_sequence, cat_code_base, level_one } from './eqtb.ts'
import { Cmd } from './types.ts'

// §259 id_lookup, for a name of length l>1 in buffer[j..j+l-1]
export function id_lookup(e: Engine, j: number, l: number): number {
  return lookup(e, String.fromCharCode(...e.buffer.slice(j, j + l)))
}

// §259–260 lookup by name; a new entry takes the next free location below hash_used
function lookup(e: Engine, s: string): number {
  const p = e.hash.get(s)
  if (p !== undefined) return p
  if (e.no_new_control_sequence) return undefined_control_sequence
  do {
    if (e.hash_used === hash_base) overflow(e, 'hash size', e.hash_used - hash_base)
    e.hash_used--
  } while (e.text.has(e.hash_used))
  e.hash.set(s, e.hash_used); e.text.set(e.hash_used, s); e.cs_count++
  return e.hash_used
}

// §262 print_cs
export function print_cs(e: Engine, p: number): void {
  if (p < hash_base) {
    if (p >= single_base) {
      if (p === null_cs) { print_esc(e, 'csname'); print_esc(e, 'endcsname'); print_char(e, 32) }
      else { print_esc(e, p - single_base); if (e.equiv[cat_code_base + p - single_base] === Cmd.letter) print_char(e, 32) }
    } else if (p < active_base) print_esc(e, 'IMPOSSIBLE.')
    else print(e, p - active_base)
  } else if (p >= undefined_control_sequence) print_esc(e, 'IMPOSSIBLE.')
  else { print_esc(e, e.text.get(p) ?? 0); print_char(e, 32) } // an empty slot has text(p)=0
}

// §263 sprint_cs
export function sprint_cs(e: Engine, p: number): void {
  if (p < hash_base) {
    if (p < single_base) print(e, p - active_base)
    else if (p < null_cs) print_esc(e, p - single_base)
    else { print_esc(e, 'csname'); print_esc(e, 'endcsname') }
  } else print_esc(e, e.text.get(p) ?? 0)
}

// §264 primitive; returns cur_val, the new eqtb location
export function primitive(e: Engine, s: string, c: number, o: number): number {
  const p = s.length === 1 ? s.charCodeAt(0) + single_base : lookup(e, s)
  e.eq_level[p] = level_one; e.eq_type[p] = c; e.equiv[p] = o
  return p
}
