#!/usr/bin/env bash
# Build one level of Bun for one target.
#
#   .github/scripts/slim/compile.sh <orig|alone|slim> <target>
#
# The levels are commits of the `slim` branch (see lib.sh `level_rev`): the tree is reset to the level first.
# orig   the end of the tooling series: upstream Bun as the tag has it, stock release build.
# alone  the end of the bun-standalone series (oven-sh/bun#32262 as it is): --standalone=on, MinSizeRel.
# slim   the end of the slim series: alone plus what bun-slim trims.
#
# Output (relative to the repository root): out/<level>/bun-<level>
# alone and slim share build/release-standalone, so the second one only recompiles what the slim series changed.
# The working tree is put back where it was when the script ends.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

level="$1"
target="$2"

start="$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)"
trap 'git checkout -q "$start"' EXIT

echo "::group::reset to $level"
checkout_level "$level"
echo "::endgroup::"

bun install --frozen-lockfile

case "$level" in
  orig)
    # No ccache: no object of this build is shared with alone/slim (other flags).
    export CCACHE_DISABLE=1
    dir=build/release-orig
    exe="$dir/bun"
    flags=()
    ;;
  alone | slim)
    dir=build/release-standalone
    exe="$dir/bun-standalone"
    flags=(--standalone=on --build-type=MinSizeRel)
    ;;
  *) echo "unknown level: $level" >&2; exit 1 ;;
esac

# shellcheck disable=SC2046  # target_args is several flags
bun scripts/build.ts --profile=release "${flags[@]}" $(target_args "$target") --build-dir="$dir"
ccache --show-stats || true

test -x "$exe"
echo "$level $target: $(file_size "$exe") bytes"

mkdir -p "out/$level"
cp "$exe" "out/$level/bun-$level"
