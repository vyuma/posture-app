use tauri::{LogicalSize, PhysicalPosition, PhysicalSize, WebviewWindow};

const DEFAULT_WIDTH: f64 = 1200.0;
const DEFAULT_HEIGHT: f64 = 780.0;
const DISPLAY_MARGIN: f64 = 16.0;

pub fn fit_initial_window(window: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let work_area = monitor.work_area();
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    let decorations = PhysicalSize::new(
        outer.width.saturating_sub(inner.width),
        outer.height.saturating_sub(inner.height),
    );
    let size = initial_size(work_area.size, monitor.scale_factor(), decorations);

    // The usual minimum must not force a window beyond a very small work area.
    window.set_min_size(Some(LogicalSize::new(
        720.0_f64.min(size.width),
        540.0_f64.min(size.height),
    )))?;
    window.set_size(size)?;

    let outer = window.outer_size()?;
    window.set_position(PhysicalPosition::new(
        work_area.position.x + (work_area.size.width.saturating_sub(outer.width) / 2) as i32,
        work_area.position.y + (work_area.size.height.saturating_sub(outer.height) / 2) as i32,
    ))
}

fn initial_size(
    work_area: PhysicalSize<u32>,
    scale_factor: f64,
    decorations: PhysicalSize<u32>,
) -> LogicalSize<f64> {
    let available_width = (work_area.width.saturating_sub(decorations.width)) as f64 / scale_factor
        - DISPLAY_MARGIN * 2.0;
    let available_height = (work_area.height.saturating_sub(decorations.height)) as f64
        / scale_factor
        - DISPLAY_MARGIN * 2.0;
    let scale = (available_width / DEFAULT_WIDTH)
        .min(available_height / DEFAULT_HEIGHT)
        .min(1.0);
    LogicalSize::new(
        (DEFAULT_WIDTH * scale).floor().max(1.0),
        (DEFAULT_HEIGHT * scale).floor().max(1.0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn large_display_uses_requested_logical_size() {
        assert_eq!(
            initial_size(PhysicalSize::new(1920, 1040), 1.0, PhysicalSize::new(0, 32)),
            LogicalSize::new(1200.0, 780.0)
        );
    }

    #[test]
    fn high_dpi_does_not_double_the_logical_window() {
        assert_eq!(
            initial_size(PhysicalSize::new(2880, 1800), 2.0, PhysicalSize::new(0, 56)),
            LogicalSize::new(1200.0, 780.0)
        );
    }

    #[test]
    fn small_work_areas_fit_frame_and_margins_while_preserving_proportion() {
        for (width, height, dpi, frame_height) in [
            (1366, 728, 1.0, 32),
            (1280, 680, 1.0, 32),
            (1920, 1000, 1.5, 48),
            (1024, 560, 1.0, 32),
            (800, 480, 1.0, 32),
        ] {
            let size = initial_size(
                PhysicalSize::new(width, height),
                dpi,
                PhysicalSize::new(0, frame_height),
            );
            assert!(size.width < DEFAULT_WIDTH);
            assert!((size.width + 32.0) * dpi <= width as f64);
            assert!((size.height + 32.0) * dpi + frame_height as f64 <= height as f64);
            assert!((size.width / size.height - DEFAULT_WIDTH / DEFAULT_HEIGHT).abs() < 0.005);
        }
    }
}
