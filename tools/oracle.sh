#!/bin/sh
# usage: tools/oracle.sh path/to/NAME.tex  -> NAME.expected.log (+ .expected.dvitype, .expected.dvi, .expected.pdf)
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
tex=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
dir=$(dirname "$tex"); name=$(basename "$tex" .tex)
find_bin() { command -v "$1" || ls /Users/g/texlive/2026/bin/*/"$1" 2>/dev/null | head -1; }
pdftex=$(find_bin pdftex); dvitype=$(find_bin dvitype)
[ -n "$pdftex" ] || { echo "oracle.sh: pdftex not found on PATH or in /Users/g/texlive/2026/bin/*/" >&2; exit 1; }
mode=$(head -1 "$tex" | sed -n 's/^%! oracle: *\([a-z]*\).*/\1/p')
case "${mode:-ini}" in
  ini) args="-ini" ;;
  etex) args="-ini -etex" ;;
  latex) args="-fmt pdflatex" ;;
  pdflatex) args="-fmt pdflatex" ;;
  pdftex) args="-ini -etex" ;;
  *) echo "oracle.sh: unknown mode $mode" >&2; exit 1 ;;
esac
runs=$(head -5 "$tex" | sed -n 's/^%! runs: *\([0-9]*\).*/\1/p' | head -1); runs=${runs:-1}
export max_print_line=9999 # TeX Live texmf.cnf variable; only used by the latex, pdflatex and pdftex modes
case "${mode:-ini}" in latex|pdflatex|pdftex) ;; *) unset max_print_line ;; esac
# PDF modes: fixed date so the PDF (incl. /ID, /CreationDate) is reproducible; no -output-format=dvi
fmt="-output-format=dvi"
case "${mode:-ini}" in pdflatex|pdftex) fmt=""; export SOURCE_DATE_EPOCH=0 FORCE_SOURCE_DATE=1 ;; esac
rm -f "$dir/$name.expected.pdf" "$dir/$name.expected.dvi" "$dir/$name.expected.dvitype" "$dir/$name.expected.out" # no stale artefacts from an earlier version of the test
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# every input lives in the temp dir so pdftex prints ./name (path-independent 79-col wrapping)
cp "$dir"/*.tex "$root"/test/texmf/*.tex "$tmp/"
cp -R "$root/test/texmf/images" "$tmp/images" # images resolve as images/NAME relative to the cwd / a root
i=0; while [ $i -lt "$runs" ]; do i=$((i+1))
  (cd "$tmp" && TEXINPUTS=".:$root/test/lvt:" TFMFONTS="$root/test/texmf:" "$pdftex" $args -interaction=batchmode $fmt -jobname="$name" "$name.tex" >/dev/null 2>&1)
done
[ -f "$tmp/$name.log" ] || { echo "oracle.sh: pdftex produced no log" >&2; exit 1; }
node "$root/tools/normalize-log.ts" "$tmp/$name.log" > "$dir/$name.expected.log"
[ -f "$tmp/$name.pdf" ] && cp "$tmp/$name.pdf" "$dir/$name.expected.pdf"
[ -f "$tmp/$name.dvi" ] && cp "$tmp/$name.dvi" "$dir/$name.expected.dvi"
# a \write file named \jobname.out is compared too
[ -f "$tmp/$name.out" ] && cp "$tmp/$name.out" "$dir/$name.expected.out"
if [ -f "$tmp/$name.dvi" ] && [ -n "$dvitype" ]; then
  (cd "$tmp" && "$dvitype" -output-level=4 "$name.dvi") | awk '
    /This is DVItype/ && NR==1 { next }
    /^'"'"'/ && !done { print "'"'"'<comment>'"'"'"; done=1; next }
    { print }' > "$dir/$name.expected.dvitype"
fi
exit 0
