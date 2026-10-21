//! Native macOS regression harness. Run with `bun run dev` serving :1420.
//! It uses an isolated app identifier and never starts camera/pairing services.
//! Commands: verify (position drift + hide/show assertions), quit.
#![allow(dead_code)]
#[path = "../src/overlay/mod.rs"]
mod overlay;
#[path = "../src/commands/overlay_commands.rs"]
mod overlay_commands;

#[cfg(not(all(target_os = "macos", debug_assertions)))]
fn main() {
    eprintln!("This regression probe requires a macOS debug build.");
}

#[cfg(all(target_os = "macos", debug_assertions))]
fn main() {
    use tauri::Manager;
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "com.vyuma.posture-app.spaces-probe".into();
    tauri::Builder::default()
        .manage(overlay::state::OverlayStateHandle::new())
        .invoke_handler(tauri::generate_handler![
            overlay_commands::overlay_get_state,
            overlay_commands::overlay_restore_position,
            overlay_commands::overlay_hide_character,
            overlay_commands::overlay_show_character,
            overlay_commands::overlay_start_drag,
            overlay_commands::overlay_open_main_window,
        ])
        .setup(|app| {
            overlay::window::ensure_overlay_window(app.handle())?;
            let handle = app.handle().clone();
            let saved_before_start: Option<serde_json::Value> =
                std::fs::read(handle.path().app_data_dir()?.join("pet-position-v2.json"))
                    .ok()
                    .and_then(|bytes| serde_json::from_slice(&bytes).ok());
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                let state = handle.state::<overlay::state::OverlayStateHandle>();
                overlay::window::restore_position(&handle, 0, 0).unwrap();
                overlay::window::apply_mode_change(&handle, &state, "good").unwrap();
                if let Some(saved) = saved_before_start {
                    let actual = overlay::native_macos::probe(&handle, false).unwrap().2;
                    assert_eq!(actual.x as i64, saved["x"].as_i64().unwrap());
                    assert_eq!(actual.y as i64, saved["y"].as_i64().unwrap());
                    println!("[spaces-probe] PASS: restart restored saved position {actual:?}");
                }
                if std::env::args().any(|arg| arg == "--verify-and-exit") {
                    let passed =
                        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| verify(&handle)))
                            .is_ok();
                    handle.exit(if passed { 0 } else { 1 });
                    return;
                }
                loop {
                    let sample = overlay::native_macos::probe(&handle, false).unwrap();
                    println!(
                        "[spaces-probe] active_space={} visible={} position={:?}",
                        sample.0, sample.1, sample.2
                    );
                    std::thread::sleep(std::time::Duration::from_secs(2));
                }
            });
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                use std::io::BufRead;
                for line in std::io::stdin().lock().lines() {
                    match line.unwrap().as_str() {
                        "quit" => handle.exit(0),
                        "verify" => {
                            verify(&handle);
                        }
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .run(context)
        .expect("native overlay probe failed");
}

#[cfg(all(target_os = "macos", debug_assertions))]
fn verify(handle: &tauri::AppHandle) {
    use tauri::Manager;
    let state = handle.state::<overlay::state::OverlayStateHandle>();
    let path = handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("pet-position-v2.json");
    let saved = std::fs::read(&path).unwrap();
    let before = overlay::native_macos::probe(&handle, false).unwrap();
    overlay::native_macos::probe(&handle, true).unwrap();
    let after = overlay::native_macos::probe(&handle, false).unwrap();
    assert_eq!(
        before.2, after.2,
        "OS movement must be restored to the user's position"
    );
    assert_eq!(
        saved,
        std::fs::read(&path).unwrap(),
        "OS movement must not overwrite saved position"
    );
    overlay::window::hide_character(&handle, &state).unwrap();
    assert!(!overlay::native_macos::probe(&handle, false).unwrap().1);
    overlay::window::show_character(&handle, &state).unwrap();
    let shown = overlay::native_macos::probe(&handle, false).unwrap();
    assert!(shown.1);
    assert_eq!(before.2, shown.2);
    overlay::native_macos::probe_drag_lifecycle(&handle).unwrap();
    println!("[spaces-probe] PASS: drag lifecycle, displacement restored, saved coordinates unchanged, hide/show retains position");
}
