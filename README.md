# tstex

pdfLaTeX in pure TypeScript: the pdfTeX engine ported from `pdftex.web`, producing the same logs and PDFs as `pdflatex`
(see `PLAN.md`). Zero runtime dependencies; runs in browsers (in a Web Worker) and in Node ≥ 22.18.

Install: `npm install tstex`, or `npm run build` here → `dist/` (browser ESM + `.d.ts`), `dist-node/` (Node, CLI).

## Usage

```js
import { createTeX } from 'tstex'
const tex = createTeX({ texmf: 'https://example.org/texmf/2026-1/' })  // a bundle, see below
const { pdf, log, outputs, fetched } = await tex.compile({
  files: { 'main.tex': source, 'fig.png': pngBytes }, main: 'main.tex',
  runs: 'auto',                                  // rerun while .aux/.out/.toc/... change (max 4)
  onProgress: p => console.log(p),               // { type: 'fetch', name, bytes, cached? } | { type: 'run', n } | { type: 'done' }
  signal,                                        // AbortSignal: terminates the worker
})
```

Also `tex.prefetch(['beamer.cls', ...])`, `tex.cache.clear()`, `tex.dispose()`, and `date: new Date(0)` for reproducible
PDFs. SyncTeX: `compile({ ..., synctex: -1 })` (pdftex's `-synctex=N`; `1` gzips, `-1` does not; `\synctex=1` in
the document also works) returns the file as `synctex` (else `null`); its `Input:` names are relative (`./main.tex`). Bundlers must emit `dist/worker.js` next to `dist/index.js` (`new URL('./worker.js', import.meta.url)`).

## Resource protocol

```
<texmf>/index.json.gz        gzipped JSON { version, files: { "<basename>": { path, size } } }
<texmf>/fmt/latex.fmt        the format (tools/build-format.ts)
<texmf>/<path>               every file, in TeX Live's texmf layout (tex/latex/..., fonts/tfm/...)
```

Serve it under a versioned prefix with `Cache-Control: public, max-age=31536000, immutable` and
`Access-Control-Allow-Origin: *` (if cross-origin). No cross-origin-isolation headers are needed. Files are looked up
by basename with kpathsea's per-kind search order, so names are unique by basename.

The worker reads files with synchronous XHR (one request per file on first use); fetched files stay in the worker's
memory for later compiles and in the browser's HTTP cache. With `createTeX({ texmf, cache: 'persistent' })` they are
also kept in Cache Storage (`tstex-<version>`): later sessions fetch only `index.json.gz` (HTTP-cached).

## Presets

`tstex pack --preset minimal|basic --out DIR [--texmf-dist DIR] [--texmf-var DIR] [--fmt build/latex.fmt]` builds a
bundle from TeX Live 2026 and a format made by `node tools/build-format.ts`:

- `minimal`: the files the test corpus opens (`tools/minimal-files.txt`): article, amsmath, hyperref, graphicx,
  geometry, xcolor, TikZ, beamer with CM fonts. 5.9 MB + 2.3 MB format (3.9 MB gzipped).
- `basic`: `tex/` and `fonts/` of scheme-basic plus pgf, beamer, hyperref, xcolor, geometry, cm-super, lm: 154 MB
  (98 MB gzipped), 7111 files.

## Node

`createTeX({ texmf: '/path/to/bundle' })` compiles in-process over a local bundle; with an `https://` URL, files are
cached in `~/.cache/tstex/<version>/` and a file missing there restarts the compile after fetching it (slow on a cold
cache: `prefetch` first). CLI: `tstex --fmt latex.fmt --pdf --runs auto [--synctex 1] file.tex` over a TeX Live tree (`TEXMFDIST`).

## Unsupported

No XeTeX/LuaTeX/OpenType, no `\write18`, no BibTeX/makeindex, no embedding of PDF images, no font subsetting,
`microtype` font expansion, and the rest listed in [AUDIT.md](AUDIT.md). Tests: `npm test`, `npm run test:browser`
(needs the `playwright` devDependency and its browsers; not needed to build or use the library).
