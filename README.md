# tstex

[![ci](https://github.com/lsd-cat/tstex/actions/workflows/ci.yml/badge.svg)](https://github.com/lsd-cat/tstex/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tstex)](https://www.npmjs.com/package/tstex)
[![licence](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue)](LICENSE)

pdfLaTeX in TypeScript, for browsers (in a Web Worker) and Node 22.18 or later, with no runtime dependencies.

## Try it

https://lsd-cat.github.io/tstex/ compiles in your browser; nothing is uploaded.

## Install / Usage

Node (`npm install tstex`); CLI: `tstex --fmt latex.fmt --pdf --runs auto file.tex` over a TeX Live tree (`TEXMFDIST`):

```js
import { createTeX } from 'tstex'
const tex = createTeX({ texmf: '/path/to/bundle' })   // or an https:// URL: files are cached in ~/.cache/tstex
const { pdf, log } = await tex.compile({ files: { 'main.tex': source }, main: 'main.tex', runs: 'auto' })
```
Browser (bundlers must emit `dist/worker.js` next to `dist/index.js`):

```js
import { createTeX } from 'tstex'
const tex = createTeX({ texmf: 'https://example.org/texmf/2026-1/', cache: 'persistent' })
const { pdf, log, outputs, fetched } = await tex.compile({
  files: { 'main.tex': source, 'fig.png': pngBytes }, main: 'main.tex',
  runs: 'auto', synctex: -1, signal, onProgress: p => console.log(p),
})
```

Also `tex.prefetch(names)`, `tex.cache.clear()`, `tex.dispose()`; `date: new Date(0)` gives reproducible PDFs; `synctex: 1` or `-1` returns the SyncTeX file.

## How it works

tstex is a port of `pdftex.web` (the pdfTeX source) to TypeScript, with the `pdftex` binary as the test oracle.
Logs and PDFs are byte-identical to `pdflatex` 2026, including e-TeX, microtype and SyncTeX output.

## Status

| | |
| --- | --- |
| Oracle tests against pdftex output | 355 pass |
| LaTeX project regression suite (lvt) | 899 of 903 |
| trip, etrip | pass |
| TeX Live documents (corpus) | 3,014 of 4,060 byte-identical |
| Speed | 1.0 to 1.4 times pdftex CPU time |

## Supported / Not supported

Supported: Type 1 fonts, PNG/JPEG/PDF figures, hyperref, TikZ/pgf, beamer, microtype, SyncTeX, multi-run builds (`runs: 'auto'`).
Not supported: XeLaTeX/LuaLaTeX, OpenType/TrueType, shell escape (`minted`), EPS, Biber, BibTeX (not yet), PK fonts. See [AUDIT.md](AUDIT.md).

## Bundles

| bundle | contents | size (gzipped) |
| --- | --- | --- |
| `minimal` | article, amsmath, hyperref, graphicx, geometry, xcolor, TikZ, beamer, CM fonts; in `bundles/minimal/` | 20 MB (8 MB) |
| `basic` | scheme-basic plus pgf, beamer, hyperref, xcolor, geometry and several Type 1 font families | 342 MB (192 MB) |
| `full` | all of texmf-dist that the engine reads (scheme-full without docs) | 2.4 GB (1.27 GB) |

A bundle is a static directory: `index.json.gz` (basename to path map, or a sharded index), `fmt/latex.fmt`, and every
file in TeX Live's texmf layout. Serve it under a versioned prefix with `Cache-Control: public, max-age=31536000, immutable`
and `Access-Control-Allow-Origin: *`; no cross-origin isolation is needed. Build one with
`node tools/pack-texmf.ts --preset minimal|basic|full --out DIR`. Details: [docs/protocol.md](docs/protocol.md).
The Pages workflow publishes `minimal` and `basic`. `.github/workflows/bundle-full.yml` (manual, and monthly) packs `full` and uploads it to a
Cloudflare R2 bucket under `full/<version>/` (secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; it does nothing without them).
Enable public access and a CORS rule for `GET`/`HEAD` on the bucket, then use `createTeX({ texmf: 'https://<bucket-public-url>/full/<version>/' })`, or choose "custom URL" in the demo's bundle selector.

## Development

```sh
npm run build            # dist/ (browser ESM) and dist-node/ (Node, CLI)
npm test                 # unit and oracle tests (the oracle falls back to bundles/minimal without TeX Live)
npm run test:lvt         # LaTeX regression suite
npm run test:browser     # Chromium, Firefox, WebKit (CI_BROWSERS=chromium: Chromium only); needs playwright
npm run test:demo        # the demo editor in Chromium; typecheck with npx tsc --noEmit
```

`PLAN.md` holds the design decisions and milestones; `AUDIT.md` lists TeX quirks reproduced and known gaps; `web/README.md` describes the demo.

## Licence

GPL-3.0-or-later (see `LICENSE`). tstex is derived from pdfTeX. `spec/` holds the upstream sources (`pdftex.web`, change files)
under their own licences, and `bundles/minimal/` carries TeX Live files under theirs.

## Acknowledgements

Donald Knuth, Peter Breitenlohner, Han The Thanh, the TeX Live team, and the LaTeX project's regression test suite.
