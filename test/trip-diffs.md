# trip test: remaining differences

`node tools/trip.ts` runs tripman's two passes (spec/tripman.tex, Appendix A steps 3–6) with tex.web's capacities
(`error_line=64`, `half_error_line=32`, `max_print_line=72`, `stack_size=200`, `buf_size=500`, `dvi_buf_size=800`, …),
the terminal lines `""`, `"\input trip"` (pass 1) and `" &trip  trip "` (pass 2), and the date 4 JUL 1776 12:00,
writes `/tmp/trip/{tripin.log,trip.log,trip.fot,trip.dvi,trip.typ}` and diffs them against `spec/`.

It also runs both passes through the real `pdftex -ini` and through this engine with TeX Live's capacities and diffs
the normalised logs and DVItype output (`/tmp/trip/pdftex` vs `/tmp/trip/tl`). That comparison is empty except for the
DVI comment's date, so every difference below is either tripman's allowed slack (a) or pdftex's behaviour (b).

Classes: (a) expected per tripman §5–6 or our design, (b) pdftex/TeX Live vs tex.web, (c) bug. **(c): none left.**

| file | lines differing (ours vs Knuth) | (a) | (b) | (c) |
|---|---|---|---|---|
| tripin.log | 12 | 8 | 4 | 0 |
| trip.log | 72 | 62 | 10 | 0 |
| trip.fot | 8 | 8 | 0 | 0 |
| trip.typ | 8 | 8 | 0 | 0 |

(Counts are `diff | grep -c '^[<>]'`: removed plus added lines.)

## tripin.log

- l.1 banner `This is tstex` — (a) program name (tripman 5a).
- l.3 `(./trip.tex` — (a) file names (tripman 5a); kpathsea prints the path found (tex.ch).
- l.451–452 `0 strings of total length 0`, `351 memory locations dumped; current usage is 0&263` — (a) no string pool, no `mem` (tripman 5f, 5g); our figures are token-memory words.
- l.453 `500 multiletter control sequences` (Knuth 341) — (b) pdftex's extra primitives (pdftex -ini prints 500 too).
- l.465–466 `0 words of pdfTeX memory`, `0 indirect objects` — (b) pdftex.web «Dump pdftex data».

## trip.log

- l.1 banner — (a) program name.
- l.3, l.1955, l.6382 `(./trip.tex`, `(./tripos.tex` — (a) file names.
- l.59–62 `\openout0 = `8terminal.tex'.`, `\openout10 = `tripos.tex'.` — (b) tex.ch [53.1374] logs every `\openout` (`log_openout`).
- 16 × `Memory usage before: 0&0; after: 0&0; still untouched: 0` (l.73, 642, 815, 915, 1070, 1511, 2190, 2576, 3617, 3952, 4054, 4507, 4829, 6597, 7157, 7290) — (a) memory statistics (tripman 5g); no `mem` array.
- 8 × `glue set` (l.1405, 2019, 2534, 3327, 3865, 4035, 4421, 4743; e.g. `16342.0fil` → `16341.99998fil`, `9737.58789fil` → `9737.58742fil`) — (a) glue-set rounding (tripman 5b); JS doubles as in pdftex/web2c, whose log is identical to ours.
- l.2652 `cm, mm, dd, cc, nd, nc, bp, or sp` — (b) pdftex.web adds the `nd`/`nc` units to §459's help.
- l.7298–7300 strings, string characters, words of memory — (a) tripman 5d, 5f, 5g.
- l.7301 `531 multiletter control sequences out of 2100+0` (Knuth `372 … out of 2100`) — (b) pdftex primitives and tex.ch [51.1334]'s `hash_size+hash_extra` form.
- l.7303 `1 hyphenation exception` (Knuth 2) — (b) tex.ch [42.941]: a repeated `\hyphenation` word replaces the old entry and does not count.

## trip.fot

- l.1 banner, l.3 `(./trip.tex` — (a).
- l.17, l.75 `Memory usage …` — (a).
- Our `** &trip  trip ` line is the terminal echo of the supplied line; it matches.

## trip.typ

- l.1 `This is DVItype, Version 3.6 (TeX Live 2026)` — (a) DVItype's banner, not our output.
- l.419 `down4 639342177` (Knuth 639342208), l.1087–1088 `y4`/`y0 203921756` (Knuth 203921760) — (a) floating-point glue rounding (tripman 6); pdftex's DVI gives the same values. All other movements, including the `w`/`x`/`y`/`z` choices with `dvi_buf_size=800`, agree.

## Fixed while running trip (class c)

- `print` (§59) did not disable `\newlinechar` while printing a character's `^^` form, and `\message` built its string without enctex's `message_printing` (`\show^^Y` with `\newlinechar=`Y` split the line). Oracle `m3-trip-newlinechar`.
- `close_files_and_terminate` did not print `Transcript written on trip.log.` and tex.ch's final `print_ln` on the terminal (trip.fot).
