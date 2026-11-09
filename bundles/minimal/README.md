# minimal texmf bundle

The files the test corpus opens (`tools/minimal-files.txt`, 511 files, 17 MB) from TeX Live 2026, plus `fmt/latex.fmt`
(3 MB), a format built from `latex.ltx` by `tools/build-format.ts`. Used by CI, the browser tests and the GitHub Pages demo,
so none of them needs TeX Live.

Licences are those of the TeX Live files: mostly LPPL (LaTeX, hyperref, xcolor, geometry, beamer, pgf/TikZ also GPL-2),
Knuth's Computer Modern fonts and TFMs (free, name-restricted), and public domain/other free licences for the rest; see
each package's documentation in TeX Live.

Regenerate (needs a TeX Live 2026 tree and `build/latex.fmt`):

    node tools/build-format.ts --out build/latex.fmt
    node tools/pack-texmf.ts --preset minimal --out bundles/minimal
