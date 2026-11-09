# tstex demo editor

Static files only; no build step. Serve one root containing `web/`, `dist/` (`npm run build`) and `bundles/minimal/`
(committed; regenerate with `node tools/pack-texmf.ts --preset minimal --out bundles/minimal`). The bundle selector offers `basic` when `../bundles/basic/` (Pages) or `../build/texmf-basic/` (local, `--preset basic`) is served, and picks it by default. The Pages workflow publishes the same layout
at https://lsd-cat.github.io/tstex/:

    python3 -m http.server 8000      # from the repo root, then open http://localhost:8000/web/

`app.js` imports `../dist/index.js`; the bundle selector defaults to `basic` if served, else `minimal`, and "custom URL" takes any
CORS-enabled bundle. Samples (`article`, `beamer`, `tikz`, `letter`) persist in localStorage (text) and IndexedDB (binary uploads).
Ctrl/Cmd+S or Ctrl/Cmd+Enter compiles. Limit: the PDF iframe reloads at page 1 after each compile.
SyncTeX (`web/synctex.js`, every compile asks for `synctex: -1`): Cmd/Ctrl+click an editor line shows its page
(`#page=N`); the header's page field opens the smallest source line typeset on that page. Page-level only: the browser's
PDF viewer takes no position and reports no clicks.

Projects: "Open folder" (or dropping a folder onto the file pane) loads a directory tree as a new project, keyed by
path relative to the folder (`sections/intro.tex`, `figs/a.png`); `.git`, `node_modules`, files over 20 MB and binaries
beyond 50 MB are skipped. The main file is the shallowest `.tex` with `\documentclass` (`main.tex` preferred) and can be
changed in the header's "main" select. "+ New file" takes a path with `/`. Caveats: folder pickers are Chromium and
Firefox (Safari's `webkitdirectory` support is partial; drop works there); Firefox drag-and-drop of folders is untested.
