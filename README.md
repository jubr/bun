# bun-slim

A long-running **patch repository** next to [oven-sh/bun](https://github.com/oven-sh/bun). It builds and publishes two
smaller Bun runtimes, meant as the executable that `bun build --compile --compile-executable-path` embeds:

- **`bun-alone`**: Bun's `bun-standalone`, the runtime with the toolkit compiled out (no bundler, package manager or
  test runner), built for size. See [docs/slim/bun-standalone.md](docs/slim/bun-standalone.md) and
  [docs/slim/compiler.md](docs/slim/compiler.md).
- **`bun-slim`**: `bun-alone` with more trimmed (`Bun.Image` and `bun:ffi` stubbed). It may not be suited for everyday use.
  See [docs/slim/bun-slim.md](docs/slim/bun-slim.md).

<!-- slim-sizes:start -->
_No release yet: the size table appears here with the first one._
<!-- slim-sizes:end -->

Nothing here replaces Bun. If you want Bun, use [oven-sh/bun](https://github.com/oven-sh/bun) (its README is [README.BUN.md](README.BUN.md)).

## Why this repo exists

The standalone binary is a change to Bun itself, not an add-on: it touches the build system, the CLI dispatch and the
runtime's feature gates. Upstream's CI builds and releases on its own infrastructure (Buildkite, S3, npm), none of which
a fork has. So this repo does two things:

1. keeps the patch set (the `slim` branch) applicable to current Bun, and
2. builds and releases it from GitHub Actions on free Linux runners.

It is a fork on purpose, not a rewrite: every difference from upstream should be visible, small, and easy to carry
forward.

## How it is organised

| Branch | What it is |
| --- | --- |
| `main` | A mirror of `oven-sh/bun` `main`. Never receives patches. Fast-forward only, synced regularly. |
| `bun-vX.Y.Z` | One per upstream release the patch set has sat on (`bun-v1.4.5`): the upstream tag, as a branch. Never receives patches. |
| `slim` | The default branch. Three series of commits on top of the newest `bun-vX.Y.Z` tag (below). |

Pull request [`slim` → `bun-v1.4.5`](https://github.com/jubr/bun-slim/pulls?q=is%3Apr+is%3Aopen+head%3Aslim) is a **permanent draft** and
never merges (a check fails on it by design). It exists to show the whole patch set against the upstream release it sits
on in one diff, at any time. Its base is the branch named like the tag, so the diff is exactly the patch set; a sync to a
newer release points the PR at the new `bun-vX.Y.Z` branch.

### What `slim` is made of

`slim` is the upstream tag plus three series of commits, oldest first. The series are told apart by the commit subject:

| Series | Subjects | Content |
| --- | --- | --- |
| **A** tooling | `tooling: ...` | `README.BUN.md` (upstream's README) and this `README.md`, `mise.toml`, the workflow, the actions, the scripts, the docs, the maintainer skill. No source: the tree at the end of A is upstream, so A is also the **orig** build. |
| **B** bun-standalone | as upstream wrote them, and one `build: ...` | [oven-sh/bun#32262](https://github.com/oven-sh/bun/pull/32262) as it is, cherry-picked, plus one commit: `-Oz` instead of `-Os` for `MinSizeRel`, because the `-Os` build does not link on LLVM 23.1.5. The **alone** build. |
| **C** slim | `slim: ...` | What `bun-slim` adds: Rust `opt-level=z`, `Bun.Image` and `bun:ffi` stubbed: the **slim** build. |

Commits with `[skip ci]` in the subject (the size table the release job commits) are not part of a series. The tooling
lives in A only: a build resets the tree to the end of a series, and must not rewrite the script it runs. A fix to the
tooling is therefore a `fixup` into the right A commit (`git commit --fixup`, `git rebase -i --autosquash`), a fix to B or C
a fixup into theirs; `slim` is a rebased branch, force-pushed. `.github/scripts/slim/lib.sh` (`level_rev`) finds the ends
of the series, and refuses a history where they cannot be told apart or where the tooling differs between them.

Files of ours that do not belong to the source: scripts in `scripts/slim/`, documentation in `docs/slim/`, the maintainer
skill in `.claude/skills/maintaining-slim-patchsets/`, workflows and actions that start with `slim-`, CI scripts in
`.github/scripts/slim/`.

### Keeping up with upstream

```sh
bun scripts/slim/sync-from-upstream.ts [--dry-run] [--push]
```

1. syncs `main` from `oven-sh/bun` `main` (`gh repo sync`, fast-forward only),
2. looks up the newest upstream `bun-vX.Y.Z` tag and **stops when it is not newer** than the one `slim` sits on,
3. replicates that tag and its commits in this repository (a tag ref created through the API: no upload, and no workflow
   listens to tags, so no build starts), plus a branch `bun-vX.Y.Z` at the tag (the base of the draft PR),
4. rebases `slim` onto the tag (`git rebase -i --onto`): series A, B and C are replayed as they are (conflicts are resolved
   like any rebase conflict, then run again with `--continue`); `README.BUN.md` is refreshed from the tag; the old tip stays as
   `slim-on-<old tag>`,
5. with `--push`, force-pushes `slim` (`--force-with-lease`) and points the draft PR at the new `bun-vX.Y.Z` branch. Not by
   default: a push to `slim` can start the build.

`slim` is rewritten by this, so do not base work on it; open a pull request against it. The maintainer skill
([`.claude/skills/maintaining-slim-patchsets/SKILL.md`](.claude/skills/maintaining-slim-patchsets/SKILL.md)) has the details.

### Builds and releases

[`slim-build.yaml`](.github/workflows/slim-build.yaml) builds four targets on GitHub's free Linux runners:
`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`. macOS is **cross-compiled from Linux** (clang `--target`, Apple's
SDK fetched at configure time, `ld64.lld`), as upstream does for its own release, so no macOS runner is needed.

- A `prep` job saves one cache of everything the build downloads (dependency sources, WebKit, Node headers, the macOS
  SDK). Caches are only readable from the same ref and the default branch, so `prep` runs on `slim` and the schedule.
- Each target builds **three levels in succession**; before each, the tree is reset to the end of its series
  (`.github/scripts/slim/compile.sh`):
  1. **orig**, end of A: upstream as the tag has it, a stock release build, without ccache. Only its size is the point of this
     build; it is cached by the commit it was built from, so it is rebuilt only when the base or the tooling changes. If it
     fails, the shipped builds are unaffected and the table shows a dash.
  2. **alone**, end of B: shipped as `bun-alone-<target>-v<version>-<N>`.
  3. **slim**, end of C: shipped as `bun-slim-<target>-v<version>-<N>`. It reuses the build directory (and ccache) of alone,
     so only what C changes recompiles.
  The size table comes from the artifacts of the run itself.
- Each shipped binary is verified. Linux binaries are run (smoke test). macOS binaries cannot run on Linux, so they get
  static checks only: Mach-O format and architecture, the minimum macOS version, and that nothing is linked outside
  `/usr/lib` and `/System/Library`.
- Run the workflow with `release` set to publish a **prerelease** tagged `bun-slim-v<version>-<N>`: `<version>` is Bun's
  version at the base tag and `<N>` the next free build number for it (`bun-slim-v1.4.5-0`, `bun-slim-v1.4.5-1`, ...).
  Its notes say why the two versions exist and hold the size table; the same table is committed to the top of this README
  (`[skip ci]`).

Upstream's own [Release workflow](.github/workflows/release.yml) is not reused: it signs, uploads to S3, publishes to npm
and Homebrew, and only runs in the `oven-sh` organisation.

---

[Bun's README](README.BUN.md)
