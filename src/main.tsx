import React from "react";
import ReactDOM from "react-dom/client";
import App from "./features/work/WorkApp";

const WorkPreview = import.meta.env.DEV && location.pathname === "/dev/work" ? React.lazy(() => import("./features/work/WorkPreview")) : null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {WorkPreview ? <React.Suspense fallback={null}><WorkPreview /></React.Suspense> : <App />}
  </React.StrictMode>,
);
