import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { RemotePairingApp } from "./features/pairing/remote/RemotePairingApp";
import { parseRemotePairingSearch } from "./features/pairing/remote/parseRemotePairingSearch";

const remotePairing = parseRemotePairingSearch(window.location.search);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {remotePairing !== null ? (
      <RemotePairingApp config={remotePairing} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
