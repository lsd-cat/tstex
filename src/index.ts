// tstex in the browser: createTeX spawns the engine's Worker (worker.ts) over a texmf bundle URL (tools/pack-texmf.ts).
//   const tex = createTeX({ texmf: 'https://example.org/texmf/2026-1/' })
//   const { pdf, log } = await tex.compile({ files: { 'main.tex': source }, main: 'main.tex', runs: 'auto' })
// Node: import from 'tstex' resolves to node.ts (same API, in-process).
export type Progress = { type: 'fetch', name: string, bytes: number, cached?: boolean } | { type: 'run', n: number } | { type: 'done' }
export interface CompileOptions {
  files: Record<string, string | Uint8Array> // the job directory; strings are UTF-8 encoded
  main: string // e.g. 'main.tex'; the job name is its base name
  runs?: 'auto' | number // 'auto' (default): rerun while .aux/.out/.toc/... change, at most 4 runs
  date?: Date // fixed \today, /CreationDate and /ID (SOURCE_DATE_EPOCH); default now
  onProgress?: (p: Progress) => void
  signal?: AbortSignal // aborting terminates the worker (a new one starts for the next call)
}
export interface CompileResult {
  pdf: Uint8Array | null, log: string, outputs: Record<string, string> // \openout files (.aux ...), latin1 strings
  fetched: number // bytes read over the network (not from memory or Cache Storage) during this compile
  runs: number, ok: boolean // ok: no errors (TeX's history <= warning_issued)
}
export interface TeX {
  compile(o: CompileOptions): Promise<CompileResult>
  prefetch(names: string[]): Promise<void> // fetch bundle files by basename now (in parallel), e.g. while the user types
  cache: { clear(): Promise<void> } // forget fetched files, in memory and in Cache Storage
  dispose(): void
}

export function createTeX(opts: { texmf: string, cache?: 'http' | 'persistent', fmt?: 'latex' }): TeX {
  let worker: Worker, queue: Promise<unknown> = Promise.resolve(), fail: ((x: Error) => void) | null = null
  const texmf = new URL(opts.texmf, globalThis.location?.href).href
  // one request at a time: progress messages, then `done' or `error'
  const request = <T>(msg: unknown, onMsg: (m: any) => void = () => {}, signal?: AbortSignal): Promise<T> => {
    const p = queue.then(() => new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      const abort = () => { start(); reject(signal!.reason) }
      signal?.addEventListener('abort', abort, { once: true })
      fail = x => { signal?.removeEventListener('abort', abort); reject(x) }
      worker.onmessage = ev => {
        const m = ev.data
        if (m.type === 'error') fail!(new Error(m.message))
        else { onMsg(m); if (m.type === 'done') { signal?.removeEventListener('abort', abort); resolve(m) } }
      }
      worker.postMessage(msg)
    }))
    queue = p.catch(() => {})
    return p
  }
  const start = () => {
    worker?.terminate()
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onerror = ev => fail?.(new Error(ev.message))
    worker.postMessage({ type: 'init', texmf, persistent: opts.cache === 'persistent' }) // its failure is every later request's error
  }
  start()
  return {
    async compile(o) {
      let fetched = 0
      const m = await request<any>({ type: 'compile', files: o.files, main: o.main, runs: o.runs ?? 'auto', date: o.date?.getTime() }, m => {
        if (m.type === 'fetch' && !m.cached) fetched += m.bytes
        o.onProgress?.(m.type === 'done' ? { type: 'done' } : m)
      }, o.signal)
      return { pdf: m.pdf, log: m.log, outputs: m.outputs, fetched, runs: m.runs, ok: m.ok }
    },
    prefetch: names => request({ type: 'prefetch', names }),
    cache: { clear: () => request({ type: 'clear' }) },
    dispose: () => worker.terminate(),
  }
}
