# shellcheck shell=bash
# Sourced by the bun-standalone workflow scripts: one place that maps a release target to build.ts flags.
# AIDEV-NOTE: darwin is always cross-compiled from Linux (config.ts `darwinCross`: clang --target + the Apple SDK that
# scripts/build/macos-sdk.ts fetches + ld64.lld), the way .buildkite/ci.ts builds the release. Only --os/--arch tell
# build.ts the target, because the host's os/arch say nothing about it.

target_args() {
  case "$1" in
    linux-x64) echo "--os=linux --arch=x64 --abi=gnu" ;;
    linux-arm64) echo "--os=linux --arch=aarch64 --abi=gnu" ;;
    darwin-x64) echo "--os=darwin --arch=x64" ;;
    darwin-arm64) echo "--os=darwin --arch=aarch64" ;;
    *) echo "unknown target: $1" >&2; return 1 ;;
  esac
}

# Rust std for the triple, which the pinned nightly does not carry for a cross target.
target_rust() {
  case "$1" in
    darwin-x64) echo "x86_64-apple-darwin" ;;
    darwin-arm64) echo "aarch64-apple-darwin" ;;
    *) echo "" ;;
  esac
}

# ── levels ─────────────────────────────────────────────────────────────────────────────────────────────────────────
# The history of `slim` is three series on top of the upstream tag, told apart by their subjects (oldest first):
#   `tooling: ...`   A  README.BUN.md, workflow, actions, scripts, docs. No source: the tree at the end of A is upstream.
#   anything else    B  bun-standalone, oven-sh/bun#32262 as it is.
#   `slim: ...`      C  what bun-slim adds.
# Commits with `[skip ci]` in the subject (the size table the release job commits) are not code and are skipped.
# The level `orig` is the last A commit, `alone` the last B commit, `slim` the last non-skipped commit.
# AIDEV-NOTE: the tooling lives in A only (checked below), so resetting the tree to another level never rewrites the
# script that is running.

level_rev() {
  local level="$1" sha subject slim="" alone="" orig=""
  while IFS=$'\t' read -r sha subject; do
    [[ "$subject" == *"[skip ci]"* ]] && continue
    [[ -z "$slim" ]] && slim="$sha"
    if [[ -z "$alone" && "$subject" != slim:* ]]; then
      alone="$sha"
      [[ "$subject" == tooling:* ]] && { echo "no commits between the tooling and slim series" >&2; return 1; }
    fi
    if [[ -n "$alone" && "$subject" == tooling:* ]]; then
      orig="$sha"
      break
    fi
  done < <(git log --format='%H%x09%s' -n 400)
  [[ -n "$slim" && -n "$alone" && "$slim" != "$alone" && -n "$orig" ]] || {
    echo "cannot find the tooling, standalone and slim series in the last 400 commits" >&2
    return 1
  }
  if ! git diff --quiet "$orig" "$slim" -- .github/scripts/slim .github/actions/slim-toolchain scripts/slim; then
    echo "the tooling differs between the levels: change it in the tooling series" >&2
    return 1
  fi
  case "$level" in
    orig) echo "$orig" ;;
    alone) echo "$alone" ;;
    slim) echo "$slim" ;;
    *) echo "unknown level: $level" >&2; return 1 ;;
  esac
}

# Reset the tracked files to what the level has. Refuses when a tracked file has changes, which it would lose.
checkout_level() {
  local rev
  rev="$(level_rev "$1")"
  git diff --quiet HEAD || { echo "tracked files have changes: commit or stash them first" >&2; return 1; }
  git checkout -q --detach "$rev"
  git log --oneline -1
}

file_size() { wc -c < "$1" | tr -d ' '; }
