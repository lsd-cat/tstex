// kpathsea's lookup rules shared by every TexFS: search path per kind, name checks, the tree search order

// kpathsea's search path per file kind, as directories relative to a texmf root (`progname=pdflatex' TEXINPUTS);
// a trailing `/' searches the subtree, `web2c' only the directory itself
export const kind_dirs: Record<string, string[]> = {
  tex: ['tex/latex/', 'tex/generic/', 'tex/'], tfm: ['fonts/tfm/'], vf: ['fonts/vf/'], enc: ['fonts/enc/'], map: ['fonts/map/pdftex/', 'fonts/map/dvips/', 'fonts/map/'],
  type1: ['fonts/type1/'], pfb: ['fonts/type1/'], cnf: ['web2c'], tcx: ['web2c'],
}

// Security policy (AUDIT.md): absolute names (but /dev/null), `..' components and NUL bytes are never found
export const escapes = (name: string) => name.startsWith('/') || name.includes('\0') || name.split(/[\\/]/).includes('..')

// kpathsea_find_file_generic's target names: a name not ending in a potential suffix of its format (tex: .tex and
// ALT_TEX_SUFFIXES; map: .map; enc: .enc) is tried with the suffix first, then as given (try_std_extension_first = t)
const suffixes: Record<string, [string, RegExp]> = { tex: ['.tex', /\.(tex|sty|cls|fd|aux|bbl|def|clo|ldf)$/], map: ['.map', /\.map$/], enc: ['.enc', /\.enc$/] }
export const candidates = (name: string, kind: string) => { const x = suffixes[kind]; return x !== undefined && !x[1].test(name) ? [name + x[0], name] : [name] }

// kpathsea order: path elements in order, each over the trees in order; within one the target names in order
// (kpathsea_db_search_list), each in the database order.
// `dbs[i](base)' lists the directories (relative, ending in `/') of tree i holding `base'; yields [tree, dir + base]
export function* tree_matches(name: string, kind: string, dbs: ((base: string) => string[] | undefined)[]): Generator<[number, string]> {
  for (const d of kind_dirs[kind] ?? ['']) for (const [i, db] of dbs.entries()) for (const n of candidates(name, kind)) {
    const sl = n.lastIndexOf('/'), base = n.slice(sl + 1), sub = n.slice(0, sl + 1) // `\input base/foo' matches a dir ending in base/
    for (const x of db(base) ?? []) if ((d.endsWith('/') ? x.startsWith(d) : x === d + '/') && x.endsWith(sub)) yield [i, x + base]
  }
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

// the index shard (index/<shard>.json.gz) holding `base': its first two characters lowercased, anything but a-z0-9 as `_'
export const shard_of = (base: string) => base.slice(0, 2).toLowerCase().replace(/[^a-z0-9]/g, '_')
