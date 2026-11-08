// CLI: node bin/tstex.ts [--ini|--etex|--fmt FILE] [--texmf DIR]... [--texmf-tree DIR]... [--tcx FILE] [--jobname NAME] file
// --ini (default) and --etex run INITEX; --fmt loads a format from tools/build-format.ts (pdflatex -output-format=dvi).
// --texmf: plain directories searched first; --texmf-tree: texmf trees with an ls-R (default $TEXMFDIST, if set).
// Writes <jobname>.log, .dvi and \openout files next to the input file.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, basename, join, resolve } from 'node:path'
import { Engine } from '../src/engine.ts'
import { nodeFS } from '../src/platform/node.ts'
import { loadFormat } from '../src/format.ts'

const args = process.argv.slice(2), texmf: string[] = [], trees: string[] = []
let file = '', mode: 'ini' | 'etex' | 'latex' = 'ini', fmt = '', tcx: string | undefined, jobname: string | undefined
for (let i = 0; i < args.length; i++) {
  const a = args[i]!, v = () => args[++i] ?? ''
  if (a === '--texmf') texmf.push(resolve(v()))
  else if (a === '--texmf-tree') trees.push(resolve(v()))
  else if (a === '--fmt') { fmt = v(); mode = 'latex' }
  else if (a === '--tcx') tcx = v()
  else if (a === '--jobname') jobname = v()
  else if (a === '--ini') mode = 'ini'
  else if (a === '--etex') mode = 'etex'
  else file = a
}
if (file === '') {
  process.stderr.write('usage: node bin/tstex.ts [--ini|--etex|--fmt FILE] [--texmf DIR]... [--texmf-tree DIR]... [--tcx FILE] [--jobname NAME] file\n')
  process.exit(2)
}
if (trees.length === 0 && process.env.TEXMFDIST) trees.push(process.env.TEXMFDIST)
const dir = dirname(resolve(file))
const format = fmt ? await loadFormat(readFileSync(fmt)) : undefined
const limits = process.env.max_print_line ? { max_print_line: +process.env.max_print_line } : {} // texmf.cnf variables come from the environment
const e = new Engine({ fs: nodeFS([dir, ...texmf, process.cwd()], trees), format, tcx, limits })
await e.run({ file: basename(file), jobname, mode })
writeFileSync(join(dir, e.job_name + '.log'), e.log, 'latin1')
if (e.dvi) writeFileSync(join(dir, e.job_name + '.dvi'), e.dvi)
for (const [name, text] of e.outputFiles) writeFileSync(join(dir, name), text, 'latin1')
process.stdout.write(Buffer.from(e.terminal, 'latin1'))
process.exit(e.history <= 1 ? 0 : 1)
