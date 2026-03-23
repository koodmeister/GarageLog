import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// On Windows in dev mode, WebView2 injects window.__TAURI_INTERNALS__ via
// AddScriptToExecuteOnDocumentCreated which is async. The Vite HTTP dev server
// can serve the page and React can mount before that injection completes,
// causing invoke() to throw. Poll until the bridge is available before rendering.
async function waitForTauriBridge(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(window as Record<string, unknown>).__TAURI_INTERNALS__) {
    if (Date.now() >= deadline) return; // not in Tauri — render anyway
    await new Promise<void>((r) => setTimeout(r, 10));
  }
}

waitForTauriBridge().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
