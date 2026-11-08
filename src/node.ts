// tstex in Node: the API of index.ts, in-process, over a texmf bundle (tools/pack-texmf.ts) in a local directory or at
// an http(s) URL. URL bundles are cached under ~/.cache/tstex/<version>/. Node has no synchronous fetch, so a file
// missing from that cache aborts the run, is fetched, and the compile restarts (shortcut: one restart per newly needed
// file, slow on a cold cache; prefetch() the names first, or point texmf at a local copy).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { gunzipSync, deflateSync, inflateSync } from 'node:zlib'
import { bundleFS, type Index } from './platform/browser.ts'
import { escapes } from './platform/lookup.ts'
import { loadFormat, type Format } from './format.ts'
import { compileRuns } from './compile.ts'
import type { TeX, CompileResult } from './index.ts'
export type { TeX, CompileOptions, CompileResult, Progress } from './index.ts'

class Miss extends Error { path: string; constructor(path: string) { super(`tstex: ${path} not cached`); this.path = path } }

export function createTeX(opts: { texmf: string, cache?: 'http' | 'persistent', fmt?: 'latex' }): TeX {
  const remote = /^https?:\/\//.test(opts.texmf), base = opts.texmf.endsWith('/') ? opts.texmf : opts.texmf + '/'
  let dir = base // local bundle directory, or the disk cache of a remote one
  const get = async (path: string) => { const r = await fetch(base + path); if (!r.ok) throw new Error(`${base + path}: HTTP ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
  const fetchToCache = async (path: string) => {
    if (escapes(path)) throw new Error(`tstex: bad bundle path ${path}`) // the index is untrusted input for the disk cache
    const d = await get(path), file = join(dir, path)
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, d)
    return d.length
  }
  const ready: Promise<{ index: Index, format: Format }> = (async () => {
    const index: Index = JSON.parse(gunzipSync(remote ? await get('index.json.gz') : readFileSync(join(dir, 'index.json.gz'))).toString())
    if (remote) {
      dir = join(homedir(), '.cache/tstex', index.version.replace(/[^\w.-]/g, '_')) + '/'
      if (!existsSync(join(dir, 'fmt/latex.fmt'))) await fetchToCache('fmt/latex.fmt')
    }
    return { index, format: await loadFormat(readFileSync(join(dir, 'fmt/latex.fmt'))) }
  })()
  const read = (path: string) => {
    try { return new Uint8Array(readFileSync(join(dir, path))) } catch { if (remote) throw new Miss(path); return null }
  }
  return {
    async compile(o): Promise<CompileResult> {
      const { index, format } = await ready
      const files = new Map(Object.entries(o.files).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v]))
      const fs = { ...bundleFS(index, read, files), compress: (d: Uint8Array, level: number) => new Uint8Array(deflateSync(d, { level })),
        inflate: (d: Uint8Array, max: number) => { try { return new Uint8Array(inflateSync(d, { maxOutputLength: max })) } catch { return new Uint8Array(0) } } }
      let fetched = 0
      for (;;) {
        o.signal?.throwIfAborted()
        try {
          const r = await compileRuns({ fs, format, main: o.main, runs: o.runs, date: o.date, onRun: n => o.onProgress?.({ type: 'run', n }) })
          o.onProgress?.({ type: 'done' })
          return { pdf: r.pdf, log: r.log, outputs: Object.fromEntries(r.outputs), fetched, runs: r.runs, ok: r.ok }
        } catch (x) {
          if (!(x instanceof Miss)) throw x
          const n = await fetchToCache(x.path); fetched += n
          o.onProgress?.({ type: 'fetch', name: x.path, bytes: n })
        }
      }
    },
    async prefetch(names) {
      const { index } = await ready
      if (!remote) return
      await Promise.all(names.filter(n => Object.hasOwn(index.files, n) && !existsSync(join(dir, index.files[n]!.path))).map(n => fetchToCache(index.files[n]!.path)))
    },
    cache: { async clear() { await ready; if (remote) rmSync(dir, { recursive: true, force: true }) } },
    dispose() {},
  }
}
