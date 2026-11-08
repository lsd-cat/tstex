// tools/pdf-normalize.ts terminates on any input: unusable /Length values end the stream at `endstream', a stream without
// one is a thrown error, random and truncated bytes do not loop
import { test } from 'node:test'
import assert from 'node:assert'
import { normalizePdf } from '../../tools/pdf-normalize.ts'

const n = (s: string) => normalizePdf(Buffer.from(s, 'latin1'))
const obj = (len: string, body = 'abc') => `%PDF-1.4\n1 0 obj\n<< /Length ${len} >>\nstream\n${body}\nendstream\nendobj\n2 0 obj\n<< /Length 3 >>\nstream\nxyz\nendstream\nendobj\ntrailer\n<< /Size 3 >>\nstartxref\n0\n%%EOF\n`

test('pdf-normalize: unusable /Length falls back to endstream', () => {
  for (const len of ['2 0 R', '1 0 R', '9 0 R', '1000000000', '1', '0', '-5']) {
    const out = n(obj(len))
    assert.match(out, /1 obj\n<< \/Length [^>]*>>\nstream\nabc\nendstream\nendobj\n2 obj\n/, len)
    assert.match(out, /stream\nxyz\nendstream/, len)
  }
  assert.match(n(obj('3 0 R') + '3 0 obj\n3\nendobj\n'), /stream\nabc\nendstream/) // an integer object written after the stream
})

test('pdf-normalize: a stream without endstream is a clear error', () => {
  assert.throws(() => n('%PDF-1.4\n1 0 obj\n<< /Length 99 >>\nstream\nabc'), /object 1: stream without endstream/)
})

test('pdf-normalize: random and truncated input terminates', () => {
  let seed = 7
  const r = (k: number) => (seed = (seed * 1103515245 + 12345) >>> 0) % k
  const base = obj('3') + '3 0 obj\n<< /Type /ObjStm /N 2 /First 9 /Length 20 >>\nstream\n4 0 5 x 6\n<<>>  [] 7 8\nendstream\nendobj\n'
  for (let i = 0; i < 300; i++) {
    const b = Buffer.from(base, 'latin1')
    const m = i % 2 ? b.subarray(0, r(b.length)) : b.map(c => r(20) ? c : r(256))
    try { normalizePdf(m) } catch (e) { assert.match(String(e), /pdf-normalize: object/) }
  }
})
