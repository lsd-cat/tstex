// tstex demo editor: plain ESM, no build. Layout and usage: web/README.md.
import { createTeX } from '../dist/index.js'
import { parseSynctex, pageOf, sourceOf } from './synctex.js'

const ARTICLE = String.raw`\documentclass{article}
\usepackage{graphicx}
\usepackage[colorlinks]{hyperref}
\begin{document}
\section{Introduction}\label{intro}
This is a demo of tstex, pdfLaTeX running in your browser.\footnote{No server involved.}
See Section~\ref{math}.
\begin{itemize}
  \item First point
  \item Second point
\end{itemize}
\section{Mathematics}\label{math}
\begin{equation}
  e^{i\pi} + 1 = 0
\end{equation}
\includegraphics[width=3cm]{fig.png}
\end{document}
`
const BEAMER = String.raw`\documentclass{beamer}
\usepackage{tikz}
\title{Title}\author{Me}
\begin{document}
\begin{frame}\titlepage\end{frame}
\begin{frame}{Items}
  \begin{itemize}\item One\pause\item Two\pause\item Three\end{itemize}
\end{frame}
\begin{frame}{Picture}
  \begin{tikzpicture}\draw (0,0) circle (1);\draw[->] (0,0) -- (2,1);\end{tikzpicture}
\end{frame}
\end{document}
`
const $ = id => document.getElementById(id)
const ed = $('ed'), gutter = $('gutter'), logEl = $('log'), state = $('state'), stats = $('stats'), pdf = $('pdf')
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const isText = n => /\.(tex|sty|cls|bib|bbl|aux|cfg|def|clo|fd|txt|md|csv|bst)$/i.test(n)
let name = 'article', files = {}, cur = 'main.tex', main = 'main.tex', errLine = 0, pdfBytes = null, pdfUrl = null
let tex = null, texKey = '', ctl = null, timer = 0, total = 0, sx = null // sx: the last compile's SyncTeX (web/synctex.js)

// persistence: text in localStorage, binary files in one IndexedDB record per project
const db = new Promise((res, rej) => {
  const r = indexedDB.open('tstex-demo', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('bin')
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
})
const idb = async (mode, f) => { const d = await db; return new Promise((res, rej) => { const r = f(d.transaction('bin', mode).objectStore('bin')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }) }
const saveText = () => localStorage.setItem('tstex:' + name, JSON.stringify({ cur, main, text: Object.fromEntries(Object.entries(files).filter(([, v]) => typeof v === 'string')) }))
const saveBin = () => idb('readwrite', s => s.put(Object.fromEntries(Object.entries(files).filter(([, v]) => typeof v !== 'string')), name))
const save = () => { saveText(); return saveBin() }

async function load(n) {
  name = n
  const saved = JSON.parse(localStorage.getItem('tstex:' + n) ?? 'null')
  if (saved) files = { ...saved.text, ...(await idb('readonly', s => s.get(n)) ?? {}) }, cur = saved.cur in files ? saved.cur : Object.keys(files)[0], main = saved.main in files ? saved.main : detectMain()
  else {
    files = { 'main.tex': n === 'beamer' ? BEAMER : ARTICLE }; cur = main = 'main.tex'
    if (n === 'article') files['fig.png'] = new Uint8Array(await (await fetch(new URL('./samples/fig.png', import.meta.url))).arrayBuffer())
    await save()
  }
  errLine = 0; show()
}

// UI
function renderFiles() {
  const root = {} // path -> nested objects; leaves are the full path string
  for (const f of Object.keys(files)) f.split('/').reduce((d, p, i, a) => d[p] ??= i === a.length - 1 ? f : {}, root)
  const walk = (d, ul, depth) => {
    for (const k of Object.keys(d).sort((a, b) => (typeof d[a] === 'string') - (typeof d[b] === 'string') || a.localeCompare(b))) {
      if (typeof d[k] !== 'string') {
        const det = document.createElement('details'), sum = document.createElement('summary'), u = document.createElement('ul')
        det.open = true; sum.textContent = k + '/'; sum.style.paddingLeft = depth * 12 + 'px'; det.append(sum, u); ul.append(det); walk(d[k], u, depth + 1); continue
      }
      const f = d[k], li = document.createElement('li'), b = document.createElement('button')
      li.tabIndex = 0; li.textContent = k; li.title = f; li.className = f === cur ? 'cur' : ''; li.style.paddingLeft = depth * 12 + 6 + 'px'
      b.textContent = '×'; b.setAttribute('aria-label', 'Delete ' + f); b.disabled = f === main
      b.onclick = e => { e.stopPropagation(); delete files[f]; if (cur === f) cur = main; save(); show() }
      li.onclick = () => { cur = f; saveText(); errLine = 0; show() }
      li.onkeydown = e => { if (e.key === 'Enter') li.click() }
      li.ondblclick = () => {
        const to = f !== main && prompt('Rename to', f)
        if (to && to !== f && !(to in files)) { files = Object.fromEntries(Object.entries(files).map(([k, v]) => [k === f ? to : k, v])); if (cur === f) cur = to; save(); show() }
      }
      li.append(b); ul.append(li)
    }
  }
  $('files').textContent = ''; walk(root, $('files'), 0)
  const m = $('main'); m.textContent = ''
  for (const f of Object.keys(files).filter(f => /\.tex$/i.test(f))) m.add(new Option(f, f, false, f === main))
}
// main file: shallowest .tex with \documentclass, main.tex first among equals
const detectMain = () => Object.keys(files).filter(f => /\.tex$/i.test(f) && /\\documentclass/.test(files[f]))
  .sort((a, b) => a.split('/').length - b.split('/').length || (b.endsWith('main.tex') - a.endsWith('main.tex')))[0] ?? 'main.tex'
function show() {
  renderFiles()
  const t = files[cur]
  ed.disabled = typeof t !== 'string'
  ed.value = ed.disabled ? `(binary file, ${t.length} bytes)` : t
  renderGutter()
}
function renderGutter() {
  const n = ed.value.split('\n').length
  gutter.innerHTML = Array.from({ length: n }, (_, i) => `<div${i + 1 === errLine ? ' class="err"' : ''}>${i + 1}</div>`).join('')
  gutter.scrollTop = ed.scrollTop
}
function gotoLine(n) {
  const at = ed.value.split('\n').slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0)
  ed.focus(); ed.setSelectionRange(at, at + (ed.value.split('\n')[n - 1] ?? '').length)
  ed.scrollTop = Math.max(0, (n - 3) * 18)
}
ed.oninput = () => { files[cur] = ed.value; saveText(); renderGutter(); clearTimeout(timer); if ($('auto').checked) timer = setTimeout(compile, 700) }
ed.onscroll = () => { gutter.scrollTop = ed.scrollTop }
ed.onkeydown = e => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ed.setRangeText('  ', ed.selectionStart, ed.selectionEnd, 'end'); ed.oninput() } }
document.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); compile() } }
$('new').onclick = () => { const n = prompt('File name', 'chapter.tex'); if (n && !(n in files)) { files[n] = ''; cur = n; save(); show() } }
// [relative path, File] pairs -> project files. Skips .git/node_modules, files > 20 MB, binaries beyond 50 MB total.
async function addFiles(pairs, folder) {
  let skipped = 0, bin = 0
  if (folder) { name = folder; files = {}; if (![...$('project').options].some(o => o.value === name)) $('project').add(new Option(name, name)); $('project').value = name }
  for (const [p, f] of pairs) {
    if (/(^|\/)(\.git|node_modules)\//.test(p) || f.size > 20e6 || !isText(p) && (bin += f.size) > 50e6) { skipped++; continue }
    files[p] = isText(p) ? await f.text() : new Uint8Array(await f.arrayBuffer())
  }
  if (folder) { main = detectMain(); cur = main }
  await save(); show(); state.textContent = skipped ? `skipped ${skipped} files (.git, node_modules, size limits)` : state.textContent
  if (folder) compile()
}
const strip = p => p.split('/').slice(1).join('/')
$('upload').onchange = async e => { await addFiles([...e.target.files].map(f => [f.name, f])); e.target.value = '' }
$('folder').onchange = async e => {
  const fs = [...e.target.files]; if (fs.length) await addFiles(fs.map(f => [strip(f.webkitRelativePath), f]), fs[0].webkitRelativePath.split('/')[0]); e.target.value = ''
}
$('main').onchange = e => { main = e.target.value; saveText() }
const walkEntry = async (en, path = '') => { // readEntries returns batches until empty
  if (en.isFile) return [[path + en.name, await new Promise((r, j) => en.file(r, j))]]
  const rd = en.createReader(), out = []
  for (let b; (b = await new Promise((r, j) => rd.readEntries(r, j))).length;) for (const c of b) out.push(...await walkEntry(c, path + en.name + '/'))
  return out
}
const nav = document.querySelector('nav')
nav.ondragover = e => e.preventDefault()
nav.ondrop = async e => {
  e.preventDefault()
  const ens = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean) // read now: items die after the first await
  const pairs = (await Promise.all(ens.map(en => walkEntry(en)))).flat()
  if (ens.length === 1 && ens[0].isDirectory) await addFiles(pairs.map(([p, f]) => [strip(p), f]), ens[0].name); else await addFiles(pairs)
}
$('project').onchange = e => load(e.target.value).then(compile)
$('compile').onclick = () => compile()
$('clear').onclick = async e => { e.preventDefault(); await getTeX().cache.clear(); stats.textContent = 'cache cleared' }
const download = (data, n) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e4) }
$('dlpdf').onclick = () => pdfBytes && download(pdfBytes, 'main.pdf')
$('dlfile').onclick = () => download(files[cur], cur.split('/').pop())

function renderLog(log) {
  logEl.innerHTML = log.split('\n').map(l => {
    const m = /^l\.(\d+)/.exec(l)
    return l.startsWith('!') ? `<span class="bang">${esc(l)}</span>` : m ? `<span class="ln" data-line="${m[1]}" tabindex="0" role="link">${esc(l)}</span>` : esc(l)
  }).join('\n')
  const m = /^l\.(\d+)/m.exec(log)
  errLine = /^!/m.test(log) && m ? +m[1] : 0
  renderGutter()
}
// SyncTeX. Cmd/Ctrl+click in the editor shows that line's page; the page field opens the first source line on a page.
// shortcut: page-level only (the iframe's PDF viewer takes #page= but no position, and reports no clicks); a PDF.js
// viewer would allow point-level sync both ways
ed.onclick = e => {
  if (!(e.ctrlKey || e.metaKey) || !sx || !pdfUrl) return
  const n = pageOf(sx, cur, ed.value.slice(0, ed.selectionStart).split('\n').length)
  if (n) { pdf.src = pdfUrl + '#page=' + n; $('syncpage').value = n }
}
$('syncpage').onchange = e => {
  const s = sx && sourceOf(sx, +e.target.value, Object.keys(files).filter(isText))
  if (s) { cur = s.file; saveText(); errLine = 0; show(); gotoLine(s.line) }
}
logEl.onclick = e => { const n = e.target.dataset?.line; if (n) gotoLine(+n) }
logEl.onkeydown = e => { if (e.key === 'Enter') logEl.onclick(e) }

// compile: one createTeX per (texmf, cache) setting; a new compile aborts the running one
function getTeX() {
  const key = $('texmf').value + '|' + $('persist').checked
  if (key !== texKey) { tex?.dispose(); tex = createTeX({ texmf: $('texmf').value, cache: $('persist').checked ? 'persistent' : 'http' }); texKey = key }
  return tex
}
const kb = b => Math.round(b / 1024) + ' KB'
async function compile() {
  clearTimeout(timer); ctl?.abort(); const mine = ctl = new AbortController()
  let nf = 0, nb = 0, run = 0; const t0 = performance.now()
  state.textContent = 'compiling'; state.className = ''
  try {
    const r = await getTeX().compile({ files: { ...files }, main, runs: 'auto', synctex: -1, signal: mine.signal, onProgress: p => {
      if (p.type === 'fetch' && !p.cached) { nf++; nb += p.bytes } else if (p.type === 'run') run = p.n
      stats.textContent = `run ${run} · fetched ${nf} files, ${kb(nb)}`
    } })
    total += r.fetched
    renderLog(r.log)
    stats.textContent = `fetched ${nf} files, ${kb(r.fetched)} · ${r.runs} runs · ${Math.round(performance.now() - t0)} ms`
    stats.dataset.total = total
    state.textContent = r.ok ? 'idle' : 'error'; state.className = r.ok ? '' : 'error'
    if (r.pdf) {
      pdfBytes = r.pdf; if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      pdfUrl = URL.createObjectURL(new Blob([r.pdf], { type: 'application/pdf' }))
      sx = r.synctex && parseSynctex(new TextDecoder().decode(r.synctex))
      pdf.src = pdfUrl; $('dlpdf').disabled = false // shortcut: viewer reloads at page 1, no #page= restore (can't read the viewer's page)
    }
  } catch (err) {
    if (mine.signal.aborted) return
    state.textContent = 'error'; state.className = 'error'; stats.textContent = String(err.message ?? err)
  }
}

// prefer the full 'basic' bundle when it is served next to the minimal one (local use); CI only packs minimal
if ((await fetch('../build/texmf-basic/index.json.gz', { method: 'HEAD' }).catch(() => ({ ok: false }))).ok) $('texmf').value = '../build/texmf-basic/'
await load('article'); compile()
