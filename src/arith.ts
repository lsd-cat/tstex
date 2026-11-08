// §99–109 arithmetic with scaled dimensions
import type { Engine } from './engine.ts'
import { print_char, print_int } from './print.ts'

export const unity = 0o200000, two = 0o400000, inf_bad = 10000

// §100 half
export function half(x: number): number {
  return (x & 1) !== 0 ? Math.trunc(((x + 1) | 0) / 2) : Math.trunc(x / 2)
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
  if (n < 0) { x = -x; n = -n } // no |0: pdftex's binary reports overflow for -(-2^31) here (oracle m1-review-int-wrap)
  if (n === 0) return y
  if (x <= Math.trunc((max_answer - y) / n) && -x <= Math.trunc((max_answer + y) / n)) return (Math.imul(n, x) + y) | 0
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
    else { r = -Math.trunc((-x | 0) / n) | 0; e.remainder = -((-x | 0) % n) } // C wraps -(-2^31)
  }
  if (negative) e.remainder = -e.remainder
  return r
}

// §107 xn_over_d
export function xn_over_d(e: Engine, x: number, n: number, d: number): number {
  const positive = x >= 0
  if (!positive) x = -x // no |0: for -2^31 pdftex's binary divides as if -x were 2^31 (unsigned), oracle m1-review-int-wrap
  const t = Math.imul(x % 0o100000, n) // every other intermediate wraps like pdftex's 32-bit C integer
  let u = (Math.imul(Math.trunc(x / 0o100000), n) + Math.trunc(t / 0o100000)) | 0
  const v = (Math.imul(u % d, 0o100000) + (t % 0o100000)) | 0
  if (Math.trunc(u / d) >= 0o100000) e.arith_error = true
  else u = (Math.imul(0o100000, Math.trunc(u / d)) + Math.trunc(v / d)) | 0
  if (positive) { e.remainder = v % d; return u }
  e.remainder = -(v % d); return -u | 0
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

// pdftex.web [7b] random numbers (from MetaPost); the 55 randoms live in Engine.randoms, j_random in Engine.j_random
const fraction_half = 0o1000000000, fraction_one = 0o2000000000, fraction_four = 0o10000000000, el_gordo = 0o17777777777
const spec_log = [0, 93032640, 38612034, 17922280, 8662214, 4261238, 2113709, 1052693, 525315, 262400, 131136, 65552, 32772, 16385,
  8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 1]

// pdftex.web make_frac
function make_frac(e: Engine, p: number, q: number): number {
  let negative = false
  if (p < 0) { p = -p; negative = true }
  if (q <= 0) { q = -q; negative = !negative }
  let n = Math.trunc(p / q); p = p % q
  if (n >= 8) { e.arith_error = true; return negative ? -el_gordo : el_gordo }
  n = (n - 1) * fraction_one
  let f = 1
  do { p = p - q + p; if (p >= 0) f = f + f + 1; else { f += f; p = p + q } } while (f < fraction_one)
  if (p - q + p >= 0) f++
  return negative ? -(f + n) : f + n
}

// pdftex.web take_frac
function take_frac(e: Engine, q: number, f: number): number {
  let negative = false, n: number, p: number
  if (f < 0) { f = -f; negative = true }
  if (q < 0) { q = -q; negative = !negative }
  if (f < fraction_one) n = 0
  else {
    n = Math.trunc(f / fraction_one); f = f % fraction_one
    if (q <= Math.trunc(el_gordo / n)) n = n * q; else { e.arith_error = true; n = el_gordo }
  }
  f = f + fraction_one
  p = fraction_half
  if (q < fraction_four) do { p = (f & 1) !== 0 ? Math.trunc((p + q) / 2) : Math.trunc(p / 2); f = Math.trunc(f / 2) } while (f !== 1)
  else do { p = (f & 1) !== 0 ? p + Math.trunc((q - p) / 2) : Math.trunc(p / 2); f = Math.trunc(f / 2) } while (f !== 1)
  if (n - el_gordo + p > 0) { e.arith_error = true; n = el_gordo - p }
  return negative ? -(n + p) : n + p
}

// pdftex.web m_log (x>0 always: norm_rand passes u>abs(x)>=0, so the "Logarithm of" error is unreachable)
function m_log(x: number): number {
  let y = 1302456956 + 4 - 100, z = 27595 + 6553600, k = 2
  while (x < fraction_four) { x += x; y -= 93032639; z -= 48782 }
  y = y + Math.trunc(z / unity)
  while (x > fraction_four + 4) {
    z = Math.trunc((x - 1) / 2 ** k) + 1
    while (x < fraction_four + z) { z = Math.trunc((z + 1) / 2); k++ }
    y += spec_log[k]!; x -= z
  }
  return Math.trunc(y / 8)
}

// pdftex.web ab_vs_cd
function ab_vs_cd(a: number, b: number, c: number, d: number): number {
  let q: number, r: number
  if (a < 0) { a = -a; b = -b }
  if (c < 0) { c = -c; d = -d }
  if (d <= 0) {
    if (b >= 0) return (a === 0 || b === 0) && (c === 0 || d === 0) ? 0 : 1
    if (d === 0) return a === 0 ? 0 : -1
    q = a; a = c; c = q; q = -b; b = -d; d = q
  } else if (b <= 0) {
    if (b < 0 && a > 0) return -1
    return c === 0 ? 0 : -1
  }
  for (;;) {
    q = Math.trunc(a / d); r = Math.trunc(c / b)
    if (q !== r) return q > r ? 1 : -1
    q = a % d; r = c % b
    if (r === 0) return q === 0 ? 0 : 1
    if (q === 0) return -1
    a = b; b = q; c = d; d = r
  }
}

// pdftex.web new_randoms
function new_randoms(e: Engine): void {
  const r = e.randoms
  for (let k = 0; k <= 23; k++) { let x = r[k]! - r[k + 31]!; if (x < 0) x += fraction_one; r[k] = x }
  for (let k = 24; k <= 54; k++) { let x = r[k]! - r[k - 24]!; if (x < 0) x += fraction_one; r[k] = x }
  e.j_random = 54
}
function next_random(e: Engine): number { if (e.j_random === 0) new_randoms(e); else e.j_random--; return e.randoms[e.j_random]! }

// pdftex.web init_randoms
export function init_randoms(e: Engine, seed: number): void {
  let j = Math.abs(seed), k = 1
  while (j >= fraction_one) j = Math.trunc(j / 2)
  for (let i = 0; i <= 54; i++) { const jj = k; k = j - k; j = jj; if (k < 0) k += fraction_one; e.randoms[(i * 21) % 55] = j }
  new_randoms(e); new_randoms(e); new_randoms(e)
}

// pdftex.web unif_rand
export function unif_rand(e: Engine, x: number): number {
  const y = take_frac(e, Math.abs(x), next_random(e))
  return y === Math.abs(x) ? 0 : x > 0 ? y : -y
}

// pdftex.web norm_rand
export function norm_rand(e: Engine): number {
  let x: number, u: number, l: number
  do {
    do { x = take_frac(e, 112429, next_random(e) - fraction_half); u = next_random(e) } while (Math.abs(x) >= u)
    x = make_frac(e, x, u)
    l = 139548960 - m_log(u)
  } while (ab_vs_cd(1024, l, x, x) < 0)
  return x
}
