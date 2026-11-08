Copied unchanged from TeX Live 2026 (found via kpsewhich): plain.tex, hyphen.tex, story.tex under Knuth's licence; the Computer Modern .tfm files (every font plain.tex loads) are public.

big100.tfm is cmr10.tfm with the design size (header word 1) patched to 100pt; only m2-review-font-2048 uses it (the tex.ch "scaled to 2048pt or higher" check).

trip.tfm is built from Knuth's spec/trip.pl (tripman step 1) with `/Users/g/texlive/2026/bin/universal-darwin/pltotf spec/trip.pl test/texmf/trip.tfm` (pltotf from TeX Live's `fontware` package); `tftopl` of the result reproduces trip.pl exactly. Only tools/trip.ts uses it.

etrip.tfm is built the same way from spec/etrip.pl (etripman step 6): `pltotf spec/etrip.pl test/texmf/etrip.tfm`. Only tools/trip.ts uses it.
