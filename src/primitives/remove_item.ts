// §1104–1108 \unpenalty \unkern \unskip; any_mode(remove_item): delete_last
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'
import { glue_node, kern_node, penalty_node } from '../nodes.ts'
import { delete_last } from '../main.ts'

export const cmd = Cmd.remove_item
export const primitives: [string, number][] = [['unpenalty', penalty_node], ['unkern', kern_node], ['unskip', glue_node]]
export function print(e: Engine, chr: number): void { print_esc(e, chr === glue_node ? 'unskip' : chr === kern_node ? 'unkern' : 'unpenalty') }
export function run(e: Engine, _chr: number): void { delete_last(e) }
