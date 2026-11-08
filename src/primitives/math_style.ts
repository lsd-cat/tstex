// §1169–1171 \displaystyle \textstyle \scriptstyle \scriptscriptstyle; mmode+math_style
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { new_style, print_style } from '../nodes.ts'
import { tail_append } from '../main.ts'

export const cmd = Cmd.math_style
export const primitives: [string, number][] = [['displaystyle', 0], ['textstyle', 2], ['scriptstyle', 4], ['scriptscriptstyle', 6]]
export function print(e: Engine, chr: number): void { print_style(e, chr) }
export function run(e: Engine, chr: number): void { tail_append(e, new_style(chr)) }
