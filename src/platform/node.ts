// TexFS over local directories, searched in order (printed as `./name'), then texmf trees through their ls-R databases
import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { TexFS } from './fs.ts'

// kpathsea's search path per file kind, as directories relative to a texmf root (`progname=pdflatex' TEXINPUTS);
// a trailing `/' searches the subtree, `web2c' only the directory itself
const kind_dirs: Record<string, string[]> = {
  tex: ['tex/latex/', 'tex/generic/', 'tex/'], tfm: ['fonts/tfm/'], vf: ['fonts/vf/'], enc: ['fonts/enc/'], map: ['fonts/map/'],
  type1: ['fonts/type1/'], pfb: ['fonts/type1/'], cnf: ['web2c'], tcx: ['web2c'],
}

// ls-R: `./dir:' lines, each followed by the names in that directory; returns basename -> directories (relative, with `/') in file order
export function parse_ls_r(text: string): Map<string, string[]> {
  const db = new Map<string, string[]>()
  const dirs = new Set<string>()
  let dir = ''
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('%')) continue
    if (line.endsWith(':')) { dir = line.slice(0, -1).replace(/^\.\/?/, ''); if (dir !== '') dir += '/'; dirs.add(dir); continue }
    const l = db.get(line)
    if (l === undefined) db.set(line, [dir]); else l.push(dir)
  }
  for (const [name, l] of db) { // subdirectory entries are not files (kpathsea stats each match)
    const f = l.filter(d => !dirs.has(d + name + '/'))
    if (f.length === 0) db.delete(name); else db.set(name, f)
  }
  return db
}

export function nodeFS(roots: string[], texmfRoots: string[] = []): TexFS {
  const trees = texmfRoots.map(root => ({ root, db: parse_ls_r(readFileSync(join(root, 'ls-R'), 'latin1')) }))
  const read = (p: string) => { try { return new Uint8Array(readFileSync(p)) } catch { return null } }
  // kpathsea order: path elements in order, each over the trees in order; within a subtree the ls-R order
  const locate = (name: string, kind: string): { file: string, shown: string } | null => {
    if (name.split(/[\\/]/).includes('..')) return null // no path escape from the roots
    if (name === '/dev/null') return { file: name, shown: name } // kpathsea finds it (expl3 sets \c_sys_platform_str to unix); no other absolute path escapes
    const names = kind === 'tex' && !/\.[^/]*$/.test(name) ? [name, name + '.tex'] : [name]
    for (const root of roots) for (const n of names) {
      const file = join(root, n)
      if (statSync(file, { throwIfNoEntry: false })?.isFile()) return { file, shown: /^\.?\//.test(n) ? n : './' + n } // kpathsea prints an absolute or explicitly relative name as given
    }
    for (const n of names) {
      const sl = n.lastIndexOf('/'), base = n.slice(sl + 1), sub = n.slice(0, sl + 1) // `\input base/foo' matches a dir ending in base/
      for (const d of kind_dirs[kind] ?? ['']) for (const { root, db } of trees) {
        const dir = db.get(base)?.find(x => (d.endsWith('/') ? x.startsWith(d) : x === d + '/') && x.endsWith(sub))
        if (dir !== undefined) return { file: join(root, dir, base), shown: join(root, dir, base) }
      }
    }
    return null
  }
  return {
    find: (name, kind) => { const l = locate(name, kind); return l && read(l.file) },
    path: (name, kind) => locate(name, kind)?.shown ?? null,
    writable: name => roots.length === 0 || statSync(dirname(join(roots[0]!, name)), { throwIfNoEntry: false })?.isDirectory() === true,
    stat: (name, kind) => { const l = locate(name, kind), st = l && statSync(l.file, { throwIfNoEntry: false }); return st ? { size: st.size, mtime: st.mtime } : null },
  }
}
