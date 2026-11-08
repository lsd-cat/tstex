// TexFS over local directories, searched in order (printed as `./name'), then texmf trees through their ls-R databases
import { readFileSync, statSync, lstatSync, realpathSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import type { TexFS } from './fs.ts'
import { parse_ls_r, escapes, candidates, tree_matches } from './lookup.ts'
export { parse_ls_r }

// Security policy (AUDIT.md): a name is read only from inside a root or texmf tree after resolving symlinks (and see
// lookup.ts escapes); names the OS rejects are not found; nothing here throws
const real = (p: string) => { try { return realpathSync(p) } catch { return null } }
const inside = (p: string, root: string | null) => { const r = real(p); return r !== null && root !== null && (r === root || r.startsWith(root + sep)) }
const is_file = (p: string) => { try { return statSync(p, { throwIfNoEntry: false })?.isFile() === true } catch { return false } }

// opts.record collects every texmf-tree file found (tools/pack-texmf.ts's `minimal' preset)
export function nodeFS(roots: string[], texmfRoots: string[] = [], opts: { record?: Set<string> } = {}): TexFS {
  const trees = texmfRoots.map(root => ({ root, real_root: real(root), db: parse_ls_r(readFileSync(join(root, 'ls-R'), 'latin1')) }))
  const real_roots = roots.map(real), dbs = trees.map(t => (b: string) => t.db.get(b))
  const read = (p: string) => { try { return new Uint8Array(readFileSync(p)) } catch { return null } }
  // kpathsea order: path elements in order, each over the trees in order; within a subtree the ls-R order
  const locate = (name: string, kind: string): { file: string, shown: string } | null => {
    if (name === '/dev/null') return { file: name, shown: name } // kpathsea finds it (expl3 sets \c_sys_platform_str to unix); no other absolute path escapes
    if (escapes(name)) return null // no path escape from the roots
    for (const [i, root] of roots.entries()) for (const n of candidates(name, kind)) {
      const file = join(root, n)
      if (is_file(file) && inside(file, real_roots[i] ?? null)) return { file, shown: /^\.?\//.test(n) ? n : './' + n } // kpathsea prints an absolute or explicitly relative name as given
    }
    for (const [i, rel] of tree_matches(name, kind, dbs)) {
      const file = join(trees[i]!.root, rel)
      if (inside(file, trees[i]!.real_root)) { opts.record?.add(file); return { file, shown: file } }
    }
    return null
  }
  return {
    find: (name, kind) => { const l = locate(name, kind); return l && read(l.file) },
    path: (name, kind) => locate(name, kind)?.shown ?? null,
    // a_open_out: the directory exists inside the first root (after symlinks), the name is one the OS takes, and it is not a symlink
    writable: name => {
      if (roots.length === 0) return true
      if (name.startsWith('/') || name.includes('\0') || name.split('/').some(c => c === '..' || c.length > 255)) return false
      const file = join(roots[0]!, name)
      try { return statSync(dirname(file)).isDirectory() && inside(dirname(file), real_roots[0] ?? null) && lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink() !== true } catch { return false }
    },
    compress: (data, level) => new Uint8Array(deflateSync(data, { level })),
    inflate: (data, max) => { try { return new Uint8Array(inflateSync(data, { maxOutputLength: max })) } catch { return new Uint8Array(0) } },
    stat: (name, kind) => { const l = locate(name, kind); try { const st = l && statSync(l.file); return st ? { size: st.size, mtime: st.mtime } : null } catch { return null } },
  }
}
