// web/ demo editor in Chromium, served statically from the repo root (bundles/minimal/ = the `minimal' bundle). `npm run test:demo`.
import { test, before, after } from 'node:test'
import assert from 'node:assert'
import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize, extname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const root = new URL('../../', import.meta.url).pathname
const types: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.gz': 'application/gzip' }
let server: Server, url = ''

before(async () => {
  if (!existsSync(root + 'dist/index.js')) execFileSync('npx', ['tsc', '-p', 'tsconfig.browser.json'], { cwd: root })
  server = createServer((req, res) => {
    let file = join(root, normalize(decodeURIComponent(new URL(req.url!, 'http://x').pathname)))
    if (file.endsWith('/')) file += 'index.html'
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/web/`
})
after(() => server.close())

test('demo editor', { timeout: 600_000 }, async () => {
  const browser = await chromium.launch(), page = await browser.newPage()
  page.on('pageerror', e => process.stderr.write(`pageerror: ${e}\n`))
  try {
    await page.goto(url)
    const idle = () => page.waitForFunction(() => document.getElementById('state')!.textContent === 'idle' && document.getElementById('stats')!.textContent!.includes(' runs'), null, { timeout: 300_000 })
    const log = () => page.locator('#log').innerText()
    await idle()
    assert.match(await page.locator('#pdf').getAttribute('src') ?? '', /^blob:/)
    const first = await log()
    assert.match(first, /Output written on main\.pdf/)
    assert.match(await page.locator('#stats').innerText(), /2 runs/) // hyperref needs a second run
    await page.locator('#ed').fill((await page.inputValue('#ed')).replace('\\end{document}', '\\section{Added}\nMore.\n\\end{document}'))
    await page.keyboard.press('Control+Enter')
    await page.waitForFunction(() => document.getElementById('state')!.textContent === 'compiling')
    await idle()
    const second = await log()
    assert.match(second, /Output written/)
    assert.notStrictEqual(second, first)
    assert.match(await page.locator('#stats').innerText(), /2 runs/)
    const total = +(await page.getAttribute('#stats', 'data-total'))!
    await page.selectOption('#project', 'beamer')
    await page.waitForFunction(() => document.getElementById('state')!.textContent === 'compiling')
    await idle()
    assert.match(await log(), /Output written/)
    assert.ok(+(await page.getAttribute('#stats', 'data-total'))! > total, 'beamer fetched more bytes')
  } finally { await browser.close() }
})

test('demo editor: project folder', { timeout: 600_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'proj-')) + '/proj'
  mkdirSync(dir + '/sections', { recursive: true }); mkdirSync(dir + '/figs')
  writeFileSync(dir + '/main.tex', '\\documentclass{article}\\usepackage{graphicx}\\begin{document}\\input{sections/intro}\\includegraphics[width=1in]{figs/fig.png}\\end{document}')
  writeFileSync(dir + '/sections/intro.tex', 'Hello from a subfolder.\n')
  copyFileSync(root + 'test/texmf/images/fig.png', dir + '/figs/fig.png')
  const browser = await chromium.launch(), page = await browser.newPage()
  try {
    await page.goto(url)
    await page.setInputFiles('#folder', dir)
    await page.waitForFunction(() => document.getElementById('state')!.textContent === 'compiling')
    await page.waitForFunction(() => document.getElementById('state')!.textContent !== 'compiling', null, { timeout: 300_000 })
    assert.strictEqual(await page.inputValue('#main'), 'main.tex')
    const tree = await page.locator('#files').innerText()
    assert.match(tree, /sections\//); assert.match(tree, /figs\//); assert.match(tree, /intro\.tex/)
    assert.match(await page.locator('#log').innerText(), /Output written on main\.pdf/)
    assert.match(await page.locator('#pdf').getAttribute('src') ?? '', /^blob:/)
  } finally { await browser.close() }
})
