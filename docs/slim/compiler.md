# Compiler options of `bun-alone` and `bun-slim`

Both are built with Bun's `MinSizeRel` build type (the build's `smol` mode). Two commits change what `smol` means: the `-Oz` one ends the bun-standalone series (B in
[the README](../../README.md#what-slim-is-made-of)), the Rust one belongs to the slim series (C), so `bun-alone` has `-Oz` only and `bun-slim` both:

```sh
bun scripts/build.ts --profile=release --standalone=on --build-type=MinSizeRel \
  --os=linux --arch=x64 --abi=gnu --build-dir=build/release-standalone
```

| Option | Where | Effect |
| --- | --- | --- |
| `--standalone=on` | `scripts/build.ts` | `cfg(bun_standalone)`: the toolkit is compiled out ([bun-standalone](bun-standalone.md)); the output is `bun-standalone` |
| `--build-type=MinSizeRel` | `scripts/build/config.ts` (`smol`) | optimise for size instead of speed, for the C++ and the Rust half |
| C++ `-Os` → `-Oz` | `scripts/build/flags.ts` (end of B) | smaller C++ code. Only the first `-Os` entry, the one for `smol`; the LTO entry further down stays. The pull request's `-Os` does not link on LLVM 23.1.5 (undefined `Zig::generateNativeModule_UTF8Validate`, thin LTO), `-Oz` does |
| Rust `opt-level = "z"` | `scripts/build/rust.ts` (slim series) | `CARGO_PROFILE_RELEASE_OPT_LEVEL=z` in the cargo environment when `smol` is on |

`-Oz` is `-Os` that also gives up size-neutral speed tricks (loop unrolling, inlining that grows code); `opt-level = "z"`
is the same for rustc. The stock release build of Bun uses neither: it optimises for speed, which is why "Upstream Bun"
in the size tables is that build (`--profile=release`, no `--standalone`, no `MinSizeRel`) of the same source.

The numbers below show that most of the saving beyond removing the toolkit comes from them.

## What they are worth

Measured on macOS arm64 with Bun 1.4.4, 1 KB = 1024 bytes, runtime executable and the `variant` program compiled with it:

| Build | Runtime | Saved vs. the line above | Compiled program |
| --- | ---: | ---: | ---: |
| `bun-standalone`, as the pull request builds it | 46,187 KB | – | 49,783 KB |
| `MinSizeRel`, C++ `-Os`, Rust `opt-level=z` | 40,022 KB | 13.3% | 43,634 KB |
| the same with C++ `-Oz` | 37,965 KB | 5.1% | 41,577 KB |
| `bun-slim` (also `Bun.Image` and `bun:ffi` stubbed) | 37,185 KB | 2.1% | 40,797 KB |

JavaScriptCore is a prebuilt 23 MB library and sets the size floor; nothing here changes it.

Each release measures the real numbers for its four targets: see its notes, or the table at the top of the
[README](../../README.md).
