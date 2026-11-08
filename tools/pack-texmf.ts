// Build a static texmf bundle (the M7 resource protocol, see README.md):
//   node tools/pack-texmf.ts --preset minimal|basic [--texmf-dist DIR] [--texmf-var DIR] [--fmt build/latex.fmt] --out DIR
// DIR/index.json.gz = { version, files: { basename: { path, size } } }, DIR/fmt/latex.fmt, DIR/<path> for every file.
// minimal = tools/minimal-files.txt (what the test corpus opens); basic = scheme-basic + the packages below, tex/ and fonts/ only.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { tree_matches } from '../src/platform/lookup.ts'

const extra = ['pgf', 'beamer', 'hyperref', 'xcolor', 'geometry', 'cm-super', 'lm', 'extsizes', 'booktabs', 'textpos', 'psnfss']

// the kind a file is looked up as, from its extension (to pick among same-basename files the way pdflatex would)
const kind_of = (base: string) => ({ tfm: 'tfm', vf: 'vf', enc: 'enc', map: 'map', pfb: 'type1', cnf: 'cnf', tcx: 'tcx' } as Record<string, string>)[base.split('.').pop()!] ?? 'tex'

// texlive.tlpdb: the runfiles of `roots' and everything they depend on, as `texmf-dist/...' paths
function tlpdb_files(tlpdb: string, roots: string[]): string[] {
  const pkgs = new Map<string, { depend: string[], files: string[] }>()
  for (const block of readFileSync(tlpdb, 'utf8').split('\n\n')) {
    const name = block.match(/^name (\S+)/m)?.[1]
    if (name === undefined) continue
    const depend = [...block.matchAll(/^depend (\S+)$/gm)].map(m => m[1]!).filter(d => !d.endsWith('.ARCH'))
    const run = block.split(/^runfiles .*$/m)[1]?.split(/^\S/m)[0] ?? ''
    pkgs.set(name, { depend, files: [...run.matchAll(/^ (\S+)/gm)].map(m => m[1]!.replace(/^RELOC\//, 'texmf-dist/')) })
  }
  const seen = new Set<string>(), out: string[] = []
  const walk = (n: string) => {
    if (seen.has(n)) return
    seen.add(n)
    const p = pkgs.get(n)
    if (p === undefined) throw new Error(`pack-texmf: no package ${n} in ${tlpdb}`)
    out.push(...p.files); p.depend.forEach(walk)
  }
  roots.forEach(walk)
  return out
}

export function pack(argv: string[]): void {
  const opt: Record<string, string> = {
    'texmf-dist': process.env.TEXMFDIST ?? '/Users/g/texlive/2026/texmf-dist', 'texmf-var': process.env.TEXMFVAR ?? '/Users/g/texlive/2026/texmf-var',
    fmt: 'build/latex.fmt',
  }
  for (let i = 0; i < argv.length; i++) if (argv[i]!.startsWith('--')) opt[argv[i]!.slice(2)] = argv[++i] ?? ''
  if (!opt.out || !['minimal', 'basic'].includes(opt.preset!)) throw new Error('usage: pack-texmf --preset minimal|basic [--texmf-dist DIR] [--texmf-var DIR] [--fmt FILE] --out DIR')
  const trees: Record<string, string> = { 'texmf-var': opt['texmf-var']!, 'texmf-dist': opt['texmf-dist']! }
  // tree-qualified paths `texmf-dist/tex/...'
  let list: string[]
  if (opt.preset === 'minimal') list = readFileSync(new URL('minimal-files.txt', import.meta.url), 'utf8').split('\n').filter(l => l !== '' && !l.startsWith('#'))
  else {
    list = tlpdb_files(join(opt['texmf-dist']!, '../tlpkg/texlive.tlpdb'), ['scheme-basic', ...extra])
      .filter(f => /^texmf-dist\/(tex|fonts)\//.test(f) && existsSync(join(trees['texmf-dist']!, f.slice(11))))
    list.push('texmf-var/fonts/map/pdftex/updmap/pdftex.map') // updmap's output for the installed fonts
  }
  // basename -> candidates; several: keep the one pdflatex's search order (lookup.ts, var before dist) picks
  const by_base = new Map<string, { tree: string, rel: string }[]>()
  for (const f of new Set(list)) {
    const tree = f.slice(0, f.indexOf('/')), rel = f.slice(tree.length + 1), base = rel.slice(rel.lastIndexOf('/') + 1)
    if (trees[tree] === undefined) throw new Error(`pack-texmf: ${f} is in no tree`)
    by_base.set(base, [...by_base.get(base) ?? [], { tree, rel }])
  }
  const files: Record<string, { path: string, size: number }> = {}
  let raw = 0
  for (const [base, c] of [...by_base].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const dbs = Object.keys(trees).map(t => () => c.filter(x => x.tree === t).map(x => x.rel.slice(0, -base.length)))
    const hit = tree_matches(base, kind_of(base), dbs).next().value
    const pick = hit ? c.find(x => x.tree === Object.keys(trees)[hit[0]] && x.rel === hit[1])! : c[0]!
    const src = join(trees[pick.tree]!, pick.rel), dst = join(opt.out, pick.rel), size = statSync(src).size
    mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst)
    files[base] = { path: pick.rel, size }; raw += size
  }
  mkdirSync(join(opt.out, 'fmt'), { recursive: true }); copyFileSync(opt.fmt!, join(opt.out, 'fmt/latex.fmt'))
  const fmt = readFileSync(opt.fmt!)
  const version = createHash('sha256').update(JSON.stringify(files)).update(fmt).digest('hex').slice(0, 12)
  writeFileSync(join(opt.out, 'index.json.gz'), gzipSync(JSON.stringify({ version, files })))
  process.stdout.write(`${opt.preset}: ${Object.keys(files).length} files, ${raw} bytes + format ${fmt.length} bytes -> ${opt.out} (version ${version})\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) pack(process.argv.slice(2))
