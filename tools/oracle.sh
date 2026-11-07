#!/bin/sh
# usage: tools/oracle.sh path/to/NAME.tex  -> NAME.expected.log (+ .expected.dvitype, .expected.dvi)
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
  *) echo "oracle.sh: unknown mode $mode" >&2; exit 1 ;;
esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# every input lives in the temp dir so pdftex prints ./name (path-independent 79-col wrapping)
cp "$dir"/*.tex "$root"/test/texmf/*.tex "$tmp/"
(cd "$tmp" && TEXINPUTS=".:$root/test/lvt:" TFMFONTS="$root/test/texmf:" "$pdftex" $args -interaction=batchmode -output-format=dvi -jobname="$name" "$name.tex" >/dev/null 2>&1)
[ -f "$tmp/$name.log" ] || { echo "oracle.sh: pdftex produced no log" >&2; exit 1; }
node "$root/tools/normalize-log.ts" "$tmp/$name.log" > "$dir/$name.expected.log"
[ -f "$tmp/$name.dvi" ] && cp "$tmp/$name.dvi" "$dir/$name.expected.dvi"
if [ -f "$tmp/$name.dvi" ] && [ -n "$dvitype" ]; then
  (cd "$tmp" && "$dvitype" -output-level=4 "$name.dvi") | awk '
    /This is DVItype/ && NR==1 { next }
    /^'"'"'/ && !done { print "'"'"'<comment>'"'"'"; done=1; next }
    { print }' > "$dir/$name.expected.dvitype"
fi
exit 0
