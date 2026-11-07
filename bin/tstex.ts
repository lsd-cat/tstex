// CLI: node bin/tstex.ts [--texmf DIR]... file.tex — runs the engine in ini mode, writes <jobname>.log, .dvi and \openout files
import { writeFileSync } from 'node:fs'
import { dirname, basename, join, resolve } from 'node:path'
import { Engine } from '../src/engine.ts'
import { nodeFS } from '../src/platform/node.ts'

const args = process.argv.slice(2), texmf: string[] = []
let file = ''
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--texmf' && i + 1 < args.length) texmf.push(resolve(args[++i]!))
  else file = args[i]!
}
if (!file.endsWith('.tex')) { process.stderr.write('usage: node bin/tstex.ts [--texmf DIR]... file.tex\n'); process.exit(2) }
const dir = dirname(resolve(file)), jobname = basename(file, '.tex')
const e = new Engine({ fs: nodeFS([dir, ...texmf, process.cwd()]) })
await e.run({ jobname, mode: 'ini' })
writeFileSync(join(dir, jobname + '.log'), e.log)
if (e.dvi) writeFileSync(join(dir, jobname + '.dvi'), e.dvi)
for (const [name, text] of e.outputFiles) writeFileSync(join(dir, name), text)
process.stdout.write(e.terminal)
process.exit(e.history <= 1 ? 0 : 1)
