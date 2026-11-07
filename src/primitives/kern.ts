// §1057–1061 \kern; any_mode(kern): append_kern
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { explicit } from '../nodes.ts'
import { append_kern } from '../main.ts'

export const cmd = Cmd.kern
export const primitives: [string, number][] = [['kern', explicit]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'kern') }
export function run(e: Engine, _chr: number): void { append_kern(e) }
