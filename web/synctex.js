// A small reader for the .synctex text pdftex writes (and tstex, byte for byte): the Input: map, the sheets ({N ... }N)
// and the node records with their tag, line and position. Coordinates are sp, page-level use only here.
//   parseSynctex(text) -> { inputs: Map<tag, name>, records: [{ page, kind, tag, line, h, v }] }
// Record kinds: '[' vbox, '(' hbox, 'v'/'h' void boxes, 'x' current point, 'k' kern, 'g' glue, '$' math, 'r' rule.
export function parseSynctex(text) {
  const inputs = new Map(), records = []
  let page = 0, v = 0
  for (const l of text.split('\n')) {
    let m
    if ((m = /^Input:(\d+):(.*)$/.exec(l))) inputs.set(+m[1], m[2])
    else if ((m = /^\{(\d+)$/.exec(l))) page = +m[1]
    else if (/^\}\d+$/.test(l)) page = 0
    else if (page && (m = /^([[(vhxkg$r])(\d+),(\d+):(-?\d+),(-?\d+|=)/.exec(l))) {
      if (m[5] !== '=') v = +m[5] // '=': the last v (option 8)
      records.push({ page, kind: m[1], tag: +m[2], line: +m[3], h: +m[4], v })
    }
  }
  return { inputs, records }
}

// the tags whose Input name is `file' (./main.tex, /abs/dir/./main.tex or main.tex)
const tagsOf = (sx, file) => new Set([...sx.inputs].filter(([, n]) => n === file || n.endsWith('/' + file)).map(([t]) => t))

// source -> PDF: the page of the first record on (file, line), else of the nearest earlier line in that file; 0 if none
export function pageOf(sx, file, line) {
  const tags = tagsOf(sx, file)
  let best = null
  for (const r of sx.records) {
    if (!tags.has(r.tag) || r.line > line) continue
    if (r.line === line) return r.page
    if (best === null || r.line > best.line) best = r
  }
  return best ? best.page : 0
}

// PDF -> source (coarse): the smallest line on `page' in the first of its files that is one of `files' (project names)
export function sourceOf(sx, page, files) {
  let best = null
  for (const r of sx.records) {
    if (r.page !== page) continue
    const n = sx.inputs.get(r.tag) ?? '', file = files.find(f => n === f || n.endsWith('/' + f))
    if (file && (best === null || file === best.file && r.line < best.line)) best = { file, line: r.line }
  }
  return best
}
