// §256–264 the hash table: §259's hash over the name's bytes, chains through hash_next, names in str_pool (cs names only)
import type { Engine } from './engine.ts'
import { print, print_char, print_esc } from './print.ts'
import { overflow } from './error.ts'
import { hash_base, single_base, active_base, null_cs, undefined_control_sequence, cat_code_base, level_one, prim_eqtb_base,
  frozen_null_font, frozen_control_sequence } from './eqtb.ts'
import { Cmd } from './types.ts'

// tex.ch: about 85% of tex.ch's hash_size=15000. A chain starts at hash_head[h], not at eqtb location h+hash_base: a new name
// still takes the next free location below hash_used, so control sequences keep the locations the Map-based table gave them.
export const hash_prime = 8501

// text(p) as a string, undefined for text(p)=0: str_pool[text_start[p]] onwards, text_len[p] bytes; text_start 0 means no text
export function text(e: Engine, p: number): string | undefined {
  const s = e.text_start[p]!
  if (s === 0) return undefined
  let t = ''
  for (let k = s, n = s + e.text_len[p]!; k < n; k++) t += String.fromCharCode(e.str_pool[k]!)
  return t
}
// text(p):=s for a location outside the hash chains (frozen control sequences, font identifiers)
export function set_text(e: Engine, p: number, s: string): void {
  const b = new Uint8Array(s.length)
  for (let k = 0; k < s.length; k++) b[k] = s.charCodeAt(k)
  store_text(e, p, b, 0, b.length)
}
function store_text(e: Engine, p: number, a: Uint8Array, j: number, l: number): void {
  if (e.pool_ptr + l > e.str_pool.length) { const q = new Uint8Array(2 * (e.pool_ptr + l)); q.set(e.str_pool); e.str_pool = q }
  e.text_start[p] = e.pool_ptr; e.text_len[p] = l
  e.str_pool.set(a.subarray(j, j + l), e.pool_ptr); e.pool_ptr += l
}

// §259 id_lookup, for a name of length l>1 in buffer[j..j+l-1]
export function id_lookup(e: Engine, j: number, l: number): number {
  return lookup(e, e.buffer, j, l)
}

// §259–261 the name a[j..j+l-1]; §260 a new entry takes the next free location below hash_used
function lookup(e: Engine, a: Uint8Array, j: number, l: number): number {
  let h = a[j]!
  for (let k = j + 1; k < j + l; k++) { h = h + h + a[k]!; while (h >= hash_prime) h -= hash_prime } // §261
  const pool = e.str_pool, start = e.text_start, len = e.text_len
  for (let p = e.hash_head[h]!; p !== 0; p = e.hash_next[p]!) {
    if (len[p] !== l) continue
    let k = start[p]!, i = j
    while (i < j + l && pool[k] === a[i]) { k++; i++ }
    if (i === j + l) return p
  }
  if (e.no_new_control_sequence) return undefined_control_sequence
  do {
    if (e.hash_used === frozen_control_sequence - e.lim.hash_size - e.lim.hash_extra) overflow(e, 'hash size', e.lim.hash_size + e.lim.hash_extra) // tex.ch
    e.hash_used--
  } while (e.text_start[e.hash_used] !== 0)
  const p = e.hash_used
  store_text(e, p, a, j, l); e.hash_next[p] = e.hash_head[h]!; e.hash_head[h] = p; e.cs_count++
  return p
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
  else { print_esc(e, p >= prim_eqtb_base && p < frozen_null_font ? e.prim_text[p - prim_eqtb_base]! : text(e, p) ?? 0); print_char(e, 32) } // an empty slot has text(p)=0
}

// §263 sprint_cs
export function sprint_cs(e: Engine, p: number): void {
  if (p < hash_base) {
    if (p < single_base) print(e, p - active_base)
    else if (p < null_cs) print_esc(e, p - single_base)
    else { print_esc(e, 'csname'); print_esc(e, 'endcsname') }
  } else if (p >= prim_eqtb_base && p < frozen_null_font) print_esc(e, e.prim_text[p - prim_eqtb_base]!)
  else print_esc(e, text(e, p) ?? 0)
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
  const t = text(e, cs) // the prim_eqtb copies have text 0, i.e. character 0, not a primitive
  return t === undefined || (cs >= prim_eqtb_base && cs < frozen_null_font) ? 0 : prim_lookup(e, t)
}

// §264 primitive (pdftex.web: also enters the primitives table and its eqtb copy); returns cur_val, the new eqtb location
export function primitive(e: Engine, s: string, c: number, o: number): number {
  const p = s.length === 1 ? s.charCodeAt(0) + single_base : lookup(e, Uint8Array.from(s, c => c.charCodeAt(0)), 0, s.length)
  e.eq_level[p] = level_one; e.eq_type[p] = c; e.equiv[p] = o
  const q = prim_eqtb_base + prim_lookup(e, s)
  e.eq_level[q] = level_one; e.eq_type[q] = c; e.equiv[q] = o
  return p
}
