use tauri::{
    menu::{Menu, MenuItem},
    Emitter, Manager,
};

pub fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    app.handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;
    app.handle().plugin(tauri_plugin_process::init())?;
    let menu = Menu::default(app.handle())?;
    let check = MenuItem::with_id(
        app,
        "check-for-updates",
        "アップデートを確認…",
        true,
        None::<&str>,
    )?;
    if let Some(submenu) = menu.items()?.first().and_then(|item| item.as_submenu()) {
        submenu.insert(&check, 1)?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "check-for-updates" {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("check-for-updates", ());
            }
        }
    });
    Ok(())
}
