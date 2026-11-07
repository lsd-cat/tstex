// TexFS over local directories, searched in order
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TexFS } from './fs.ts'

export function nodeFS(roots: string[]): TexFS {
  return {
    async find(name, kind) {
      if (name.split(/[\\/]/).includes('..')) return null // no path escape from the roots
      const names = kind === 'tex' && !/\.[^/]*$/.test(name) ? [name, name + '.tex'] : [name]
      for (const root of roots) for (const n of names) {
        try { return new Uint8Array(await readFile(join(root, n))) } catch { }
      }
      return null
    },
  }
}
