//! A stable WebView2 canvas with a region limited to the visible widget.
//! SetWindowRgn also excludes the rest of the transparent canvas from hit testing.
use std::ffi::c_void;
use tauri::WebviewWindow;

#[link(name = "gdi32")]
extern "system" {
    fn CreateRectRgn(left: i32, top: i32, right: i32, bottom: i32) -> *mut c_void;
    fn CombineRgn(dest: *mut c_void, first: *mut c_void, second: *mut c_void, mode: i32) -> i32;
    fn DeleteObject(object: *mut c_void) -> i32;
}
#[link(name = "user32")]
extern "system" {
    fn SetWindowRgn(window: *mut c_void, region: *mut c_void, redraw: i32) -> i32;
}

fn physical_rect(rect: [f64; 4], scale: f64, width: i32, height: i32) -> Option<[i32; 4]> {
    if rect.iter().any(|value| !value.is_finite()) {
        return None;
    }
    let [left, top, right, bottom] = rect;
    let result = [
        ((left * scale).floor() as i32).clamp(0, width),
        ((top * scale).floor() as i32).clamp(0, height),
        ((right * scale).ceil() as i32).clamp(0, width),
        ((bottom * scale).ceil() as i32).clamp(0, height),
    ];
    (result[0] < result[2] && result[1] < result[3]).then_some(result)
}

pub fn set_regions(window: &WebviewWindow, rects: Vec<[f64; 4]>) -> Result<(), String> {
    if rects.len() > 8 {
        return Err("too many widget regions".into());
    }
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    unsafe {
        let region = CreateRectRgn(0, 0, 0, 0);
        if region.is_null() {
            return Err("failed to create widget region".into());
        }
        for rect in rects {
            if let Some([left, top, right, bottom]) =
                physical_rect(rect, scale, size.width as i32, size.height as i32)
            {
                let part = CreateRectRgn(left, top, right, bottom);
                if part.is_null() || CombineRgn(region, region, part, 2) == 0 {
                    if !part.is_null() {
                        DeleteObject(part);
                    }
                    DeleteObject(region);
                    return Err("failed to combine widget region".into());
                }
                DeleteObject(part);
            }
        }
        // On success Windows owns the HRGN; do not delete it afterwards.
        if SetWindowRgn(hwnd.0 as _, region, 1) == 0 {
            DeleteObject(region);
            return Err(std::io::Error::last_os_error().to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn region_uses_physical_pixels_without_clipping_fractional_edges() {
        assert_eq!(
            physical_rect([-10., 12.1, 81.1, 95.9], 1.5, 600, 1080),
            Some([0, 18, 122, 144])
        );
        assert_eq!(
            physical_rect([390., 700., 500., 900.], 1., 400, 720),
            Some([390, 700, 400, 720])
        );
        assert_eq!(physical_rect([500., 0., 600., 10.], 1., 400, 720), None);
        assert_eq!(physical_rect([f64::NAN, 0., 10., 10.], 1., 400, 720), None);
    }
}
