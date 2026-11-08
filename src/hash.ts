// §256–264 the hash table: names live in a Map instead of str_pool and coalesced lists
import type { Engine } from './engine.ts'
import { print, print_char, print_esc } from './print.ts'
import { overflow } from './error.ts'
import { hash_base, single_base, active_base, null_cs, undefined_control_sequence, cat_code_base, level_one, prim_eqtb_base,
  frozen_null_font } from './eqtb.ts'
import { Cmd, hash_size } from './types.ts'

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
    if (e.hash_used === hash_base) overflow(e, 'hash size', hash_size) // tex.ch: hash_size+hash_extra
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
  else { print_esc(e, p >= prim_eqtb_base && p < frozen_null_font ? e.prim_text[p - prim_eqtb_base]! : e.text.get(p) ?? 0); print_char(e, 32) } // an empty slot has text(p)=0
}

// §263 sprint_cs
export function sprint_cs(e: Engine, p: number): void {
  if (p < hash_base) {
    if (p < single_base) print(e, p - active_base)
    else if (p < null_cs) print_esc(e, p - single_base)
    else { print_esc(e, 'csname'); print_esc(e, 'endcsname') }
  } else if (p >= prim_eqtb_base && p < frozen_null_font) print_esc(e, e.prim_text[p - prim_eqtb_base]!)
  else print_esc(e, e.text.get(p) ?? 0)
}

// pdftex.web prim_lookup: the primitives table, a Map by name (one-character names included); 0 is undefined_primitive.
// A new entry is made only while no_new_control_sequence is false (INITEX's primitive calls).
// prim_text[p] is a number for a one-character primitive, as TeX's prim_text(p)-1 is a character code.
export function prim_lookup(e: Engine, s: string): number {
  const p = e.prim.get(s)
  if (p !== undefined) return p
  if (e.no_new_control_sequence) return 0
  e.prim_text.push(s.length === 1 ? s.charCodeAt(0) : s); e.prim.set(s, e.prim_text.length - 1)
  return e.prim_text.length - 1
}

// pdftex.web: prim_lookup(cur_cs-single_base) for cur_cs<hash_base, else prim_lookup(text(cur_cs))
export function prim_lookup_cs(e: Engine, cs: number): number {
  if (cs < hash_base) {
    // shortcut: null_cs looks up string 256 of pdftex's pool (not a primitive's name); we answer undefined_primitive
    if (cs < single_base || cs === null_cs) return 0
    return prim_lookup(e, String.fromCharCode(cs - single_base))
  }
  const t = e.text.get(cs) // the prim_eqtb copies have text 0, i.e. character 0, not a primitive
  return t === undefined || (cs >= prim_eqtb_base && cs < frozen_null_font) ? 0 : prim_lookup(e, t)
}

// §264 primitive (pdftex.web: also enters the primitives table and its eqtb copy); returns cur_val, the new eqtb location
export function primitive(e: Engine, s: string, c: number, o: number): number {
  const p = s.length === 1 ? s.charCodeAt(0) + single_base : lookup(e, s)
  e.eq_level[p] = level_one; e.eq_type[p] = c; e.equiv[p] = o
  const q = prim_eqtb_base + prim_lookup(e, s)
  e.eq_level[q] = level_one; e.eq_type[q] = c; e.equiv[q] = o
  return p
}
