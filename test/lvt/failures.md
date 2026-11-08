# lvt failures

Baseline classification of the first full run on `m5` (778 pass, 119 fail, 6 skipped), by the first error/unsupported message or first differing line.

## unsupported: terminal input (49)

- base/github-0022
- base/github-0022b
- base/github-0022c
- base/github-0043
- base/github-0052
- base/github-0198
- base/github-0386
- base/github-0408
- base/github-0414
- base/github-0422
- base/github-0479b
- base/github-0479c
- base/github-0528
- base/github-0577
- base/github-0600
- base/github-0617
- base/github-0710
- base/github-0828
- base/github-0862
- base/github-0864
- base/github-0864a
- base/github-0885
- base/github-0892
- base/github-0917+0958
- base/github-0932
- base/github-0938
- base/github-1092
- base/github-1279
- base/github-1298
- base/github-1619a
- base/github-1619b
- base/github-1619c
- base/github-1619d
- base/github-1619e
- base/github-1756
- base/github-1920
- base/github-2110
- base/tlb-filecontents-001
- base/tlb-input
- base/tlb-isodate-001
- base/tlb-option-space-001
- base/tlb-option-space-002
- base/tlb-rollback-001
- base/tlb-rollback-003
- base/tlb-utf8-filecontents-1
- base/tlb1873
- base/tlb1876
- base/tltx003
- graphics/utf8-filenames-001

## log differs (first diff: see below) (39)

- base/github-0088: `+   'Not found\n' + || -   '(github-0088.aux) \\relax^^M\n' +`
- base/github-0109: `+   'No github-0109-1.\n' + || -   '(github-0109-2.tex\n' +`
- base/github-0199: `+   '\n' + || +   '\n' +`
- base/github-0217-base: `+   'No file gh217-include.tex.\n' + || -   '(gh217-include.tex\n' +`
- base/github-0217-io-base: `+   'No file part-one.tex.\n' + || -   '(part-one.tex\n' +`
- base/github-0217-io-space: `+   'No file part one.tex.\n' + || -   '(part one.tex\n' +`
- base/github-0217-space: `+   'No file gh217 include.tex.\n' + || -   '(gh217 include.tex\n' +`
- base/github-0221: `+   '1: no\n' + || -   '1: yes\n' +`
- base/github-0256: `+   'First line: hello = some comment line?\n' + || -   "First line: %% LaTeX2e file `./github-0256.xxx' = some comment line?\n" +`
- base/github-0580: `-   '(class_test.cls\n' + || -   'Document Class: class_test\n' +`
- base/github-0626: `+   'No file github-0626-2.tex.\n' + || -   '= (LEVEL 1 START) github-0626-2.tex\n' +`
- base/github-0645: `+   'No file github-0645.\n' + || -   '(github-0645.tex\n' +`
- base/github-0903: `+   'Not found\n' + || -   '(github-0903-test.sty) %%^^M\n' +`
- base/github-1413: `+   'Applying: [2023/06/01] Hooks with args on input l'... 76399 more characters || -   'Applying: [2023/06/01] Hooks with args on input l'... 76770 more charac`
- base/tlb-filename-01: `+   '3: no\n' + || -   '3: yes\n' +`
- base/tlb-nfss-ts1: `+   'LaTeX Font Info:    No file T1zzz.fd. on input line 42.\n' + || +   '\n' +`
- base/tlb0577a: `+   ')\n' + || -   ') (flnoindent.sty) (test2e.tex\n' +`
- base/tlb0577b: `+   ')\n' + || -   ') (flnoindent.sty) (test2e.tex\n' +`
- base/tlb1514: `+   'No file pr1514a.tex.\n' + || -   '(pr1514a.tex\n' +`
- base/tlb1826: `+   '\n' + || +   '\n' +`
- base/tlb2140: `+   'No file pr2140a.tex.\n' + || +   "\\openout2 = `pr2140b.aux'.\n" +`
- base/tlb2153: `-   'Compatibility mode: loading tlb2153.sty rather than tlb2153.cls.\n' + || -   '(tlb2153.sty) (test2e.tex\n' +`
- base/tlb2153a: `-   'Compatibility mode: loading tlb2153.sty rather than tlb2153.cls.\n' + || -   '(tlb2153.sty) (tlb2153a.sty) (test2e.tex\n' +`
- base/tlb2153b: `-   'Compatibility mode: loading tlb2153.sty rather than tlb2153.cls.\n' + || -   '(tlb2153.sty) (tlb2153b.sty) (test2e.tex\n' +`
- base/tlb2153c: `-   'Compatibility mode: loading tlb2153.sty rather than tlb2153.cls.\n' + || -   '(tlb2153.sty) (tlb2153c.sty) (test2e.tex\n' +`
- base/tlb2661: `+   'No file TESTcmm.fd.\n' + || +   '\n' +`
- base/tltc001: `+   "LaTeX Warning: Citation `abc' on page 2 undefine"... 44958 more characters || -   "LaTeX Warning: Citation `abc' on page 2 undefine"... 44950 more characte`
- base/tltx001: `+   '..\\glue(\\rightsk'... 47094 more characters || -   '..\\glue(\\rightsk'... 47086 more characters`
- base/vlatex05: `+   '....\\g'... 48932 more characters || -   '....\\g'... 48924 more characters`
- base/vtl2e05: `+   '....\\OT1/cmr/m/n/10'... 48916 more characters || -   '....\\OT1/cmr/m/n/10'... 48908 more characters`
- graphics/github-0516: `+   '\n' + || +   "LaTeX Warning: File `graph-test.1' not found on input line 23.\n" +`
- hyperref/issue194-colon-label: `+   '   '... 399 more characters || -   '   '... 1403 more characters`
- l3kernel/m3file001: `+   'De'... 15068 more characters || -   'De'... 16454 more characters`
- l3kernel/m3file003: `+   '! Undefined control sequence.\n' + || +   '<argument> \\ERROR\n' +`
- l3kernel/m3ior002: `+   'Def'... 6007 more characters || -   'Def'... 5215 more characters`
- l3kernel/m3iow001: `+   'Def'... 7158 more characters || -   'Def'... 6756 more characters`
- l3kernel/m3rand001: `+   'De'... 2772 more characters || -   'De'... 14524 more characters`
- l3kernel/m3seq009: `+   'Def'... 2882 more characters || -   'Def'... 3081 more characters`
- l3kernel/m3shell001: `+   '! Undefined control sequence.\n' + || +   '<argument> \\ERROR\n' +`

## unsupported: \pdfmdfivesum (15)

- hyperref/303-textormath
- hyperref/38-pdfminorversion
- hyperref/81-gobble-thanks
- hyperref/87-pdf2
- hyperref/documentproperties
- hyperref/gh167-lastskip
- hyperref/gh187-whatsits-break
- hyperref/gh235-hookrule
- hyperref/issue185-nonascii-label
- hyperref/missing-theH
- hyperref/o50-footnotesspaces
- hyperref/pdfdoc
- hyperref/psdextra-greek
- hyperref/test6
- l3kernel/m3str002

## unsupported: braced file name (9)

- hyperref/gh118-xr-hyper
- hyperref/test1
- hyperref/xr-newlabel-1
- hyperref/xr-newlabel-2
- hyperref/xr-newlabel-3
- hyperref/xr-newlabel-4
- hyperref/xr-newlabel-5
- hyperref/xr-properties-6
- hyperref/xr-space

## unsupported: \pdfsavepos (2)

- base/properties-004-predeclare
- base/tlb-hfloat-01

## unsupported: \pdfescapestring (2)

- hyperref/hyperget-test
- hyperref/next-anchor

## unsupported: \pdfmapfile (1)

- base/github-0094

## unsupported: \rpcode (1)

- base/sx172785

## unsupported: \pdfmatch (1)

- hyperref/testnb
