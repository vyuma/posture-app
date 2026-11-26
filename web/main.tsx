import React from "react";
import { AuthPage } from '../src/features/accounts/AuthPage';
import { NativeLogin } from "./NativeLogin";
import ReactDOM from "react-dom/client";

import App from "../src/features/work/WorkApp";
import {
  DeveloperAccessProvider,
  useDeveloperAccess,
} from "../src/features/developer/DeveloperAccessContext";
import { DeveloperLoginPage } from "../src/features/developer/DeveloperLoginPage";
import { LandingPage } from "../src/features/landing/LandingPage";
import { LegalPageView } from "../src/features/legal/LegalContent";

const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isDeveloperLogin = normalizedPath === "/dev/login";
const isAnagoMotionPreview =
  normalizedPath === "/dev/anago";
const AnagoMotionPreview =
  isAnagoMotionPreview
    ? React.lazy(() => import("../src/features/overlay/AnagoMotionPreview"))
    : null;

const WorkPreview = import.meta.env.DEV ? React.lazy(() => import("../src/features/work/WorkPreview")) : null;
const TimelapsePreview = import.meta.env.DEV ? React.lazy(() => import("../src/features/timelapse/TimelapsePreview")) : null;

function RootRoute() {
  const { enabled, status } = useDeveloperAccess();
  if (["/login","/signup","/forgot-password","/reset-password"].includes(normalizedPath)) return <AuthPage mode={normalizedPath.slice(1) as "login"|"signup"|"forgot-password"|"reset-password"} />;
  if (normalizedPath === "/account/native") return <NativeLogin />;

  if (normalizedPath === '/privacy' || normalizedPath === '/support') return <LegalPageView page={normalizedPath === '/privacy' ? 'privacy' : 'support'} />;

  if (WorkPreview && normalizedPath === "/dev/work") return <React.Suspense fallback={null}><WorkPreview /></React.Suspense>;
  if (TimelapsePreview && normalizedPath === "/dev/timelapse") return <React.Suspense fallback={null}><TimelapsePreview /></React.Suspense>;

  if (isDeveloperLogin) {
    return <DeveloperLoginPage />;
  }

  if (AnagoMotionPreview) {
    if (status === "checking") {
      return null;
    }
    if (!enabled) {
      window.location.replace("/dev/login");
      return null;
    }

    return (
      <React.Suspense fallback={null}>
        <AnagoMotionPreview />
      </React.Suspense>
    );
  }


  if (normalizedPath === "/") {
    return <LandingPage />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DeveloperAccessProvider>
      <RootRoute />
    </DeveloperAccessProvider>
  </React.StrictMode>,
);
