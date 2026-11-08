// Knuth's trip test (spec/tripman.tex, Appendix A steps 3-6): two INITEX passes with tex.web's capacities,
// outputs in /tmp/trip, each diffed against spec/. If pdftex is installed, the same two passes are also run
// with TeX Live's capacities by both pdftex (/tmp/trip/pdftex) and this engine (/tmp/trip/tl) and diffed after
// tools/normalize-log.ts: that is the oracle for classifying a Knuth diff as pdftex behaviour or a bug.
// The same is done for Breitenlohner's etrip (outputs in /tmp/trip/etrip); see the end of this file and test/etrip-diffs.md.
// Usage: node tools/trip.ts
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { Engine } from '../src/engine.ts'
import { default_limits } from '../src/engine.ts'
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
function typ(dir: string, job: string): void {
  if (dvitype && existsSync(`${dir}/${job}.dvi`)) writeFileSync(`${dir}/${job}.typ`,
    execFileSync(dvitype, ['-output-level=2', '-dpi=72.27', '-page-start=*.*.*.*.*.*.*.*.*.*', `${job}.dvi`], { cwd: dir, env: { ...process.env, TFMFONTS: `${root}test/texmf:` } }))
}

// trip: step 3 `**' answered by an empty line, then `\input trip'; step 4 ` &trip  trip '.
// etrip (etripman steps 7-8, etrip2.in/etrip3.in): `*etrip', then `&etrip etrip'.
async function passes(dir: string, limits: Partial<Limits>, job = 'trip', t1 = ['', '\\input trip'], t2 = [' &trip  trip '], efs = fs): Promise<void> {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const e1 = new Engine({ fs: efs, limits })
  await e1.run({ mode: 'ini', terminal: t1, date })
  writeFileSync(`${dir}/${job}in.log`, e1.log); writeFileSync(`${dir}/${job}in.fot`, e1.terminal)
  if (e1.fmt_file === null) throw new Error('pass 1 made no format')
  const e2 = new Engine({ fs: efs, limits, format: e1.fmt_file })
  await e2.run({ mode: 'ini', terminal: t2, date })
  writeFileSync(`${dir}/${job}.log`, e2.log); writeFileSync(`${dir}/${job}.fot`, e2.terminal)
  for (const [name, text] of e2.outputFiles) writeFileSync(`${dir}/${name}`, text, 'latin1')
  if (e2.dvi) writeFileSync(`${dir}/${job}.dvi`, e2.dvi)
  typ(dir, job)
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
  const env = { ...process.env, TFMFONTS: `${root}test/texmf:`, SOURCE_DATE_EPOCH: '0', FORCE_SOURCE_DATE: '1' }
  spawnSync(pdftex, ['-ini'], { cwd: p, env, input: '\\input trip\n' })
  copyFileSync(`${p}/trip.log`, `${p}/tripin.log`)
  writeFileSync(`${p}/trip.fot`, spawnSync(pdftex, ['-ini'], { cwd: p, env, input: ' &trip  trip \n' }).stdout)
  typ(p, 'trip')
  await passes(`${out}/tl`, {})
  for (const f of ['tripin.log', 'trip.log']) {
    for (const d of [p, `${out}/tl`]) writeFileSync(`${d}/${f}.norm`, normalizeLog(readFileSync(`${d}/${f}`, 'latin1')).replace(/^(Beginning to dump on file .*\n).*\n.*\n.*\n/m, '$1').replace(/^Memory usage before: .*$/mg, 'Memory usage'))
    diff(`${p}/${f}.norm`, `${out}/tl/${f}.norm`, `pdftex ${f}`)
  }
  diff(`${p}/trip.typ`, `${out}/tl/trip.typ`, 'pdftex trip.typ')
}

// etrip (spec/etripman.tex, spec/etrip-texmf.cnf: trip's capacities). TeXXeT is not ported (PLAN: deferred), so a copy
// of etrip.tex with every `\TeXXeTstate=1' changed to 0 is run; those spots then give `Improper \beginR' etc. instead.
const ed = `${out}/etrip-src`
rmSync(ed, { recursive: true, force: true }); mkdirSync(ed, { recursive: true })
writeFileSync(`${ed}/etrip.tex`, readFileSync(`${root}spec/etrip.tex`, 'latin1').replaceAll('\\TeXXeTstate=1', '\\TeXXeTstate=0'), 'latin1')
const efs = nodeFS([ed, root + 'test/texmf'])
const eout = `${out}/etrip`
// etrip-texmf.cnf leaves the hash, trie and hyphenation sizes at TeX Live's (hash 15000, but no hash_extra; etrip.log prints 659 exceptions)
const etrip_limits = { ...trip_limits, hash_size: 15000, hyph_size: 659, trie_size: default_limits.trie_size, trie_op_size: default_limits.trie_op_size }
await passes(eout, etrip_limits, 'etrip', ['*etrip'], ['&etrip etrip'], efs)
for (const f of ['etripin.log', 'etrip.log', 'etrip.fot', 'etrip.typ', 'etrip.out']) diff(`${root}spec/${f}`, `${eout}/${f}`, f)
if (pdftex) {
  const p = `${eout}/pdftex`
  mkdirSync(p, { recursive: true }); copyFileSync(`${ed}/etrip.tex`, `${p}/etrip.tex`)
  const env = { ...process.env, TFMFONTS: `${root}test/texmf:`, SOURCE_DATE_EPOCH: '0', FORCE_SOURCE_DATE: '1' }
  spawnSync(pdftex, ['-ini'], { cwd: p, env, input: '*etrip\n' })
  copyFileSync(`${p}/etrip.log`, `${p}/etripin.log`)
  writeFileSync(`${p}/etrip.fot`, spawnSync(pdftex, ['-ini'], { cwd: p, env, input: '&etrip etrip\n' }).stdout)
  typ(p, 'etrip')
  await passes(`${eout}/tl`, {}, 'etrip', ['*etrip'], ['&etrip etrip'], efs)
  for (const f of ['etripin.log', 'etrip.log']) {
    for (const d of [p, `${eout}/tl`]) writeFileSync(`${d}/${f}.norm`, normalizeLog(readFileSync(`${d}/${f}`, 'latin1')).replace(/^(Beginning to dump on file .*\n).*\n.*\n.*\n/m, '$1').replace(/^Memory usage before: .*$/mg, 'Memory usage'))
    diff(`${p}/${f}.norm`, `${eout}/tl/${f}.norm`, `pdftex ${f}`)
  }
  diff(`${p}/etrip.typ`, `${eout}/tl/etrip.typ`, 'pdftex etrip.typ')
  diff(`${p}/etrip.out`, `${eout}/tl/etrip.out`, 'pdftex etrip.out')
}
