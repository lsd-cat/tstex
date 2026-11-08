// §1336 init_prim: registry of the per-command files, keyed by command code
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { primitive } from '../hash.ts'
import { frozen_relax, frozen_end_group, frozen_fi, frozen_null_font, frozen_cr, frozen_right, frozen_endv,
  frozen_end_template, end_write, level_one } from '../eqtb.ts'
import { null_list, omit_template } from '../nodes.ts'
import { cs_token_flag } from '../tokens.ts'
import * as relax from './relax.ts'
import * as par_end from './par_end.ts'
import * as stop from './stop.ts'
import * as def from './def.ts'
import * as register from './register.ts'
import * as assign_int from './assign_int.ts'
import * as assign_dimen from './assign_dimen.ts'
import * as assign_glue from './assign_glue.ts'
import * as assign_mu_glue from './assign_mu_glue.ts'
import * as assign_toks from './assign_toks.ts'
import * as toks_register from './toks_register.ts'
import * as def_code from './def_code.ts'
import * as advance from './advance.ts'
import * as multiply from './multiply.ts'
import * as divide from './divide.ts'
import * as prefix from './prefix.ts'
import * as let_ from './let.ts'
import * as shorthand_def from './shorthand_def.ts'
import * as after_assignment from './after_assignment.ts'
import * as after_group from './after_group.ts'
import * as begin_group from './begin_group.ts'
import * as end_group from './end_group.ts'
import * as expand_after from './expand_after.ts'
import * as if_test from './if_test.ts'
import * as fi_or_else from './fi_or_else.ts'
import * as convert from './convert.ts'
import * as case_shift from './case_shift.ts'
import * as last_item from './last_item.ts'
import * as set_font from './set_font.ts'
import * as message from './message.ts'
import * as xray from './xray.ts'
import * as the from './the.ts'
import * as no_expand from './no_expand.ts'
import * as cs_name from './cs_name.ts'
import * as input from './input.ts'
import * as in_stream from './in_stream.ts'
import * as read_to_cs from './read_to_cs.ts'
import * as unsupported from './unsupported.ts'
import * as set_box from './set_box.ts'
import * as set_box_dimen from './set_box_dimen.ts'
import * as set_aux from './set_aux.ts'
import * as set_prev_graf from './set_prev_graf.ts'
import * as def_font from './def_font.ts'
import * as assign_font_dimen from './assign_font_dimen.ts'
import * as assign_font_int from './assign_font_int.ts'
import * as make_box from './make_box.ts'
import * as hmove from './hmove.ts'
import * as vmove from './vmove.ts'
import * as leader_ship from './leader_ship.ts'
import * as un_hbox from './un_hbox.ts'
import * as un_vbox from './un_vbox.ts'
import * as remove_item from './remove_item.ts'
import * as hskip from './hskip.ts'
import * as vskip from './vskip.ts'
import * as kern from './kern.ts'
import * as hrule from './hrule.ts'
import * as vrule from './vrule.ts'
import * as insert from './insert.ts'
import * as vadjust from './vadjust.ts'
import * as mark from './mark.ts'
import * as break_penalty from './break_penalty.ts'
import * as start_par from './start_par.ts'
import * as ital_corr from './ital_corr.ts'
import * as accent from './accent.ts'
import * as discretionary from './discretionary.ts'
import * as ex_space from './ex_space.ts'
import * as char_num from './char_num.ts'
import * as no_boundary from './no_boundary.ts'
import * as end_cs_name from './end_cs_name.ts'
import * as extension from './extension.ts'
import * as def_family from './def_family.ts'
import * as hyph_data from './hyph_data.ts'
import * as set_shape from './set_shape.ts'
import * as set_page_dimen from './set_page_dimen.ts'
import * as set_page_int from './set_page_int.ts'
import * as top_bot_mark from './top_bot_mark.ts'
import * as partoken_name from './partoken_name.ts'
import * as delim_num from './delim_num.ts'
import * as math_char_num from './math_char_num.ts'
import * as math_accent from './math_accent.ts'
import * as math_choice from './math_choice.ts'
import * as non_script from './non_script.ts'
import * as radical from './radical.ts'
import * as vcenter from './vcenter.ts'
import * as mskip from './mskip.ts'
import * as mkern from './mkern.ts'
import * as eq_no from './eq_no.ts'
import * as math_comp from './math_comp.ts'
import * as limit_switch from './limit_switch.ts'
import * as math_style from './math_style.ts'
import * as above from './above.ts'
import * as left_right from './left_right.ts'
import * as halign from './halign.ts'
import * as valign from './valign.ts'
import * as no_align from './no_align.ts'
import * as omit from './omit.ts'
import * as tab_mark from './tab_mark.ts'
import * as car_ret from './car_ret.ts'
import * as ignore_spaces from './ignore_spaces.ts'
import * as set_interaction from './set_interaction.ts'

export type Prim = {
  cmd: number
  primitives: [string, number][]
  etex_primitives?: [string, number][]          // generated only in e-TeX mode (etex.ch "Generate all e-TeX primitives")
  print(e: Engine, chr: number): void
  run?(e: Engine, chr: number): boolean | void   // main_control or expand action
  assign?(e: Engine, a: number): void           // prefixed_command action, a = prefixes
}

const prims: Prim[] = [relax, par_end, stop, def, register, assign_int, assign_dimen, assign_glue, assign_mu_glue, assign_toks,
  toks_register, def_code, advance, multiply, divide, prefix, let_, shorthand_def, after_assignment, after_group, begin_group,
  end_group, expand_after, if_test, fi_or_else, convert, case_shift, last_item, set_font, message, xray, the, no_expand, cs_name, input, in_stream, read_to_cs,
  set_box, set_box_dimen, set_aux, set_prev_graf, def_font, assign_font_dimen, assign_font_int, make_box, hmove, vmove, leader_ship,
  un_hbox, un_vbox, remove_item, hskip, vskip, kern, hrule, vrule, insert, vadjust, mark, break_penalty, start_par, ital_corr, accent,
  discretionary, ex_space, char_num, no_boundary, end_cs_name, extension, def_family, hyph_data, set_shape, set_page_dimen, set_page_int, top_bot_mark, partoken_name,
  delim_num, math_char_num, math_accent, math_choice, non_script, radical, vcenter, mskip, mkern, eq_no, math_comp, limit_switch, math_style, above, left_right,
  halign, valign, no_align, omit, tab_mark, car_ret, ignore_spaces, set_interaction, ...unsupported.prims]
export const registry = new Map<number, Prim>() // filled by init_prim, after every module is evaluated

// §1336 init_prim (with the frozen copies of §265, §334, §491, §553, §780, §1188, §1344);
// with etex, etex.ch's Generate all eTeX primitives instead
export function init_prim(e: Engine, etex = false): void {
  e.no_new_control_sequence = false
  for (const p of prims) registry.set(p.cmd, p)
  if (etex) {
    for (const p of prims) for (const [name, chr] of p.etex_primitives ?? []) primitive(e, name, p.cmd, chr)
    e.no_new_control_sequence = true; return
  }
  const frozen: Record<string, number> = { relax: frozen_relax, endgroup: frozen_end_group, fi: frozen_fi, nullfont: frozen_null_font,
    cr: frozen_cr, right: frozen_right }
  for (const p of prims) for (const [name, chr] of p.primitives) {
    const loc = primitive(e, name, p.cmd, chr)
    if (name === 'par') { e.par_loc = loc; e.par_token = cs_token_flag + loc } // §334
    if (name === 'write') e.write_loc = loc // §1344
    const f = frozen[name]
    if (f !== undefined) {
      e.text.set(f, name); e.eq_type[f] = e.eq_type[loc]!; e.eq_level[f] = e.eq_level[loc]!; e.equiv[f] = e.equiv[loc]!
    }
  }
  // §780
  e.text.set(frozen_end_template, 'endtemplate'); e.text.set(frozen_endv, 'endtemplate')
  e.eq_type[frozen_endv] = Cmd.endv; e.equiv[frozen_endv] = null_list; e.eq_level[frozen_endv] = level_one
  e.eq_type[frozen_end_template] = Cmd.end_template; e.equiv[frozen_end_template] = null_list; e.eq_level[frozen_end_template] = level_one
  e.info[omit_template] = cs_token_flag + frozen_end_template // §790
  // §1369
  e.text.set(end_write, 'endwrite'); e.eq_level[end_write] = level_one; e.eq_type[end_write] = Cmd.outer_call; e.equiv[end_write] = 0
  e.no_new_control_sequence = true
}
