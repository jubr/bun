---
name: maintaining-slim-patchsets
description: Maintain the bun-slim patch set - the tooling / bun-standalone / slim commit series, rebasing them onto a new upstream Bun tag, the three-level CI build (orig, alone, slim), releases and the size table. Use when changing source for bun-alone or bun-slim, syncing with upstream, changing the build workflow or cutting a release.
---

# Maintaining the bun-slim patch set

This repository (`jubr/bun-slim`) is a long-running patch repository next to `oven-sh/bun`. It builds two smaller runtimes:

- **bun-alone** = Bun's `bun-standalone` (bundler, package manager, test runner compiled out; PR oven-sh/bun#32262), as the PR has it, built MinSizeRel with C++ `-Oz` (one commit after the PR: the PR's `-Os` does not link on LLVM 23.1.5).
- **bun-slim** = bun-alone plus Rust `opt-level=z` and `Bun.Image` and `bun:ffi` stubbed.

Read `README.md` for the why. Docs of the result: `docs/slim/bun-standalone.md`, `docs/slim/bun-slim.md`, `docs/slim/compiler.md`.

## Branches

- `main`: mirror of `oven-sh/bun` `main`. Never patched. Fast-forward only.
- `bun-vX.Y.Z`: the upstream tag as a branch (today `bun-v1.4.5`), one per release the patch set has sat on. Never patched.
- `slim`: default branch. The three series (below) on top of one **upstream tag** (the base). The permanent draft PR
  `slim` -> `bun-vX.Y.Z` (base = the branch of the tag `slim` sits on, so the diff is exactly the patch set) shows it; a check
  (`slim-do-not-merge`, bases `main` and `bun-v*`) fails on it on purpose. `sync-from-upstream.ts` creates the branch and, with
  `--push`, retargets the PR (`gh pr edit <n> --base bun-vX.Y.Z`).
- `slim` is a **rebased** branch: history is rewritten and force-pushed (`--force-with-lease`).
- Do not push to `slim` casually: a push that touches the workflow, `.github/scripts/slim/*`, `.github/actions/slim-*` or
  `scripts/slim/*.ts` starts a full build (hours). Say so before pushing.

## The three series

Oldest first on top of the tag; the subject tells them apart:

| Series | Subject | Content |
| --- | --- | --- |
| A tooling | `tooling: ...` | `README.BUN.md` (upstream README, a copy) + our `README.md`, `mise.toml`, workflow, actions, `.github/scripts/slim/`, `scripts/slim/`, `docs/slim/`, this skill. **No source**: the tree at the end of A is upstream -> the **orig** build. |
| B bun-standalone | the PR's own subjects, and `build: ...` | oven-sh/bun#32262 cherry-picked as it is, plus `build: smol uses -Oz instead of -Os` -> the **alone** build. |
| C slim | `slim: ...` | Rust `opt-level=z`, Image stub, ffi stub -> the **slim** build. |

Commits with `[skip ci]` (the size table, committed by the release job) belong to no series; they sit on top.

Rules:

- The levels are found by `.github/scripts/slim/lib.sh` `level_rev orig|alone|slim`: orig = newest `tooling:` commit, alone = newest
  commit that is neither `slim:` nor `[skip ci]`, slim = newest non-`[skip ci]` commit. It fails when a series is missing or when
  `.github/scripts/slim`, `.github/actions/slim-toolchain` or `scripts/slim` differ between the ends of A and C.
- **Tooling lives in A only.** Reason: a build resets the tree to a level (`git checkout --detach`) while its script runs; a tooling
  file that differs between levels would be rewritten under it. Change tooling with a fixup into the right A commit.
- B is the PR as-is: do not edit those commits (a rebase onto a new tag only replays them). Changes to bun-alone beyond the PR
  go into C (that makes them bun-slim) or are a deliberate new decision.
- Source changes for bun-slim: a new `slim: ...` commit (or a fixup into an existing one).
- Not source (workflows, CI scripts, docs, toolchain action) starts with `slim-` or sits in a `slim/` directory.

### Editing

```sh
git commit --fixup <commit>                      # change that belongs to an earlier commit of a series
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base tag>
```

`/git-scripted-rebase` does the same for reorders and splits. After rewriting: `bash -c 'source .github/scripts/slim/lib.sh;
level_rev orig; level_rev alone; level_rev slim'` must print three different commits.

## Updating to a new upstream tag: `scripts/slim/sync-from-upstream.ts`

```sh
bun scripts/slim/sync-from-upstream.ts --dry-run   # what it would do
bun scripts/slim/sync-from-upstream.ts             # main sync, tag lookup, tag replication, slim rebase (no push)
bun scripts/slim/sync-from-upstream.ts --continue --tag bun-vX.Y.Z   # after resolving rebase conflicts
bun scripts/slim/sync-from-upstream.ts --push      # also git push --force-with-lease origin slim + retarget the draft PR
```

1. `gh repo sync` fast-forwards `main` from `oven-sh/bun` `main`; fetch; `main` is moved locally.
2. The newest `bun-vX.Y.Z` tag on upstream (`git ls-remote`, semver order). The tag `slim` sits on comes from
   `git describe`. Not newer: stop.
3. The tag is replicated here with a ref created through the GitHub API (forks share objects, nothing is uploaded; fallback:
   fetch + `git push origin <tag>`). No workflow listens to tags, so no build starts. Upstream release tags are not on
   `main` (they sit on a release commit), which is why the tag, not `main`, is the base. A branch `bun-vX.Y.Z` is created at the
   tag too (the base of the draft PR); `--push` retargets the PR after force-pushing `slim`.
4. `git rebase -i --onto <tag> <old tag> slim` with the `[skip ci]` commits dropped. The old tip is the branch `slim-on-<old tag>`.
   `README.md` never conflicts (a merge driver for the rebase takes our version; upstream's goes to `README.BUN.md`). Any other
   conflict: resolve like any rebase conflict, `git add`, `git rebase --continue`, then `--continue --tag ...` of the script.
5. `README.BUN.md` is made equal to the tag's `README.md` (a fixup into the `tooling: README...` commit, autosquashed), and
   `level_rev` is run as a check.
6. Update the base tag mentioned in README/this file, build all four targets (`slim-build`), release.

Do not push without being asked.

## CI: `.github/workflows/slim-build.yaml`

Jobs: `prep` -> `plan` -> `build` (matrix of 4) -> `release` (on request).

- **prep** (per host arch; x64 host also covers darwin cross targets): installs the toolchain, runs `slim/prefetch.sh` (only the
  ninja `dep_fetch*` edges), saves one deps cache. Runs on `slim`, the schedule (`17 4 */5 * *`, keeps the cache alive) and on request.
  Caches are readable only from their ref and the default branch, hence "prep on the default branch".
- **plan**: `version` = `package.json` version, `n` = next free build number from existing `bun-slim-v<version>-*` tags.
  Artifact names are `bun-alone-<target>-v<version>-<n>`, `bun-slim-<target>-v<version>-<n>` (`target` = `linux-x64`, `linux-arm64`,
  `darwin-x64`, `darwin-arm64`).
- **build** (per target; checkout `fetch-depth: 400` so `level_rev` sees the series), three levels in succession through
  `.github/scripts/slim/compile.sh <level> <target>`, which first runs `checkout_level` (`git checkout --detach` of the level's
  commit; refuses tracked changes) and puts the tree back at the end:
  1. `orig` (`continue-on-error`: a failure loses nothing shipped, the table shows `-`): stock `--profile=release`, `build/release-orig`, `CCACHE_DISABLE=1`.
  2. `alone`: `--standalone=on --build-type=MinSizeRel`, `build/release-standalone` -> `out/alone/bun-alone`.
  3. `slim`: same flags, **same build dir** (only what C changed recompiles) -> `out/slim/bun-slim`.
  Each has a restore step and a save step right after its compile (a later failure keeps finished builds), cache of the finished
  binary. Keys are all made in `Levels and cache keys`, printed, and
  passed on as outputs (`build_deps`, `runtime_orig|alone|slim`, `ccache`, `ccache_prefix`); a hash is cut to 10 characters behind
  a name of capitals (`DEP`, `GIT` = the run's commit, `END` = end of a series). orig = `slim-runtime-orig-<target>-v<version>` (only a
  new Bun version rebuilds it); alone = `slim-runtime-alone-<target>-GIT<sha>-END<B end>`; slim likewise with the C end (the commit
  forces a rebuild; the shared ccache makes that cheap).
  ccache: one per target, **shared by alone and slim**, restored by prefix, `CCACHE_MAXSIZE=1500M`, saved with `if: always()`
  (failed, cancelled and timed-out builds still seed the next run; each build step has `timeout-minutes: 120`). Then verify
  (`slim/verify.sh <target> <exe> alone|slim`), package `bun-<level>-<target>-v<version>-<n>.zip` + `.sha256`, write
  `sizes-<target>.json` (`orig`, `alone`, `slim` bytes; orig `null` when absent), upload three artifacts. Job `timeout-minutes: 340`.
  The size table is made from the artifacts of the run only (nothing is persisted in git).
- **release** (`workflow_dispatch` input `release`): downloads the artifacts, `scripts/slim/markdownify-sizes.ts` writes the release notes (why +
  size table) and rewrites the table between `<!-- slim-sizes:start -->` / `<!-- slim-sizes:end -->` at the top of `README.md`,
  `gh release create bun-slim-v<version>-<n> --prerelease`, then (on `slim`) commits the README with `[skip ci]` and pushes.
  The release also has `bun-dist-standalone-slim-sizes.json` (`markdownify-sizes.ts --json`: `{tag, version, n, targets: {<target>: {orig, alone, slim}}}`).
- **packslip** (`.github/workflows/slim-packslip.yaml`, reusable + dispatchable with `tag`; slim-build calls it after `release`): downloads the
  eight zips and the sizes json from the release, writes a `release.toml` (platform, variant `alone`|`slim` and `bin` per zip; extension
  `github.com/jubr/bun-slim` with `"bun-upstream-<target>-v<version>-size" = <orig bytes>` for every target with an orig size), signs with
  `jdx/packslip` (job without `contents: write`), and the next job uploads `packslip.sigstore.json`. `artifacts[].size` is the zip size.
  Only on `slim`. Check a manifest locally with a release binary of packslip: `packslip keygen --out k`, then `packslip create ... --manifest
  release.toml --key k --no-log -- dist/*.zip` and `packslip show`.
- darwin is cross-compiled from Linux (`darwinCross` in `scripts/build/config.ts`: clang `--target`, Apple SDK fetched by
  `scripts/build/macos-sdk.ts`, `ld64.lld`); the binary cannot run, so verify is static (`file`, `llvm-objdump` minos/sdk/dylibs).
- Upstream's `release.yml` is not used (signs, S3, npm, only in the `oven-sh` org).
- Concurrency: `slim-build-<ref>` (no cancel) and `slim-release`.

### Verify (`slim/verify.sh`)

linux (run natively): `--version` has `-standalone`, `-e`, node:crypto, Bun.serve + fetch, script file, `build`/`install`/`test` refused,
`bun build --compile --compile-executable-path`. alone: `typeof Bun.Image === "function"` and `bun:ffi` loads. slim: `Bun.Image` is
`undefined`, `bun:ffi` `dlopen` throws "not available". darwin: Mach-O of the right arch, only `/usr/lib` and `/System/Library`
dylibs, `-standalone` in the strings.

## Local build and test

All commands through mise: `cd <repo> && eval "$(mise hook-env -s bash; set -x)"`. `mise.toml` (committed in A) takes the bootstrap
`bun` from `LATEST` and has the macOS toolchain.

Try a change in a **throwaway clone** (`git clone <repo> /tmp/x && cd /tmp/x`), where the level resets cannot touch your work:

```sh
.github/scripts/slim/compile.sh orig darwin-arm64    # out/orig/bun-orig
.github/scripts/slim/compile.sh alone darwin-arm64   # out/alone/bun-alone
.github/scripts/slim/compile.sh slim darwin-arm64    # out/slim/bun-slim
```

(a native build: use the target of the host; `ccache` and `~/.bun/build-cache` are shared with other clones.) `compile.sh` refuses a
tree with tracked changes. Compare sizes with `wc -c`.

## Release checklist

1. `level_rev` prints three different commits; the history has the three series.
2. Push to `slim` (starts a build), wait for green, or dispatch the workflow with `release=true`.
3. The release is a prerelease `bun-slim-v<version>-<n>` with eight zips + `SHA256SUMS`; notes carry the explanation and the table.
4. Never merge the draft PR; a human owns every other merge.
