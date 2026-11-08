// Nightly differential runner: pdflatex (TeX Live) vs this engine over whole documents. See test/corpus/README.md.
// usage: node tools/corpus.ts [--texlive-docs] [--samples] [--list FILE] [--only RE] [--jobs N] [--timeout S] [--slow] [--update-skip] [--resume]
// Internal: node tools/corpus.ts --side pdftex|engine DIR MAIN  (one side, in its own process; prints a JSON result)
import { readFileSync, writeFileSync, readdirSync, statSync, statfsSync, mkdtempSync, mkdirSync, cpSync, rmSync, existsSync, appendFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname, basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TL = process.env.TL ?? '/Users/g/texlive/2026'
const TEXMFDIST = process.env.TEXMFDIST ?? TL + '/texmf-dist', TEXMFVAR = process.env.TEXMFVAR ?? TL + '/texmf-var'
const bindir = readdirSync(TL + '/bin').map(d => `${TL}/bin/${d}`).find(d => existsSync(d + '/pdftex')) ?? ''
// shell_escape_commands empty: pdftex stays in restricted mode (\pdfshellescape=2, as the engine) but runs nothing (makeindex, repstopdf)
const env = { ...process.env, PATH: `${bindir}:${process.env.PATH}`, SOURCE_DATE_EPOCH: '0', FORCE_SOURCE_DATE: '1', max_print_line: '9999', shell_escape_commands: '' }
const AUX = /\.(aux|out|toc|lof|lot|nav|snm)$/ // compile.ts's rerun_files
// \pdfsetrandomseed: pdftex seeds \pdfuniformdeviate from the clock, not SOURCE_DATE_EPOCH (tagpdf's namespace UUID differed per run)
const JOB = 'main', FIRST = (main: string) => `\\pdfsetrandomseed 1 \\pdfcompresslevel=0\\pdfobjcompresslevel=0\\input{${main}}`

// ---- one side: run -> (bibtex after run 1) -> rerun while an AUX file changed, at most 4 runs
async function side(kind: string, dir: string, main: string) {
  const t0 = Date.now(), deadline = t0 + Number(process.env.CORPUS_TIMEOUT ?? 120) * 1000
  const sig = () => readdirSync(dir).filter(f => AUX.test(f)).sort().map(f => f + '\0' + readFileSync(join(dir, f), 'latin1')).join('\0\0')
  const bib = readdirSync(dir).some(f => f.endsWith('.bib')) && /\\bibliography\s*\{/.test(readFileSync(join(dir, main), 'latin1'))
  let once: () => Promise<void> | void
  if (kind === 'pdftex') {
    once = () => { const r = spawnSync('pdftex', ['-fmt', 'pdflatex', '-interaction=batchmode', `-jobname=${JOB}`, FIRST(main)], { cwd: dir, env, timeout: deadline - Date.now(), stdio: 'ignore' }); if (r.error) throw new Error('timeout') }
  } else {
    const [{ compileRuns }, { nodeFS }, { loadFormat }] = await Promise.all([import('../src/compile.ts'), import('../src/platform/node.ts'), import('../src/format.ts')])
    const format = await loadFormat(readFileSync(root + '/build/latex.fmt'))
    once = async () => {
      const { engine: e } = await compileRuns({ fs: nodeFS([dir], [TEXMFVAR, TEXMFDIST]), format, file: FIRST(main), jobname: JOB, mode: 'pdflatex', runs: 1, date: new Date(0), limits: { max_print_line: 9999 }, cwd: dir })
      const out = (n: string, d: string | Uint8Array) => { if (n.startsWith('/') || n.split('/').includes('..')) return; mkdirSync(dirname(join(dir, n)), { recursive: true }); writeFileSync(join(dir, n), d, 'latin1') }
      out(JOB + '.log', e.log); if (e.pdf) out(JOB + '.pdf', e.pdf); for (const [n, v] of e.outputFiles) out(n, v)
    }
  }
  let runs = 0, prev = ''
  for (;;) {
    runs++; await once()
    if (runs === 1 && bib) spawnSync('bibtex', [JOB], { cwd: dir, env, timeout: 30000, stdio: 'ignore' })
    const s = sig(); if (runs >= 4 || (s === prev && !(runs === 1 && bib))) break
    prev = s
  }
  return { runs, ms: Date.now() - t0 }
}
if (process.argv[2] === '--side') {
  const [, , , kind, dir, main] = process.argv
  try { process.stdout.write(JSON.stringify(await side(kind!, dir!, main!))) } catch (x) { process.stdout.write(JSON.stringify({ crash: x instanceof Error ? x.message : String(x), ms: 0 })) }
  process.exit(0)
}

// ---- document discovery
type Doc = { id: string, dir: string, main: string, strip?: boolean, slow?: boolean }
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : e.isFile() ? [join(d, e.name)] : [])
const idOf = (p: string) => p.startsWith(TEXMFDIST + '/') ? p.slice(TEXMFDIST.length + 1) : relative(root, p).startsWith('..') ? p : relative(root, p)
const mk = (p: string, extra: Partial<Doc> = {}): Doc => ({ id: idOf(p), dir: dirname(p), main: basename(p), ...extra })
// not pdflatex, or needs something we do not provide (shell escape, Biber, dvips, ...): [regex, reason]
const NEEDS: [RegExp, string][] = [
  [/\\usepackage(\[[^\]]*\])?\{(fontspec|polyglossia|unicode-math|luacode|luatexja[^}]*|xeCJK)\}|\\RequirePackage\{luatex|\\XeTeX|\\directlua/, 'needs xelatex/lualatex'],
  [/\\write18|\\usepackage(\[[^\]]*\])?\{(minted|pythontex|sagetex|gnuplottex|svg|pstool|auto-pst-pdf)\}|\\ShellEscape|shell-escape|\\immediate\\write18/, 'needs shell escape'],
  [/\\usepackage(\[(?![^\]]*backend=bibtex)[^\]]*\]|)\{biblatex\}|\\addbibresource/, 'needs Biber'],
  [/\\usepackage(\[[^\]]*\])?\{(pstricks[^}]*|pst-[^}]*|pspicture)\}/, 'needs dvips/PostScript'],
  [/\\includegraphics(\[[^\]]*\])?\{[^}]*\.e?ps\}/, 'needs EPS conversion (shell escape)'],
]
const needs = (src: string) => NEEDS.find(([re]) => re.test(src))?.[1]

function discover(a: string[]): Doc[] {
  const docs: Doc[] = []
  if (a.includes('--texlive-docs')) for (const f of walk(TEXMFDIST + '/doc').filter(f => f.endsWith('.tex'))) {
    const s = readFileSync(f, 'latin1')
    if (/^[^%\n]*\\documentclass/m.test(s) && /\\begin\{document\}/.test(s)) docs.push(mk(f))
  }
  if (a.includes('--samples')) for (const l of readFileSync(root + '/test/corpus/samples.txt', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))) {
    const [p, flag] = l.trim().split(/\s+/) as [string, string?], abs = p.startsWith('test/') ? join(root, p) : join(TEXMFDIST, p)
    if (existsSync(abs)) docs.push(mk(abs, { slow: flag === 'slow', strip: p.startsWith('test/') }))
  }
  for (const [i, x] of a.entries()) if (x === '--list') for (const p of readFileSync(a[i + 1]!, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))) docs.push(mk(resolve(p)))
  return [...new Map(docs.map(d => [d.id, d])).values()].sort((x, y) => x.id < y.id ? -1 : 1)
}

// ---- running a document
const MB50 = 50 * 1024 * 1024
const size = (d: string) => walk(d).reduce((n, f) => n + statSync(f).size, 0)
function prepare(doc: Doc, to: string) {
  if (doc.strip) { // oracle tests: the %! header lines go; test/texmf supplies the images and inputs like oracle.sh
    cpSync(root + '/test/texmf', to, { recursive: true, filter: s => !s.endsWith('.tfm') })
    writeFileSync(join(to, doc.main), readFileSync(join(doc.dir, doc.main), 'latin1').split('\n').filter(l => !l.startsWith('%!')).join('\n'), 'latin1')
  } else cpSync(doc.dir, to, { recursive: true, filter: s => !statSync(s, { throwIfNoEntry: false })?.isSymbolicLink() })
  for (const e of ['aux', 'log', 'pdf', 'out', 'toc', 'lof', 'lot', 'nav', 'snm', 'bbl', 'blg']) if (doc.main !== `${JOB}.${e}`) rmSync(join(to, `${JOB}.${e}`), { force: true })
  if (doc.main !== JOB + '.tex' && existsSync(join(to, JOB + '.tex'))) throw new Error(`directory contains ${JOB}.tex`)
}
const runSide = (kind: string, dir: string, main: string, timeout: number) => new Promise<{ ms: number, runs?: number, crash?: string, timeout?: boolean }>(res => {
  const t0 = Date.now(), p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--side', kind, dir, main], { env: { ...env, CORPUS_TIMEOUT: String(timeout) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d)
  const timer = setTimeout(() => { p.kill('SIGKILL'); res({ ms: Date.now() - t0, timeout: true }) }, (timeout + 10) * 1000)
  p.on('close', () => { clearTimeout(timer); try { const r = JSON.parse(out); res(r.crash === 'timeout' ? { ms: r.ms || Date.now() - t0, timeout: true } : r) } catch { res({ ms: Date.now() - t0, crash: (err.trim().split('\n').pop() ?? 'no output').slice(0, 200) }) } })
})

const { normalizeLog } = await import('./normalize-log.ts'), { normalizePdf } = await import('./pdf-normalize.ts')
const rd = (p: string) => existsSync(p) ? readFileSync(p) : null
const firstErr = (log: string | undefined) => log === undefined ? 'no log' : log.match(/^!.*$/m)?.[0] ?? (/^\*\*\* \(job aborted/m.test(log) ? log.match(/^\*\*\* \(.*$/m)![0] : '')
const unsup = (log: string) => log.match(/unsupported:[^)\n]*/)?.[0]
const render = (pdf: string, tmp: string, tag: string) => { const r = spawnSync('pdftoppm', ['-gray', '-r', '50', '-f', '1', '-l', '1', pdf, join(tmp, tag)]); const f = readdirSync(tmp).find(f => f.startsWith(tag + '-')); return r.status === 0 && f ? readFileSync(join(tmp, f)) : null }

type Res = { cat: string, detail: string, tp?: number, te?: number }
async function runDoc(doc: Doc, timeout: number): Promise<Res> {
  const src = readFileSync(join(doc.dir, doc.main), 'latin1')
  if (size(doc.dir) > MB50 && !doc.strip) return { cat: 'skipped', detail: 'directory over 50 MB' }
  const free = (({ bavail, bsize }) => bavail * bsize)(statfsSync(tmpdir()))
  if (free < 2 ** 31) return { cat: 'skipped', detail: `disk: ${(free / 2 ** 30).toFixed(1)} GB free` } // the last run died of ENOSPC
  const tmp = mkdtempSync(join(tmpdir(), 'corpus-')), A = join(tmp, 'a'), B = join(tmp, 'b')
  try {
    try { prepare(doc, A); prepare(doc, B) } catch (x) { return { cat: 'skipped', detail: 'runner: ' + String(x instanceof Error ? x.message : x) } }
    const [p, e] = await Promise.all([runSide('pdftex', A, doc.main, timeout), runSide('engine', B, doc.main, timeout)])
    const t = { tp: p.ms, te: e.ms }
    if (p.timeout || e.timeout) return { cat: 'timeout', detail: `${p.timeout ? 'pdftex' : ''}${p.timeout && e.timeout ? '+' : ''}${e.timeout ? 'engine' : ''} > ${timeout}s`, ...t }
    const pl = rd(join(A, JOB + '.log'))?.toString('latin1'), el = rd(join(B, JOB + '.log'))?.toString('latin1')
    const pp = rd(join(A, JOB + '.pdf')), ep = rd(join(B, JOB + '.pdf'))
    const pe = firstErr(pl), ee = e.crash ? 'crash: ' + e.crash : firstErr(el)
    const nl = (l?: string) => l === undefined ? null : normalizeLog(l)
    const logEq = nl(pl) !== null && nl(pl) === nl(el)
    const np = pp && normalizePdf(pp), ne = ep && normalizePdf(ep), pdfEq = np !== null && np === ne
    if (logEq && pdfEq) return { cat: 'identical', detail: `raw-pdf-bytes ${Buffer.compare(pp!, ep!) === 0 ? 'equal' : 'differ'}, runs ${p.runs}/${e.runs}`, ...t }
    if (pe && ee && pe === ee) return { cat: 'both-error', detail: pe, ...t }
    if (pe && !ee) return { cat: 'pdftex-error', detail: pe, ...t }
    if (ee) return { cat: 'engine-error', detail: (el && unsup(el)) ? 'unsupported: ' + unsup(el)!.slice(12).trim() : ee, ...t }
    if (!pp || !ep) return { cat: 'engine-error', detail: ep ? 'pdftex wrote no pdf' : 'no pdf written', ...t }
    if (!pdfEq) {
      const n = np!, m = ne!; let i = 0; while (i < n.length && n[i] === m[i]) i++
      const objs = [...n.slice(0, i + 1).matchAll(/^(\d+)(?: \d+)? obj\b/gm)], obj = objs.length ? objs[objs.length - 1]![1] : '?'
      let detail = `obj ${obj}: ${JSON.stringify(n.slice(Math.max(0, i - 20), i + 80))} vs ${JSON.stringify(m.slice(Math.max(0, i - 20), i + 80))}`
      const ia = render(join(A, JOB + '.pdf'), tmp, 'ra'), ib = render(join(B, JOB + '.pdf'), tmp, 'rb')
      if (ia && ib) { let d = 0; const L = Math.max(ia.length, ib.length); for (let k = 0; k < L; k++) if (ia[k] !== ib[k]) d++; detail += ` [page1 pixels differing: ${(100 * d / L).toFixed(2)}%]` }
      return { cat: 'pdf-differs', detail, ...t }
    }
    const a = nl(pl)!.split('\n'), b = nl(el)!.split('\n'); let k = 0; while (a[k] === b[k]) k++
    return { cat: 'log-differs-only', detail: `line ${k + 1}: ${JSON.stringify(a[k] ?? '')} vs ${JSON.stringify(b[k] ?? '')}`.slice(0, 300), ...t }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

// ---- main
const args = process.argv.slice(2), arg = (n: string) => args.includes(n) ? args[args.indexOf(n) + 1] : undefined
if (!args.some(a => ['--texlive-docs', '--samples', '--list'].includes(a))) { process.stderr.write('usage: node tools/corpus.ts [--texlive-docs] [--samples] [--list FILE] [--only RE] [--jobs N] [--timeout S] [--slow] [--update-skip]\n'); process.exit(2) }
const skipFile = root + '/test/corpus/skip.txt', statusFile = root + '/test/corpus/status.md'
const skip = new Map(readFileSync(skipFile, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => [l.split(': ')[0]!, l.split(': ').slice(1).join(': ')]))
const only = arg('--only') ? new RegExp(arg('--only')!) : null, jobs = +(arg('--jobs') ?? 8), timeout = +(arg('--timeout') ?? 120)
const git = spawnSync('git', ['log', '-1', '--format=%h', '--', 'src'], { cwd: root, encoding: 'utf8' }).stdout.trim() // the engine: last commit touching src/
// the ledger so far: kept for --only (other documents) and --resume (same engine commit: documents with a final category)
const lines = new Map<string, string[]>() // id -> [cat, detail]
const prev = existsSync(statusFile) ? readFileSync(statusFile, 'utf8') : ''
const resume = args.includes('--resume') && prev.match(/^Engine (\w+);/m)?.[1] === git
if (only || resume) for (const l of prev.split('\n')) { const m = l.match(/^([a-z-]+) \| (.*?) \| (.*)$/); if (m && m[1] !== 'category') lines.set(m[2]!, [m[1]!, m[3]!]) }
const final = (id: string) => { const l = lines.get(id); return resume && l !== undefined && l[0] !== 'timeout' && !(l[0] === 'skipped' && /^(disk|runner)/.test(l[1]!)) }
const docs = discover(args).filter(d => !only || only.test(d.id))
const results = new Map<string, Res>(), newSkips: string[] = []
const todo: Doc[] = []
for (const d of docs) {
  if (final(d.id)) continue
  const why = skip.get(d.id) ?? needs(readFileSync(join(d.dir, d.main), 'latin1'))
  if (why !== undefined) { results.set(d.id, { cat: 'skipped', detail: why }); if (!skip.has(d.id)) newSkips.push(`${d.id}: ${why}`) }
  else if (d.slow && !args.includes('--slow')) results.set(d.id, { cat: 'skipped', detail: 'slow (use --slow)' })
  else todo.push(d)
}
if (!existsSync(root + '/build/latex.fmt')) { process.stderr.write('build/latex.fmt missing: run `node tools/build-format.ts --out build/latex.fmt`\n'); process.exit(1) }
let next = 0, done = 0
await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, async () => {
  while (next < todo.length) {
    const d = todo[next++]!, r = await runDoc(d, timeout).catch(x => ({ cat: 'skipped', detail: 'runner: ' + (x instanceof Error ? x.message : x) }) as Res)
    results.set(d.id, r); process.stderr.write(`[${++done}/${todo.length}] ${r.cat} ${d.id}\n`)
    if (done % 20 === 0) ledger() // so --resume can continue after a crash
  }
}))
if (args.includes('--update-skip') && newSkips.length) appendFileSync(skipFile, newSkips.map(l => l + '\n').join(''))

// ledger: with --only or --resume, lines of the other documents are kept
function ledger(): string[] {
  for (const [id, r] of results) lines.set(id, [r.cat, r.detail.replace(/\s+/g, ' ')])
  const cats = ['identical', 'both-error', 'pdf-differs', 'log-differs-only', 'engine-error', 'pdftex-error', 'timeout', 'skipped']
  const pct = (v: number[], q: number) => v.length ? (v.sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(q * v.length))]! / 1000).toFixed(1) + ' s' : '-'
  const tp = [...results.values()].flatMap(r => r.tp ? [r.tp] : []), te = [...results.values()].flatMap(r => r.te ? [r.te] : [])
  const tlv = spawnSync('pdftex', ['--version'], { env, encoding: 'utf8' }).stdout.split('\n')[0]
  const groups = new Map<string, number>()
  for (const [, [c, d]] of lines) if (c === 'engine-error') groups.set(d!, (groups.get(d!) ?? 0) + 1)
  const out = [`# Corpus status`, '', `Engine ${git}; ${tlv}; ${lines.size} documents${only || resume ? ' (partial rerun merged; timings are from this run only)' : ''}.`, '',
    '| category | count |', '|---|---|', ...cats.map(c => `| ${c} | ${[...lines.values()].filter(v => v[0] === c).length} |`), '',
    '| side | p50 | p95 | (this run, documents run: ' + tp.length + ') |', '|---|---|---|---|', `| pdftex | ${pct(tp, .5)} | ${pct(tp, .95)} | |`, `| engine | ${pct(te, .5)} | ${pct(te, .95)} | |`, '']
  if (groups.size) out.push('## engine-error by message', '', ...[...groups].sort((a, b) => b[1] - a[1]).map(([m, n]) => `- ${n}x ${m}`), '')
  out.push('## Documents', '', 'category | path | detail', ...[...lines].sort((a, b) => a[1][0]! === b[1][0]! ? (a[0] < b[0] ? -1 : 1) : cats.indexOf(a[1][0]!) - cats.indexOf(b[1][0]!)).map(([id, [c, d]]) => `${c} | ${id} | ${d}`))
  writeFileSync(statusFile, out.join('\n') + '\n')
  return out
}
const out = ledger()
process.stdout.write(out.slice(0, out.indexOf('## Documents')).join('\n') + '\n')
