// M7 exit test: the library in Chromium, Firefox and WebKit (Playwright, a devDependency only for this test) from a
// static server with the `minimal' bundle. Builds dist/ first if missing; serves bundles/minimal/ (CI_BROWSERS=chromium: Chromium only). `npm run test:browser`.
import { test, before, after } from 'node:test'
import assert from 'node:assert'
import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs'
import { join, normalize, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chromium, firefox, webkit } from 'playwright'

const root = new URL('../../', import.meta.url).pathname, docs = ['m6-latex-beamer.tex', 'm6-latex-hyperref.tex']
const TEXMFDIST = process.env.TEXMFDIST ?? '/Users/g/texlive/2026/texmf-dist', TEXMFVAR = process.env.TEXMFVAR ?? '/Users/g/texlive/2026/texmf-var'
const types: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html', '.gz': 'application/gzip' }
const harness = `<!doctype html><script type="module">import { createTeX } from '/dist/index.js'; window.createTeX = createTeX</script>`
let server: Server, url = '', served = 0 // bundle bytes the server sent
const expected = new Map<string, string>() // the Node CLI's PDF hashes (over TeX Live itself)

before(async () => {
  if (!existsSync(root + 'dist/index.js')) execFileSync('npx', ['tsc', '-p', 'tsconfig.browser.json'], { cwd: root })
  const tmp = mkdtempSync(join(tmpdir(), 'tstex-'))
  for (const d of docs) {
    copyFileSync(root + 'test/oracle/' + d, join(tmp, d))
    if (existsSync(TEXMFDIST) && existsSync(root + 'build/latex.fmt')) execFileSync(process.execPath, [root + 'bin/tstex.ts', '--fmt', root + 'build/latex.fmt', '--pdf', '--texmf-tree', TEXMFVAR, '--texmf-tree', TEXMFDIST, '--runs', 'auto', join(tmp, d)], { env: { ...process.env, SOURCE_DATE_EPOCH: '0' } })
    else { // no TeX Live (CI): the Node API over the same bundle
      const { createTeX } = await import('../../src/node.ts')
      writeFileSync(join(tmp, d.replace('.tex', '.pdf')), (await createTeX({ texmf: root + 'bundles/minimal' }).compile({ files: { [d]: readFileSync(join(tmp, d)) }, main: d, runs: "auto", date: new Date(0) })).pdf!)
    }
    expected.set(d, createHash('sha256').update(readFileSync(join(tmp, d.replace('.tex', '.pdf')))).digest('hex'))
  }
  server = createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url!, 'http://x').pathname))
    const file = p === '/' ? null : p.startsWith('/dist/') ? root + p.slice(1) : p.startsWith('/texmf/') ? root + 'bundles/minimal/' + p.slice('/texmf/'.length) : undefined
    if (file === undefined || (file !== null && !existsSync(file))) { res.writeHead(404).end(); return }
    const body = file === null ? Buffer.from(harness) : readFileSync(file)
    if (p.startsWith('/texmf/')) served += body.length
    res.writeHead(200, { 'Content-Type': types[extname(p)] ?? (p === '/' ? 'text/html' : 'application/octet-stream'), 'Access-Control-Allow-Origin': '*',
      ...(p.startsWith('/texmf/') && { 'Cache-Control': 'public, max-age=31536000, immutable' }) }).end(body)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
after(() => server.close())

for (const [name, type] of Object.entries(process.env.CI_BROWSERS === 'chromium' ? { chromium } : { chromium, firefox, webkit })) {
  test(name, { timeout: 600_000 }, async () => {
    const browser = await type.launch(), context = await browser.newContext(), page = await context.newPage()
    let requests = 0
    context.on('request', r => { if (r.url().includes('/texmf/')) requests++ })
    page.on('pageerror', e => process.stderr.write(`${name}: ${e}\n`))
    try {
      await page.goto(url)
      await page.waitForFunction('window.createTeX')
      await page.evaluate(`window.tex = createTeX({ texmf: '/texmf/' })`)
      const compile = async (d: string) => {
        requests = 0; served = 0
        const r = await page.evaluate(async ([d, src]) => {
          const r = await (window as any).tex.compile({ files: { [d!]: src }, main: d, runs: 'auto', date: new Date(0) })
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', r.pdf))].map(b => b.toString(16).padStart(2, '0')).join('')
          return { hash, bangs: r.log.split('\n').filter((l: string) => l.startsWith('!')), runs: r.runs }
        }, [d, readFileSync(root + 'test/oracle/' + d, 'latin1')])
        return { ...r, requests, served }
      }
      const first = await compile(docs[0]!)
      process.stdout.write(`# ${name} ${docs[0]}: ${first.requests} requests, ${first.served} bytes, ${first.runs} runs\n`)
      assert.ok(first.requests > 0, 'Playwright saw the worker requests')
      assert.ok(first.served < 14e6, /* bundles/minimal is 21 MB (pdftex.map alone 5.6 MB, latex.fmt 3 MB): demand-driven, not the whole bundle */ `first compile fetched ${first.served} bytes`)
      for (const d of [docs[0]!, docs[1]!]) {
        const r = d === docs[0] ? first : await compile(d)
        if (d !== docs[0]) process.stdout.write(`# ${name} ${d}: ${r.requests} requests, ${r.served} bytes\n`)
        assert.deepStrictEqual(r.bangs, [])
        assert.strictEqual(r.hash, expected.get(d), `${d} PDF differs from the Node CLI's`)
      }
      for (const d of docs) { const again = await compile(d); assert.strictEqual(again.requests, 0, `${d} again: ${again.requests} requests`); assert.strictEqual(again.served, 0) }
    } finally { await browser.close() }
  })
}
