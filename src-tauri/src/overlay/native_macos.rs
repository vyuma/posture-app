//! The pet lives in an NSPanel initialized as nonactivating. Converting an already
//! initialized NSWindow does not give it the same WindowServer/Spaces behavior.
//! Tauri keeps its hidden host and root view; only the webview moves into the panel.
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use objc2::{rc::Retained, runtime::ProtocolObject, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSBackingStoreType, NSColor, NSEvent, NSEventType, NSPanel, NSScreen, NSWindow,
    NSWindowCollectionBehavior as Behavior, NSWindowDidMoveNotification, NSWindowStyleMask,
    NSWorkspace, NSWorkspaceActiveSpaceDidChangeNotification,
};
use objc2_foundation::{
    NSNotificationCenter, NSObjectProtocol, NSOperationQueue, NSPoint, NSProcessInfo,
};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

thread_local! {
    // AppKit objects never cross threads, including when managed by Tauri commands.
    static PANEL: RefCell<Option<Rc<PetPanel>>> = const { RefCell::new(None) };
}

struct Observer {
    center: Retained<NSNotificationCenter>,
    token: Retained<ProtocolObject<dyn NSObjectProtocol>>,
}

impl Drop for Observer {
    fn drop(&mut self) {
        unsafe { self.center.removeObserver((&*self.token).as_ref()) };
    }
}

struct PetPanel {
    native: Retained<NSPanel>,
    target: Cell<NSPoint>,
    dragging: Cell<bool>,
    reconciling: Cell<bool>,
    observers: RefCell<Vec<Observer>>,
}

impl PetPanel {
    fn finish_drag(&self, app: &AppHandle, mtm: MainThreadMarker) -> Result<(), String> {
        let after = self.native.frame().origin;
        let changed = self.target.replace(after) != after;
        self.dragging.set(false);
        if changed {
            super::window::save_position(app, self.position(mtm))?;
            app.emit("overlay:dragged", ())
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn reconcile(&self) {
        if self.dragging.get() || self.reconciling.replace(true) {
            return;
        }
        if self.native.frame().origin != self.target.get() {
            self.native.setFrameOrigin(self.target.get());
        }
        self.reconciling.set(false);
    }

    fn set_origin(&self, origin: NSPoint) {
        self.target.set(origin);
        self.reconcile();
    }

    fn position(&self, mtm: MainThreadMarker) -> PhysicalPosition<i32> {
        let frame = self.native.frame();
        let scale = self.native.backingScaleFactor();
        PhysicalPosition::new(
            (frame.origin.x * scale).round() as i32,
            ((screen_top(mtm) - frame.origin.y - frame.size.height) * scale).round() as i32,
        )
    }
}

fn screen_top(mtm: MainThreadMarker) -> f64 {
    NSScreen::screens(mtm)
        .firstObject()
        .map(|s| s.frame().size.height)
        .unwrap_or(0.0)
}

fn on_main<T: Send + 'static>(
    app: &AppHandle,
    work: impl FnOnce(MainThreadMarker) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    if let Some(mtm) = MainThreadMarker::new() {
        return work(mtm);
    }
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = send.send(work(MainThreadMarker::new().expect("AppKit main thread")));
    })
    .map_err(|error| error.to_string())?;
    receive.recv().map_err(|error| error.to_string())?
}

fn panel() -> Result<Rc<PetPanel>, String> {
    PANEL
        .with(|slot| slot.borrow().clone())
        .ok_or_else(|| "pet panel is not initialized".into())
}

pub fn create(window: &WebviewWindow) -> Result<(), String> {
    let host = window.clone();
    on_main(window.app_handle(), move |mtm| {
        if PANEL.with(|slot| slot.borrow().is_some()) {
            return Ok(());
        }
        let pointer = host.ns_window().map_err(|error| error.to_string())?;
        let source = unsafe { &*pointer.cast::<NSWindow>() };
        let native = NSPanel::initWithContentRect_styleMask_backing_defer(
            NSPanel::alloc(mtm),
            source.frame(),
            NSWindowStyleMask::NonactivatingPanel,
            NSBackingStoreType::Buffered,
            false,
        );
        // Retained owns the panel; AppKit must not release it on close.
        unsafe { native.setReleasedWhenClosed(false) };
        native.setHidesOnDeactivate(false);
        native.setLevel(3); // NSFloatingWindowLevel, above app content in every Space.
        native.setCollectionBehavior(Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary);
        native.setOpaque(false);
        native.setBackgroundColor(Some(&NSColor::clearColor()));
        native.setHasShadow(false);
        native.setTitle(&objc2_foundation::NSString::from_str("PiiiN character"));
        let source_view = source.contentView().ok_or("pet host has no content view")?;
        let destination = native
            .contentView()
            .ok_or("pet panel has no content view")?;
        // Removing the root view breaks Tao's window bookkeeping. Its child WKWebView
        // retains the existing Tauri IPC bridge and frontend when reparented.
        for child in source_view.subviews() {
            destination.addSubview(&child);
        }
        let state = Rc::new(PetPanel {
            target: Cell::new(native.frame().origin),
            native,
            dragging: Cell::new(false),
            reconciling: Cell::new(false),
            observers: RefCell::new(Vec::new()),
        });
        let weak = Rc::downgrade(&state);
        let moved = block2::RcBlock::new(
            move |_: std::ptr::NonNull<objc2_foundation::NSNotification>| {
                if let Some(panel) = weak.upgrade() {
                    panel.reconcile();
                }
            },
        );
        let center = NSNotificationCenter::defaultCenter();
        let token = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(NSWindowDidMoveNotification),
                Some(&state.native),
                Some(&NSOperationQueue::mainQueue()),
                &moved,
            )
        };
        state
            .observers
            .borrow_mut()
            .push(Observer { center, token });
        let weak = Rc::downgrade(&state);
        let changed = block2::RcBlock::new(
            move |_: std::ptr::NonNull<objc2_foundation::NSNotification>| {
                if let Some(panel) = weak.upgrade() {
                    panel.reconcile();
                }
            },
        );
        let center = NSWorkspace::sharedWorkspace().notificationCenter();
        let token = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(NSWorkspaceActiveSpaceDidChangeNotification),
                None,
                Some(&NSOperationQueue::mainQueue()),
                &changed,
            )
        };
        state
            .observers
            .borrow_mut()
            .push(Observer { center, token });
        PANEL.with(|slot| *slot.borrow_mut() = Some(state));
        Ok(())
    })
}

pub fn set_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    on_main(app, move |_| {
        let panel = panel()?;
        if visible {
            panel.reconcile();
            if !panel.native.isVisible() {
                panel.native.orderFrontRegardless();
            }
        } else {
            panel.native.orderOut(None);
        }
        Ok(())
    })
}

pub fn position(app: &AppHandle) -> Result<PhysicalPosition<i32>, String> {
    on_main(app, |mtm| Ok(panel()?.position(mtm)))
}

pub fn set_position(app: &AppHandle, position: PhysicalPosition<i32>) -> Result<(), String> {
    on_main(app, move |mtm| {
        let panel = panel()?;
        let scale = panel.native.backingScaleFactor();
        panel.set_origin(NSPoint::new(
            position.x as f64 / scale,
            screen_top(mtm) - position.y as f64 / scale - panel.native.frame().size.height,
        ));
        Ok(())
    })
}

pub fn position_bottom_right(app: &AppHandle, offset_x: i32, offset_y: i32) -> Result<(), String> {
    on_main(app, move |mtm| {
        let panel = panel()?;
        let screen = panel
            .native
            .screen()
            .or_else(|| NSScreen::mainScreen(mtm))
            .ok_or("no monitor available")?;
        let area = screen.visibleFrame();
        let size = panel.native.frame().size;
        let scale = screen.backingScaleFactor();
        panel.set_origin(NSPoint::new(
            area.origin.x + area.size.width - size.width
                + (offset_x - super::window::OVERLAY_MARGIN_X) as f64 / scale,
            area.origin.y - offset_y as f64 / scale,
        ));
        Ok(())
    })
}

pub fn start_drag(app: &AppHandle) -> Result<(), String> {
    let started = on_main(app, move |_| {
        let panel = panel()?;
        if panel.dragging.get() || NSEvent::pressedMouseButtons() & 1 == 0 {
            return Ok(false);
        }
        let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
            NSEventType::LeftMouseDown,
            panel.native.convertPointFromScreen(NSEvent::mouseLocation()),
            NSEvent::modifierFlags_class(), NSProcessInfo::processInfo().systemUptime(),
            panel.native.windowNumber(), None, 0, 1, 1.0,
        ).ok_or("could not start pet drag")?;
        panel.dragging.set(true);
        panel.native.performWindowDragWithEvent(&event);
        // AppKit hands the drag to WindowServer and returns immediately. Mouse-up
        // need not reach the webview, so neither IPC completion nor pointerup ends it.
        Ok(true)
    })?;
    if started {
        let handle = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(20));
            let app = handle.clone();
            let finished = on_main(&handle, move |mtm| {
                let panel = panel()?;
                if NSEvent::pressedMouseButtons() & 1 != 0 {
                    return Ok(false);
                }
                panel.finish_drag(&app, mtm)?;
                Ok(true)
            });
            match finished {
                Ok(false) => continue,
                Ok(true) => break,
                Err(error) => {
                    eprintln!("failed to finish pet drag: {error}");
                    break;
                }
            }
        });
    }
    Ok(())
}

#[cfg(debug_assertions)]
#[allow(dead_code)] // Used by the isolated native regression example.
pub fn probe(
    app: &AppHandle,
    displace: bool,
) -> Result<(bool, bool, PhysicalPosition<i32>), String> {
    on_main(app, move |mtm| {
        let panel = panel()?;
        if displace {
            let target = panel.target.get();
            panel
                .native
                .setFrameOrigin(NSPoint::new(target.x + 80.0, target.y + 40.0));
        }
        Ok((
            panel.native.isOnActiveSpace(),
            panel.native.isVisible(),
            panel.position(mtm),
        ))
    })
}

#[cfg(debug_assertions)]
#[allow(dead_code)]
pub fn probe_drag_lifecycle(app: &AppHandle) -> Result<(), String> {
    let handle = app.clone();
    on_main(app, move |mtm| {
        let panel = panel()?;
        if panel.dragging.get() {
            return Err("finish the current drag before verifying".into());
        }
        let original = panel.target.get();
        let destination = NSPoint::new(original.x - 80.0, original.y + 40.0);
        panel.dragging.set(true);
        panel.native.setFrameOrigin(destination);
        // Exercise the actual NSWindowDidMove callback while WindowServer owns the
        // gesture, including after performWindowDragWithEvent would have returned.
        assert_eq!(panel.native.frame().origin, destination);
        assert_eq!(panel.target.get(), original, "do not commit before release");
        panel.finish_drag(&handle, mtm)?;
        assert_eq!(panel.target.get(), destination);
        panel.native.setFrameOrigin(original);
        assert_eq!(
            panel.native.frame().origin,
            destination,
            "OS movement must use the new target"
        );
        panel.set_origin(original);
        super::window::save_position(&handle, panel.position(mtm))?;
        Ok(())
    })
}
