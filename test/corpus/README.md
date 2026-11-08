# Corpus (nightly tier)

Differential runs of whole documents: TeX Live `pdftex -fmt pdflatex` vs this engine, same first line
(`\pdfsetrandomseed 1 \pdfcompresslevel=0\pdfobjcompresslevel=0\input{main}`: pdftex seeds its random numbers from the clock), oracle env, `-jobname=main`, rerun while
.aux/.out/.toc/.lof/.lot/.nav/.snm change (max 4), `bibtex` after run 1 on both sides when a `.bib` and `\bibliography` exist.

    npm run corpus -- --samples                  # test/corpus/samples.txt
    npm run corpus -- --texlive-docs             # every main .tex under texmf-dist/doc
    npm run corpus -- --list FILE                # paths, one per line
    options: --only REGEX  --jobs N (8)  --timeout S (120)  --slow  --update-skip  --resume

- `status.md`: the ledger (summary, engine-error groups, `category | path | detail` per document). `--only` merges into it; it is rewritten every 20 documents, and `--resume` (same engine commit as its header) skips documents it already has with a final category (not `timeout`, not a `disk`/`runner` skip). A document is `skipped: disk` when the temp directory has under 2 GB free.
- `skip.txt`: `path: reason`, consulted before running. Content heuristics (xelatex/lualatex, shell escape, Biber, dvips, EPS)
  skip without being listed; `--update-skip` appends those findings so they can be edited by hand.
- `samples.txt`: curated paths (relative to texmf-dist, or the repo for `test/`); `slow` entries need `--slow`.
- Needs `build/latex.fmt`. Timings are wall time per side, measured while `--jobs` documents run concurrently.
