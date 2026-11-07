// §99–109 arithmetic with scaled dimensions
import type { Engine } from './engine.ts'
import { print_char, print_int } from './print.ts'

export const unity = 0o200000, two = 0o400000, inf_bad = 10000

// §100 half
export function half(x: number): number {
  return (x & 1) !== 0 ? Math.trunc((x + 1) / 2) : Math.trunc(x / 2)
}

// §102 round_decimals
export function round_decimals(e: Engine, k: number): number {
  let a = 0
  while (k > 0) { k--; a = Math.trunc((a + e.dig[k]! * two) / 10) }
  return Math.trunc((a + 1) / 2)
}

// §103 print_scaled
export function print_scaled(e: Engine, s: number): void {
  if (s < 0) { print_char(e, 45); s = -s | 0 }
  print_int(e, Math.trunc(s / unity))
  print_char(e, 46)
  s = 10 * (s % unity) + 5
  let delta = 10
  do {
    if (delta > unity) s = s + 0o100000 - 50000
    print_char(e, 48 + Math.trunc(s / unity)); s = 10 * (s % unity); delta *= 10
  } while (s > delta)
}

// §105 mult_and_add
export function mult_and_add(e: Engine, n: number, x: number, y: number, max_answer: number): number {
  if (n < 0) { x = -x; n = -n }
  if (n === 0) return y
  if (x <= Math.trunc((max_answer - y) / n) && -x <= Math.trunc((max_answer + y) / n)) return (n * x + y) | 0
  e.arith_error = true; return 0
}
export const nx_plus_y = (e: Engine, n: number, x: number, y: number) => mult_and_add(e, n, x, y, 0o7777777777)
export const mult_integers = (e: Engine, n: number, x: number) => mult_and_add(e, n, x, 0, 0o17777777777)

// §106 x_over_n
export function x_over_n(e: Engine, x: number, n: number): number {
  let negative = false, r: number
  if (n === 0) { e.arith_error = true; r = 0; e.remainder = x }
  else {
    if (n < 0) { x = -x; n = -n; negative = true }
    if (x >= 0) { r = Math.trunc(x / n); e.remainder = x % n }
    else { r = -Math.trunc(-x / n); e.remainder = -(-x % n) }
  }
  if (negative) e.remainder = -e.remainder
  return r
}

// §107 xn_over_d
export function xn_over_d(e: Engine, x: number, n: number, d: number): number {
  const positive = x >= 0
  if (!positive) x = -x
  const t = (x % 0o100000) * n
  let u = Math.trunc(x / 0o100000) * n + Math.trunc(t / 0o100000)
  const v = (u % d) * 0o100000 + (t % 0o100000)
  if (Math.trunc(u / d) >= 0o100000) e.arith_error = true
  else u = 0o100000 * Math.trunc(u / d) + Math.trunc(v / d)
  if (positive) { e.remainder = v % d; return u }
  e.remainder = -(v % d); return -u
}

// §108 badness
export function badness(t: number, s: number): number {
  if (t === 0) return 0
  if (s <= 0) return inf_bad
  let r: number
  if (t <= 7230584) r = Math.trunc((t * 297) / s)
  else if (s >= 1663497) r = Math.trunc(t / Math.trunc(s / 297))
  else r = t
  if (r > 1290) return inf_bad
  return Math.trunc((r * r * r + 0o400000) / 0o1000000)
}
