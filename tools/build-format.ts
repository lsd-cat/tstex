// node tools/build-format.ts [--texmf DIR]... [--out build/latex.fmt]
// = pdftex -ini -etex -jobname=pdflatex -translate-file=cp227.tcx pdflatex.ini (TeX Live's fmtutil line); writes the format and build/pdflatex.log
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Engine } from '../src/engine.ts'
import { nodeFS } from '../src/platform/node.ts'
import { dumpFormat } from '../src/format.ts'

const args = process.argv.slice(2), texmf: string[] = []
let out = 'build/latex.fmt'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--texmf') texmf.push(args[++i]!)
  else if (args[i] === '--out') out = args[++i]!
}
if (texmf.length === 0) texmf.push('/Users/g/texlive/2026/texmf-var', '/Users/g/texlive/2026/texmf-dist') // kpathsea's order: TEXMFVAR first
mkdirSync(dirname(out), { recursive: true })
const t0 = performance.now()
const e = new Engine({ fs: nodeFS([dirname(out)], texmf), tcx: 'cp227.tcx', limits: { max_print_line: 9999 } })
await e.run({ jobname: 'pdflatex', mode: 'etex', file: '*pdflatex.ini' })
writeFileSync(join(dirname(out), 'pdflatex.log'), e.log, 'latin1')
for (const [name, text] of e.outputFiles) writeFileSync(join(dirname(out), name), text, 'latin1')
if (e.fmt_file === null) { process.stderr.write(e.terminal + '\nno format dumped\n'); process.exit(1) }
const bytes = await dumpFormat(e.fmt_file)
writeFileSync(out, bytes)
process.stdout.write(`${out}: ${bytes.length} bytes in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`)
