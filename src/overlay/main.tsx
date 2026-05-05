import { createRoot } from "react-dom/client";
import { OverlayApp } from "./OverlayApp";
import "./OverlayApp.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <OverlayApp />,
);
