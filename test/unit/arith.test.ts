// §99–109 arithmetic; expected values worked out from tex.web's definitions (print_scaled cross-checked with pdftex)
import { test } from 'node:test'
import assert from 'node:assert'
import { Engine } from '../../src/engine.ts'
import { half, x_over_n, xn_over_d, mult_integers, nx_plus_y, badness, print_scaled, inf_bad } from '../../src/arith.ts'
import { new_string } from '../../src/types.ts'

const engine = () => new Engine({ fs: { find: () => null } })

test('§100 half rounds odd numbers up (toward +infinity)', () => {
  assert.deepStrictEqual([5, 4, 1, 0, -1, -3, -4, -5].map(half), [3, 2, 1, 0, 0, -1, -2, -2])
})

test('§106 x_over_n truncates toward zero; remainder has the sign of x, flipped when n<0', () => {
  const e = engine()
  const r = (x: number, n: number) => { e.arith_error = false; const q = x_over_n(e, x, n); return [q, e.remainder, e.arith_error] }
  assert.deepStrictEqual(r(7, 2), [3, 1, false])
  assert.deepStrictEqual(r(-7, 2), [-3, -1, false])
  assert.deepStrictEqual(r(7, -2), [-3, 1, false])
  assert.deepStrictEqual(r(-7, -2), [3, -1, false])
  assert.deepStrictEqual(r(5, 0), [0, 5, true])
})

test('§107 xn_over_d', () => {
  const e = engine()
  e.arith_error = false
  assert.strictEqual(xn_over_d(e, 65536, 7227, 100), 4736286); assert.strictEqual(e.remainder, 72) // 1in
  assert.strictEqual(xn_over_d(e, -65536, 7227, 100), -4736286); assert.strictEqual(e.remainder, -72)
  assert.strictEqual(e.arith_error, false)
  xn_over_d(e, 0o10000000000, 4, 1) // u div d >= 2^15
  assert.strictEqual(e.arith_error, true)
})

test('§105 mult_and_add overflow', () => {
  const e = engine()
  const m = (f: () => number) => { e.arith_error = false; const v = f(); return [v, e.arith_error] }
  assert.deepStrictEqual(m(() => mult_integers(e, 46340, 46340)), [2147395600, false])
  assert.deepStrictEqual(m(() => mult_integers(e, 46341, 46341)), [0, true])
  assert.deepStrictEqual(m(() => mult_integers(e, 1000000, 1000000)), [0, true])
  assert.deepStrictEqual(m(() => mult_integers(e, -3, 5)), [-15, false])
  assert.deepStrictEqual(m(() => nx_plus_y(e, 2, 536870911, 1)), [0o7777777777, false])
  assert.deepStrictEqual(m(() => nx_plus_y(e, 2, 536870912, 0)), [0, true])
  assert.deepStrictEqual(m(() => nx_plus_y(e, -2, 536870912, 0)), [0, true])
})

test('§108 badness at its breakpoints', () => {
  assert.strictEqual(badness(0, 0), 0)
  assert.strictEqual(badness(1, 0), inf_bad)
  assert.strictEqual(badness(1, 2), 12)
  assert.strictEqual(badness(100, 100), 100) // r=297
  assert.strictEqual(badness(1290, 297), 8189) // r=1290
  assert.strictEqual(badness(1291, 297), inf_bad) // r=1291
  assert.strictEqual(badness(7230584, 7230584), 100) // largest t of the first branch
  assert.strictEqual(badness(7230585, 1663497), 8189) // second branch: t div (s div 297)
  assert.strictEqual(badness(7230585, 1663496), inf_bad) // third branch: r=t
})

test('§103 print_scaled', () => {
  const e = engine(); e.selector = new_string
  const p = (s: number) => { e.cur_str = []; print_scaled(e, s); return String.fromCharCode(...e.cur_str) }
  assert.deepStrictEqual([0, 1, 65535, 65536, 32768, 1073741823, -1, -65536].map(p),
    ['0.0', '0.00002', '0.99998', '1.0', '0.5', '16383.99998', '-0.00002', '-1.0'])
})

test('§106–107 32-bit wrap as in pdftex binaries (oracle m1-review-int-wrap)', () => {
  const e = engine()
  e.arith_error = false
  assert.strictEqual(xn_over_d(e, 2147483647, 65535, 0o200000), -32768) // \dimen0=0.99999\count1 -> -0.5pt
  assert.strictEqual(xn_over_d(e, -2147483648, 45875, 0o200000), 644251648) // -0.7\count4 -> -9830.5pt after the sign
  assert.strictEqual(x_over_n(e, -2147483648, 2), 1073741824) // \divide\count2 by 2
  assert.strictEqual(e.arith_error, false)
})
