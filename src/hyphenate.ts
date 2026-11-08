// §891–965 pre-hyphenation, post-hyphenation, Liang's hyphenation, \hyphenation and \patterns (tex.ch: exceptions in a
// simple hash, bigger tries; e-TeX's \savinghyphcodes is inactive outside e-TeX mode, so hyph_index is always 0)
import type { Engine } from './engine.ts'
import { Cmd } from './types.ts'
import { print, print_esc } from './print.ts'
import { error, print_err, help, overflow } from './error.ts'
import { int_par, lc_code_base } from './eqtb.ts'
import { new_char, new_kern, new_ligature, new_lig_item, new_disc, flush_node_list, flush_list, is_char_node, garbage,
  ligature_node, kern_node, math_node, whatsit_node, glue_node, penalty_node, ins_node, adjust_node, mark_node, normal, L_code,
  language_node } from './nodes.ts'
import type { Node, CharNode, LigNode, DiscNode } from './nodes.ts'
import { char_info, char_tag, lig_kern_start, lig_kern_restart, skip_byte, next_char, op_byte, rem_byte, char_kern, stop_flag,
  kern_flag, lig_tag, non_char, non_address, new_character } from './tfm.ts'
import { get_x_token } from './expand.ts'
import { scan_left_brace, scan_char_num, scan_toks } from './scan.ts'

const uc_hyph_code = 38, language_code = 50
const max_trie_op = 65535

// §892, §900, §905, §921, §926, §943, §947, §950 the hyphenation globals
export function hyph_state() {
  return {
    hc: new Array<number>(66).fill(0), hn: 0, ha: null as Node | null, hb: null as Node | null, hf: 0,
    hu: new Array<number>(64).fill(0), hyf_char: 0, cur_lang: 0, l_hyf: 0, r_hyf: 0, hyf_bchar: 0,
    hyf: new Array<number>(65).fill(0), init_list: null as Node | null, init_lig: false, init_lft: false, hyphen_passed: 0,
    hold_head: new_char(0, 0) as Node,
    trie_link: [] as number[], trie_char: [] as number[], trie_op: [] as number[],
    hyf_distance: [0], hyf_num: [0], hyf_next: [0], op_start: new Array<number>(256).fill(0),
    hyph_word: new Map<string, number[]>(), hyph_count: 0,
    trie_op_hash: new Map<string, number>(), trie_used: new Array<number>(256).fill(0), trie_op_lang: [0], trie_op_val: [0],
    trie_op_ptr: 0, max_op_used: 0,
    trie_c: [0], trie_o: [0], trie_l: [0], trie_r: [0], trie_ptr: 0, trie_ref: [] as number[],
    trie_taken: [] as boolean[], trie_back: [] as number[], trie_min: new Array<number>(256).fill(0), trie_max: 0, trie_not_ready: true,
  }
}
export type HyphState = ReturnType<typeof hyph_state>

const lc_code = (e: Engine, c: number) => e.equiv[lc_code_base + c]!
// §934 set_cur_lang
const set_cur_lang = (e: Engine) => { const l = int_par(e, language_code); e.hy.cur_lang = l <= 0 || l > 255 ? 0 : l }

// §894 Try to hyphenate the following word (cur_p is a glue node)
export function try_hyphenate(e: Engine, cur_p: Node): void {
  const h = e.hy
  let prev_s: Node = cur_p, s: Node | null = prev_s.link
  if (s === null) return
  // §896 Skip to node ha, or goto done1 if no hyphenation should be attempted
  for (;;) {
    let c: number
    skip: {
      if (is_char_node(s)) { c = s.character; h.hf = s.font }
      else if (s.type === ligature_node) {
        if (s.lig_ptr === null) break skip
        const q = s.lig_ptr as CharNode; c = q.character; h.hf = q.font
      } else if (s.type === kern_node && s.subtype === normal) break skip
      else if (s.type === math_node && s.subtype >= L_code) break skip
      else if (s.type === whatsit_node) { // §1363
        if (s.subtype === language_node) { h.cur_lang = s.what_lang; h.l_hyf = s.what_lhm; h.r_hyf = s.what_rhm }
        break skip
      } else return
      h.hc[0] = lc_code(e, c)
      if (h.hc[0] !== 0) {
        if (h.hc[0] === c || int_par(e, uc_hyph_code) > 0) break
        return
      }
    }
    prev_s = s; s = prev_s.link!
  }
  h.hyf_char = e.hyphen_char[h.hf]!
  if (h.hyf_char < 0 || h.hyf_char > 255) return
  h.ha = prev_s
  if (h.l_hyf + h.r_hyf > 63) return
  // §897 Skip to node hb, putting letters into hu and hc
  h.hn = 0
  done3: for (;;) {
    if (is_char_node(s)) {
      if (s.font !== h.hf) break
      h.hyf_bchar = s.character; const c = h.hyf_bchar
      h.hc[0] = lc_code(e, c)
      if (h.hc[0] === 0) break
      if (h.hn === 63) break
      h.hb = s; h.hn++; h.hu[h.hn] = c; h.hc[h.hn] = h.hc[0]; h.hyf_bchar = non_char
    } else if (s.type === ligature_node) { // §898 Move the characters of a ligature node to hu and hc
      if (s.font !== h.hf) break
      let j = h.hn, q = s.lig_ptr
      if (q !== null) h.hyf_bchar = (q as CharNode).character
      while (q !== null) {
        const c = (q as CharNode).character
        h.hc[0] = lc_code(e, c)
        if (h.hc[0] === 0) break done3
        if (j === 63) break done3
        j++; h.hu[j] = c; h.hc[j] = h.hc[0]
        q = q.link
      }
      h.hb = s; h.hn = j
      h.hyf_bchar = (s.subtype & 1) === 1 ? e.font_bchar[h.hf]! : non_char
    } else if (s.type === kern_node && s.subtype === normal) { h.hb = s; h.hyf_bchar = e.font_bchar[h.hf]! }
    else break
    s = s.link!
  }
  // §899 Check that the nodes following hb permit hyphenation and that at least l_hyf+r_hyf letters have been found
  if (h.hn < h.l_hyf + h.r_hyf) return
  done4: for (;;) {
    if (!is_char_node(s)) switch (s.type) {
      case ligature_node: break
      case kern_node: if (s.subtype !== normal) break done4; break
      case whatsit_node: case glue_node: case penalty_node: case ins_node: case adjust_node: case mark_node: break done4
      case math_node: if (s.subtype >= L_code) break done4; return
      default: return
    }
    s = s.link!
  }
  hyphenate(e, cur_p)
}

// §895 hyphenate
function hyphenate(e: Engine, cur_p: Node): void {
  const h = e.hy, hc = h.hc, hyf = h.hyf, hu = h.hu
  // §923 Find hyphen locations for the word in hc, or return
  for (let j = 0; j <= h.hn; j++) hyf[j] = 0
  found: {
    // §930 Look for the word hc[1..hn] in the exception table
    const list = h.hyph_word.get(String.fromCharCode(...hc.slice(1, h.hn + 1), h.cur_lang))
    if (list !== undefined) { for (const k of list) hyf[k] = 1; break found }
    if (h.trie_char[h.cur_lang + 1] !== h.cur_lang) return
    hc[0] = 0; hc[h.hn + 1] = 0; hc[h.hn + 2] = 256
    for (let j = 0; j <= h.hn - h.r_hyf + 1; j++) {
      let z = h.trie_link[h.cur_lang + 1]! + hc[j]!, l = j
      while (hc[l] === h.trie_char[z]) {
        if (h.trie_op[z] !== 0) { // §924 Store maximum values in the hyf table
          let v = h.trie_op[z]!
          do {
            v += h.op_start[h.cur_lang]!; const i = l - h.hyf_distance[v]!
            if (h.hyf_num[v]! > hyf[i]!) hyf[i] = h.hyf_num[v]!
            v = h.hyf_next[v]!
          } while (v !== 0)
        }
        l++; z = h.trie_link[z]! + hc[l]!
      }
    }
  }
  for (let j = 0; j <= h.l_hyf - 1; j++) hyf[j] = 0
  for (let j = 0; j <= h.r_hyf - 1; j++) hyf[h.hn - j] = 0
  // §902 If no hyphens were found, return
  let any = false
  for (let j = h.l_hyf; j <= h.hn - h.r_hyf; j++) if ((hyf[j]! & 1) === 1) { any = true; break }
  if (!any) return
  // §903 Replace nodes ha..hb by a sequence of nodes that includes the discretionary hyphens
  const ha = h.ha!, hb = h.hb!, hf = h.hf
  const q = hb.link; hb.link = null; const r = ha.link!; ha.link = null
  const bchar = h.hyf_bchar
  let s: Node, j: number
  common: {
    found2: {
      if (is_char_node(ha)) {
        if (ha.font !== hf) break found2
        h.init_list = ha; h.init_lig = false; hu[0] = ha.character
      } else if (ha.type === ligature_node) {
        if (ha.font !== hf) break found2
        h.init_list = ha.lig_ptr; h.init_lig = true; h.init_lft = ha.subtype > 1
        hu[0] = ha.character
        if (h.init_list === null && h.init_lft) { hu[0] = 256; h.init_lig = false }
      } else {
        if (!is_char_node(r) && r.type === ligature_node && r.subtype > 1) break found2
        j = 1; s = ha; h.init_list = null; break common
      }
      s = cur_p
      while (s.link !== ha) s = s.link!
      j = 0; break common
    }
    s = ha; j = 0; hu[0] = 256; h.init_lig = false; h.init_list = null
  }
  flush_node_list(e, r)
  // §913 Reconstitute nodes for the hyphenated word, inserting discretionary hyphens
  const hold_head = h.hold_head
  do {
    let l = j
    j = reconstitute(e, j, h.hn, bchar, h.hyf_char) + 1
    if (h.hyphen_passed === 0) {
      s.link = hold_head.link
      while (s.link !== null) s = s.link
      if ((hyf[j - 1]! & 1) === 1) { l = j; h.hyphen_passed = j - 1; hold_head.link = null }
    }
    if (h.hyphen_passed > 0) {
      // §914 Create and append a discretionary node as an alternative to the unhyphenated word, and continue to develop
      // both branches until they become equivalent
      do {
        const rr: DiscNode = new_disc()
        rr.link = hold_head.link
        let major_tail: Node = rr, r_count = 0
        while (major_tail.link !== null) { major_tail = major_tail.link; r_count++ }
        let i = h.hyphen_passed; hyf[i] = 0
        // §915 Put the characters hu[l..i] and a hyphen into pre_break(r)
        let minor_tail: Node | null = null, c = 0
        rr.pre_break = null
        const hyf_node = new_character(e, hf, h.hyf_char)
        if (hyf_node !== null) { i++; c = hu[i]!; hu[i] = h.hyf_char }
        while (l <= i) {
          l = reconstitute(e, l, i, e.font_bchar[hf]!, non_char) + 1
          if (hold_head.link !== null) {
            if (minor_tail === null) rr.pre_break = hold_head.link; else minor_tail.link = hold_head.link
            minor_tail = hold_head.link
            while (minor_tail.link !== null) minor_tail = minor_tail.link
          }
        }
        if (hyf_node !== null) { hu[i] = c; l = i; i-- }
        // §916 Put the characters hu[i+1..] into post_break(r), appending to this list and to major_tail until
        // synchronization has been achieved
        minor_tail = null; rr.post_break = null; let c_loc = 0
        if (e.bchar_label[hf] !== non_address) { l--; c = hu[l]!; c_loc = l; hu[l] = 256 }
        while (l < j) {
          do {
            l = reconstitute(e, l, h.hn, bchar, non_char) + 1
            if (c_loc > 0) { hu[c_loc] = c; c_loc = 0 }
            if (hold_head.link !== null) {
              if (minor_tail === null) rr.post_break = hold_head.link; else minor_tail.link = hold_head.link
              minor_tail = hold_head.link
              while (minor_tail.link !== null) minor_tail = minor_tail.link
            }
          } while (l < j)
          while (l > j) { // §917 Append characters of hu[j..] to major_tail, advancing j
            j = reconstitute(e, j, h.hn, bchar, non_char) + 1
            major_tail.link = hold_head.link
            while (major_tail.link !== null) { major_tail = major_tail.link; r_count++ }
          }
        }
        // §918 Move pointer s to the end of the current list, and set replace_count(r) appropriately
        if (r_count > 127) { s.link = rr.link; rr.link = null; flush_node_list(e, rr) }
        else { s.link = rr; rr.replace_count = r_count }
        s = major_tail
        h.hyphen_passed = j - 1; hold_head.link = null
      } while ((hyf[j - 1]! & 1) === 1)
    }
  } while (j <= h.hn)
  s.link = q // §903 flush_list(init_list) is left to the garbage collector
}

// §905 reconstitute
function reconstitute(e: Engine, j: number, n: number, bchar: number, hchar: number): number {
  const h = e.hy, hf = h.hf, hu = h.hu, hyf = h.hyf
  h.hyphen_passed = 0
  let t: Node = h.hold_head, w = 0, cur_rh = non_char
  h.hold_head.link = null
  const append_charnode_to_t = (c: number) => { const p = new_char(hf, c); t.link = p; t = p }
  const set_cur_r = () => {
    e.cur_r = j < n ? hu[j + 1]! : bchar
    cur_rh = (hyf[j]! & 1) === 1 ? hchar : non_char
  }
  const wrap_lig = (rt: boolean) => {
    if (e.ligature_present) {
      const p = new_ligature(hf, e.cur_l, e.cur_q.link)
      if (e.lft_hit) { p.subtype = 2; e.lft_hit = false }
      if (rt && e.lig_stack === null) { p.subtype++; e.rt_hit = false }
      e.cur_q.link = p; t = p; e.ligature_present = false
    }
  }
  const pop_lig_stack = () => {
    const ls = e.lig_stack as LigNode
    if (ls.lig_ptr !== null) { t.link = ls.lig_ptr; t = t.link!; j++ }
    e.lig_stack = ls.link
    if (e.lig_stack === null) set_cur_r(); else e.cur_r = (e.lig_stack as LigNode).character
  }
  // §908 Set up data structures with the cursor following position j
  e.cur_l = hu[j]!; e.cur_q = t
  if (j === 0) {
    e.ligature_present = h.init_lig
    let p = h.init_list
    if (e.ligature_present) e.lft_hit = h.init_lft
    while (p !== null) { append_charnode_to_t((p as CharNode).character); p = p.link }
  } else if (e.cur_l < non_char) append_charnode_to_t(e.cur_l)
  e.lig_stack = null; set_cur_r()
  cont: for (;;) {
    // §909 If there's a ligature or kern at the cursor position, update the data structures, possibly advancing j;
    // continue until the cursor moves
    done: {
      let k: number, q: number
      if (e.cur_l === non_char) {
        k = e.bchar_label[hf]!
        if (k === non_address) break done
        q = e.font_info[k]!
      } else {
        q = char_info(e, hf, e.cur_l)
        if (char_tag(q) !== lig_tag) break done
        k = lig_kern_start(e, hf, q); q = e.font_info[k]!
        if (skip_byte(q) > stop_flag) { k = lig_kern_restart(e, hf, q); q = e.font_info[k]! }
      }
      const test_char = cur_rh < non_char ? cur_rh : e.cur_r
      for (;;) {
        if (next_char(q) === test_char && skip_byte(q) <= stop_flag) {
          if (cur_rh < non_char) { h.hyphen_passed = j; hchar = non_char; cur_rh = non_char; continue cont }
          if (hchar < non_char && (hyf[j]! & 1) === 1) { h.hyphen_passed = j; hchar = non_char }
          if (op_byte(q) < kern_flag) {
            // §911 Carry out a ligature replacement, updating the cursor structure and possibly advancing j
            if (e.cur_l === non_char) e.lft_hit = true
            if (j === n && e.lig_stack === null) e.rt_hit = true
            switch (op_byte(q)) {
              case 1: case 5: e.cur_l = rem_byte(q); e.ligature_present = true; break
              case 2: case 6:
                e.cur_r = rem_byte(q)
                if (e.lig_stack !== null) (e.lig_stack as LigNode).character = e.cur_r
                else {
                  const ls = new_lig_item(e.cur_r); e.lig_stack = ls
                  if (j === n) bchar = non_char
                  else ls.lig_ptr = new_char(hf, hu[j + 1]!)
                }
                break
              case 3: {
                e.cur_r = rem_byte(q)
                const p = e.lig_stack; e.lig_stack = new_lig_item(e.cur_r); e.lig_stack.link = p
                break
              }
              case 7: case 11:
                wrap_lig(false)
                e.cur_q = t; e.cur_l = rem_byte(q); e.ligature_present = true
                break
              default:
                e.cur_l = rem_byte(q); e.ligature_present = true
                if (e.lig_stack !== null) pop_lig_stack()
                else if (j === n) break done
                else { append_charnode_to_t(e.cur_r); j++; set_cur_r() }
            }
            if (op_byte(q) > 4 && op_byte(q) !== 7) break done
            continue cont
          }
          w = char_kern(e, hf, q); break done
        }
        if (skip_byte(q) >= stop_flag) {
          if (cur_rh === non_char) break done
          cur_rh = non_char; continue cont
        }
        k += skip_byte(q) + 1; q = e.font_info[k]!
      }
    }
    // §910 Append a ligature and/or kern to the translation; goto continue if the stack of inserted ligatures is nonempty
    wrap_lig(e.rt_hit)
    if (w !== 0) { t.link = new_kern(w); t = t.link; w = 0 }
    if (e.lig_stack !== null) {
      e.cur_q = t; e.cur_l = (e.lig_stack as LigNode).character; e.ligature_present = true
      pop_lig_stack(); continue
    }
    return j
  }
}

// §934 new_hyph_exceptions
export function new_hyph_exceptions(e: Engine): void {
  const h = e.hy
  scan_left_brace(e); set_cur_lang(e)
  // §935 Enter as many hyphenation exceptions as are listed, until coming to a right brace
  let n = 0, p: number[] = []
  for (;;) {
    get_x_token(e)
    for (;;) { // reswitch
      switch (e.cur_cmd) {
        case Cmd.letter: case Cmd.other_char: case Cmd.char_given: // §937 Append a new letter or hyphen
          if (e.cur_chr === 45) { if (n < 63) p.push(n) } // §938
          else {
            h.hc[0] = lc_code(e, e.cur_chr)
            if (h.hc[0] === 0) {
              print_err(e, 'Not a letter')
              help(e, 'Letters in \\hyphenation words must have \\lccode>0.', "Proceed; I'll ignore the character I just read.")
              error(e)
            } else if (n < 63) { n++; h.hc[n] = h.hc[0] }
          }
          break
        case Cmd.char_num: scan_char_num(e); e.cur_chr = e.cur_val; e.cur_cmd = Cmd.char_given; continue
        case Cmd.spacer: case Cmd.right_brace:
          if (n > 1) { // §939 Enter a hyphenation exception
            n++; h.hc[n] = h.cur_lang
            const key = String.fromCharCode(...h.hc.slice(1, n + 1))
            // §940 tex.ch: a repeated word replaces the old entry without counting
            if (h.hyph_count === e.lim.hyph_size) overflow(e, 'exception dictionary', e.lim.hyph_size)
            if (!h.hyph_word.has(key)) h.hyph_count++
            h.hyph_word.set(key, p)
          }
          if (e.cur_cmd === Cmd.right_brace) return
          n = 0; p = []
          break
        default: // §936 Give improper \hyphenation error
          print_err(e, 'Improper '); print_esc(e, 'hyphenation'); print(e, ' will be flushed')
          help(e, 'Hyphenation exceptions must contain only letters', "and hyphens. But continue; I'll forgive and forget.")
          error(e)
      }
      break
    }
  }
}

// §944 new_trie_op
function new_trie_op(e: Engine, d: number, n: number, v: number): number {
  const h = e.hy, key = `${d},${n},${v},${h.cur_lang}`
  const l = h.trie_op_hash.get(key)
  if (l !== undefined) return h.trie_op_val[l]!
  if (h.trie_op_ptr === e.lim.trie_op_size) overflow(e, 'pattern memory ops', e.lim.trie_op_size)
  let u = h.trie_used[h.cur_lang]!
  if (u === max_trie_op) overflow(e, 'pattern memory ops per language', max_trie_op)
  h.trie_op_ptr++; u++; h.trie_used[h.cur_lang] = u
  if (u > h.max_op_used) h.max_op_used = u
  const k = h.trie_op_ptr
  h.hyf_distance[k] = d; h.hyf_num[k] = n; h.hyf_next[k] = v; h.trie_op_lang[k] = h.cur_lang
  h.trie_op_hash.set(key, k); h.trie_op_val[k] = u
  return u
}

// §948 trie_node: the first node seen with the same c, o, l, r
function trie_node(h: HyphState, seen: Map<string, number>, p: number): number {
  const key = `${h.trie_c[p]},${h.trie_o[p]},${h.trie_l[p]},${h.trie_r[p]}`
  const q = seen.get(key)
  if (q !== undefined) return q
  seen.set(key, p)
  return p
}

// §949 compress_trie
function compress_trie(h: HyphState, seen: Map<string, number>, p: number): number {
  if (p === 0) return 0
  h.trie_l[p] = compress_trie(h, seen, h.trie_l[p]!)
  h.trie_r[p] = compress_trie(h, seen, h.trie_r[p]!)
  return trie_node(h, seen, p)
}

// §953 first_fit
function first_fit(e: Engine, p: number): void {
  const t = e.hy
  const c = t.trie_c[p]!
  let z = t.trie_min[c]!, h: number
  for (;;) {
    h = z - c
    if (t.trie_max < h + 256) { // §954 Ensure that trie_max>=h+256
      if (e.lim.trie_size <= h + 256) overflow(e, 'pattern memory', e.lim.trie_size)
      do {
        t.trie_max++; t.trie_taken[t.trie_max] = false
        t.trie_link[t.trie_max] = t.trie_max + 1; t.trie_back[t.trie_max] = t.trie_max - 1
      } while (t.trie_max !== h + 256)
    }
    fits: if (!t.trie_taken[h]) { // §955 If all characters of the family fit relative to h, then goto found
      for (let q = t.trie_r[p]!; q > 0; q = t.trie_r[q]!) if (t.trie_link[h + t.trie_c[q]!] === 0) break fits
      break
    }
    z = t.trie_link[z]!
  }
  // §956 Pack the family into trie relative to h
  t.trie_taken[h] = true; t.trie_ref[p] = h
  let q = p
  do {
    z = h + t.trie_c[q]!
    let l = t.trie_back[z]!
    const r = t.trie_link[z]!
    t.trie_back[r] = l; t.trie_link[l] = r; t.trie_link[z] = 0
    if (l < 256) {
      const ll = z < 256 ? z : 256
      do { t.trie_min[l] = r; l++ } while (l !== ll)
    }
    q = t.trie_r[q]!
  } while (q !== 0)
}

// §957 trie_pack
function trie_pack(e: Engine, p: number): void {
  const t = e.hy
  do {
    const q = t.trie_l[p]!
    if (q > 0 && (t.trie_ref[q] ?? 0) === 0) { first_fit(e, q); trie_pack(e, q) }
    p = t.trie_r[p]!
  } while (p !== 0)
}

// §959 trie_fix
function trie_fix(t: HyphState, p: number): void {
  const z = t.trie_ref[p]!
  do {
    const q = t.trie_l[p]!, c = t.trie_c[p]!
    t.trie_link[z + c] = t.trie_ref[q] ?? 0; t.trie_char[z + c] = c; t.trie_op[z + c] = t.trie_o[p]!
    if (q > 0) trie_fix(t, q)
    p = t.trie_r[p]!
  } while (p !== 0)
}

// §960 new_patterns
export function new_patterns(e: Engine): void {
  const h = e.hy, hc = h.hc, hyf = h.hyf
  if (!h.trie_not_ready) {
    print_err(e, 'Too late for '); print_esc(e, 'patterns')
    help(e, 'All patterns must be given before typesetting begins.')
    error(e); e.link[garbage] = scan_toks(e, false, false); flush_list(e, e.def_ref)
    return
  }
  set_cur_lang(e); scan_left_brace(e)
  // §961 Enter all of the patterns into a linked trie, until coming to a right brace
  let k = 0, digit_sensed = false
  hyf[0] = 0
  for (;;) {
    get_x_token(e)
    switch (e.cur_cmd) {
      case Cmd.letter: case Cmd.other_char: // §962 Append a new letter or a hyphen level
        if (digit_sensed || e.cur_chr < 48 || e.cur_chr > 57) {
          if (e.cur_chr === 46) e.cur_chr = 0
          else {
            e.cur_chr = lc_code(e, e.cur_chr)
            if (e.cur_chr === 0) { print_err(e, 'Nonletter'); help(e, '(See Appendix H.)'); error(e) }
          }
          if (k < 63) { k++; hc[k] = e.cur_chr; hyf[k] = 0; digit_sensed = false }
        } else if (k < 63) { hyf[k] = e.cur_chr - 48; digit_sensed = true }
        break
      case Cmd.spacer: case Cmd.right_brace:
        if (k > 0) { // §963 Insert a new pattern into the linked trie
          // §965 Compute the trie op code, v, and set l:=0
          if (hc[1] === 0) hyf[0] = 0
          if (hc[k] === 0) hyf[k] = 0
          let l = k, v = 0
          for (;;) {
            if (hyf[l] !== 0) v = new_trie_op(e, k - l, hyf[l]!, v)
            if (l > 0) l--; else break
          }
          let q = 0
          hc[0] = h.cur_lang
          while (l <= k) {
            const c = hc[l]!
            l++
            let p = h.trie_l[q]!, first_child = true
            while (p > 0 && c > h.trie_c[p]!) { q = p; p = h.trie_r[q]!; first_child = false }
            if (p === 0 || c < h.trie_c[p]!) { // §964 Insert a new trie node between q and p, and make p point to it
              if (h.trie_ptr === e.lim.trie_size) overflow(e, 'pattern memory', e.lim.trie_size)
              h.trie_ptr++; h.trie_r[h.trie_ptr] = p; p = h.trie_ptr; h.trie_l[p] = 0
              if (first_child) h.trie_l[q] = p; else h.trie_r[q] = p
              h.trie_c[p] = c; h.trie_o[p] = 0
            }
            q = p
          }
          if (h.trie_o[q] !== 0) { print_err(e, 'Duplicate pattern'); help(e, '(See Appendix H.)'); error(e) }
          h.trie_o[q] = v
        }
        if (e.cur_cmd === Cmd.right_brace) return
        k = 0; hyf[0] = 0; digit_sensed = false
        break
      default: print_err(e, 'Bad '); print_esc(e, 'patterns'); help(e, '(See Appendix H.)'); error(e)
    }
  }
}

// §966 init_trie
export function init_trie(e: Engine): void {
  const t = e.hy
  // §952 Get ready to compress the trie; §945 Sort the hyphenation op tables into proper order
  t.op_start[0] = 0
  for (let j = 1; j <= 255; j++) t.op_start[j] = t.op_start[j - 1]! + t.trie_used[j - 1]!
  const dest = [0]
  for (let j = 1; j <= t.trie_op_ptr; j++) dest[j] = t.op_start[t.trie_op_lang[j]!]! + t.trie_op_val[j]!
  for (let j = 1; j <= t.trie_op_ptr; j++) while (dest[j]! > j) {
    const k = dest[j]!
    let x = t.hyf_distance[k]!; t.hyf_distance[k] = t.hyf_distance[j]!; t.hyf_distance[j] = x
    x = t.hyf_num[k]!; t.hyf_num[k] = t.hyf_num[j]!; t.hyf_num[j] = x
    x = t.hyf_next[k]!; t.hyf_next[k] = t.hyf_next[j]!; t.hyf_next[j] = x
    dest[j] = dest[k]!; dest[k] = k
  }
  t.trie_l[0] = compress_trie(t, new Map(), t.trie_l[0]!) // trie_root
  t.trie_ref = []
  for (let p = 0; p <= 255; p++) t.trie_min[p] = p + 1
  t.trie_link[0] = 1; t.trie_max = 0
  if (t.trie_l[0] !== 0) { first_fit(e, t.trie_l[0]!); trie_pack(e, t.trie_l[0]!) }
  // §958 Move the data into trie
  if (t.trie_max === 0) {
    for (let r = 0; r <= 256; r++) { t.trie_link[r] = 0; t.trie_op[r] = 0; t.trie_char[r] = 0 }
    t.trie_max = 256
  } else {
    trie_fix(t, t.trie_l[0]!)
    let r = 0
    do { const s = t.trie_link[r]!; t.trie_link[r] = 0; t.trie_op[r] = 0; t.trie_char[r] = 0; r = s } while (r <= t.trie_max)
  }
  t.trie_char[0] = 63
  t.trie_not_ready = false
}
