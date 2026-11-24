# `bun-slim` — `bun-alone` with more trimmed

`bun-slim` is [`bun-alone`](bun-standalone.md) (Bun's `bun-standalone`: bundler, package manager and test runner
compiled out) built with Rust `opt-level=z` ([compiler options](compiler.md)) and with two more parts of the runtime
stubbed out:

| Removed | What a program sees | What drops out of the link |
| --- | --- | --- |
| `Bun.Image` | `typeof Bun.Image === "undefined"`; `Blob.image()` throws `Bun.Image is not available in standalone executables`; a `Bun.Image` is not accepted as a `Response`/`Blob` body | libjpeg-turbo, libspng, libwebp |
| `bun:ffi` | `require("bun:ffi")` loads, but `dlopen`, `cc`, `linkSymbols`, `callback` and `viewSource` throw `bun:ffi is not available in standalone executables`. The pointer and read helpers (`ptr`, `read`, `CString`) still work | TinyCC |

It **may not be suited for everyday use**: it is meant as the executable that `bun build --compile
--compile-executable-path` embeds, for programs known to use neither. A program that uses `Bun.Image` or `bun:ffi`
needs [`bun-alone`](bun-standalone.md) (or stock Bun).

Both stubs use the codegen flag `standaloneStub` (`src/codegen/class-definitions.ts`, `generate-classes.ts`): under
`cfg(bun_standalone)` it emits a zero-sized backing type and throwing thunks for the class, so the C++ `extern` symbols
still link while the real Rust module is cfg-gated out.

## Which files

These are the commits of the slim series (`slim: ...`, the C series in [the README](../../README.md#what-slim-is-made-of)),
on top of the bun-standalone series:

| File | Change |
| --- | --- |
| `scripts/build/rust.ts` | Rust `opt-level=z` ([compiler options](compiler.md)) |
| `src/runtime/lib.rs` | `crate::image` is `image_standalone_stub.rs` under `cfg(bun_standalone)` |
| `src/runtime/image_standalone_stub.rs` (new) | the few names other modules use: `Image`, `from_blob_js` |
| `src/runtime/api/BunObject.rs` | `Bun.Image` lazy property returns `undefined` |
| `src/runtime/webcore/Body.rs` | the `Image` body branch is `cfg(not(bun_standalone))` |
| `src/runtime/image/Image.classes.ts` | `standaloneStub: "Bun.Image is not available…"` |
| `src/runtime/ffi/mod.rs` | `ffi_body` is `ffi_standalone_stub.rs` under `cfg(bun_standalone)`; `get_dl_error` and `abi_type` are `cfg(not(bun_standalone))` |
| `src/runtime/ffi/ffi_standalone_stub.rs` (new) | `FFI` (never constructed) and `bun__ffi__cc` (throws) |
| `src/runtime/ffi/ffi.classes.ts` | `standaloneStub: "bun:ffi is not available…"` |

`--tinycc=off` alone does not link, because the Rust `ffi` code still references TinyCC; replacing `ffi_body` is what
lets it drop out.

## Checks

`.github/scripts/slim/verify.sh` runs for every Linux binary: `Bun.Image` is `undefined` and `bun:ffi` throws
"not available" in `bun-slim`; `Bun.Image` is a function and `bun:ffi` loads in `bun-alone`. The darwin binaries are
cross-compiled and checked statically only.

## Not done

- The HTTP/2 and HTTP/3 fetch client (lshpack, lsquic, lsqpack) is about 1.3 MB with roughly 70 call sites in `bun_http`.
- Shell, `Bun.sql`, Redis, `HTMLRewriter`, markdown and archive are about 0.1 to 0.2 MB each.
- Turning off crash-report upload did not change the size.

Sizes of every release are in its notes and in the table at the top of the [README](../../README.md).
