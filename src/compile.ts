// One compile: pdflatex runs over `fs', each run reading the files the previous runs wrote (latexmk's rerun rule).
// Used by the worker, the Node library and the CLI.
import { Engine } from './engine.ts'
import type { TexFS } from './platform/fs.ts'
import type { Format } from './format.ts'

export interface Result { pdf: Uint8Array | null, log: string, outputs: Map<string, string>, runs: number, ok: boolean }

const rerun_files = /\.(aux|out|toc|lof|lot|nav|snm)$/ // a change in one of these can change the next run's pages

// runs: a count, or 'auto' = rerun while a file above changed (at most 4 runs)
export async function compileRuns(o: { fs: TexFS, format: Format, main: string, runs?: 'auto' | number, date?: Date, mode?: 'latex' | 'pdflatex', onRun?: (n: number) => void }): Promise<Result> {
  const overlay = new Map<string, string>()
  const fs: TexFS = { ...o.fs, find: (n, k) => { const v = overlay.get(n.replace(/^\.\//, '')); return v === undefined ? o.fs.find(n, k) : Uint8Array.from(v, c => c.charCodeAt(0)) } }
  const max = o.runs === 'auto' || o.runs === undefined ? 4 : o.runs
  let e: Engine, n = 0
  for (;;) {
    o.onRun?.(++n)
    e = new Engine({ fs, format: o.format })
    await e.run({ file: o.main, mode: o.mode ?? 'pdflatex', date: o.date })
    const changed = [...e.outputFiles].some(([k, v]) => rerun_files.test(k) && overlay.get(k) !== v)
    for (const [k, v] of e.outputFiles) overlay.set(k, v)
    if (n >= max || (o.runs === 'auto' || o.runs === undefined) && !changed) break
  }
  return { pdf: e.pdf, log: e.log, outputs: e.outputFiles, runs: n, ok: e.history <= 1 }
}
