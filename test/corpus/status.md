# Corpus status

Engine 4cd1bc1; pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026); 32 documents.

| category | count |
|---|---|
| identical | 15 |
| both-error | 2 |
| pdf-differs | 0 |
| log-differs-only | 0 |
| engine-error | 13 |
| pdftex-error | 0 |
| timeout | 0 |
| skipped | 2 |

| side | p50 | p95 | (this run, documents run: 30) |
|---|---|---|---|
| pdftex | 16.9 s | 103.9 s | |
| engine | 45.6 s | 96.1 s | |

## engine-error by message

- 7x unsupported: \pdfinterwordspaceon
- 6x unsupported: \pdffakespace

## Documents

category | path | detail
identical | doc/latex/acmart/samples/acmengage.tex | raw-pdf-bytes equal, runs 3/3
identical | doc/latex/amscls/amsart-template.tex | raw-pdf-bytes equal, runs 2/2
identical | doc/latex/amscls/amsproc-template.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m5-article.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m6-latex-article.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m6-latex-beamer.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m6-latex-geometry-xcolor.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m6-latex-graphicx.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m6-latex-hyperref.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m6-latex-minimal.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m6-latex-tikz.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m8-latex-acmart.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m8-latex-epdf.tex | raw-pdf-bytes equal, runs 2/2
identical | test/oracle/m8-latex-microtype.tex | raw-pdf-bytes equal, runs 2/2
identical | tex/latex/base/sample2e.tex | raw-pdf-bytes equal, runs 2/2
both-error | doc/latex/acmart/samples/acmcp.tex | ! LaTeX Error: File `acm-jdslogo' not found.
both-error | doc/latex/amscls/amsbook-template.tex | ! I can't write on file `.aux'.
engine-error | doc/latex/acmart/samples/acmlarge.tex | unsupported: \pdffakespace
engine-error | doc/latex/acmart/samples/acmmanuscript.tex | unsupported: \pdffakespace
engine-error | doc/latex/acmart/samples/acmsmall-conf.tex | unsupported: \pdfinterwordspaceon
engine-error | doc/latex/acmart/samples/acmsmall-submission.tex | unsupported: \pdffakespace
engine-error | doc/latex/acmart/samples/acmsmall.tex | unsupported: \pdffakespace
engine-error | doc/latex/acmart/samples/acmtog-conf.tex | unsupported: \pdfinterwordspaceon
engine-error | doc/latex/acmart/samples/acmtog.tex | unsupported: \pdfinterwordspaceon
engine-error | doc/latex/acmart/samples/sigconf-authordraft.tex | unsupported: \pdfinterwordspaceon
engine-error | doc/latex/acmart/samples/sigconf-i13n.tex | unsupported: \pdfinterwordspaceon
engine-error | doc/latex/acmart/samples/sigconf.tex | unsupported: \pdfinterwordspaceon
engine-error | doc/latex/acmart/samples/sigplan.tex | unsupported: \pdfinterwordspaceon
engine-error | doc/latex/asmeconf/asmeconf-template.tex | unsupported: \pdffakespace
engine-error | doc/latex/asmejour/asmejour-template.tex | unsupported: \pdffakespace
skipped | doc/latex/acmart/samples/acmsmall-biblatex.tex | needs Biber
skipped | doc/latex/acmart/samples/sigconf-biblatex.tex | needs Biber
