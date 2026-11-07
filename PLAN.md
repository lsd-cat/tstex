# tstex — pdfLaTeX in pure TypeScript

Goal: a `pdflatex` replacement in TypeScript, zero runtime dependencies, running on Node ≥ 22, Bun, and browsers. LaTeX, expl3, and every `.sty` run unchanged on it. We port TeX, we do not design it.

## Decisions (fixed; change only via this file)

| Topic | Decision |
|---|---|
| Spec | `tex.web` + `etex.ch` + pdfTeX primitives. Knuth's text is the spec; cite its § numbers in code. |
| Oracle | Real `pdftex` log output. A feature is done when `\tracingall` logs and `\showbox` dumps are byte‑identical after normalisation. |
| Output | DVI first (M2), PDF later (M6). |
| Fonts | TFM metrics; embed whole Type1 `.pfb`. No subsetting. |
| Arithmetic | 32‑bit ints (`|0`, `Math.imul`) in scaled points. Port §99–109 verbatim. Glue ratio is a JS double, same as pdftex/web2c. |
| Data model | Lists stay singly linked (`link`), as in tex.web, so every algorithm ports 1:1. Token lists live in numeric `info`/`link` arrays with a free list (pointer‑heavy, hot path, keeps `cur_chr`/`loc` integers). Box/glue/char nodes are TS objects with a `type` discriminant, no `mem` array for them. |
| State | `eqtb`, save stack, registers as plain data so `\dump` is serialisation and `structuredClone` works. |
| Unicode | 8‑bit input like pdftex. No XeTeX/LuaTeX. |
| Runtime split | Only `src/platform/*` differs between Node/Bun/browser: file lookup and reading. `TexFS.find` is synchronous because TeX is; the browser implementation fetches on a miss and restarts the run (`shortcut:` restart cost grows with document size, switch to a Worker + sync XHR or a prefetch manifest if it hurts). Everything else is pure. |
| Tooling | Erasable‑syntax TS only (no `enum`, `namespace`, parameter properties) so Node/Bun run `.ts` directly. `typescript` and `@types/node` (types only) are the only devDependencies, used for `tsc --noEmit` and the browser build. Tests use `node:test`. |
| Limits | Match TeX Live defaults where macros can observe them: `\maxdimen`, 32768 registers (e‑TeX), `max_print_line=79`, `error_line=79`, `half_error_line=50`. Do not replicate `mem` size limits. |

## Prerequisites (one‑time, by a human)

```sh
brew install --cask basictex          # pdftex, kpsewhich, latex.ltx, CM fonts
eval "$(/usr/libexec/path_helper)"    # puts /Library/TeX/texbin on PATH
mkdir spec && cd spec
curl -LO https://mirrors.ctan.org/systems/knuth/dist/tex/tex.web
curl -LO https://mirrors.ctan.org/systems/knuth/dist/lib/trip.tex  # and trip.fot/trip.log
curl -LO https://mirrors.ctan.org/systems/knuth/dist/etc/etex.ch   # adjust URL if moved
# pdftex.web: https://github.com/TeX-Live/texlive-source/blob/trunk/texk/web2c/pdftexdir/pdftex.web
```

`spec/` is read‑only reference, never imported.

## File structure (strict)

```
PLAN.md  CLAUDE.md  package.json  tsconfig.json
spec/                    tex.web, etex.ch, pdftex.web, trip.*           (reference only)
src/
  arith.ts               §99–109: half, round_decimals, xn_over_d, badness, glue ratio
  types.ts               scaled, halfword, Node union, Token, EqtbEntry, Mode
  print.ts               §54–71 the print routines; log/terminal buffering; line wrapping
  error.ts               §72–98 error(), fatal_error, overflow, confusion; recovery actions, no prompt
  strings.ts             §38–53 only what survives in JS: print_cs, str_toks helpers
  nodes.ts               §133–199 node constructors, copy_node_list, flush_node_list
  eqtb.ts                §220–288 the equivalents table, save stack, eq_define/geq_define
  hash.ts                §256–264 control‑sequence lookup (`Map<string, cs>`)
  tokens.ts              §289–296 token representation, show_token_list
  input.ts               §300–365 input stacks, get_next (the mouth), catcode scanning
  expand.ts              §366–401 expand, macro_call, insert_relax, x_token
  scan.ts                §402–463 scan_int, scan_dimen, scan_glue, scan_keyword, scan_toks
  conditional.ts         §487–510 \if… handling
  files.ts               §511–538 open_log_file, start_input, \read/\openin/\openout
  tfm.ts                 §539–582 TFM loading, char metrics
  dvi.ts                 §583–643 DVI output + ship_out
  pack.ts                §644–679 hpack, vpack
  math.ts                §680–767 mlist_to_hlist
  align.ts               §768–812 \halign (\valign stubbed: error "unsupported")
  linebreak.ts           §813–890 Knuth–Plass
  hyphenate.ts           §891–965 hyphenation, trie lookup; trie built at format time
  vsplit.ts  page.ts     §967–1028 vsplit, page builder, \output firing
  main.ts                §1029–1054 main_control loop + mode dispatch
  primitives/            one file per tex.web command code (see below)
  etex/                  e‑TeX additions, same per‑command layout
  pdftex/                pdfTeX primitives (M6), same per‑command layout
  format.ts              §1299–1329 \dump / undump
  engine.ts              Engine class: owns all state, run(), the public API
  platform/
    fs.ts                interface TexFS { find(name, kind): Promise<Uint8Array|null> }
    node.ts              kpsewhich‑less lookup over a TEXMF tree + ls‑R index
    browser.ts           fetch() against a texmf URL + Cache Storage
backend/
  pdf.ts  type1.ts       M6: PDF writer, PFB embedding
tools/
  oracle.sh              run pdftex on a .tex, normalise log, store .expected.log
  build-format.ts        make latex.fmt for our engine
  pack-texmf.ts          M7: produce the hosted texmf subset + index
test/
  unit/*.test.ts         arith, scan, tfm, dvi encoder
  oracle/*.tex           input files
  oracle/*.expected.log  pdftex output, checked in (CI needs no TeX Live)
  oracle/run.test.ts     runs each .tex through Engine, diffs against expected
bin/tstex.ts             CLI: `tstex file.tex`
web/index.html web/main.ts   minimal browser demo (M7)
```

### `src/primitives/` convention

One file per tex.web **command code** (the `cmd` enum in §207–210), named after the primitive when the code has one primitive, else after the code:

```
primitives/def.ts        cmd def: \def \gdef \edef \xdef
primitives/register.ts   cmd register: \count \dimen \skip \toks
primitives/hbox.ts       cmd make_box: \hbox \vbox \vtop \box \copy \lastbox \vsplit
primitives/index.ts      registry: Map<cmd, handler>, built from each file's export
```

Each file exports:

```ts
export const cmd = Cmd.def
export const primitives: [string, number][] = [['def', 0], ['gdef', 1], ['edef', 2], ['xdef', 3]]
export function print(e: Engine, chr: number): void   // its case of print_cmd_chr §298
export function run(e: Engine, chr: number): void     // main_control / expand action; return true to leave main_control
// or, for assignments, the prefixed_command case (a = prefix bits):
export function assign(e: Engine, a: number): void    // §1218
```

Every TeX82/e‑TeX/pdfTeX primitive name is registered from day one; those not yet ported get a `run` that calls `fatal_error("unsupported: \\name")` so `\show\hbox` prints correctly and nothing degrades into "Undefined control sequence". Each file

and starts with a comment giving the tex.web § range it ports. No file may import from another `primitives/*` file; shared logic goes in the `src/*.ts` module it belongs to.

## Milestones

Each has an exit test. Nothing moves to the next milestone until the test passes under `node --test`.

**M0 Oracle harness.** `tools/oracle.sh` runs `pdftex -ini` (plain) or `pdflatex` with `\tracingonline=1` and normalises the log: strip banner line, dates, absolute paths, `**` prompt echo. `test/oracle/run.test.ts` compares. `tools/fetch-lvt.sh` (see Verification) also lands here so the `.lvt` corpus exists from day one. Exit: a `hello.tex` expected log is produced and the test fails because the engine doesn't exist yet.

**M1 Mouth and expansion.** `arith print error nodes eqtb hash tokens input expand scan conditional` plus the `\input`/`\endinput`/`\openin`/`\read`/`\closein` part of `files`, and primitives for the `\def` family, `\let`/`\futurelet`, prefixes `\global`/`\long`/`\outer`, the `\catcode` family (`\lccode` … `\delcode`), `\chardef` family, `\count`/`\dimen`/`\skip`/`\toks` registers, `\advance`/`\multiply`/`\divide`, all TeX82 `\if…`, `\expandafter`, `\noexpand`, `\csname`, `\string`, `\number`, `\romannumeral`, `\uppercase`/`\lowercase`, `\the`, `\meaning`, `\jobname`, `\message`/`\errmessage`, `\show`/`\showthe`, `\begingroup`/`\endgroup`, `\aftergroup`/`\afterassignment`, `\relax`, `\par` (vertical mode only), `\end`. Error recovery and `show_context` are ported, not stubbed, since the log must match in batchmode. Exit: logs identical to pdftex on 25+ macro‑only `-ini` tests (`test/oracle/m1-*.tex`) with no `plain.tex`, covering normal behaviour and the error paths (undefined cs, runaway argument, missing number, extra `}`, incomplete `\if`).

**M2 Boxes, paragraphs, DVI.** `tfm pack linebreak hyphenate vsplit page dvi main` + `\font`, box, glue, kern, penalty, rule, char primitives, `\immediate\write`, and `\output`. Exit: `plain.tex` loads under `-ini` with an identical log; `story.tex` and 20 paragraph/box tests give identical `\showbox` dumps *and* identical DVI bytes (compare with `dvitype`, ignoring the comment/timestamp).

**M3 Math and alignment.** `math align` + math primitives. Exit: `testmath.tex`‑style tests and `\halign` tables, identical `\showbox` and DVI.

**M4 e‑TeX.** `etex/` : `\numexpr`‑family, `\unexpanded`, `\detokenize`, `\protected`, `\ifdefined`, `\ifcsname`, `\unless`, `\scantokens`, `\readline`, `\lastnodetype`, `\currentgrouplevel`, `\interactionmode`, 32768 registers, `\middle`, TeXXeT **stubbed** (`\beginL` etc. error). Exit: `etex.tex` loads; oracle tests for each primitive against `pdftex -etex`.

**M5 LaTeX boots.** `format.ts`, `files.ts` complete, `tools/build-format.ts`. Exit: `pdftex -ini -etex latex.ltx \dump` equivalent produces a format; reloading it and compiling a 2‑page `article` with `\section`, footnotes, `\ref`/`\label` (two runs), a `tabular`, and `amsmath` gives identical `\showbox` dumps and DVI. Also run the `trip` test and diff `trip.log`; known differences are listed in `test/trip-diffs.md`.

**M6 pdfTeX primitives and PDF.** First grep `latex.ltx`, `l3backend-pdftex.def`, `hyperref`'s `hpdftex.def`, `graphicx`'s `pdftex.def`, `geometry`, `microtype` (skip: error "unsupported") for `\pdf` primitives; implement exactly that set in `pdftex/`. `backend/pdf.ts` and `type1.ts`. Exit: the M5 article plus `hyperref`, `graphicx` (PDF/PNG/JPEG images), `geometry` produces a PDF that opens in Preview/Chrome and whose page content streams match pdftex's after decompression, modulo object numbering and font object names.

**M7 Distribution.** `platform/browser.ts`, `tools/pack-texmf.ts` (texmf subset + `name → path` index), `web/`. Exit: the M6 document compiles in Chrome and Safari from a static server with the fetched byte total logged; must be under 6 MB for the article, 0 on second compile.

## Verification

Four layers; a change is good when all four are green for the §s it touches.

1. **Differential oracle, three channels.** For every oracle test the harness compares, after normalisation: the `\tracingall` log, `\showbox` dumps, and `dvitype` output of the DVI (M2+). Normaliser strips banner, dates, absolute paths, and the DVI comment.
2. **The LaTeX team's regression tests.** `tools/fetch-lvt.sh` clones `latex3/latex2e` (`base/testfiles`), `latex3/latex3` (`l3kernel/testfiles`), `amsmath`, `hyperref`, `graphics` testfiles plus `regression-test.tex` from `l3build`, and runs each `.lvt` through local `pdftex` via `tools/oracle.sh` into `test/lvt/<pkg>/<name>.expected.log`. We do not use `.tlg` or `l3build`. Exit for M5 becomes: all `base` and `l3kernel` `.lvt` pass; M6 adds `amsmath`, `hyperref`, `graphics`. Tests that need unsupported features are listed in `test/lvt/skip.txt` with a reason.
3. **Conformance.** `trip` (TeX82) at M3, `etrip` (e‑TeX) at M4. Diffs against `trip.log`/`etrip.log` recorded in `test/trip-diffs.md`; the goal is an empty file.
4. **Cold spec review.** When a `src/*.ts` file first passes its oracle tests, a second agent with no access to the first agent's session reads the tex.web § range and the TS and lists divergences. Each divergence is either a bug (fix, add oracle test) or an `AUDIT.md` entry.

Mechanical guards: `tools/coverage.ts` greps `// §NNN` in `src/` and `§NNN` in test names and prints uncovered sections; `test/perf.test.ts` compiles the M5 article and fails if it takes more than 3× the number recorded in the file.

## Auditing the original

The port reproduces TeX's behaviour, bugs included; compatibility is the product. Findings go in `AUDIT.md`, one entry each, sections:

- **Quirks** — behaviour that surprised the porter and that macros depend on.
- **Known bugs** — from Knuth's `tex82.bug` and the 2021 tune‑up; whether pdftex has the fix; what we do.
- **pdftex vs tex.web** — divergences (pdftex wins, plan rule 5).
- **Security** — trust boundaries carried over: `openin_any`/`openout_any` paranoid defaults, no path escape from the texmf root or the browser virtual fs, no `\write18`. Each boundary has a test in `test/unit/security.test.ts` with a hostile `.tex`.

## Working rules for the implementing agent

1. Open `spec/tex.web` at the § you're porting and port it. Do not reinvent, simplify, or "improve" an algorithm; TeX's quirks are the contract.
2. Every function comment is `// §NNN name` and nothing else unless the JS differs from the Pascal on purpose; then one line why.
3. Integer discipline: any `+ - *` on scaled values ends in `|0`; multiplication uses `Math.imul` or the §105–107 routines. A test in `test/unit/arith.test.ts` covers overflow cases from §104.
4. Logging goes through `print.ts` only, never `console.log`, so logs stay diffable.
5. When the oracle differs: the engine is wrong, the log is not. Fix the engine. If pdftex's behaviour differs from tex.web, pdftex wins; note it in a comment.
6. Add the oracle `.tex` before implementing a primitive; it is the definition of done.
7. Unsupported things fail loudly with `fatal_error("unsupported: \\valign")`, never silently.
8. Keep each milestone's work on its own branch, squash on merge, and update the checklist below.

## Deferred, do not build

XeTeX/LuaTeX, OpenType, Unicode input, Type1 subsetting, `\valign`, TeXXeT, `\mag`, MLTeX, interactive error prompt, `\write18`, BibTeX/makeindex (separate programs; run on the same fs later), `microtype`, PDF compression (use `CompressionStream` when M6 lands if size matters), fontspec.

## Progress

- [x] M0 oracle harness (2026-11-07)
- [x] M1 mouth and expansion (2026-11-07; 48 tests; known limit: nested expansion depth ~1500 vs pdftex 10000, see AUDIT.md)
- [x] M2 boxes, paragraphs, DVI (2026-11-07; 25 oracle tests, logs and DVI byte-identical)
- [ ] M3 math and alignment
- [ ] M4 e‑TeX
- [ ] M5 LaTeX boots, trip test
- [ ] M6 pdfTeX primitives, PDF output
- [ ] M7 browser distribution
