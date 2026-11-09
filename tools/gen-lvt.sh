#!/bin/sh
# usage: tools/gen-lvt.sh [pkg/name ...]  (default: all) -> test/lvt/<pkg>/<name>.expected.{log,dvi}, oracle-status.txt, skip.txt
set -u
root=$(cd "$(dirname "$0")/.." && pwd); lvt=$root/test/lvt
keep=$(grep -v ": oracle:" "$lvt/skip.txt" 2>/dev/null || true) # manual skip entries survive regeneration
export SOURCE_DATE_EPOCH=0 FORCE_SOURCE_DATE=1 # fixed date: \today and dates in the DVI must not depend on the run day
pdftex=$(command -v pdftex || ls /Users/g/texlive/2026/bin/*/pdftex | head -1)
if [ "${1:-}" = --one ]; then # worker: --one pkg/name outdir
  t=$2; pkg=${t%/*}; name=${t#*/}; out=$3; tmp=$(mktemp -d)
  cp "$lvt/$pkg/$name.lvt" "$lvt/regression-test.tex" "$tmp/"
  for f in "$lvt/$pkg"/*; do case "$f" in *.lvt|*.expected.*) ;; *) [ -f "$f" ] && cp "$f" "$tmp/";; esac; done
  (cd "$tmp" && TEXINPUTS=".:" max_print_line=9999 "$pdftex" -fmt pdflatex -output-format=dvi -interaction=batchmode -jobname="$name" "$name.lvt" >/dev/null 2>&1 </dev/null)
  rm -f "$lvt/$pkg/$name.expected.log" "$lvt/$pkg/$name.expected.dvi"
  if [ ! -f "$tmp/$name.log" ]; then echo "$t: no-log" > "$out/$pkg.$name.st"
  else
    node "$root/tools/normalize-log.ts" "$tmp/$name.log" > "$lvt/$pkg/$name.expected.log"
    [ -f "$tmp/$name.dvi" ] && cp "$tmp/$name.dvi" "$lvt/$pkg/$name.expected.dvi"
    bang=$(grep -m1 '^!' "$tmp/$name.log")
    if grep -q 'Emergency stop\|Fatal error' "$tmp/$name.log"; then
      echo "$t: fatal (${bang:-no ! line})" > "$out/$pkg.$name.st"
      case "$bang" in
        *"File \`"*"not found"*|*"can't find file"*) echo "$t: oracle: missing file $(echo "$bang" | sed "s/[^\`]*\`\([^']*\)'.*/\1/")" > "$out/$pkg.$name.sk";;
      esac
    else echo "$t: ok" > "$out/$pkg.$name.st"; fi
  fi
  rm -rf "$tmp"; exit 0
fi
out=$(mktemp -d)
if [ $# -gt 0 ]; then printf '%s\n' "$@"; else (cd "$lvt" && ls */*.lvt | sed 's/\.lvt$//'); fi |
  xargs -P 8 -I{} sh "$0" --one {} "$out"
if [ $# -eq 0 ]; then # partial runs leave the summaries alone
  cat "$out"/*.st | sort > "$lvt/oracle-status.txt"
  { cat "$out"/*.sk 2>/dev/null; [ -n "$keep" ] && printf "%s\n" "$keep"; } | sort -u > "$lvt/skip.txt"
fi
cat "$out"/*.st | sed 's/^\([^/]*\)\/[^:]*: \([a-z-]*\).*/\1 \2/' | sort | uniq -c
rm -rf "$out"
