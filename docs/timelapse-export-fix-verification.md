# Timelapse export fix verification — 2026-10-29

## Confirmed failure and changes

A browser recording using VP9 in MP4 was playable by HTML video but rejected by the WebCodecs decoder used by composed export. Added bounded-memory HTML video seeking as a decoder fallback. WebCodecs remains the primary path. New recordings prefer supported H.264 Level 4.0 (including 1080p); compatible browser fallbacks remain. Camera-only export remains an original file copy. Composition remains silent and 1× regardless of playback speed.

Web file sharing is prepared before a fresh click invokes navigator.share, avoiding lost transient activation during composition. Exactly one File is passed, MIME excludes codec parameters, cancellation allows retry, and export resources are released. Browser policy/support is checked before offering the native sharing step. A policy-blocked browser downloads one video with an instruction to attach it to the destination.

macOS sharing uses NSSharingServicePicker with one file URL. The exported file is copied to Downloads before showing the picker, so temporary cleanup cannot invalidate the shared URL. Native code lives only in posture-app. Windows retains its file-save fallback.

## Runtime evidence

Evidence in the web repository: `output/timelapse-export/`.

- Web original VP9/MP4 regression: camera-only, pet, scene, pet+scene exports all passed; HTML fallback was exercised for composition. Output duration about 11.99474s, no audio.
- Fresh Chromium H.264 recording: 18s source excludes rest/pause/calibration to produce 11.99264s focus video. All four export configurations passed decoding at five timestamps (0, 2.5, 4.2, 6.5, near end), duration tolerance 0.05s, and zero audio tracks. Camera/pet 1280×720; scene/composed scene 1108×720.
- Actual macOS Tauri/WKWebView: all four configurations passed the same checks, duration 12.10333s; camera/pet 1280×720; scene/composed scene 1108×720. `native-four-modes.txt` captures the runtime results.
- Web save at player 16× produced a 1× H.264 1662×1080 silent scene video, 11.992969s. This checks 1080p output and that playback speed does not alter file speed.
- Actual macOS save and native share generated valid H.264 1108×720 silent files, 12.10333s. Sharing picker displayed one video (~133KB), then was canceled; no third-party message was sent. `native-share.txt` records the picker.
- The current Chrome verification browser exposed canShare but blocked `web-share` policy even with active user gesture, focused document and visible tab. After the policy guard, Share produced one downloaded MP4, 525346 bytes, H.264 1280×720, 11.992639s, no audio. `web-share-fallback.png` captures the successful fallback notice. No browser policy was bypassed.

Saved test files were inspected with ffprobe:

- PiiiN-2026-10-29T03-35-30-868Z.mp4 — web old codec composition.
- PiiiN-1793245276047.mp4 — macOS save.
- PiiiN-1793245286254.mp4 — macOS share file.
- PiiiN-2026-10-29T03-43-41-082Z.mp4 — 1080p / 16× player save.
- PiiiN-2026-10-29T08-25-29-011Z.mp4 — latest web Share fallback.

All files above are in the user's Downloads and contain isolated QA synthetic content. Real collection recordings were not deleted.

## Automated validation

Both repositories: `bun test scripts/timelapse.test.ts scripts/timelapse-export.test.ts` — 11 tests / 61 assertions, all pass. Tests cover fresh-gesture invocation, one file, cancellation without second download, blocked-policy fallback, abort cleanup, recording codec preference, focus-only timeline, pet state reconstruction, reset generation and disk failure.

Both `bun run build` passed; desktop `cargo check --manifest-path src-tauri/Cargo.toml` passed. Existing Lottie/bundle and unused pairing warnings remain. No publication or merge performed.

## Remaining coverage limits

Web OS sharing sheet could not be opened in the policy-blocked verification browser; its single-file API payload is covered by tests and the actual browser download fallback is verified. macOS native picker opening and file delivery were verified, but sending to a third party was intentionally not performed. Windows native execution was not available. Long competition-length recordings and arbitrary legacy codecs were not exhaustively tested; HTML fallback on native WKWebView with a WebCodecs-unsupported codec remains unverified (native H.264 uses the verified WebCodecs path). Original recordings remain intact when export fails or is canceled.
