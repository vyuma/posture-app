/// The Store sandbox grants access to the URL chosen in this panel, not Downloads.
pub(super) async fn choose_export_destination(window: &tauri::WebviewWindow, extension: String, title: &'static str) -> Result<Option<std::path::PathBuf>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSSavePanel, NSWindow, NSModalResponseOK, NSModalResponseCancel};
    use objc2_foundation::{NSArray, NSString};
    let host = window.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    window.run_on_main_thread(move || {
        let pointer = match host.ns_window() { Ok(v) => v, Err(e) => { let _ = sender.send(Err(e.to_string())); return; } };
        let native = unsafe { &*pointer.cast::<NSWindow>() };
        let panel = NSSavePanel::savePanel(MainThreadMarker::new().expect("AppKit main thread"));
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
        panel.setNameFieldStringValue(&NSString::from_str(&format!("PiiiN-{stamp}.{extension}")));
        panel.setCanCreateDirectories(true);
        panel.setTitle(Some(&NSString::from_str(title)));
        #[allow(deprecated)]
        panel.setAllowedFileTypes(Some(&NSArray::from_slice(&[&*NSString::from_str(&extension)])));
        let selected = panel.clone();
        let completion = block2::RcBlock::new(move |response| {
            let result = if response == NSModalResponseOK {
                selected.URL().and_then(|url| url.path()).map(|path| Some(std::path::PathBuf::from(path.to_string()))).ok_or_else(|| "保存先を取得できませんでした".to_string())
            } else if response == NSModalResponseCancel { Ok(None) } else { Err("保存ダイアログを開けませんでした".into()) };
            let _ = sender.send(result);
        });
        panel.beginSheetModalForWindow_completionHandler(native, &completion);
    }).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv().map_err(|e| e.to_string())?).await.map_err(|e| e.to_string())?
}

