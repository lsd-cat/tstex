// The engine's Web Worker (spawned by index.ts). Messages in: { type: 'init', texmf, persistent }, { type: 'compile', files,
// main, runs, date }, { type: 'prefetch', names }, { type: 'clear' }; out: progress ({ type: 'fetch' | 'run' }), then one
// { type: 'done', ... } or { type: 'error', message } per request but init (whose error is every later request's).
import { httpFS, type Index } from './platform/browser.ts'
import { loadFormat, type Format } from './format.ts'
import { compileRuns } from './compile.ts'

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)
const bytes = async (r: Response) => { if (!r.ok) throw new Error(`${r.url}: HTTP ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
const gunzip = (b: Uint8Array) => new Response(new Blob([b as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()

let base = '', index: Index, format: Format, store: Cache | null = null
const cache = new Map<string, Uint8Array>() // bundle path -> bytes: every file this worker has read
const stored = new Set<string>() // paths in `cache' that came from Cache Storage and are not yet reported

async function init(texmf: string, persistent: boolean) {
  base = texmf.endsWith('/') ? texmf : texmf + '/'
  index = JSON.parse(new TextDecoder().decode(await gunzip(await bytes(await fetch(base + 'index.json.gz')))))
  if (persistent) { // layer 2: load every file a previous session stored, so the synchronous reads hit memory
    store = await caches.open('tstex-' + index.version)
    for (const req of await store.keys()) {
      const path = req.url.slice(base.length), r = await store.match(req)
      if (r && req.url.startsWith(base)) { cache.set(path, await bytes(r)); stored.add(path) }
    }
  }
  const fmt = cache.get('fmt/latex.fmt') ?? await bytes(await fetch(base + 'fmt/latex.fmt'))
  if (store && !cache.has('fmt/latex.fmt')) await store.put(base + 'fmt/latex.fmt', new Response(fmt as Uint8Array<ArrayBuffer>))
  cache.set('fmt/latex.fmt', fmt)
  format = await loadFormat(fmt)
}

async function compile(m: { files: Record<string, Uint8Array | string>, main: string, runs?: 'auto' | number, date?: number, synctex?: number }) {
  const files = new Map(Object.entries(m.files).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v]))
  const fetched: string[] = []
  const fs = httpFS(base, index, { files, cache, onFetch: (path, d) => { fetched.push(path); post({ type: 'fetch', name: path, bytes: d.length }) } })
  const read = fs.find
  fs.find = (n, k) => { // report Cache Storage hits once
    const p = fs.path!(n, k)
    if (p !== null && stored.delete(p)) post({ type: 'fetch', name: p, bytes: cache.get(p)!.length, cached: true })
    return read(n, k)
  }
  const { engine: e, runs } = await compileRuns({ fs, format, file: m.main, runs: m.runs, date: m.date === undefined ? undefined : new Date(m.date), synctex: m.synctex, onRun: n => post({ type: 'run', n }) })
  if (store) for (const p of fetched) await store.put(base + p, new Response(cache.get(p)! as Uint8Array<ArrayBuffer>))
  post({ type: 'done', pdf: e.pdf, log: e.log, outputs: Object.fromEntries(e.outputFiles), synctex: e.synctex, runs, ok: e.history <= 1, fetched }, e.pdf ? [e.pdf.buffer] : [])
}

let queue = Promise.resolve(), init_error: unknown = null
self.onmessage = (ev: MessageEvent) => {
  const m = ev.data
  queue = queue.then(async () => {
    try {
      if (m.type === 'init') { try { await init(m.texmf, m.persistent) } catch (x) { init_error = x }; return }
      if (init_error !== null) throw init_error
      if (m.type === 'compile') await compile(m)
      else if (m.type === 'prefetch') { // async, in parallel: later synchronous reads hit memory
        const paths = (m.names as string[]).filter(n => Object.hasOwn(index.files, n)).map(n => index.files[n]!.path).filter(p => !cache.has(p))
        await Promise.all(paths.map(async p => {
          const d = await bytes(await fetch(base + p))
          cache.set(p, d); post({ type: 'fetch', name: p, bytes: d.length })
          await store?.put(base + p, new Response(d as Uint8Array<ArrayBuffer>))
        }))
        post({ type: 'done' })
      } else if (m.type === 'clear') {
        cache.clear(); stored.clear()
        for (const k of await caches.keys()) if (k.startsWith('tstex-')) await caches.delete(k)
        store = null; post({ type: 'done' })
      }
    } catch (x) { post({ type: 'error', message: x instanceof Error ? x.message : String(x) }) }
  })
}
