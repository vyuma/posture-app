/// Save card PNGs through the user-selected sandbox grant, and acknowledge only
/// after an atomic write succeeds. Cancelling is not a successful save.
#[tauri::command]
pub async fn save_result_image(window: tauri::WebviewWindow, png_base64: String) -> Result<bool, String> {
    if window.label() != "main" { return Err("image export is owned by the main window".into()); }
    #[cfg(all(target_os = "macos", feature = "mac-app-store"))]
    {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use objc2_foundation::{NSData, NSDataWritingOptions, NSURL, NSString};
        if png_base64.len() > 44_740_000 { return Err("画像が大きすぎます".into()); }
        let bytes = STANDARD.decode(&png_base64).map_err(|e| e.to_string())?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Err("PNG画像を読み込めませんでした".into()); }
        let Some(target) = super::save_dialog::choose_export_destination(&window, "png".into(), "画像を保存").await? else { return Ok(false); };
        tauri::async_runtime::spawn_blocking(move || {
            let url = NSURL::fileURLWithPath(&NSString::from_str(&target.to_string_lossy()));
            let data = NSData::with_bytes(&bytes);
            data.writeToURL_options_error(&url, NSDataWritingOptions::Atomic)
                .map_err(|error| format!("画像を保存できませんでした: {error}"))?;
            Ok(true)
        }).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(all(target_os = "macos", feature = "mac-app-store")))]
    { let _ = png_base64; Err("Store image export is unavailable in this distribution".into()) }
}
