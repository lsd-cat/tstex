// fig-cff.pdf: gs's pdfwrite output with three font dictionaries' /Encoding changed, then the xref rebuilt
import fs from 'node:fs'
let s = fs.readFileSync(process.argv[2], 'latin1')
const sub = (font, enc) => {
  const re = new RegExp(`(/BaseFont/[A-Z]{6}\\+${font}/FontDescriptor[^]*?)/Encoding/WinAnsiEncoding`)
  if (!re.test(s)) throw new Error(font)
  s = s.replace(re, `$1${enc}`)
}
sub('CMR10', '') // no /Encoding: the CFF program's built-in encoding
sub('CMTI10', '/Encoding/MacRomanEncoding')
sub('NimbusSanL-Regu', '/Encoding/MacExpertEncoding')
const x = s.indexOf('\nxref\n') + 1, offs = []
for (const m of s.slice(0, x).matchAll(/^(\d+) 0 obj/gm)) offs[Number(m[1])] = m.index
const trailer = s.slice(s.indexOf('trailer', x))
let xref = `xref\n0 ${offs.length}\n0000000000 65535 f \n`
for (let i = 1; i < offs.length; i++) xref += `${String(offs[i]).padStart(10, '0')} 00000 n \n`
s = s.slice(0, x) + xref + trailer.replace(/startxref\n\d+/, `startxref\n${x}`)
fs.writeFileSync(process.argv[3], s, 'latin1')
