import { createRoot } from "react-dom/client";
import { WorkOverlayApp } from "./WorkOverlayApp";
// The Store panel is AppKit; its hidden Tauri host must not run a second renderer.
if (import.meta.env.VITE_DISTRIBUTION_CHANNEL !== 'mac-app-store') {
  createRoot(document.getElementById("root") as HTMLElement).render(<WorkOverlayApp />);
}
