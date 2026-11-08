# tstex demo editor

Static files only; no build step. Serve one root containing `web/`, `dist/` (`npm run build`) and `build/texmf/`
(`node dist-node/tools/pack-texmf.js --preset minimal --out build/texmf`):

    python3 -m http.server 8000      # from the repo root, then open http://localhost:8000/web/

`app.js` imports `../dist/index.js`; the texmf field defaults to `../build/texmf/` (relative to the page) and may be any
CORS-enabled bundle URL. Projects (`article`, `beamer`) persist in localStorage (text) and IndexedDB (binary uploads).
Ctrl/Cmd+S or Ctrl/Cmd+Enter compiles. Limit: the PDF iframe reloads at page 1 after each compile.
