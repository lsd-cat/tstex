// Knuth's trip test (spec/tripman.tex, Appendix A steps 3-6): two INITEX passes with tex.web's capacities,
// outputs in /tmp/trip, each diffed against spec/. If pdftex is installed, the same two passes are also run
// with TeX Live's capacities by both pdftex (/tmp/trip/pdftex) and this engine (/tmp/trip/tl) and diffed after
// tools/normalize-log.ts: that is the oracle for classifying a Knuth diff as pdftex behaviour or a bug.
// Usage: node tools/trip.ts
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { Engine } from '../src/engine.ts'
import type { Limits } from '../src/engine.ts'
import { nodeFS } from '../src/platform/node.ts'
import { normalizeLog } from './normalize-log.ts'

const root = new URL('..', import.meta.url).pathname, out = '/tmp/trip'
const bin = (p: string) => [p, `/Users/g/texlive/2026/bin/universal-darwin/${p}`].find(b => spawnSync(b, ['--version']).status === 0)
const dvitype = bin('dvitype'), pdftex = bin('pdftex')
const fs = nodeFS([root + 'spec', root + 'test/texmf'])
const date = new Date(1776, 6, 4, 12, 0) // the date in Knuth's logs
// tripman step 2: mem_min=mem_bot=1, mem_top=mem_max=3000 have no counterpart; the rest are tex.web §11's values
const trip_limits = {
  error_line: 64, half_error_line: 32, max_print_line: 72, stack_size: 200, max_in_open: 6, buf_size: 500, param_size: 60,
  nest_size: 40, save_size: 600, font_max: 75, font_mem_size: 20000, hash_size: 2100, hash_extra: 0, hyph_size: 307,
  trie_size: 8000, trie_op_size: 500, dvi_buf_size: 800,
}

// DVItype as in step 6: output level 2, all pages, 72.27 pixels per inch
function typ(dir: string): void {
  if (dvitype && existsSync(`${dir}/trip.dvi`)) writeFileSync(`${dir}/trip.typ`,
    execFileSync(dvitype, ['-output-level=2', '-dpi=72.27', '-page-start=*.*.*.*.*.*.*.*.*.*', 'trip.dvi'], { cwd: dir, env: { ...process.env, TFMFONTS: `${root}test/texmf:` } }))
}

// step 3: `**' answered by an empty line, then `\input trip'; step 4: ` &trip  trip '
async function passes(dir: string, limits: Partial<Limits>): Promise<void> {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const e1 = new Engine({ fs, limits })
  await e1.run({ mode: 'ini', terminal: ['', '\\input trip'], date })
  writeFileSync(`${dir}/tripin.log`, e1.log); writeFileSync(`${dir}/tripin.fot`, e1.terminal)
  if (e1.fmt_file === null) throw new Error('pass 1 made no format')
  const e2 = new Engine({ fs, limits, format: e1.fmt_file })
  await e2.run({ mode: 'ini', terminal: [' &trip  trip '], date })
  writeFileSync(`${dir}/trip.log`, e2.log); writeFileSync(`${dir}/trip.fot`, e2.terminal)
  for (const [name, text] of e2.outputFiles) writeFileSync(`${dir}/${name}`, text, 'latin1')
  if (e2.dvi) writeFileSync(`${dir}/trip.dvi`, e2.dvi)
  typ(dir)
}

function diff(a: string, b: string, label: string): void {
  const d = spawnSync('diff', ['-u', '--label', `${label} expected`, '--label', `${label} ours`, a, b], { encoding: 'latin1' })
  process.stdout.write(d.stdout || `${label}: identical\n`)
}

await passes(out, trip_limits)
for (const f of ['tripin.log', 'trip.log', 'trip.fot', 'trip.typ']) diff(`${root}spec/${f}`, `${out}/${f}`, f)

if (pdftex) {
  const p = `${out}/pdftex`
  mkdirSync(p, { recursive: true }); copyFileSync(`${root}spec/trip.tex`, `${p}/trip.tex`)
  const env = { ...process.env, TFMFONTS: `${root}test/texmf:` }
  spawnSync(pdftex, ['-ini'], { cwd: p, env, input: '\\input trip\n' })
  copyFileSync(`${p}/trip.log`, `${p}/tripin.log`)
  writeFileSync(`${p}/trip.fot`, spawnSync(pdftex, ['-ini'], { cwd: p, env, input: ' &trip  trip \n' }).stdout)
  typ(p)
  await passes(`${out}/tl`, {})
  for (const f of ['tripin.log', 'trip.log']) {
    for (const d of [p, `${out}/tl`]) writeFileSync(`${d}/${f}.norm`, normalizeLog(readFileSync(`${d}/${f}`, 'latin1')).replace(/^(Beginning to dump on file .*\n).*\n.*\n.*\n/m, '$1').replace(/^Memory usage before: .*$/mg, 'Memory usage'))
    diff(`${p}/${f}.norm`, `${out}/tl/${f}.norm`, `pdftex ${f}`)
  }
  diff(`${p}/trip.typ`, `${out}/tl/trip.typ`, 'pdftex trip.typ')
}
