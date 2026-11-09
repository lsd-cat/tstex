# Bundle resource protocol

```
<texmf>/index.json.gz        gzipped JSON manifest: { version, files: { "<basename>": { path, size } } } (small bundles), or
                             { version, sharded: true } with the same map split over
<texmf>/index/<xx>.json.gz   gzipped JSON { "<basename>": { path, size } }; xx = first two characters of the basename,
                             lowercased, anything but a-z0-9 as `_` (`lookup.ts` shard_of); only for bundles over 20000 files
<texmf>/fmt/latex.fmt        the format (tools/build-format.ts)
<texmf>/<path>               every file, in TeX Live's texmf layout (tex/latex/..., fonts/tfm/...)
```

Serve it under a versioned prefix with `Cache-Control: public, max-age=31536000, immutable` and
`Access-Control-Allow-Origin: *` (if cross-origin). No cross-origin-isolation headers are needed. Files are looked up
by basename with kpathsea's per-kind search order, so names are unique by basename (the packer picks, among same-basename
files, the one pdflatex's `kpsewhich` returns; checked for all 379 colliding names of `full`: no differences).

A sharded index is read lazily: the manifest at start, and a shard (3 to 60 KB gzipped, read with sync XHR in the worker, or from
disk/the disk cache in Node) on the first lookup of a name with that prefix. A hyperref document needs 25 shards of 649.

The worker reads files with synchronous XHR (one request per file on first use); fetched files stay in the worker's
memory for later compiles and in the browser's HTTP cache. With `createTeX({ texmf, cache: 'persistent' })` they are
also kept in Cache Storage (`tstex-<version>`): later sessions fetch only `index.json.gz` (HTTP-cached).

## Presets

`tstex pack --preset minimal|basic|full [--shard] --out DIR [--texmf-dist DIR] [--texmf-var DIR] [--fmt build/latex.fmt]` builds a
bundle from TeX Live 2026 and a format made by `node tools/build-format.ts`. `--shard` forces a sharded index.

| preset | contents | files | size | gzipped | index |
| --- | --- | --- | --- | --- | --- |
| `minimal` | the files the test corpus opens (`tools/minimal-files.txt`; committed as `bundles/minimal`): article, amsmath, hyperref, graphicx, geometry, xcolor, TikZ, beamer with CM fonts | 511 | 16.7 MB + 3.1 MB format | ~8 MB | one file |
| `basic` | `tex/` and `fonts/` of scheme-basic plus pgf, beamer, hyperref, xcolor, geometry, cm-super, lm, and the Type 1 families lato, sourcesans, fira, libertinus, tex-gyre, libertine, inconsolata | 17234 | 342 MB | 192 MB | one file |
| `full` | all of texmf-dist `tex/`, `fonts/{tfm,vf,type1,enc,map}`, `bibtex/{bst,bib}`, `web2c/cp227.tcx` (scheme-full; no doc, source, OpenType/TrueType, pk, metapost, dvips) | 159424 | 2.4 GB | 1.27 GB | 649 shards, 3.5 MB |

## Node

`createTeX({ texmf: '/path/to/bundle' })` compiles in-process over a local bundle; with an `https://` URL, files are
cached in `~/.cache/tstex/<version>/` and a file missing there restarts the compile after fetching it (slow on a cold
cache: `prefetch` first). CLI: `tstex --fmt latex.fmt --pdf --runs auto [--synctex 1] file.tex` over a TeX Live tree (`TEXMFDIST`).

