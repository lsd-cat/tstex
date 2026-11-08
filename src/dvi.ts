// §583–643 DVI output and ship_out, §1366–1375 \write, \special and \openout during shipping
// The DVI bytes live in one growable buffer; dvi_ptr/dvi_limit/dvi_offset/dvi_gone are simulated exactly as with
// TeX Live's 16384-byte half-buffered dvi_buf, since movement() and dvi_pop() depend on them.
import type { Engine } from './engine.ts'
import { term_and_log, log_only, new_string } from './types.ts'
import { print, print_char, print_nl, print_ln, print_int, print_two, slow_print, begin_diagnostic, end_diagnostic } from './print.ts'
import { error, print_err, help, confusion, fatal_error, write_text } from './error.ts'
import { int_par, prepare_mag, count_base, dimen_base, end_write, mag_code, synctex_code } from './eqtb.ts'
import { show_token_list, token_show, cs_token_flag, right_brace_token, left_brace_token } from './tokens.ts'
import { get_avail, flush_list, flush_node_list, show_box, zround, is_char_node, hlist_node, vlist_node, rule_node, whatsit_node,
  glue_node, kern_node, math_node, ligature_node, normal, stretching, a_leaders, c_leaders, null_flag, open_node, write_node,
  close_node, special_node, latespecial_node, language_node, pdf_save_pos_node } from './nodes.ts'
import type { BoxNode, WhatsitNode } from './nodes.ts'
import { char_info, char_width, null_font } from './tfm.ts'
import { get_token, ins_list, begin_token_list, end_token_list } from './input.ts'
import { scan_toks } from './scan.ts'
import { open_log_file, print_file_name, prompt_file_name } from './files.ts'
import { fix_pdfoutput, pdf_ship_out } from './pdf.ts'

// §586 DVI opcodes
const set1 = 128, set_rule = 132, put_rule = 137, bop = 139, eop = 140, push = 141, pop = 142, right1 = 143,
  down1 = 157, y0 = 161, y1 = 162, z0 = 166, z1 = 167, fnt_num_0 = 171, fnt1 = 235, xxx1 = 239, xxx4 = 242,
  fnt_def1 = 243, pre = 247, post = 248, post_post = 249, id_byte = 2
const pdf_output_code = 65, tracing_output_code = 34, tracing_online_code = 29, tracing_stats_code = 31, h_offset_code = 18, v_offset_code = 19, pdf_page_height_code = 24
const max_dimen = 0o7777777777

// §598 dvi_out
function dvi_out(e: Engine, b: number): void {
  const at = e.dvi_offset + e.dvi_ptr
  if (at >= e.dvi_buf.length) { const n = new Uint8Array(e.dvi_buf.length * 2); n.set(e.dvi_buf); e.dvi_buf = n }
  e.dvi_buf[at] = b
  if (++e.dvi_ptr === e.dvi_limit) dvi_swap(e)
}
// §598 dvi_swap: only the bookkeeping, the bytes stay in place
function dvi_swap(e: Engine): void {
  if (e.dvi_limit === e.lim.dvi_buf_size) { e.dvi_limit = (e.lim.dvi_buf_size >> 1); e.dvi_offset += e.lim.dvi_buf_size; e.dvi_ptr = 0 }
  else e.dvi_limit = e.lim.dvi_buf_size
  e.dvi_gone += (e.lim.dvi_buf_size >> 1)
}

// §600 dvi_four
function dvi_four(e: Engine, x: number): void {
  dvi_out(e, (x >>> 24) & 255); dvi_out(e, (x >>> 16) & 255); dvi_out(e, (x >>> 8) & 255); dvi_out(e, x & 255)
}

// §601 dvi_pop
function dvi_pop(e: Engine, l: number): void {
  if (l === e.dvi_offset + e.dvi_ptr && e.dvi_ptr > 0) e.dvi_ptr--
  else dvi_out(e, pop)
}

// §602 dvi_font_def
function dvi_font_def(e: Engine, f: number): void {
  if (f <= 256) { dvi_out(e, fnt_def1); dvi_out(e, f - 1) }
  else { dvi_out(e, fnt_def1 + 1); dvi_out(e, (f - 1) >> 8); dvi_out(e, (f - 1) & 255) } // tex.ch [32.602]
  dvi_four(e, e.font_check[f]!)
  dvi_four(e, e.font_size[f]!); dvi_four(e, e.font_dsize[f]!)
  const a = e.font_area[f]!, n = e.font_name[f]!
  dvi_out(e, a.length); dvi_out(e, n.length)
  for (const s of a + n) dvi_out(e, s.charCodeAt(0)) // §603
}

// §605 movement stack entries
export type Movement = { link: Movement | null, width: number, location: number, info: number }
const y_here = 1, z_here = 2, yz_OK = 3, y_OK = 4, z_OK = 5, d_fixed = 6, none_seen = 0, y_seen = 6, z_seen = 12

// §607 movement
function movement(e: Engine, w: number, o: number): void {
  const q: Movement = { link: null, width: w, location: e.dvi_offset + e.dvi_ptr, info: 0 }
  if (o === down1) { q.link = e.down_ptr; e.down_ptr = q } else { q.link = e.right_ptr; e.right_ptr = q }
  // §611 Look at the other stack entries until deciding what sort of DVI command to generate; goto found if node p is a "hit"
  let p = q.link, mstate = none_seen
  found: {
    not_found: while (p !== null) {
      if (p.width === w) { // §612 Consider a node with matching width; goto found if it's a hit
        switch (mstate + p.info) {
          case none_seen + yz_OK: case none_seen + y_OK: case z_seen + yz_OK: case z_seen + y_OK:
            if (p.location < e.dvi_gone) break not_found
            e.dvi_buf[p.location] += y1 - down1; p.info = y_here; break found // §613
          case none_seen + z_OK: case y_seen + yz_OK: case y_seen + z_OK:
            if (p.location < e.dvi_gone) break not_found
            e.dvi_buf[p.location] += z1 - down1; p.info = z_here; break found // §614
          case none_seen + y_here: case none_seen + z_here: case y_seen + z_here: case z_seen + y_here: break found
        }
      } else switch (mstate + p.info) {
        case none_seen + y_here: mstate = y_seen; break
        case none_seen + z_here: mstate = z_seen; break
        case y_seen + z_here: case z_seen + y_here: break not_found
      }
      p = p.link
    }
    // §610 Generate a down or right command for w and return
    q.info = yz_OK
    if (Math.abs(w) >= 0o40000000) { dvi_out(e, o + 3); dvi_four(e, w); return }
    if (Math.abs(w) >= 0o100000) {
      dvi_out(e, o + 2)
      if (w < 0) w += 0o100000000
      dvi_out(e, w >> 16); w = w % 0o200000
      dvi_out(e, w >> 8); dvi_out(e, w & 255); return
    }
    if (Math.abs(w) >= 0o200) {
      dvi_out(e, o + 1)
      if (w < 0) w += 0o200000
      dvi_out(e, w >> 8); dvi_out(e, w & 255); return
    }
    dvi_out(e, o)
    if (w < 0) w += 0o400
    dvi_out(e, w); return
  }
  // found: §609 Generate a y0 or z0 command in order to reuse a previous appearance of w
  let r: Movement = q
  r.info = p!.info
  if (r.info === y_here) {
    dvi_out(e, o + y0 - down1)
    while (r.link !== p) { r = r.link!; if (r.info === yz_OK) r.info = z_OK; else if (r.info === y_OK) r.info = d_fixed }
  } else {
    dvi_out(e, o + z0 - down1)
    while (r.link !== p) { r = r.link!; if (r.info === yz_OK) r.info = y_OK; else if (r.info === z_OK) r.info = d_fixed }
  }
}

// §615 prune_movements
function prune_movements(e: Engine, l: number): void {
  while (e.down_ptr !== null && e.down_ptr.location >= l) e.down_ptr = e.down_ptr.link
  while (e.right_ptr !== null && e.right_ptr.location >= l) e.right_ptr = e.right_ptr.link
}

// §616 synch_h, synch_v
function synch_h(e: Engine): void { if (e.cur_h !== e.dvi_h) { movement(e, (e.cur_h - e.dvi_h) | 0, right1); e.dvi_h = e.cur_h } }
function synch_v(e: Engine): void { if (e.cur_v !== e.dvi_v) { movement(e, (e.cur_v - e.dvi_v) | 0, down1); e.dvi_v = e.cur_v } }

// §625 round_glue; returns the new cur_g and keeps cur_glue in st
const billion = 1000000000
function glue_amount(e: Engine, st: { cur_g: number, cur_glue: number }, b: BoxNode, gp: number): void {
  const g = e.spec[gp]!
  if (b.glue_sign === normal) return
  if (b.glue_sign === stretching) {
    if (g.stretch_order !== b.glue_order) return
    st.cur_glue += g.stretch
  } else {
    if (g.shrink_order !== b.glue_order) return
    st.cur_glue -= g.shrink
  }
  let t = b.glue_set * st.cur_glue // vet_glue
  if (t > billion) t = billion; else if (t < -billion) t = -billion
  st.cur_g = zround(t)
}

// §619 hlist_out
function hlist_out(e: Engine, this_box: BoxNode): void {
  const st = { cur_g: 0, cur_glue: 0 }
  let p = this_box.list_ptr
  e.cur_s++
  if (e.cur_s > 0) dvi_out(e, push)
  if (e.cur_s > e.max_push) e.max_push = e.cur_s
  const save_loc = e.dvi_offset + e.dvi_ptr, base_line = e.cur_v, left_edge = e.cur_h
  while (p !== null) {
    // §620 Output node p for hlist_out and move to the next node, maintaining the condition cur_v=base_line
    if (is_char_node(p) || p.type === ligature_node) { // §652: a ligature looks like a char_node
      synch_h(e); synch_v(e)
      do {
        const f = p.font, c = p.character
        if (f !== e.dvi_f) { // §621 Change font dvi_f to f
          if (!e.font_used[f]) { dvi_font_def(e, f); e.font_used[f] = true }
          if (f <= 64) dvi_out(e, f - 1 + fnt_num_0)
          else if (f <= 256) { dvi_out(e, fnt1); dvi_out(e, f - 1) }
          else { dvi_out(e, fnt1 + 1); dvi_out(e, (f - 1) >> 8); dvi_out(e, (f - 1) & 255) } // tex.ch [32.621]
          e.dvi_f = f
        }
        if (c >= 128) dvi_out(e, set1)
        dvi_out(e, c)
        e.cur_h = (e.cur_h + char_width(e, f, char_info(e, f, c))) | 0
        p = p.link
      } while (p !== null && (is_char_node(p) || p.type === ligature_node))
      e.dvi_h = e.cur_h
      continue
    }
    // §622 Output the non-char_node p for hlist_out and move to the next node
    let rule_ht = 0, rule_dp = 0, rule_wd = 0
    fin_rule: {
      move_past: {
        switch (p.type) {
          case hlist_node: case vlist_node: // §623 Output a box in an hlist
            if (p.list_ptr === null) e.cur_h = (e.cur_h + p.width) | 0
            else {
              const save_h = e.dvi_h, save_v = e.dvi_v
              e.cur_v = (base_line + p.shift_amount) | 0
              const edge = (e.cur_h + p.width) | 0
              if (p.type === vlist_node) vlist_out(e, p); else hlist_out(e, p)
              e.dvi_h = save_h; e.dvi_v = save_v
              e.cur_h = edge; e.cur_v = base_line
            }
            break
          case rule_node: rule_ht = p.height; rule_dp = p.depth; rule_wd = p.width; break fin_rule
          case whatsit_node: out_what(e, p); break // §1367
          case glue_node: { // §625 Move right or output leaders
            rule_wd = (e.spec[p.glue_ptr]!.width - st.cur_g) | 0
            glue_amount(e, st, this_box, p.glue_ptr)
            rule_wd = (rule_wd + st.cur_g) | 0
            if (p.subtype >= a_leaders) { // §626 Output leaders in an hlist, goto fin_rule if a rule or to next_p if done
              const leader_box = p.leader_ptr!
              if (leader_box.type === rule_node) { rule_ht = leader_box.height; rule_dp = leader_box.depth; break fin_rule }
              const lb = leader_box as BoxNode, leader_wd = lb.width
              if (leader_wd > 0 && rule_wd > 0) {
                rule_wd = (rule_wd + 10) | 0
                const edge = (e.cur_h + rule_wd) | 0
                let lx = 0
                // §627 Let cur_h be the position of the first box, and set leader_wd+lx to the spacing between corresponding parts of boxes
                if (p.subtype === a_leaders) {
                  const save_h = e.cur_h
                  e.cur_h = (left_edge + leader_wd * Math.trunc((e.cur_h - left_edge) / leader_wd)) | 0
                  if (e.cur_h < save_h) e.cur_h = (e.cur_h + leader_wd) | 0
                } else {
                  const lq = Math.trunc(rule_wd / leader_wd), lr = rule_wd % leader_wd
                  if (p.subtype === c_leaders) e.cur_h = (e.cur_h + Math.trunc(lr / 2)) | 0
                  else { lx = Math.trunc(lr / (lq + 1)); e.cur_h = (e.cur_h + Math.trunc((lr - (lq - 1) * lx) / 2)) | 0 }
                }
                while (e.cur_h + leader_wd <= edge) { // §628 Output a leader box at cur_h, then advance cur_h by leader_wd+lx
                  e.cur_v = (base_line + lb.shift_amount) | 0; synch_v(e); const save_v = e.dvi_v
                  synch_h(e); const save_h = e.dvi_h
                  const outer_doing_leaders = e.doing_leaders; e.doing_leaders = true
                  if (lb.type === vlist_node) vlist_out(e, lb); else hlist_out(e, lb)
                  e.doing_leaders = outer_doing_leaders
                  e.dvi_v = save_v; e.dvi_h = save_h; e.cur_v = base_line
                  e.cur_h = (save_h + leader_wd + lx) | 0
                }
                e.cur_h = (edge - 10) | 0
                p = p.link; continue
              }
            }
            break move_past
          }
          case kern_node: e.cur_h = (e.cur_h + p.width) | 0; break
          case math_node: e.cur_h = (e.cur_h + p.width) | 0; break // §1409 (no TeXXeT)
        }
        p = p.link; continue
      }
      // move_past:
      e.cur_h = (e.cur_h + rule_wd) | 0
      p = p.link; continue
    }
    // fin_rule: §624 Output a rule in an hlist
    if (rule_ht === null_flag) rule_ht = this_box.height
    if (rule_dp === null_flag) rule_dp = this_box.depth
    rule_ht = (rule_ht + rule_dp) | 0
    if (rule_ht > 0 && rule_wd > 0) {
      synch_h(e); e.cur_v = (base_line + rule_dp) | 0; synch_v(e)
      dvi_out(e, set_rule); dvi_four(e, rule_ht); dvi_four(e, rule_wd)
      e.cur_v = base_line; e.dvi_h = (e.dvi_h + rule_wd) | 0
    }
    e.cur_h = (e.cur_h + rule_wd) | 0 // move_past
    p = p.link
  }
  prune_movements(e, save_loc)
  if (e.cur_s > 0) dvi_pop(e, save_loc)
  e.cur_s--
}

// §629 vlist_out
function vlist_out(e: Engine, this_box: BoxNode): void {
  const st = { cur_g: 0, cur_glue: 0 }
  let p = this_box.list_ptr
  e.cur_s++
  if (e.cur_s > 0) dvi_out(e, push)
  if (e.cur_s > e.max_push) e.max_push = e.cur_s
  const save_loc = e.dvi_offset + e.dvi_ptr, left_edge = e.cur_h
  e.cur_v = (e.cur_v - this_box.height) | 0
  const top_edge = e.cur_v
  for (; p !== null; p = p.link) {
    // §630 Output node p for vlist_out and move to the next node, maintaining the condition cur_h=left_edge
    if (is_char_node(p)) confusion(e, 'vlistout')
    let rule_ht = 0, rule_dp = 0, rule_wd = 0
    fin_rule: {
      switch (p.type) { // §631
        case hlist_node: case vlist_node: // §632 Output a box in a vlist
          if (p.list_ptr === null) e.cur_v = (e.cur_v + p.height + p.depth) | 0
          else {
            e.cur_v = (e.cur_v + p.height) | 0; synch_v(e)
            const save_h = e.dvi_h, save_v = e.dvi_v
            e.cur_h = (left_edge + p.shift_amount) | 0
            if (p.type === vlist_node) vlist_out(e, p); else hlist_out(e, p)
            e.dvi_h = save_h; e.dvi_v = save_v
            e.cur_v = (save_v + p.depth) | 0; e.cur_h = left_edge
          }
          continue
        case rule_node: rule_ht = p.height; rule_dp = p.depth; rule_wd = p.width; break fin_rule
        case whatsit_node: out_what(e, p); continue // §1366
        case glue_node: { // §634 Move down or output leaders
          rule_ht = (e.spec[p.glue_ptr]!.width - st.cur_g) | 0
          glue_amount(e, st, this_box, p.glue_ptr)
          rule_ht = (rule_ht + st.cur_g) | 0
          if (p.subtype >= a_leaders) { // §635 Output leaders in a vlist, goto fin_rule if a rule or to next_p if done
            const leader_box = p.leader_ptr!
            if (leader_box.type === rule_node) { rule_wd = leader_box.width; rule_dp = 0; break fin_rule }
            const lb = leader_box as BoxNode, leader_ht = (lb.height + lb.depth) | 0
            if (leader_ht > 0 && rule_ht > 0) {
              rule_ht = (rule_ht + 10) | 0
              const edge = (e.cur_v + rule_ht) | 0
              let lx = 0
              if (p.subtype === a_leaders) { // §636
                const save_v = e.cur_v
                e.cur_v = (top_edge + leader_ht * Math.trunc((e.cur_v - top_edge) / leader_ht)) | 0
                if (e.cur_v < save_v) e.cur_v = (e.cur_v + leader_ht) | 0
              } else {
                const lq = Math.trunc(rule_ht / leader_ht), lr = rule_ht % leader_ht
                if (p.subtype === c_leaders) e.cur_v = (e.cur_v + Math.trunc(lr / 2)) | 0
                else { lx = Math.trunc(lr / (lq + 1)); e.cur_v = (e.cur_v + Math.trunc((lr - (lq - 1) * lx) / 2)) | 0 }
              }
              while (e.cur_v + leader_ht <= edge) { // §637 Output a leader box at cur_v, then advance cur_v by leader_ht+lx
                e.cur_h = (left_edge + lb.shift_amount) | 0; synch_h(e); const save_h = e.dvi_h
                e.cur_v = (e.cur_v + lb.height) | 0; synch_v(e); const save_v = e.dvi_v
                const outer_doing_leaders = e.doing_leaders; e.doing_leaders = true
                if (lb.type === vlist_node) vlist_out(e, lb); else hlist_out(e, lb)
                e.doing_leaders = outer_doing_leaders
                e.dvi_v = save_v; e.dvi_h = save_h; e.cur_h = left_edge
                e.cur_v = (save_v - lb.height + leader_ht + lx) | 0
              }
              e.cur_v = (edge - 10) | 0
              continue
            }
          }
          e.cur_v = (e.cur_v + rule_ht) | 0 // move_past
          continue
        }
        case kern_node: e.cur_v = (e.cur_v + p.width) | 0; continue
        default: continue
      }
    }
    // fin_rule: §633 Output a rule in a vlist, goto next_p
    if (rule_wd === null_flag) rule_wd = this_box.width
    rule_ht = (rule_ht + rule_dp) | 0
    e.cur_v = (e.cur_v + rule_ht) | 0
    if (rule_ht > 0 && rule_wd > 0) {
      synch_h(e); synch_v(e)
      dvi_out(e, put_rule); dvi_four(e, rule_ht); dvi_four(e, rule_wd)
    }
  }
  prune_movements(e, save_loc)
  if (e.cur_s > 0) dvi_pop(e, save_loc)
  e.cur_s--
}

// pdftex.web ship_out: pdf_ship_out when \pdfoutput>0, else dvi_ship_out
export function ship_out(e: Engine, p: BoxNode): void {
  fix_pdfoutput(e)
  if (int_par(e, synctex_code) !== 0) fatal_error(e, 'unsupported: synctex') // synctex-rec.ch0 synctex_sheet would start recording
  if (int_par(e, pdf_output_code) > 0) pdf_ship_out(e, p); else dvi_ship_out(e, p)
}

// §638 dvi_ship_out
function dvi_ship_out(e: Engine, p: BoxNode): void {
  if (int_par(e, tracing_output_code) > 0) { print_nl(e, ''); print_ln(e); print(e, 'Completed box being shipped out') }
  if (e.term_offset > e.lim.max_print_line - 9) print_ln(e)
  else if (e.term_offset > 0 || e.file_offset > 0) print_char(e, 32)
  print_char(e, 91)
  let j = 9
  while (e.equiv[count_base + j] === 0 && j > 0) j--
  for (let k = 0; k <= j; k++) { print_int(e, e.equiv[count_base + k]!); if (k < j) print_char(e, 46) }
  if (int_par(e, tracing_output_code) > 0) { print_char(e, 93); begin_diagnostic(e); show_box(e, p); end_diagnostic(e, true) }
  // §640 Ship box p out
  const h_offset = e.equiv[dimen_base + h_offset_code]!, v_offset = e.equiv[dimen_base + v_offset_code]!
  done: {
    // §641 Update the values of max_h and max_v; but if the page is too large, goto done
    const hdv = ((p.height + p.depth | 0) + v_offset) | 0, wh = (p.width + h_offset) | 0 // pdftex wraps
    if (p.height > max_dimen || p.depth > max_dimen || hdv > max_dimen || wh > max_dimen) {
      print_err(e, 'Huge page cannot be shipped out')
      help(e, 'The page just created is more than 18 feet tall or', 'more than 18 feet wide, so I suspect something went wrong.')
      error(e)
      if (int_par(e, tracing_output_code) <= 0) {
        begin_diagnostic(e); print_nl(e, 'The following box has been deleted:'); show_box(e, p); end_diagnostic(e, true)
      }
      break done
    }
    if (hdv > e.max_v) e.max_v = hdv
    if (wh > e.max_h) e.max_h = wh
    // §617 Initialize variables as ship_out begins
    e.dvi_h = 0; e.dvi_v = 0; e.cur_h = h_offset; e.dvi_f = null_font
    // pdftex.web Calculate DVI page dimensions and margins (only cur_page_height is read, by \pdfsavepos)
    e.cur_page_height = e.equiv[dimen_base + pdf_page_height_code]! !== 0 ? e.equiv[dimen_base + pdf_page_height_code]!
      : (p.height + p.depth + 2 * v_offset + 2 * 4736286) | 0
    if (e.output_file_name === '') { // ensure_dvi_open
      if (e.job_name === '') open_log_file(e)
      e.output_file_name = e.job_name + '.dvi'
    }
    if (e.total_pages === 0) {
      dvi_out(e, pre); dvi_out(e, id_byte)
      dvi_four(e, 25400000); dvi_four(e, 473628672)
      prepare_mag(e); dvi_four(e, int_par(e, mag_code))
      const old_setting = e.selector; e.selector = new_string
      const b = e.cur_str.length
      print(e, ' TeX output '); print_int(e, int_par(e, 23)); print_char(e, 46)
      print_two(e, int_par(e, 22)); print_char(e, 46); print_two(e, int_par(e, 21))
      print_char(e, 58); print_two(e, Math.trunc(int_par(e, 20) / 60)); print_two(e, int_par(e, 20) % 60)
      e.selector = old_setting
      const s = e.cur_str.splice(b)
      dvi_out(e, s.length)
      for (const c of s) dvi_out(e, c)
    }
    const page_loc = e.dvi_offset + e.dvi_ptr
    dvi_out(e, bop)
    for (let k = 0; k <= 9; k++) dvi_four(e, e.equiv[count_base + k]!)
    dvi_four(e, e.last_bop); e.last_bop = page_loc
    e.cur_v = (p.height + v_offset) | 0
    if (p.type === vlist_node) vlist_out(e, p); else hlist_out(e, p)
    dvi_out(e, eop); e.total_pages++; e.cur_s = -1
  }
  if (int_par(e, tracing_output_code) <= 0) print_char(e, 93)
  e.dead_cycles = 0
  // §639 Flush the box from memory, showing statistics if requested
  // shortcut: no mem array, so \tracingstats>1 prints zero usage figures; upgrade if a test needs them
  if (int_par(e, tracing_stats_code) > 1) { print_nl(e, 'Memory usage before: '); print(e, '0&0;') }
  flush_node_list(e, p)
  if (int_par(e, tracing_stats_code) > 1) { print(e, ' after: 0&0; still untouched: 0'); print_ln(e) }
}

// §642 Finish the DVI file
export function finish_dvi_file(e: Engine): void {
  while (e.cur_s > -1) {
    if (e.cur_s > 0) dvi_out(e, pop)
    else { dvi_out(e, eop); e.total_pages++ }
    e.cur_s--
  }
  if (e.total_pages === 0) { print_nl(e, 'No pages of output.'); return }
  dvi_out(e, post)
  dvi_four(e, e.last_bop); e.last_bop = e.dvi_offset + e.dvi_ptr - 5
  dvi_four(e, 25400000); dvi_four(e, 473628672)
  prepare_mag(e); dvi_four(e, int_par(e, mag_code))
  dvi_four(e, e.max_v); dvi_four(e, e.max_h)
  dvi_out(e, e.max_push >> 8); dvi_out(e, e.max_push & 255)
  dvi_out(e, (e.total_pages >> 8) & 255); dvi_out(e, e.total_pages & 255)
  for (let f = e.font_ptr; f > 0; f--) if (e.font_used[f]) dvi_font_def(e, f) // §643
  dvi_out(e, post_post); dvi_four(e, e.last_bop); dvi_out(e, id_byte)
  let k = 4 + ((e.lim.dvi_buf_size - e.dvi_ptr) % 4)
  while (k > 0) { dvi_out(e, 223); k-- }
  print_nl(e, 'Output written on '); slow_print(e, e.output_file_name)
  print(e, ' ('); print_int(e, e.total_pages); print(e, ' page')
  if (e.total_pages !== 1) print_char(e, 115)
  print(e, ', '); print_int(e, e.dvi_offset + e.dvi_ptr); print(e, ' bytes).')
}

// §1371 Expand macros in the token list and make link(def_ref) point to the result
export function expand_write_tokens(e: Engine, p: WhatsitNode, toks: number): void {
  let q = get_avail(e); e.info[q] = right_brace_token + 125
  const r = get_avail(e); e.link[q] = r; e.info[r] = cs_token_flag + end_write; ins_list(e, q)
  begin_token_list(e, toks, write_text)
  q = get_avail(e); e.info[q] = left_brace_token + 123; ins_list(e, q)
  const old_mode = e.mode; e.mode = 0
  e.cur_cs = e.write_loc; scan_toks(e, false, true)
  e.mode = old_mode // unbalanced-braces.ch: before the final get_token
  get_token(e)
  if (e.cur_tok !== cs_token_flag + end_write) { // §1372 Recover from an unbalanced write command
    print_err(e, 'Unbalanced write command')
    help(e, "On this page there's a \\write with fewer real {'s than }'s.", "I can't handle that very well; good luck.")
    error(e)
    do get_token(e); while (e.cur_tok !== cs_token_flag + end_write)
  }
  end_token_list(e)
}

// §1368 special_out
function special_out(e: Engine, p: WhatsitNode): void {
  synch_h(e); synch_v(e)
  let h: number
  if (p.subtype === latespecial_node) { expand_write_tokens(e, p, p.write_tokens); h = e.def_ref }
  else h = p.write_tokens
  const old_setting = e.selector; e.selector = new_string
  const b = e.cur_str.length
  show_token_list(e, e.link[h]!, 0, 6250000 - b) // pool_size-pool_ptr
  e.selector = old_setting
  const s = e.cur_str.splice(b)
  if (s.length < 256) { dvi_out(e, xxx1); dvi_out(e, s.length) }
  else { dvi_out(e, xxx4); dvi_four(e, s.length) }
  for (const c of s) dvi_out(e, c)
  if (p.subtype === latespecial_node) flush_list(e, e.def_ref)
}

// §1370 write_out (tex.ch: \write18 reports a disabled shell escape)
export function write_out(e: Engine, p: WhatsitNode): void {
  expand_write_tokens(e, p, p.write_tokens)
  const old_setting = e.selector, j = p.write_stream
  const b = e.cur_str.length
  if (j === 18) e.selector = new_string
  else if (e.write_open[j]) e.selector = j
  else { // write to the terminal if file isn't open
    if (j === 17 && e.selector === term_and_log) e.selector = log_only
    print_nl(e, '')
  }
  token_show(e, e.def_ref); print_ln(e)
  flush_list(e, e.def_ref)
  if (j === 18) {
    e.selector = int_par(e, tracing_online_code) <= 0 ? log_only : term_and_log
    if (!e.log_opened) e.selector = 17 // term_only
    const s = e.cur_str.splice(b)
    print_nl(e, 'runsystem(')
    for (const c of s) print(e, c)
    // shortcut: no shell escape; TeX Live's restricted mode reports every command not on its allow list this way
    print(e, ')...'); print(e, 'disabled (restricted)'); print_char(e, 46); print_nl(e, ''); print_ln(e)
  }
  e.selector = old_setting
}

// §1373 out_what
export function out_what(e: Engine, p: WhatsitNode): void {
  switch (p.subtype) {
    case open_node: case write_node: case close_node: // §1374 Do some work that has been queued up for \write
      if (e.doing_leaders) return
      if (p.subtype === write_node) { write_out(e, p); return }
      const j = p.write_stream
      if (e.write_open[j]) e.write_open[j] = false // tex.ch: a_close
      if (p.subtype === close_node || j >= 16) return
      e.cur_name = p.open_name; e.cur_area = p.open_area; e.cur_ext = p.open_ext
      if (e.cur_ext === '') e.cur_ext = '.tex'
      { // tex.ch: kpse_out_name_ok (openout_any=p), a_open_out (the directory must exist), and log the file
        const name = e.cur_area + e.cur_name + e.cur_ext
        while (name.startsWith('/') || name.split('/').some(c => c === '..') || /(^|\/)\.[^/]/.test(name) || e.fs.writable?.(name) === false) prompt_file_name(e, 'output file name', '.tex')
        const key = name.replace(/^(\.\/)+/, '') // `./x.aux' and `x.aux' are one file
        e.outputFiles.set(key, ''); e.write_name[j] = key; e.write_open[j] = true
        if (e.log_opened) {
          const old_setting = e.selector
          e.selector = int_par(e, tracing_online_code) <= 0 ? log_only : term_and_log
          print_nl(e, '\\openout'); print_int(e, j); print(e, " = `")
          print_file_name(e, e.cur_name, e.cur_area, e.cur_ext); print(e, "'."); print_nl(e, ''); print_ln(e)
          e.selector = old_setting
        }
      }
      return
    case special_node: case latespecial_node: special_out(e, p); return
    case language_node: return
    case pdf_save_pos_node: // pdftex.web Save current position in DVI mode (4736286 = 1in, the DVI origin offset)
      e.pdf_last_x_pos = (e.cur_h + 4736286) | 0; e.pdf_last_y_pos = (e.cur_page_height - e.cur_v - 4736286) | 0; return
    default: confusion(e, 'ext4')
  }
}
