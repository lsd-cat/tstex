#!/bin/sh
# Clone the LaTeX regression-test sources into test/lvt/_src and copy .lvt files out. Idempotent.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd); lvt=$root/test/lvt; src=$lvt/_src
mkdir -p "$src"
clone() { # name url sparse-paths...
  n=$1; u=$2; shift 2
  if [ -d "$src/$n/.git" ]; then git -C "$src/$n" pull -q --depth 1 || true
  else git clone -q --depth 1 --filter=blob:none --sparse "$u" "$src/$n"; fi
  git -C "$src/$n" sparse-checkout set --no-cone "$@"
}
clone latex2e https://github.com/latex3/latex2e '/base/testfiles/' '/required/amsmath/testfiles/' '/required/graphics/testfiles/' '/support/'
clone latex3 https://github.com/latex3/latex3 '/l3kernel/testfiles/' '/texmf/tex/latex/l3build/regression-test.tex'
clone hyperref https://github.com/latex3/hyperref '/testfiles/'
copy() { # srcdir destname
  mkdir -p "$lvt/$2"
  for f in "$1"/*; do
    [ -f "$f" ] || continue
    case "$f" in *.tlg|*.pdf|*.png) continue ;; esac
    cp "$f" "$lvt/$2/"
  done
  echo "$2: $(ls "$lvt/$2"/*.lvt 2>/dev/null | wc -l | tr -d ' ') lvt, $(ls "$lvt/$2" | wc -l | tr -d ' ') files"
}
copy "$src/latex2e/base/testfiles" base
copy "$src/latex3/l3kernel/testfiles" l3kernel
copy "$src/latex2e/required/amsmath/testfiles" amsmath
copy "$src/latex2e/required/graphics/testfiles" graphics
copy "$src/hyperref/testfiles" hyperref
for p in base amsmath graphics; do cp "$src/latex2e/support/test2e.tex" "$src/latex2e/support/test209.tex" "$src/latex2e/support/regression-test.tex" "$lvt/$p/"; done # latex2e tests use their own support files
rt=$(find "$src/latex3" -name regression-test.tex | head -1)
[ -n "$rt" ] && cp "$rt" "$lvt/" && echo "regression-test.tex: $rt"
