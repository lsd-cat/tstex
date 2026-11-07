// Normalise a TeX log so pdftex and tstex logs can be compared byte for byte.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function normalizeLog(text: string): string {
  const lines = text.split('\n')
  if (lines[0]?.startsWith('This is ')) lines.shift()
  return lines
    .filter(l => l !== ' restricted \\write18 enabled.' && l !== ' %&-line parsing enabled.' && !l.startsWith('**'))
    .map(l => l
      .replace(/\(\.\//g, '(')
      .replace(/(^|[ (])\/[^ ()]*\//g, '$1') // absolute path -> basename
      .trimEnd())
    .join('\n')
    .replace(/\n*$/, '\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(normalizeLog(readFileSync(process.argv[2] ?? 0, 'utf8')))
}
