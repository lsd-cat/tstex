// §238–240 integer parameters (pdftex.web and etex.ch included), §1228 assign_int
import type { Engine } from '../engine.ts'
import { Cmd } from '../types.ts'
import { print_esc, print_int } from '../print.ts'
import { int_base, count_base, print_param } from '../eqtb.ts'
import { word_define } from '../main.ts'
import { scan_optional_equals, scan_int } from '../scan.ts'

export const cmd = Cmd.assign_int
export const primitives: [string, number][] = [
  ['pretolerance', int_base], ['tolerance', int_base + 1], ['linepenalty', int_base + 2],
  ['hyphenpenalty', int_base + 3], ['exhyphenpenalty', int_base + 4], ['clubpenalty', int_base + 5],
  ['widowpenalty', int_base + 6], ['displaywidowpenalty', int_base + 7], ['brokenpenalty', int_base + 8],
  ['binoppenalty', int_base + 9], ['relpenalty', int_base + 10], ['predisplaypenalty', int_base + 11],
  ['postdisplaypenalty', int_base + 12], ['interlinepenalty', int_base + 13],
  ['doublehyphendemerits', int_base + 14], ['finalhyphendemerits', int_base + 15],
  ['adjdemerits', int_base + 16], ['mag', int_base + 17], ['delimiterfactor', int_base + 18],
  ['looseness', int_base + 19], ['time', int_base + 20], ['day', int_base + 21], ['month', int_base + 22],
  ['year', int_base + 23], ['showboxbreadth', int_base + 24], ['showboxdepth', int_base + 25],
  ['hbadness', int_base + 26], ['vbadness', int_base + 27], ['pausing', int_base + 28],
  ['tracingonline', int_base + 29], ['tracingmacros', int_base + 30], ['tracingstats', int_base + 31],
  ['tracingparagraphs', int_base + 32], ['tracingpages', int_base + 33], ['tracingoutput', int_base + 34],
  ['tracinglostchars', int_base + 35], ['tracingcommands', int_base + 36], ['tracingrestores', int_base + 37],
  ['uchyph', int_base + 38], ['outputpenalty', int_base + 39], ['maxdeadcycles', int_base + 40],
  ['hangafter', int_base + 41], ['floatingpenalty', int_base + 42], ['globaldefs', int_base + 43],
  ['fam', int_base + 44], ['escapechar', int_base + 45], ['defaulthyphenchar', int_base + 46],
  ['defaultskewchar', int_base + 47], ['endlinechar', int_base + 48], ['newlinechar', int_base + 49],
  ['language', int_base + 50], ['lefthyphenmin', int_base + 51], ['righthyphenmin', int_base + 52],
  ['holdinginserts', int_base + 53], ['errorcontextlines', int_base + 54], ['pdfoutput', int_base + 55],
  ['pdfcompresslevel', int_base + 56], ['pdfobjcompresslevel', int_base + 76],
  ['pdfdecimaldigits', int_base + 57], ['pdfmovechars', int_base + 58], ['pdfimageresolution', int_base + 59],
  ['pdfpkresolution', int_base + 60], ['pdfuniqueresname', int_base + 61],
  ['pdfoptionpdfminorversion', int_base + 65], ['pdfoptionalwaysusepdfpagebox', int_base + 62],
  ['pdfoptionpdfinclusionerrorlevel', int_base + 63], ['pdfmajorversion', int_base + 64],
  ['pdfminorversion', int_base + 65], ['pdfforcepagebox', int_base + 66], ['pdfpagebox', int_base + 67],
  ['pdfinclusionerrorlevel', int_base + 68], ['pdfgamma', int_base + 69], ['pdfimagegamma', int_base + 70],
  ['pdfimagehicolor', int_base + 71], ['pdfimageapplygamma', int_base + 72], ['pdfadjustspacing', int_base + 73],
  ['pdfprotrudechars', int_base + 74], ['pdftracingfonts', int_base + 75],
  ['pdfadjustinterwordglue', int_base + 77], ['pdfprependkern', int_base + 78], ['pdfappendkern', int_base + 79],
  ['pdfgentounicode', int_base + 80], ['pdfdraftmode', int_base + 81], ['pdfinclusioncopyfonts', int_base + 82],
  ['pdfsuppresswarningdupdest', int_base + 83], ['pdfsuppresswarningdupmap', int_base + 84],
  ['pdfsuppresswarningpagegroup', int_base + 85], ['pdfinfoomitdate', int_base + 86],
  ['pdfsuppressptexinfo', int_base + 87], ['pdfomitcharset', int_base + 88], ['pdfomitinfodict', int_base + 89],
  ['pdfomitprocset', int_base + 90], ['pdfptexuseunderscore', int_base + 91],
]
export const etex_primitives: [string, number][] = [
  ['tracingassigns', int_base + 92], ['tracinggroups', int_base + 93], ['tracingifs', int_base + 94],
  ['tracingscantokens', int_base + 95], ['tracingnesting', int_base + 96],
  ['predisplaydirection', int_base + 97], ['lastlinefit', int_base + 98], ['savingvdiscards', int_base + 99],
  ['savinghyphcodes', int_base + 100], ['ignoreprimitiveerror', int_base + 101], ['TeXXeTstate', int_base + 102],
]
// §242
export function print(e: Engine, chr: number): void {
  if (chr < count_base) print_param(e, chr - int_base)
  else { print_esc(e, 'count'); print_int(e, chr - count_base) }
}
export function assign(e: Engine, a: number): void {
  const p = e.cur_chr; scan_optional_equals(e); scan_int(e)
  word_define(e, a, p, e.cur_val)
}
