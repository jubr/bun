//! `cfg(bun_standalone)` replacement for `ffi_body` (`bun:ffi` `dlopen`, `cc`,
//! `linkSymbols`, `callback`), used by the SLIM variant. Those compile C with
//! TinyCC at runtime, which a `--compile`d executable that only runs its own JS
//! does not need. Every entry point throws; the pointer/read helpers in
//! `FFIObject.rs` are untouched.

#![allow(dead_code, unused_variables)]

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

const UNAVAILABLE: &str = "bun:ffi is not available in standalone executables";

/// Never constructed (the codegen `standaloneStub` flag stubs every thunk of the class). Its associated functions are what
/// `FFIObject.rs` (`Bun.FFI`: `viewSource`, `dlopen`, `callback`, `linkSymbols`, `closeCallback`, `CFunction`) calls; each throws.
pub(crate) struct FFI;

impl FFI {
    pub(crate) fn print(global: &JSGlobalObject, object: JSValue, is_callback_val: Option<JSValue>) -> JsResult<JSValue> {
        Err(global.throw_type_error(format_args!("{}", UNAVAILABLE)))
    }

    pub(crate) fn open(global: &JSGlobalObject, name_str: &bun_core::String, object_value: JSValue) -> JsResult<JSValue> {
        Err(global.throw_type_error(format_args!("{}", UNAVAILABLE)))
    }

    pub(crate) fn callback(global: &JSGlobalObject, interface: JSValue, js_callback: JSValue) -> JsResult<JSValue> {
        Err(global.throw_type_error(format_args!("{}", UNAVAILABLE)))
    }

    pub(crate) fn link_symbols(global: &JSGlobalObject, object_value: JSValue) -> JsResult<JSValue> {
        Err(global.throw_type_error(format_args!("{}", UNAVAILABLE)))
    }

    pub(crate) fn close_jsc_callback(global: &JSGlobalObject, callback: JSValue) -> JsResult<JSValue> {
        Ok(JSValue::UNDEFINED)
    }

    pub(crate) fn create_cfunction(global: &JSGlobalObject, options: JSValue, name_value: Option<JSValue>) -> JsResult<JSValue> {
        Err(global.throw_type_error(format_args!("{}", UNAVAILABLE)))
    }
}

#[allow(non_snake_case)]
pub(crate) fn bun__ffi__cc(global: &JSGlobalObject, callframe: &CallFrame) -> JsResult<JSValue> {
    Err(global.throw_type_error(format_args!("{}", UNAVAILABLE)))
}
