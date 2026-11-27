#!/usr/bin/env bash
# Check a finished bun-alone or bun-slim binary.
#
#   .github/scripts/slim/verify.sh <target> <path-to-binary> <alone|slim>
#
# linux-*: the binary is native on this runner, so it is run (the smoke test).
# darwin-*: it cannot run here, so only what can be read from the file is checked: format, arch, minimum macOS and that
# it links nothing but system libraries.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

target="$1"
exe="$(realpath "$2")"
level="${3:?alone or slim}"
test -f "$exe"
ls -l "$exe"

case "$target" in
  darwin-*)
    want="x86_64"
    [[ "$target" == darwin-arm64 ]] && want="arm64"
    echo "--- file"
    file "$exe" | tee /tmp/file.txt
    # file(1) words it two ways: "Mach-O 64-bit x86_64 executable, flags:..." (Linux) and "Mach-O 64-bit executable x86_64" (macOS).
    grep -Eq "Mach-O 64-bit ($want executable|executable $want)" /tmp/file.txt
    echo "--- load commands"
    llvm-objdump --macho --private-headers "$exe" > /tmp/headers.txt
    grep -E "minos|sdk" /tmp/headers.txt | sort -u
    echo "--- linked libraries"
    llvm-objdump --macho --dylibs-used "$exe" | tail -n +2 | sed 's/^[[:space:]]*//; s/ (.*//' | sort -u | tee /tmp/dylibs.txt
    if grep -v -E '^(/usr/lib/|/System/Library/)' /tmp/dylibs.txt; then
      echo "bun-$level links a library outside /usr/lib and /System/Library" >&2
      exit 1
    fi
    echo "--- version string"
    # Not `grep -q`: it would close the pipe on `strings` early, and pipefail turns that into a failure.
    test "$(strings -a "$exe" | grep -c -- "-standalone")" -gt 0
    ;;

  linux-*)
    tmp="$(mktemp -d)"
    cd "$tmp"

    echo "--- version names the standalone variant"
    "$exe" --version | tee version.txt
    grep -q -- "-standalone" version.txt

    echo "--- eval"
    "$exe" -e 'console.log(Bun.version, process.arch)'

    echo "--- node:crypto"
    test "$("$exe" -e 'console.log(require("node:crypto").createHash("sha256").update("bun").digest("hex"))')" \
      = "$(printf bun | sha256sum | cut -d' ' -f1)"

    echo "--- Bun.serve + fetch on loopback"
    cat > serve.ts <<'TS'
const server = Bun.serve({ port: 0, fetch: () => new Response("pong") });
const res = await fetch(`http://127.0.0.1:${server.port}/`);
const body = await res.text();
server.stop(true);
if (body !== "pong") throw new Error(`unexpected body: ${body}`);
console.log("serve ok");
TS
    "$exe" serve.ts

    # bun-alone keeps Bun.Image and bun:ffi; bun-slim stubs both (src/runtime/image_standalone_stub.rs and friends).
    case "$level" in
      alone)
        echo "--- Bun.Image and bun:ffi are present"
        "$exe" -e 'if (typeof Bun.Image !== "function") process.exit(1); require("bun:ffi")'
        ;;
      slim)
        echo "--- Bun.Image is gone and bun:ffi throws"
        "$exe" -e 'if (typeof Bun.Image !== "undefined") process.exit(1)'
        "$exe" -e 'try { require("bun:ffi").dlopen("libc", {}); process.exit(1) } catch (e) { if (!/not available/.test(String(e.message))) process.exit(1) }'
        echo "--- --check is refused (no type checker)"
        if "$exe" --check -e 'let a: number = 1' 2> check.txt; then exit 1; fi
        grep -q "not available" check.txt
        ;;
      *) echo "unknown level: $level" >&2; exit 1 ;;
    esac

    echo "--- running a script file"
    echo 'console.log("script", [1, 2, 3].map(n => n * 2).join(","))' > script.ts
    test "$("$exe" script.ts)" = "script 2,4,6"

    echo "--- toolkit commands are refused"
    echo 'console.log("nothing")' > nothing.ts
    for cmd in build install test; do
      if "$exe" "$cmd" ./nothing.ts; then
        echo "bun-$level $cmd must not be available" >&2
        exit 1
      fi
    done

    # The released Bun (setup-bun) does the bundling; only the embedded runtime is the new binary.
    echo "--- --compile with the standalone runtime"
    cat > app.ts <<'TS'
import { createHash } from "node:crypto";
console.log("compiled", process.argv.slice(2).join(" "), createHash("md5").update("x").digest("hex"));
TS
    bun build --compile --compile-executable-path "$exe" ./app.ts --outfile ./app
    ./app one two | tee out.txt
    grep -q "^compiled one two 9dd4e461268c8034f5c8564e155c67a6$" out.txt
    ls -l ./app
    ;;

  *) echo "unknown target: $target" >&2; exit 1 ;;
esac
echo "verified $level $target"
