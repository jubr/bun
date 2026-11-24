#!/usr/bin/env bun
/**
 * markdownify-sizes: turn the per-target size files of a build into the release notes and the README table.
 *
 *   bun scripts/slim/markdownify-sizes.ts --sizes DIR --version 1.4.5 --n 0 --notes notes.md [--readme README.md]
 *
 * DIR holds one sizes-<target>.json per target: {"target": "linux-x64", "orig": N, "alone": N, "slim": N} (bytes of the
 * stripped executable). `--readme` rewrites what sits between the two markers near the top of that file.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const need = (name: string) => arg(name) ?? (console.error(`markdownify-sizes: ${name} is required`), process.exit(1));

const dir = need("--sizes");
const version = need("--version");
const n = need("--n");
const tag = `bun-slim-v${version}-${n}`;
const repo = process.env.GITHUB_REPOSITORY ?? "jubr/bun-slim";
const doc = (name: string) => `https://github.com/${repo}/blob/slim/docs/slim/${name}`;
const ORDER = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"];

// orig is null when the build of upstream Bun failed: the table then shows a dash.
type Row = { target: string; orig: number | null; alone: number; slim: number };
const rows: Row[] = readdirSync(dir)
  .filter(f => /^sizes-.*\.json$/.test(f))
  .map(f => JSON.parse(readFileSync(join(dir, f), "utf8")) as Row)
  .sort((a, b) => ORDER.indexOf(a.target) - ORDER.indexOf(b.target));
if (rows.length === 0) {
  console.error(`markdownify-sizes: no sizes-*.json in ${dir}`);
  process.exit(1);
}

const mib = (b: number) => `${(b / 1048576).toFixed(1)} MiB`;
const delta = (b: number, orig: number | null) => (orig ? `${(((b - orig) / orig) * 100).toFixed(1)}%` : "-");
const table = [
  "| Target | Upstream Bun | `bun-alone` | vs. upstream | `bun-slim` | vs. upstream |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map(
    r =>
      `| ${r.target} | ${r.orig ? mib(r.orig) : "-"} | ${mib(r.alone)} | ${delta(r.alone, r.orig)} | ${mib(r.slim)} | ${delta(r.slim, r.orig)} |`,
  ),
].join("\n");

const notes = `bun-slim ${version}, build ${n}: two smaller Bun runtimes, built from Bun ${version} on GitHub's free Linux runners.

- **\`bun-alone\`** is \`bun-standalone\` ([oven-sh/bun#32262](https://github.com/oven-sh/bun/pull/32262), as it is): the bundler, package manager and test runner are compiled out. It is the runtime that \`bun build --compile --compile-executable-path\` embeds.
- **\`bun-slim\`** is \`bun-alone\` with more trimmed: the C++ and Rust code is optimised harder for size, and \`Bun.Image\` and \`bun:ffi\` are stubbed. It may not suit everyday use.

Why: a \`--compile\`d program only needs to run JavaScript, so everything that builds, installs or tests it is dead weight. Details: [bun-standalone](${doc("bun-standalone.md")}), [bun-slim](${doc("bun-slim.md")}), [compiler options](${doc("compiler.md")}).

Size of the stripped executable. "Upstream Bun" is the same source built unpatched as a stock release build.

${table}

Each zip holds one executable (\`bun-alone\` or \`bun-slim\`); \`SHA256SUMS\` lists the sums. darwin builds are cross-compiled from Linux and were only checked statically.
`;
writeFileSync(need("--notes"), notes);

const readme = arg("--readme");
if (readme) {
  const start = "<!-- slim-sizes:start -->";
  const end = "<!-- slim-sizes:end -->";
  const text = readFileSync(readme, "utf8");
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) {
    console.error(`markdownify-sizes: ${readme} lacks the ${start} / ${end} markers`);
    process.exit(1);
  }
  const block = `${start}\n**Latest build: [${tag}](https://github.com/${repo}/releases/tag/${tag})** (size of the stripped executable)\n\n${table}\n${end}`;
  writeFileSync(readme, text.slice(0, a) + block + text.slice(b + end.length));
}
console.log(table);
