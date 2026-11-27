//! `cfg(bun_standalone)` replacement for `crate::image` (`Bun.Image`), used by the SLIM variant.
//!
//! The real module (codecs, CoreGraphics/WIC backends, `Image` class) pulls in
//! libjpeg-turbo, libspng and libwebp and is not needed by a `--compile`d
//! executable that only runs its own JS. The codegen `standaloneStub` flag on
//! `Image.classes.ts` emits a ZST `Image` plus throwing thunks so the C++
//! `extern` symbols still link; this file provides the few Rust-side names
//! other modules reference (`Blob.image()`).

#![allow(dead_code, unused_variables)]

use bun_jsc::{JSGlobalObject, JSValue, JsResult};

pub(crate) const UNAVAILABLE: &str = "Bun.Image is not available in standalone executables";

/// Never constructed; `from_blob_js` (`Blob.image()`) throws first.
pub(crate) struct Image;

impl Image {
    pub(crate) fn from_blob_js(global: &JSGlobalObject, blob_value: JSValue, options: JSValue) -> JsResult<JSValue> {
        Err(global.throw_type_error(format_args!("{}", UNAVAILABLE)))
    }
}
