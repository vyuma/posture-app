fn main() {
    if std::env::var_os("CARGO_FEATURE_MAC_APP_STORE").is_some()
        && std::env::var_os("CARGO_FEATURE_DIRECT_DISTRIBUTION").is_some()
    {
        panic!("mac-app-store requires --no-default-features; direct updater must not be linked");
    }
    if std::env::var_os("CARGO_FEATURE_MAC_APP_STORE").is_some() {
        build_native_pet();
        println!("cargo:rerun-if-changed=capabilities/default.json");
        tauri_build::try_build(
            tauri_build::Attributes::new().capabilities_path_pattern("./capabilities/default.json"),
        )
        .expect("Mac App Store build configuration failed");
    } else {
        tauri_build::build()
    }
}

fn build_native_pet() {
    use std::{path::PathBuf, process::Command};
    assert_eq!(std::env::var("CARGO_CFG_TARGET_OS").unwrap(), "macos", "Store feature is macOS-only");
    println!("cargo:rerun-if-changed=native-pet/Package.swift");
    println!("cargo:rerun-if-changed=native-pet/Package.resolved");
    println!("cargo:rerun-if-changed=native-pet/Sources/PiiiNPetNative");
    println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");
    let developer = std::env::var("DEVELOPER_DIR").unwrap_or_else(|_| "/Applications/Xcode.app/Contents/Developer".into());
    let arch = if std::env::var("CARGO_CFG_TARGET_ARCH").unwrap() == "aarch64" { "arm64" } else { "x86_64" };
    let status = Command::new("/usr/bin/xcrun").env("DEVELOPER_DIR", &developer)
        .args(["swift", "build", "--package-path", "native-pet", "-c", "release", "--product", "PiiiNPetNative", "--arch", arch, "--disable-automatic-resolution"])
        .status().expect("Xcode is required to build the Store pet");
    assert!(status.success(), "native Store pet build failed");
    let output = Command::new("/usr/bin/xcrun").env("DEVELOPER_DIR", &developer)
        .args(["swift", "build", "--package-path", "native-pet", "-c", "release", "--arch", arch, "--show-bin-path"])
        .output().expect("Swift output directory unavailable");
    assert!(output.status.success());
    let path = String::from_utf8(output.stdout).unwrap();
    println!("cargo:rustc-link-search=native={}", path.trim());
    println!("cargo:rustc-link-lib=static=PiiiNPetNative");
    println!("cargo:rustc-link-search=native={}", PathBuf::from(&developer).join("Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx").display());
    let sdk = Command::new("/usr/bin/xcrun").env("DEVELOPER_DIR", &developer).args(["--sdk", "macosx", "--show-sdk-path"]).output().expect("macOS SDK unavailable");
    let sdk = String::from_utf8(sdk.stdout).unwrap();
    println!("cargo:rustc-link-search=native={}/usr/lib/swift", sdk.trim());
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    for framework in ["AppKit", "Foundation", "QuartzCore", "CoreGraphics", "CoreText"] { println!("cargo:rustc-link-lib=framework={framework}"); }
}
