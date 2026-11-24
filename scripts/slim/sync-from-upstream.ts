#!/usr/bin/env bun
/**
 * sync-from-upstream: bring this patch repository up to the newest upstream Bun release. Run from the
 * maintaining-slim-patchsets skill (.claude/skills/maintaining-slim-patchsets/SKILL.md).
 *
 *   bun scripts/slim/sync-from-upstream.ts [--dry-run] [--push] [--tag bun-vX.Y.Z] [--continue] [--no-sync]
 *
 * 1. `main` is synced from upstream `main` (GitHub's fork sync: fast-forward only) and fetched.
 * 2. The newest `bun-vX.Y.Z` tag on upstream is looked up. Not newer than the tag `slim` sits on: stop.
 * 3. That tag (and the commits it points at) is replicated in this repository. A tag ref created through the API
 *    shares the fork network's objects, so nothing is uploaded; no workflow listens to tags, so no build starts.
 *    `git push origin <tag>` is the fallback. A branch with the tag's name (`bun-vX.Y.Z`, at the tag) is created too:
 *    it is the base of the permanent draft PR, so the PR shows the patch set against exactly that upstream release.
 * 4. `slim` is rebased onto the tag with `git rebase -i --onto <tag> <old tag> slim`: the tooling, standalone and slim series
 *    are replayed commit by commit (see README.md); the commits with `[skip ci]` (size tables) are dropped. The old tip
 *    stays as `slim-on-<old tag>`. README.BUN.md is refreshed from the tag (fixup into its tooling commit).
 *    A conflict stops the script: resolve it like any rebase conflict, `git rebase --continue`, then run again with --continue.
 * 5. `--push` force-pushes `slim` (--force-with-lease) and points the draft PR `slim` -> bun-vX.Y.Z at the new branch. That
 *    push can start the slim build, so it is opt-in.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => args[args.indexOf(n) + 1];
const dry = flag("--dry-run");

const out = (cmd: string, a: string[], allowFail = false): string => {
  try {
    return execFileSync(cmd, a, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (allowFail) return "";
    throw e;
  }
};
const run = (cmd: string, a: string[], opts: { mutates?: boolean; allowFail?: boolean } = {}): number => {
  console.log(`$ ${cmd} ${a.join(" ")}`);
  if (dry && opts.mutates !== false) return 0;
  const r = spawnSync(cmd, a, { stdio: "inherit" });
  if (r.status !== 0 && !opts.allowFail) die(`${cmd} ${a[0]} failed`);
  return r.status ?? 1;
};
const git = (...a: string[]) => out("git", a);
const die = (m: string): never => {
  console.error(`sync-from-upstream: ${m}`);
  process.exit(1);
};

const semver = (tag: string) => tag.replace(/^bun-v/, "").split(".").map(Number);
const cmp = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

const repo = git("remote", "get-url", "origin").replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "").replace(/\.git$/, "");
const cont = flag("--continue");
// --no-sync: only the rebase (steps 4 and 5). For tests and for a tag that is already replicated.
const noSync = flag("--no-sync") || cont;

if (!cont && git("status", "--porcelain", "--untracked-files=no")) die("the working tree has changes; commit or stash them first");

// ── 1. main ────────────────────────────────────────────────────────────────────────────────────────────────────────
if (!noSync) {
  console.log("== 1. main from upstream main");
  run("gh", ["repo", "sync", repo, "--branch", "main"]);
  run("git", ["fetch", "origin", "main", "--no-tags"]);
  if (git("branch", "--show-current") !== "main") run("git", ["branch", "-f", "main", "origin/main"]);
}

// ── 2. the newest upstream tag ─────────────────────────────────────────────────────────────────────────────────────
console.log("== 2. newest upstream tag");
const listing = out("git", ["ls-remote", "--tags", "--refs", "upstream", "bun-v*"])
  .split("\n")
  .map(l => l.split(/\s+/))
  .filter(([, ref]) => /^refs\/tags\/bun-v\d+\.\d+\.\d+$/.test(ref ?? ""))
  .map(([sha, ref]) => ({ sha, tag: ref.slice("refs/tags/".length) }))
  .sort((a, b) => cmp(a.tag, b.tag));
const newest = flag("--tag") ? (listing.find(t => t.tag === opt("--tag")) ?? die(`no upstream tag ${opt("--tag")}`)) : listing.at(-1)!;
const base = out("git", ["describe", "--tags", "--abbrev=0", "--match", "bun-v[0-9]*", "slim"], true) || die("cannot tell which tag slim sits on");
console.log(`slim sits on ${base}; upstream's newest is ${newest.tag} (${newest.sha.slice(0, 10)})`);
if (!noSync && !flag("--tag") && cmp(newest.tag, base) <= 0) {
  console.log("no newer tag: nothing to do");
  process.exit(0);
}
const tag = newest.tag;

// ── 3. replicate the tag ───────────────────────────────────────────────────────────────────────────────────────────
if (!noSync) {
  console.log(`== 3. replicate ${tag} in ${repo}`);
  const have = out("gh", ["api", `repos/${repo}/git/ref/tags/${tag}`, "--jq", ".object.sha"], true);
  if (have === newest.sha) console.log("already there");
  else {
    const rc = run("gh", ["api", "-X", "POST", `repos/${repo}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${newest.sha}`], {
      allowFail: true,
    });
    if (rc !== 0) {
      run("git", ["fetch", "upstream", `refs/tags/${tag}:refs/tags/${tag}`, "--no-tags"]);
      run("git", ["push", "origin", `refs/tags/${tag}`]);
    }
  }
  // The branch named like the tag: the base of the permanent draft PR.
  if (!out("gh", ["api", `repos/${repo}/git/ref/heads/${tag}`, "--jq", ".object.sha"], true)) {
    run("gh", ["api", "-X", "POST", `repos/${repo}/git/refs`, "-f", `ref=refs/heads/${tag}`, "-f", `sha=${newest.sha}`]);
  }
  if (!out("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], true)) {
    run("git", ["fetch", "upstream", `refs/tags/${tag}:refs/tags/${tag}`, "--no-tags", "--depth=1"], { mutates: false });
  }
}
if (dry) {
  console.log(`dry run: would now rebase slim from ${base} onto ${tag}`);
  process.exit(0);
}

// ── 4. rebase slim onto the tag ────────────────────────────────────────────────────────────────────────────────────
console.log(`== 4. rebase slim onto ${tag}`);
const backup = `slim-on-${base}`;
if (!cont) {
  if (git("branch", "--show-current") !== "slim") run("git", ["checkout", "slim"]);
  run("git", ["branch", "-f", backup, "HEAD"]);
  // The commits the release job added to slim (size table, `[skip ci]`) are not part of the patch set: the next build makes new ones.
  const editor = `f() { grep -v -F '[skip ci]' "$1" > "$1.new"; mv "$1.new" "$1"; }; f`;
  // README.md is ours (upstream's goes to README.BUN.md below): when both sides changed it, take the commit's version
  // instead of a conflict. A merge driver that copies "theirs" (%B, the commit being replayed) over the result.
  const attrs = join(mkdtempSync(join(tmpdir(), "slim-attrs-")), "attributes");
  writeFileSync(attrs, "/README.md merge=slimreadme\n");
  const rc = spawnSync("git", ["-c", `core.attributesFile=${attrs}`, "-c", "merge.slimreadme.driver=cp %B %A", "rebase", "-i", "--onto", tag, base, "slim"], {
    stdio: "inherit",
    env: { ...process.env, GIT_SEQUENCE_EDITOR: editor },
  }).status;
  if (rc !== 0) {
    die(
      `conflicts. Resolve them like any rebase conflict (README.md never conflicts: ours wins), ` +
        `\`git add\`, \`git rebase --continue\`, then: bun scripts/slim/sync-from-upstream.ts --continue --tag ${tag}`,
    );
  }
}
if (existsSync(join(git("rev-parse", "--git-dir"), "rebase-merge"))) die("a rebase is still in progress: finish it first");

// README.BUN.md is upstream's README at the base. The tooling commit that created it is fixed up in place.
const upstreamReadme = execFileSync("git", ["show", `${tag}:README.md`], { maxBuffer: 1 << 28 });
if (!readFileSync("README.BUN.md").equals(upstreamReadme)) {
  const readmeCommit = git("log", "--format=%H", "--grep", "^tooling: README", `${tag}..HEAD`).split("\n").at(-1);
  if (!readmeCommit) die("no `tooling: README...` commit to carry README.BUN.md");
  writeFileSync("README.BUN.md", upstreamReadme);
  run("git", ["commit", "-q", "--fixup", readmeCommit, "--", "README.BUN.md"]);
  const rc = spawnSync("git", ["rebase", "-i", "--autosquash", tag], { stdio: "inherit", env: { ...process.env, GIT_SEQUENCE_EDITOR: "true" } }).status;
  if (rc !== 0) die("could not fold README.BUN.md into its commit");
}

// The three series must still be found, and the tooling must be the same in all of them.
run("bash", ["-c", "source .github/scripts/slim/lib.sh && level_rev orig && level_rev alone && level_rev slim"], { mutates: false });
console.log(`slim is on ${tag}; the old tip is ${backup}.`);

// ── 5. push ────────────────────────────────────────────────────────────────────────────────────────────────────────
const retarget = () => {
  const pr = out("gh", ["pr", "list", "--repo", repo, "--head", "slim", "--state", "open", "--json", "number", "--jq", ".[0].number"], true);
  if (!pr) return console.log(`no open PR from slim: point it at ${tag} by hand`);
  run("gh", ["pr", "edit", pr, "--repo", repo, "--base", tag, "--title", `slim -> ${tag}: the patch set (permanent draft, never merge)`]);
};
if (flag("--push")) {
  run("git", ["push", "--force-with-lease", "origin", "slim"]);
  retarget();
} else {
  console.log("not pushed (a push to slim can start the build): git push --force-with-lease origin slim");
  console.log(`then point the draft PR at the new base: gh pr edit <number> --base ${tag}`);
}
