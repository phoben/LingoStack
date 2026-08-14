import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// This dynamic import is compiled only in the E2E Vite mode. It installs the
// WDIO execute/log bridge before the test runner interacts with the window.
if (import.meta.env.MODE === "e2e") {
  void import("@wdio/tauri-plugin");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
