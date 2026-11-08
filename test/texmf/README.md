Copied unchanged from TeX Live 2026 (found via kpsewhich): plain.tex, hyphen.tex, story.tex under Knuth's licence; the Computer Modern .tfm files (every font plain.tex loads) are public.

big100.tfm is cmr10.tfm with the design size (header word 1) patched to 100pt; only m2-review-font-2048 uses it (the tex.ch "scaled to 2048pt or higher" check).

trip.tfm is built from Knuth's spec/trip.pl (tripman step 1) with `/Users/g/texlive/2026/bin/universal-darwin/pltotf spec/trip.pl test/texmf/trip.tfm` (pltotf from TeX Live's `fontware` package); `tftopl` of the result reproduces trip.pl exactly. Only tools/trip.ts uses it.

etrip.tfm is built the same way from spec/etrip.pl (etripman step 6): `pltotf spec/etrip.pl test/texmf/etrip.tfm`. Only tools/trip.ts uses it.

images/ (M6 image tests; fig.png etc. are one downscaled desktop picture, resolved as `images/NAME` relative to a root, oracle.sh copies the dir into the temp cwd): fig.png (8-bit RGB), fig.jpg (baseline JPEG, sips), fig-gray.png (8-bit grayscale, sips with the Generic Gray profile), fig-pal.png (8-bit palette, 64 colours, ImageMagick `magick fig.png -colors 64 PNG8:fig-pal.png`; sips cannot write palette PNGs).

ec-lmr10.tfm (Latin Modern, TeX Live fonts/tfm/public/lm) is only for m6-pdf-fonts-enc (a font re-encoded via lm-ec.enc in pdftex.map).

images/boxes.pdf (a hand-written 3-page PDF 1.4 with MediaBox/CropBox/BleedBox/TrimBox/ArtBox variations, incl. a CropBox wider than the MediaBox) and images/bad.pdf (8 bytes of garbage) come from the M6 backend review (/tmp/rv); used by the m6-review-pdfimage-* tests.
