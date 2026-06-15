//! `cfg(bun_standalone)` replacement for `dev_server`.
//!
//! The real `DevServer` pulls `bun_bundler::bundle_v2` (and through it `bun_css`) into the link via
//! `IncrementalGraph` → `BundleV2` → `Chunk`. A standalone executable has no `Bun.build`, so no
//! `DevServer` can ever be created: `Bun.serve` rejects `app`, `html_route_from_js` throws, and
//! `ServerConfig::bake` is compiled out. This stub names only what the rest of `bun_runtime`
//! mentions in signatures. `DevServer` is uninhabited, so `Option<Box<DevServer>>` is a ZST that
//! is statically `None`, and the methods below are statically unreachable.

#![allow(dead_code, unused_variables)]

use bun_event_loop::EventLoopTimer::{EventLoopTimer, Timespec};

pub(crate) const INTERNAL_PREFIX: &str = "/_bun";
pub(crate) const CLIENT_PREFIX: &str = "/_bun/client";

/// Uninhabited.
pub(crate) enum DevServer {}

// The inspector agent handle is also what `Bun__InspectorBunFrontendDevServerAgent__setEnabled`
// (called from C++) talks to, independent of any `DevServer` instance.
#[path = "dev_server/inspector_agent.rs"]
pub(crate) mod inspector_agent;

pub(crate) mod route_bundle {
    pub(crate) enum RouteBundleMarker {}
    pub(crate) type Index = bun_core::GenericIndex<u32, RouteBundleMarker>;
    pub(crate) type IndexOptional = Option<Index>;
}

/// Uninhabited: never enqueued, there is no `DevServer` to own a watcher.
pub(crate) enum HotReloadEvent {}

impl bun_event_loop::Taskable for HotReloadEvent {
    const TAG: bun_event_loop::TaskTag = bun_event_loop::task_tag::BakeHotReloadEvent;
    unsafe fn context(_: *const Self) -> bun_event_loop::ContextId {
        unreachable!("bake DevServer is not available in standalone executables")
    }
    unsafe fn release_unrun(this: *mut Self) {
        unreachable!("bake DevServer is not available in standalone executables")
    }
}

impl HotReloadEvent {
    pub(crate) unsafe fn run(_this: *mut Self) {
        unreachable!("bake DevServer is not available in standalone executables")
    }
}

pub(crate) mod source_map_store {
    /// Uninhabited.
    pub(crate) enum SourceMapStore {}

    impl SourceMapStore {
        pub(crate) fn sweep_weak_refs(
            _timer: *mut bun_event_loop::EventLoopTimer::EventLoopTimer,
            _now: &bun_event_loop::EventLoopTimer::Timespec,
        ) {
            unreachable!("bake DevServer is not available in standalone executables")
        }
    }
}

impl DevServer {
    pub(crate) fn emit_memory_visualizer_message_timer(_t: *mut EventLoopTimer) {
        unreachable!("bake DevServer is not available in standalone executables")
    }

    pub(crate) fn vm(&self) -> &bun_jsc::virtual_machine::VirtualMachine {
        match *self {}
    }

    pub(crate) fn memory_cost(&self) -> usize {
        match *self {}
    }

    pub(crate) fn respond_for_html_bundle(
        &mut self,
        _route: bun_ptr::ThisPtr<crate::server::html_bundle::Route>,
        _req: &mut bun_uws::Request,
        _resp: bun_uws::AnyResponse,
    ) -> Result<(), crate::Error> {
        match *self {}
    }

    pub(crate) fn on_plugins_resolved(
        &mut self,
        _plugins: Option<*mut crate::api::js_bundler::Plugin>,
    ) -> Result<(), crate::Error> {
        match *self {}
    }

    pub(crate) fn on_plugins_rejected(&mut self) -> Result<(), crate::Error> {
        match *self {}
    }
}

pub(crate) fn get_deinit_count_for_testing() -> usize {
    0
}

pub(crate) fn is_allowed_dev_host(dev: &DevServer, _req: &bun_uws::Request) -> bool {
    match *dev {}
}

/// Only reached from the development-mode `/.well-known/...` handlers, which are never registered
/// without a `DevServer`.
pub(crate) fn is_allowed_host_header(
    _req: &bun_uws::Request,
    _address: Option<&crate::server::server_config::Address>,
) -> bool {
    false
}

// `bun_bundler`'s `link_interface!(DevServerHandle[Bake] { .. })` declares these as `extern "Rust"`;
// the real bodies live in `dev_server/bundler_vtable.rs`. The bundler is still linked (it backs
// `Bun.Transpiler`), and its `DevServerHandle` call sites are reachable code to the linker even
// though no handle is ever created. Signatures are erased: Rust `extern` symbols match by name only,
// and none of these can run because there is no `DevServer` to own a handle.
macro_rules! dev_server_dispatch_stub {
    ($($sym:ident),* $(,)?) => {$(
        #[unsafe(no_mangle)]
        fn $sym() -> ! {
            unreachable!("bake DevServer is not available in standalone executables")
        }
    )*};
}
dev_server_dispatch_stub!(
    __bun_dispatch__DevServerHandle__Bake__asset_hash,
    __bun_dispatch__DevServerHandle__Bake__barrel_needed_exports,
    __bun_dispatch__DevServerHandle__Bake__current_bundle_start_data,
    __bun_dispatch__DevServerHandle__Bake__finalize_bundle,
    __bun_dispatch__DevServerHandle__Bake__handle_parse_task_failure,
    __bun_dispatch__DevServerHandle__Bake__is_file_cached,
    __bun_dispatch__DevServerHandle__Bake__log_for_resolution_failures,
    __bun_dispatch__DevServerHandle__Bake__put_or_overwrite_asset,
    __bun_dispatch__DevServerHandle__Bake__register_barrel_export,
    __bun_dispatch__DevServerHandle__Bake__register_barrel_with_deferrals,
    __bun_dispatch__DevServerHandle__Bake__track_resolution_failure,
);
