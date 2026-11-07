// §1336 init_prim: registry of the per-command files, keyed by command code
import type { Engine } from '../engine.ts'
import { primitive } from '../hash.ts'
import { frozen_relax } from '../eqtb.ts'
import { cs_token_flag } from '../tokens.ts'
import * as relax from './relax.ts'
import * as par_end from './par_end.ts'
import * as stop from './stop.ts'
import * as def from './def.ts'
import * as register from './register.ts'
import * as assign_int from './assign_int.ts'
import * as def_code from './def_code.ts'
import * as message from './message.ts'
import * as xray from './xray.ts'
import * as the from './the.ts'

export type Prim = {
  cmd: number
  primitives: [string, number][]
  print(e: Engine, chr: number): void
  run?(e: Engine, chr: number): boolean | void   // main_control or expand action
  assign?(e: Engine, a: number): void           // prefixed_command action, a = prefixes
}

const prims: Prim[] = [relax, par_end, stop, def, register, assign_int, def_code, message, xray, the]
export const registry = new Map<number, Prim>() // filled by init_prim, after every module is evaluated

// §1336 init_prim
export function init_prim(e: Engine): void {
  e.no_new_control_sequence = false
  for (const p of prims) registry.set(p.cmd, p)
  for (const p of prims) for (const [name, chr] of p.primitives) {
    const loc = primitive(e, name, p.cmd, chr)
    if (name === 'par') { e.par_loc = loc; e.par_token = cs_token_flag + loc } // §334
    if (name === 'relax') { // §265
      e.text.set(frozen_relax, 'relax')
      e.eq_type[frozen_relax] = e.eq_type[loc]!; e.eq_level[frozen_relax] = e.eq_level[loc]!; e.equiv[frozen_relax] = e.equiv[loc]!
    }
  }
  e.no_new_control_sequence = true
}
