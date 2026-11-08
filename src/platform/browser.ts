// TexFS over a packed texmf bundle (tools/pack-texmf.ts): user files first (printed as `./name'), then the bundle's
// index with kpathsea's search order (lookup.ts). httpFS reads the bundle with synchronous XHR, which only a Worker may do.
import type { TexFS } from './fs.ts'
import { escapes, candidates, tree_matches } from './lookup.ts'
import { deflate, inflate } from './deflate.ts'

export interface Index { version: string, files: Record<string, { path: string, size: number }> }

// `read(path)' gets a bundle file (null: unavailable); `files' are the user's files, by name relative to the job directory
export function bundleFS(index: Index, read: (path: string) => Uint8Array | null, files: Map<string, Uint8Array> = new Map()): TexFS {
  const entries = new Map(Object.entries(index.files)) // a Map: names like `constructor' must not hit Object.prototype
  const dbs = [(b: string) => { const p = entries.get(b)?.path; return p === undefined ? undefined : [p.slice(0, p.length - b.length)] }]
  const locate = (name: string, kind: string): { user: string } | { path: string, size: number } | null => {
    if (escapes(name)) return null // no path escape; /dev/null does not exist here
    for (const n of candidates(name, kind)) { const u = n.replace(/^\.\//, ''); if (files.has(u)) return { user: u } }
    for (const [, rel] of tree_matches(name, kind, dbs)) return entries.get(rel.slice(rel.lastIndexOf('/') + 1))!
    return null
  }
  return {
    find: (name, kind) => { const l = locate(name, kind); return l === null ? null : 'user' in l ? files.get(l.user)! : read(l.path) },
    path: (name, kind) => { const l = locate(name, kind); return l === null ? null : 'user' in l ? (/^\.\//.test(name) ? name : './' + l.user) : l.path },
    stat: (name, kind) => { const l = locate(name, kind); return l === null ? null : { size: 'user' in l ? files.get(l.user)!.length : l.size, mtime: new Date(0) } },
    writable: name => !escapes(name), // outputs stay in memory (Engine.outputFiles)
    compress: (data, level) => deflate(data, level),
    inflate: (data, max) => { try { return inflate(data, max) } catch { return new Uint8Array(0) } }, // as zlib's errors in nodeFS
  }
}

// synchronous GET of base + path (Workers only); x-user-defined keeps each byte in one UTF-16 unit
export function syncGet(base: string, path: string): Uint8Array | null {
  const x = new XMLHttpRequest()
  x.open('GET', base + path, false)
  x.overrideMimeType('text/plain; charset=x-user-defined')
  x.send()
  if (x.status !== 200) return null
  const s = x.responseText, b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}

// base ends in `/'; `cache' (bundle path -> bytes) is read first and filled by every network read, which onFetch sees
export const httpFS = (base: string, index: Index, opts: { files?: Map<string, Uint8Array>, cache?: Map<string, Uint8Array>, onFetch?: (path: string, data: Uint8Array) => void } = {}) =>
  bundleFS(index, path => {
    const c = opts.cache?.get(path)
    if (c !== undefined) return c
    const d = syncGet(base, path)
    if (d !== null) { opts.cache?.set(path, d); opts.onFetch?.(path, d) }
    return d
  }, opts.files)
