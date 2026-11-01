#[cfg(target_os = "macos")]
pub(crate) mod native_macos;
pub mod state;
pub mod window;

#[cfg(all(target_os = "macos", feature = "mac-app-store"))]
pub(crate) mod store_pet;
