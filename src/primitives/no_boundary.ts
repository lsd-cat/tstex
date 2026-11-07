// §265 \noboundary; main_control handles it (§1045)
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc } from '../print.ts'

export const cmd = Cmd.no_boundary
export const primitives: [string, number][] = [['noboundary', 0]]
export function print(e: Engine, _chr: number): void { print_esc(e, 'noboundary') }
