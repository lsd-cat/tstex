// One compile: runs of the engine over `fs', each reading the files the previous runs wrote (latexmk's rerun rule).
// Used by the worker, the Node library and the CLI.
import { Engine, type Limits } from './engine.ts'
import type { TexFS } from './platform/fs.ts'
import type { Format } from './format.ts'

const rerun_files = /\.(aux|out|toc|lof|lot|nav|snm)$/ // a change in one of these can change the next run's pages

// runs: a count, or 'auto' (default) = rerun while a file above changed, at most 4 runs; returns the last run's engine
export async function compileRuns(o: { fs: TexFS, format?: Format, file: string, jobname?: string, mode?: 'ini' | 'etex' | 'latex' | 'pdflatex',
  runs?: 'auto' | number, date?: Date, limits?: Partial<Limits>, tcx?: string, synctex?: number, cwd?: string, onRun?: (n: number) => void }): Promise<{ engine: Engine, runs: number }> {
  const overlay = new Map<string, string>()
  const fs: TexFS = { ...o.fs, find: (n, k) => { const v = overlay.get(n.replace(/^\.\//, '')); return v === undefined ? o.fs.find(n, k) : Uint8Array.from(v, c => c.charCodeAt(0)) } }
  const auto = o.runs === 'auto' || o.runs === undefined, max = auto ? 4 : o.runs as number
  for (let n = 1; ; n++) {
    o.onRun?.(n)
    const e = new Engine({ fs, format: o.format, limits: o.limits, tcx: o.tcx })
    await e.run({ file: o.file, jobname: o.jobname, mode: o.mode ?? 'pdflatex', date: o.date, synctex: o.synctex, cwd: o.cwd })
    const changed = [...e.outputFiles].some(([k, v]) => rerun_files.test(k) && overlay.get(k) !== v)
    for (const [k, v] of e.outputFiles) overlay.set(k, v)
    if (n >= max || auto && !changed) return { engine: e, runs: n }
  }
}
