// tools/pack-texmf.ts: the manifest, and the same lookups through the unsharded and the sharded index
import { test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gunzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { bundleFS, type Index } from '../../src/platform/browser.ts'

const root = new URL('../../', import.meta.url).pathname
const pack = (out: string, ...more: string[]) => execFileSync(process.execPath, [root + 'tools/pack-texmf.ts', '--preset', 'minimal', '--fmt', root + 'build/latex.fmt', '--out', out, ...more])
const load = (dir: string) => {
  const index: Index = JSON.parse(gunzipSync(readFileSync(join(dir, 'index.json.gz'))).toString())
  const read = (p: string) => { try { return new Uint8Array(readFileSync(join(dir, p))) } catch { return null } }
  return { index, fs: bundleFS(index, read) }
}
const kind = (n: string) => ({ tfm: 'tfm', vf: 'vf', enc: 'enc', map: 'map', pfb: 'type1' } as Record<string, string>)[n.split('.').pop()!] ?? 'tex'

test('pack minimal: manifest, and a sharded index resolves the same names', { skip: !existsSync(root + 'build/latex.fmt') && 'needs build/latex.fmt' }, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'tstex-pack-')), a = join(tmp, 'plain'), b = join(tmp, 'sharded')
  pack(a); pack(b, '--shard')
  const plain = load(a), sharded = load(b)
  assert.ok(plain.index.files && !plain.index.sharded && /^[0-9a-f]{12}$/.test(plain.index.version))
  assert.deepStrictEqual({ ...sharded.index }, { version: sharded.index.version, sharded: true })
  assert.ok(readdirSync(join(b, 'index')).every(f => /^[a-z0-9_]{1,2}\.json\.gz$/.test(f)))
  const names = Object.keys(plain.index.files!), pick = Array.from({ length: 20 }, (_, i) => names[Math.floor(i * names.length / 20)]!)
  for (const n of pick) {
    const p = plain.fs.path!(n, kind(n))
    assert.ok(p !== null && existsSync(join(a, p)), n)
    assert.strictEqual(sharded.fs.path!(n, kind(n)), p, n)
    assert.deepStrictEqual(sharded.fs.stat!(n, kind(n)), plain.fs.stat!(n, kind(n)))
    assert.deepStrictEqual(sharded.fs.find(n, kind(n)), plain.fs.find(n, kind(n)))
  }
  assert.strictEqual(sharded.fs.path!('no-such-file.sty', 'tex'), null)
})
