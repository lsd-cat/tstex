# tstex

pdfLaTeX in pure TypeScript. Read `PLAN.md` first; it holds every decision, the file structure, the milestones, and the working rules. Do not change decisions there without being asked.

## Mode

Ponytail, level full: the smallest change that fully solves the task. No abstractions, options, or "for later" code. Delete before you add.

## Hard rules

- The spec is `spec/pdftex.web` plus the pdftex.am change-file chain in `spec/` (see PLAN.md → Decisions → Spec); `tex.web` § numbers are the citation key: `// §NNN name`. Never invent an algorithm TeX already has.
- Definition of done = oracle test passes: `node --test test/`. Add the `.tex` and its `pdftex` `.expected.log` (via `tools/oracle.sh`) before implementing.
- Zero runtime dependencies. `typescript` and `@types/node` are the only devDependencies (plus `playwright`, used only by `test/browser/`). Erasable TS syntax only; `node src/...ts` must run without a build step.
- All output through `src/print.ts`. No `console.*` in `src/`.
- Scaled arithmetic ends in `|0`; multiply via `Math.imul` or `src/arith.ts`.
- One file per tex.web command code in `src/primitives/`; primitive files never import each other.
- Unsupported features throw `fatal_error("unsupported: ...")`; never degrade silently.
- Shortcuts get a comment: `shortcut: <limit>, <when to upgrade>`.
- TeX's quirks and bugs are reproduced, never fixed. Anything surprising goes in `AUDIT.md` (see PLAN.md → Auditing the original).

## Commands

```sh
node --test test/                       # all tests
node --test test/oracle/                # differential tests only
npx -p typescript tsc --noEmit          # typecheck
tools/oracle.sh test/oracle/foo.tex     # (re)generate expected log; needs pdftex on PATH
node bin/tstex.ts file.tex              # run the engine
```
