// §1336 init_prim: registry of the per-command files, keyed by command code
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { primitive } from '../hash.ts'
import { frozen_relax, frozen_end_group, frozen_fi, frozen_null_font, frozen_cr, frozen_right, frozen_endv,
  frozen_end_template, end_write, level_one } from '../eqtb.ts'
import { null_list } from '../nodes.ts'
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
import * as unsupported from './unsupported.ts'

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
  end_group, expand_after, if_test, fi_or_else, convert, case_shift, last_item, set_font, message, xray, the, no_expand, cs_name, ...unsupported.prims]
export const registry = new Map<number, Prim>() // filled by init_prim, after every module is evaluated

// §1336 init_prim (with the frozen copies of §265, §334, §491, §553, §780, §1188, §1344)
export function init_prim(e: Engine, etex = false): void {
  e.no_new_control_sequence = false
  for (const p of prims) registry.set(p.cmd, p)
  const frozen: Record<string, number> = { relax: frozen_relax, endgroup: frozen_end_group, fi: frozen_fi, nullfont: frozen_null_font,
    cr: frozen_cr, right: frozen_right }
  for (const p of prims) for (const [name, chr] of etex ? [...p.primitives, ...p.etex_primitives ?? []] : p.primitives) {
    const loc = primitive(e, name, p.cmd, chr)
    if (name === 'par') { e.par_loc = loc; e.par_token = cs_token_flag + loc } // §334
    const f = frozen[name]
    if (f !== undefined) {
      e.text.set(f, name); e.eq_type[f] = e.eq_type[loc]!; e.eq_level[f] = e.eq_level[loc]!; e.equiv[f] = e.equiv[loc]!
    }
  }
  // §780
  e.text.set(frozen_end_template, 'endtemplate'); e.text.set(frozen_endv, 'endtemplate')
  e.eq_type[frozen_endv] = Cmd.endv; e.equiv[frozen_endv] = null_list; e.eq_level[frozen_endv] = level_one
  e.eq_type[frozen_end_template] = Cmd.end_template; e.equiv[frozen_end_template] = null_list; e.eq_level[frozen_end_template] = level_one
  // §1369
  e.text.set(end_write, 'endwrite'); e.eq_level[end_write] = level_one; e.eq_type[end_write] = Cmd.outer_call; e.equiv[end_write] = 0
  e.no_new_control_sequence = true
}
