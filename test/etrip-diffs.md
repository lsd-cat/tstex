# etrip test: remaining differences

`node tools/trip.ts` runs, after trip, Breitenlohner's e-TeX trip test as `spec/etripman.tex` (steps 7–8) and
TeX Live's `etrip.diffs` script do: pass 1 answers `**` with `*etrip` (`etrip2.in`, INITEX enters extended mode), pass 2
with `&etrip etrip` (`etrip3.in`). Capacities are trip's (`spec/etrip-texmf.cnf`), except what that file leaves at TeX
Live's values: `hash_size=15000` (no `hash_extra`), `trie_size`, `trie_op_size=35111`, and `hyph_size=659` (what
`etrip.log` prints). `etrip.tfm` is `pltotf spec/etrip.pl` (in `test/texmf`). Outputs go to `/tmp/trip/etrip` and are
diffed against `spec/{etripin.log,etrip.log,etrip.fot,etrip.typ,etrip.out}`.

**TeXXeT substitution.** TeXXeT is not ported (PLAN: deferred), so the run uses a copy of `etrip.tex`
(`/tmp/trip/etrip-src`) with every `\TeXXeTstate=1` replaced by `\TeXXeTstate=0` (l.106, 193, 341, 546, 1253).
The `\beginL`…`\endR` there then give e-TeX's `Improper \beginL` etc. instead of making math/LR nodes.

Both passes are also run through the real `pdftex -ini` (on the same substituted file, TeX Live capacities) and
through this engine with TeX Live capacities (`/tmp/trip/etrip/pdftex` vs `/tmp/trip/etrip/tl`): the normalised
`etripin.log` and `etrip.log`, and `etrip.out`, are identical; `etrip.typ` differs only in the DVI comment's date.
By hand, `pdftex -ini` with trip's capacities as environment variables (`error_line=64 … hash_extra=0 hyph_size=659`)
gives an `etrip.log` identical to ours except the banner and the memory/string lines, both on the substituted file
and, on the unmodified file, against Knuth's except the (b) items below; that is how the classes were assigned.

Classes: (a) expected per etripman/tripman §5–6, our design, or the TeXXeT substitution, (b) pdftex/TeX Live vs
e-TeX, (c) bug. **(c): none.**

| file | lines differing (ours vs Breitenlohner) | (a) | (b) | (c) |
|---|---|---|---|---|
| etripin.log | 12 | 8 | 4 | 0 |
| etrip.log | 250 | 242 | 8 | 0 |
| etrip.fot | 7 | 5 | 2 | 0 |
| etrip.typ | 4 | 4 | 0 | 0 |
| etrip.out | 0 | 0 | 0 | 0 |

(Counts are `diff | grep -c '^[<>]'`.)

## etripin.log

- l.1 banner, l.26 format date — (a).
- l.27–28 `0 strings of total length 0`, `210 memory locations dumped; current usage is 0&156` — (a) no string pool, no `mem`.
- l.29 `570 multiletter control sequences` (Breitenlohner 408) — (b) pdftex's extra primitives (pdftex prints 570).
- `0 words of pdfTeX memory`, `0 indirect objects` — (b) pdftex.web «Dump pdftex data».

## etrip.log

- l.1 banner — (a).
- 228 lines from the TeXXeT substitution — (a): `Improper \beginL/\beginR/\endL/\endR` errors and the boxes without
  LR nodes at l.195–203 (Breitenlohner's log l.52–288) and l.341–342 (l.511), the `\endL or \endR problem` paragraphs
  of l.546–551 (l.1931–2007), and the `\beginL`/`\beginR` paragraph of l.1256 (l.4292–4412).
- l.589 `### insert group … (\insert0{)` (Breitenlohner `(\vadjust{)`) — (b) pdftex's `\vadjust pre` pushes an extra
  save-stack word, so `\showgroups` reads the wrong `saved(-2)` (AUDIT.md, e-TeX).
- l.692 `\openout1 = `etrip.out'.` plus a blank line — (b) tex.ch [53.1374] `log_openout`.
- 3 × `Memory usage before: …` (l.692, 2718, 2720) and the strings/string characters/words of memory lines of the
  final statistics — (a) tripman 5d, 5f, 5g.
- `571 multiletter control sequences out of 15000+0` (Breitenlohner 409) — (b) pdftex primitives.
- `10i,15n,8p,137b,80s stack positions` (Breitenlohner `79s`) — (b) the same extra `\vadjust` save-stack word;
  pdftex on the unmodified etrip.tex also prints `80s`.

## etrip.fot

- l.1–2 banner (Breitenlohner's binary even reports `preloaded format=etex`), and our `**&etrip etrip` echo of the
  supplied line before `entering extended mode` — (a).
- `\openout1 = `etrip.out'.` and a blank line — (b) `log_openout` writes to the terminal too.

## etrip.typ

- l.1 DVItype banner, l.9 the DVI comment's date — (a).

## Fixed while running etrip (class c)

- None: with the TeXXeT substitution the M4 port already matched pdftex.
