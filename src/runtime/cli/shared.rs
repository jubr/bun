//! Items shared between toolkit subcommands and the always-compiled runtime.
//!
//! These were originally defined in `upgrade_command.rs` but are referenced
//! from core runtime code (`jsc_hooks`, `ffi_body`, C++ `BunProcess.cpp`), so
//! they must compile under `cfg(bun_standalone)` where `upgrade_command` is
//! reduced to a stub.

use core::ffi::c_char;

use bun_core::Global::SyncCStr;
use bun_core::{Environment, Global};
use bun_resolver::fs;
use bun_sys as sys;

// `bun_resolver::fs::FileSystem` (the inline canonical type surface
// in `resolver/lib.rs`) does not yet expose `tmpdir()`; the full impl lives in
// the un-exported `fs_full` module. Shim it locally — open
// `RealFS::tmpdir_path()` as a `sys::Dir`, mirroring `RealFS::open_tmp_dir`.
pub(crate) trait FileSystemTmpdirExt {
    fn tmpdir(&mut self) -> crate::Result<sys::Dir>;
}
impl FileSystemTmpdirExt for fs::FileSystem {
    fn tmpdir(&mut self) -> crate::Result<sys::Dir> {
        sys::Dir::open(fs::RealFS::tmpdir_path()).map_err(Into::into)
    }
}

/// Release-artifact name constants. These back `process.release.sourceUrl`
/// (via [`Bun__githubURL`]), so they must compile in every build flavor.
pub(crate) mod release {
    use super::*;

    // "windows" not "win32"; Android folds to "linux" (`SUFFIX_ABI` below adds
    // "-android", matching `bun-linux-aarch64-android.zip` on the release page).
    pub(crate) const PLATFORM_LABEL: &str = bun_core::env::OS_NAME_NPM;

    pub(crate) const ARCH_LABEL: &str = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    };
    pub(crate) const TRIPLET: &str = const_format::concatcp!(PLATFORM_LABEL, "-", ARCH_LABEL);
    pub(super) const SUFFIX_ABI: &str = if Environment::IS_MUSL {
        "-musl"
    } else if Environment::IS_ANDROID {
        "-android"
    } else {
        ""
    };
    pub(super) const SUFFIX: &str = SUFFIX_ABI;
    pub(crate) const FOLDER_NAME: &str = const_format::concatcp!("bun-", TRIPLET, SUFFIX);
    pub(crate) const ZIP_FILENAME: &str = const_format::concatcp!(FOLDER_NAME, ".zip");

    pub(crate) const PROFILE_FOLDER_NAME: &str =
        const_format::concatcp!("bun-", TRIPLET, SUFFIX, "-profile");
    pub(crate) const PROFILE_ZIP_FILENAME: &str =
        const_format::concatcp!(PROFILE_FOLDER_NAME, ".zip");
}

// Exported C symbol — null-terminated. `*const c_char` is `!Sync`, so wrap in
// the `#[repr(transparent)]` `SyncCStr` newtype (same pattern as
// `Bun__userAgent` in bun_core::Global) so the C++ side still sees a single
// `const char*`-sized symbol.
#[unsafe(no_mangle)]
pub(crate) static Bun__githubURL: SyncCStr = SyncCStr(
    const_format::concatcp!(
        "https://github.com/oven-sh/bun/releases/download/bun-v",
        Global::package_json_version,
        "/",
        release::ZIP_FILENAME,
        "\0"
    )
    .as_ptr()
    .cast::<c_char>(),
);
