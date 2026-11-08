// Normalise a TeX log so pdftex and tstex logs can be compared byte for byte.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function normalizeLog(text: string): string {
  const lines = text.split('\n')
  if (lines[0]?.startsWith('This is ')) lines.shift()
  // \tracingstats memory usage (§1334): the figures depend on mem/pool sizes we do not replicate
  const stats = lines.indexOf("Here is how much of TeX's memory you used:")
  if (stats >= 0) lines.splice(stats, lines.findIndex((l, i) => i > stats && l.includes(' stack positions out of ')) - stats + 1)
  return lines
    .filter(l => l !== ' restricted \\write18 enabled.' && l !== ' %&-line parsing enabled.' && !/^\*\*(?!\*)/.test(l)) // the ** prompt echo, not '*** (job aborted' fatal lines
    .map(l => l
      .replace(/\(\.\//g, '(')
      .replace(/(^|[ (<{])\/[^ ()<>{}]*\//g, '$1') // absolute path -> basename
      .replace(/^(Output written on .*\.pdf \(\d+ pages?, )\d+ bytes\)\.$/, '$1* bytes).') // expected logs were stored this way (fonts were whole before M8)
      .trimEnd())
    .join('\n')
    .replace(/\n*$/, '\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(Buffer.from(normalizeLog(readFileSync(process.argv[2] ?? 0, 'latin1')), 'latin1'))
}
