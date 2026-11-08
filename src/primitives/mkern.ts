// §1057–1061 \mkern; mmode+mkern: append_kern
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { mu_glue } from '../nodes.ts'
import { append_kern } from '../main.ts'

export const cmd = Cmd.mkern
export const primitives: [string, number][] = [['mkern', mu_glue]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'mkern') }
export function run(e: Engine, _chr: number): void { append_kern(e) }
