// Performance benchmark: median of 5 in-process runs after 1 warm-up, in ms.
// usage: [TSTEX_FMT=path] node tools/bench.ts [--pdftex] [--n N] [name...]   (names: hello beamer acmart guide loop)
// Wall time and process CPU time (user+system; less sensitive to a loaded machine) are both reported.
// --pdftex also times TeX Live's pdftex once on the same inputs (same env as tools/oracle.sh).
import { readFileSync, mkdtempSync, writeFileSync, cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Engine } from '../src/engine.ts'
import { nodeFS } from '../src/platform/node.ts'
import { loadFormat } from '../src/format.ts'
import type { TexFS } from '../src/platform/fs.ts'
import { candidates } from '../src/platform/lookup.ts'

const root = new URL('..', import.meta.url).pathname
const TL = process.env.TL ?? '/Users/g/texlive/2026'
const TEXMFDIST = TL + '/texmf-dist', TEXMFVAR = TL + '/texmf-var'
const oracle = root + 'test/oracle/', texmf = root + 'test/texmf/', lvt = root + 'test/lvt/'
const args = process.argv.slice(2), withPdftex = args.includes('--pdftex')
const N = args.includes('--n') ? Number(args[args.indexOf('--n') + 1]) : 5
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--n')
const fmtBytes = readFileSync(process.env.TSTEX_FMT ?? root + 'build/latex.fmt')
const tmp = mkdtempSync(join(tmpdir(), 'tstex-bench-'))

const loop = [ // the macro-heavy loop: 200k iterations, a few \edef's each (` is a TeX character constant here)
  '\\catcode`\\{=1 \\catcode`\\}=2 \\catcode`\\#=6',
  '\\countdef\\n=10 \\n=0',
  '\\def\\a#1#2{#2#1}',
  '\\def\\loop{\\edef\\x{\\a{\\number\\n}{x}}\\edef\\y{\\x\\x}\\edef\\z{\\the\\n\\y\\ifodd\\n o\\else e\\fi}%',
  '  \\ifnum\\n<200000 \\advance\\n1 \\expandafter\\loop\\fi}',
  '\\loop', '\\end', ''].join('\n')
writeFileSync(join(tmp, 'hello.tex'), String.raw`\documentclass{article}\begin{document}Hello.\end{document}` + '\n')
writeFileSync(join(tmp, 'loop.tex'), loop)
const guide = join(tmp, 'guide')
cpSync(TEXMFDIST + '/doc/latex/beamer', guide, { recursive: true })

type B = { name: string, dir: string, job: string, file?: string, mode: 'etex' | 'pdflatex', runs: number }
const benches = ([
  { name: 'hello', dir: tmp, job: 'hello', mode: 'pdflatex', runs: 1 },
  { name: 'beamer', dir: oracle, job: 'm6-latex-beamer', mode: 'pdflatex', runs: 2 },
  { name: 'acmart', dir: oracle, job: 'm8-latex-acmart', mode: 'pdflatex', runs: 2 },
  { name: 'guide', dir: guide, job: 'beameruserguide', mode: 'pdflatex', runs: 1 },
  { name: 'loop', dir: tmp, job: 'loop', mode: 'etex', runs: 1 },
] as B[]).filter(b => only.length === 0 || only.includes(b.name))

const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1]!
const ms = (t: number) => t.toFixed(0).padStart(7)

async function engineRun(b: B, base: TexFS, format: Awaited<ReturnType<typeof loadFormat>> | undefined) {
  const overlay = new Map<string, string | Uint8Array>()
  const fs: TexFS = { ...base, find: (n, k) => { const o = candidates(n, k).map(c => overlay.get(c)).find(o => o !== undefined); return o === undefined ? base.find(n, k) : typeof o === 'string' ? Buffer.from(o, 'latin1') : o } }
  let e: Engine | undefined
  for (let i = 0; i < b.runs; i++) {
    e = new Engine({ fs, format, limits: { max_print_line: 9999 } })
    await e.run({ jobname: b.job, mode: b.mode, date: new Date(0) })
    for (const [n, v] of e.outputFiles) overlay.set(n, v)
  }
  return e!
}

function pdftex(b: B): number {
  const bin = readdirSync(TL + '/bin').map(d => `${TL}/bin/${d}/pdftex`).find(existsSync)
  if (bin === undefined) return NaN
  const d = mkdtempSync(join(tmpdir(), 'tstex-bench-pdftex-'))
  cpSync(b.dir, d, { recursive: true })
  const env = { ...process.env, SOURCE_DATE_EPOCH: '0', FORCE_SOURCE_DATE: '1', max_print_line: '9999', TEXINPUTS: `.:${lvt}:${texmf}:`, TFMFONTS: `${texmf}:`, VFFONTS: `${texmf}:` }
  const a = b.mode === 'etex' ? ['-ini', '-etex'] : ['-fmt', 'pdflatex']
  const t0 = performance.now()
  for (let i = 0; i < b.runs; i++) spawnSync(bin, [...a, '-interaction=batchmode', `-jobname=${b.job}`, `${b.job}.tex`], { cwd: d, env, stdio: 'ignore' })
  const t = performance.now() - t0
  rmSync(d, { recursive: true, force: true })
  return t
}

console.log(`bench: median of ${N} after 1 warm-up, ms`)
for (const b of benches) {
  const fmt: number[] = [], run: number[] = [], cpu: number[] = []
  let lines = 0
  const base = nodeFS(b.dir === oracle ? [oracle, texmf, lvt] : [b.dir], [TEXMFVAR, TEXMFDIST]) // ls-R parsing is host setup, not timed
  for (let i = 0; i <= N; i++) {
    const c0 = process.cpuUsage(), t0 = performance.now()
    const format = b.mode === 'pdflatex' ? await loadFormat(fmtBytes) : undefined
    const t1 = performance.now()
    const e = await engineRun(b, base, format)
    const t2 = performance.now(), c = process.cpuUsage(c0)
    if (i > 0) { fmt.push(t1 - t0); run.push(t2 - t1); cpu.push((c.user + c.system) / 1000) }
    lines = e.log.length
  }
  const ref = withPdftex ? `  pdftex ${ms(pdftex(b))}` : ''
  console.log(`${b.name.padEnd(7)} total ${ms(median(fmt.map((f, i) => f + run[i]!)))}  loadFormat ${ms(median(fmt))}  run ${ms(median(run))}  cpu ${ms(median(cpu))}  (log ${lines} B)${ref}`)
}
rmSync(tmp, { recursive: true, force: true })
