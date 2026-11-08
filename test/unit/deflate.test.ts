// src/platform/deflate.ts (browser zlib) against node:zlib, both directions
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { deflate, inflate } from '../../src/platform/deflate.ts'

const rnd = (n: number) => { let s = 1; return Uint8Array.from({ length: n }, () => (s = Math.imul(s, 1103515245) + 12345) >>> 24) }
const samples = [new Uint8Array(0), Uint8Array.of(7), new Uint8Array(100000), rnd(70000), readFileSync(new URL('../../src/engine.ts', import.meta.url)),
  Uint8Array.from({ length: 300000 }, (_, i) => (i * 7) % 251 < 30 ? 65 : i & 255)]

test('deflate output inflates with zlib, zlib output inflates with inflate', () => {
  for (const d of samples) {
    const ours = deflate(d, 6)
    assert.deepStrictEqual(new Uint8Array(inflateSync(ours)), new Uint8Array(d))
    for (const level of [0, 1, 9]) assert.deepStrictEqual(inflate(new Uint8Array(deflateSync(d, { level })), d.length), new Uint8Array(d))
  }
  assert.ok(deflate(samples[4]!, 6).length < samples[4]!.length / 2) // zlib: 0.36 on this file, ours 0.43
})

test('inflate rejects more than max bytes, truncation and a bad checksum', () => {
  const z = new Uint8Array(deflateSync(samples[3]!))
  assert.throws(() => inflate(z, samples[3]!.length - 1))
  assert.throws(() => inflate(z.subarray(0, z.length - 10), 1 << 20))
  const bad = Uint8Array.from(z); bad[bad.length - 1]! ^= 1
  assert.throws(() => inflate(bad, 1 << 20))
})
