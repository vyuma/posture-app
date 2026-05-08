use std::borrow::Cow;
use std::thread;
use std::time::Duration;

use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose::STANDARD, Engine};

#[tauri::command]
pub fn copy_share_image_to_clipboard(png_base64: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(png_base64)
        .map_err(|error| format!("failed to decode image data: {error}"))?;
    let image = image::load_from_memory(&bytes)
        .map_err(|error| format!("failed to read image data: {error}"))?
        .into_rgba8();
    let (width, height) = image.dimensions();
    let bytes = image.into_raw();

    let mut last_error = String::from("failed to copy image");
    for attempt in 0..5 {
        match write_image_to_clipboard(width as usize, height as usize, &bytes) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error;
                if attempt < 4 {
                    thread::sleep(Duration::from_millis(80));
                }
            }
        }
    }

    Err(last_error)
}

fn write_image_to_clipboard(
    width: usize,
    height: usize,
    bytes: &[u8],
) -> Result<(), String> {
    let mut clipboard =
        Clipboard::new().map_err(|error| format!("failed to open clipboard: {error}"))?;
    clipboard
        .set_image(ImageData {
            width,
            height,
            bytes: Cow::Borrowed(bytes),
        })
        .map_err(|error| format!("failed to copy image: {error}"))
}
