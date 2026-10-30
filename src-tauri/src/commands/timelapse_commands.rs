//! Camera recordings are local files. All writes share the reset epoch and mutex.
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::{fs::{self, OpenOptions}, io::{Seek, SeekFrom, Write}, path::Path, sync::Mutex};
use tauri::Manager;

static MEDIA_LOCK: Mutex<()> = Mutex::new(());
fn file_name(value: &Value) -> Result<&str, String> {
    let name = value["name"].as_str().ok_or("missing file name")?;
    let stem = name.strip_suffix(".mp4").or_else(|| name.strip_suffix(".webm")).ok_or("invalid video extension")?;
    if stem.is_empty() || stem.len() > 120 || !stem.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') { return Err("invalid video name".into()); }
    Ok(name)
}
fn execute(root: &Path, downloads: &Path, operation: &str, payload: Value) -> Result<Value, String> {
    let _guard = MEDIA_LOCK.lock().map_err(|e| e.to_string())?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let db = Connection::open(root.join("timelapse.sqlite3")).map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS clips (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY, epoch INTEGER NOT NULL);
        INSERT OR IGNORE INTO meta(id,epoch) VALUES(1,0);").map_err(|e| e.to_string())?;
    let epoch: i64 = db.query_row("SELECT epoch FROM meta WHERE id=1", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let media = root.join("timelapse");
    if matches!(operation, "create" | "write" | "put") {
        let incoming = if operation == "put" { payload["clip"]["epoch"].as_i64() } else { payload["epoch"].as_i64() };
        if incoming != Some(epoch) { return Err("コレクション初期化後の動画は保存できません".into()); }
    }
    match operation {
        "epoch" => Ok(json!(epoch)),
        "get" => { let data: Option<String> = db.query_row("SELECT data FROM clips WHERE id=?1", [payload["id"].as_str().unwrap_or("")], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
            data.map(|v| serde_json::from_str(&v).map_err(|e| e.to_string())).unwrap_or(Ok(Value::Null)) },
        "put" => { let clip = &payload["clip"]; let id = clip["id"].as_str().ok_or("missing clip id")?;
            db.execute("INSERT INTO clips(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", params![id, clip.to_string()]).map_err(|e| e.to_string())?; Ok(Value::Null) },
        "create" => { fs::create_dir_all(&media).map_err(|e| e.to_string())?; fs::File::create(media.join(file_name(&payload)?)).map_err(|e| e.to_string())?; Ok(Value::Null) },
        "write" => { let encoded = payload["data"].as_str().ok_or("missing bytes")?;
            if encoded.len() > 1_400_000 { return Err("video writes must be bounded".into()); }
            let data = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
            let mut file = OpenOptions::new().write(true).open(media.join(file_name(&payload)?)).map_err(|e| e.to_string())?;
            file.seek(SeekFrom::Start(payload["position"].as_u64().ok_or("missing position")?)).map_err(|e| e.to_string())?;
            file.write_all(&data).map_err(|e| e.to_string())?; file.sync_data().map_err(|e| e.to_string())?; Ok(Value::Null) },
        "path" => { let path = media.join(file_name(&payload)?); if !path.is_file() { return Err("動画ファイルが見つかりません".into()); } Ok(json!(path)) },
        "remove" => { let path = media.join(file_name(&payload)?); if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; } Ok(Value::Null) },
        "clear" => {
            // Bump first: delayed recorder/export commands cannot recreate deleted files.
            db.execute("UPDATE meta SET epoch=epoch+1 WHERE id=1", []).map_err(|e| e.to_string())?;
            db.execute("DELETE FROM clips", []).map_err(|e| e.to_string())?;
            for directory in [&media, &root.join("timelapse-shared")] {
                if directory.exists() { fs::remove_dir_all(directory).map_err(|e| format!("動画の削除を再試行してください: {e}"))?; }
            }
            Ok(Value::Null)
        },
        "recover" => {
            let mut query = db.prepare("SELECT id,data FROM clips").map_err(|e| e.to_string())?;
            let rows = query.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
            for row in rows { let (id, data) = row.map_err(|e| e.to_string())?; let mut clip: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
                if clip["state"] == "recording" {
                    let name = file_name(&json!({"name":clip["file"]}))?.to_string();
                    let bytes = fs::metadata(media.join(name)).map(|m| m.len()).unwrap_or(0);
                    clip["bytes"] = json!(bytes); clip["state"] = json!(if bytes > 0 { "partial" } else { "failed" });
                    clip["error"] = json!("録画が途中で終了しました。保存できた範囲の映像です。");
                    db.execute("UPDATE clips SET data=?1 WHERE id=?2", params![clip.to_string(), id]).map_err(|e| e.to_string())?;
                }
            }
            if let Ok(entries) = fs::read_dir(&media) { for entry in entries.flatten() { if entry.file_name().to_string_lossy().starts_with("export-") { let _ = fs::remove_file(entry.path()); } } }
            Ok(Value::Null)
        },
        "deliver" => {
            let name = file_name(&payload)?;
            fs::create_dir_all(downloads).map_err(|e| e.to_string())?;
            let suffix = if name.ends_with(".mp4") { "mp4" } else { "webm" };
            let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
            let path = downloads.join(format!("PiiiN-{stamp}.{suffix}"));
            let mut target = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
            let mut source = fs::File::open(media.join(name)).map_err(|e| e.to_string())?;
            std::io::copy(&mut source, &mut target).map_err(|e| e.to_string())?;
            target.sync_all().map_err(|e| e.to_string())?; Ok(json!(path))
        },
        _ => Err("unknown timelapse operation".into())
    }
}

#[tauri::command]
pub async fn timelapse_store(app: tauri::AppHandle, window: tauri::WebviewWindow, operation: String, payload: Option<Value>, qa: Option<bool>) -> Result<Value, String> {
    if window.label() != "main" { return Err("timelapse is owned by the main window".into()); }
    let mut root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if qa == Some(true) {
        if !cfg!(debug_assertions) { return Err("test storage is only available in development".into()); }
        root = root.join("timelapse-qa");
    }
    #[cfg(all(target_os = "macos", feature = "mac-app-store"))]
    if operation == "deliver" || operation == "share" {
        return deliver_store_video(&app, &window, root, payload.unwrap_or(Value::Null), operation == "share").await;
    }
    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let share = operation == "share";
    let result = tauri::async_runtime::spawn_blocking(move || execute(&root, &downloads, if share { "deliver" } else { &operation }, payload.unwrap_or(Value::Null))).await.map_err(|e| e.to_string())??;
    if share {
        let path = result.as_str().ok_or("missing exported video")?.to_string();
        #[cfg(target_os = "macos")]
        show_video_share(&window, path.clone()).await?;
        return Ok(json!({ "path": path, "shared": cfg!(target_os = "macos") }));
    }
    Ok(result)
}

#[cfg(target_os = "macos")]
async fn show_video_share(window: &tauri::WebviewWindow, path: String) -> Result<(), String> {
    use objc2::{rc::Retained, runtime::AnyObject, AnyThread};
    use objc2_app_kit::{NSSharingServicePicker, NSWindow};
    use objc2_foundation::{NSArray, NSString, NSURL, NSRect, NSPoint, NSSize, NSRectEdge};
    thread_local! { static PICKER: std::cell::RefCell<Option<Retained<NSSharingServicePicker>>> = const { std::cell::RefCell::new(None) }; }
    let host = window.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    window.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let pointer = host.ns_window().map_err(|e| e.to_string())?;
            // Tauri owns the NSWindow; AppKit objects are used only on its main thread.
            let native = unsafe { &*pointer.cast::<NSWindow>() };
            let view = native.contentView().ok_or("missing share window")?;
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
            let items = NSArray::<AnyObject>::from_slice(&[url.as_ref()]);
            let picker = unsafe { NSSharingServicePicker::initWithItems(NSSharingServicePicker::alloc(), &items) };
            let bounds = view.bounds();
            let anchor = NSRect::new(NSPoint::new(bounds.size.width - 100.0, 80.0), NSSize::new(32.0, 32.0));
            picker.showRelativeToRect_ofView_preferredEdge(anchor, &view, NSRectEdge::MinY);
            PICKER.with(|slot| *slot.borrow_mut() = Some(picker));
            Ok(())
        })();
        let _ = sender.send(result);
    }).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv().map_err(|e| e.to_string())?).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deletion_rejects_stale_writes_and_keeps_external_files() {
        let root = std::env::temp_dir().join(format!("piiin-timelapse-{}", std::process::id()));
        let downloads = root.join("exports"); let _ = fs::remove_dir_all(&root);
        execute(&root, &downloads, "create", json!({"name":"test.webm","epoch":0})).unwrap();
        execute(&root, &downloads, "write", json!({"name":"test.webm","epoch":0,"position":0,"data":STANDARD.encode(b"video")})).unwrap();
        let path = execute(&root, &downloads, "deliver", json!({"name":"test.webm"})).unwrap();
        execute(&root, &downloads, "clear", Value::Null).unwrap();
        assert!(execute(&root, &downloads, "create", json!({"name":"late.webm","epoch":0})).is_err());
        assert!(execute(&root, &downloads, "put", json!({"clip":{"id":"late","epoch":0}})).is_err());
        assert_eq!(fs::read(path.as_str().unwrap()).unwrap(), b"video");
        assert!(execute(&root, &downloads, "create", json!({"name":"../escape.webm","epoch":1})).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}

/// The Store sandbox grants access to the URL chosen in this panel, not Downloads.
#[cfg(all(target_os = "macos", feature = "mac-app-store"))]
async fn choose_video_destination(window: &tauri::WebviewWindow, extension: String) -> Result<Option<std::path::PathBuf>, String> {
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
        panel.setTitle(Some(&NSString::from_str("動画を保存")));
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

#[cfg(all(target_os = "macos", feature = "mac-app-store"))]
async fn deliver_store_video(_app: &tauri::AppHandle, window: &tauri::WebviewWindow, root: std::path::PathBuf, payload: Value, share: bool) -> Result<Value, String> {
    let name = file_name(&payload)?.to_string();
    if share {
        // Keep a stable local copy while the share service reads it. Removing the
        // temporary export in the frontend must not invalidate the selected file.
        let cache = root.join("timelapse-shared");
        let path = tauri::async_runtime::spawn_blocking(move || execute(&root, &cache, "deliver", payload)).await.map_err(|e| e.to_string())??;
        let path = path.as_str().ok_or("missing exported video")?.to_string();
        show_video_share(window, path.clone()).await?;
        return Ok(json!({"path":path,"shared":true}));
    }
    let extension = if name.ends_with(".mp4") { "mp4" } else { "webm" };
    let Some(target) = choose_video_destination(window, extension.into()).await? else { return Ok(Value::Null); };
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MEDIA_LOCK.lock().map_err(|e| e.to_string())?;
        let source = root.join("timelapse").join(name);
        // AppKit has already asked for replacement permission if target exists.
        // Open the source first so a missing original cannot truncate an existing file.
        use objc2_foundation::{NSData, NSDataReadingOptions, NSDataWritingOptions, NSURL, NSString};
        let source_path = fs::canonicalize(&source).map_err(|e| e.to_string())?;
        if fs::canonicalize(&target).ok().as_ref() == Some(&source_path) { return Err("元の録画ファイルと別の保存先を選んでください".to_string()); }
        let source_url = NSURL::fileURLWithPath(&NSString::from_str(&source_path.to_string_lossy()));
        let target_url = NSURL::fileURLWithPath(&NSString::from_str(&target.to_string_lossy()));
        // Memory-map the app-owned file, then let Cocoa replace the destination
        // atomically. A failed copy must not truncate an existing chosen file.
        let data = NSData::dataWithContentsOfURL_options_error(&source_url, NSDataReadingOptions::MappedIfSafe).map_err(|e| e.to_string())?;
        data.writeToURL_options_error(&target_url, NSDataWritingOptions::Atomic).map_err(|e| format!("動画を保存できませんでした: {e}"))?;
        Ok(json!(target))
    }).await.map_err(|e| e.to_string())?
}
