import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App.jsx";
import { logUiError } from "./utils/uiErrors";

// React's own error reporting would print the full message and stack. The
// app's error boundary already logs the error type and its reference, so the
// caught case logs nothing more; anything else logs its type only.
createRoot(document.getElementById("root"), {
  onCaughtError: () => {},
  onUncaughtError: (error) => logUiError(error, "uncaught"),
  onRecoverableError: (error) => logUiError(error, "recovered"),
}).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
