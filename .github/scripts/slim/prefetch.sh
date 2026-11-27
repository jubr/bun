#!/usr/bin/env bash
# Fill the dependency caches (vendor/ and ~/.bun/build-cache) for every target given, without compiling anything.
#
#   .github/scripts/slim/prefetch.sh darwin-arm64 darwin-x64 linux-x64
#
# Per target: configure only (this is also where the macOS SDK is extracted for a darwin target), then run exactly the
# ninja edges that download: `dep_fetch` (a dependency's source, stamp `.ref`) and `dep_fetch_prebuilt` (WebKit and the
# Node headers, stamp `.identity`). No --standalone: nothing that is downloaded depends on it, and the default branch
# (where the scheduled run happens) does not have the flag.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

for target in "$@"; do
  echo "::group::prefetch $target"
  dir="build/prefetch-$target"
  # shellcheck disable=SC2046
  bun scripts/build.ts --profile=release $(target_args "$target") --build-dir="$dir" --configure-only
  ninja -C "$dir" -t targets all |
    sed -n 's/^\(.*\): dep_fetch\(_prebuilt\)\{0,1\}$/\1/p' |
    grep -E '/\.(ref|identity)$' | sort -u > "$dir/fetch-targets.txt"
  echo "$(wc -l < "$dir/fetch-targets.txt") fetch edges"
  xargs ninja -C "$dir" < "$dir/fetch-targets.txt"
  rm -rf "$dir"
  echo "::endgroup::"
done
du -sh vendor "$HOME/.bun/build-cache" 2>/dev/null || true
