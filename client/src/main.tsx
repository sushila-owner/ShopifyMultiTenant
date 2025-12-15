import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Filter out benign ResizeObserver errors that trigger false positive runtime error overlays
const resizeObserverErr = "ResizeObserver loop";
const origError = window.onerror;
window.onerror = function (message, source, lineno, colno, error) {
  if (typeof message === "string" && message.includes(resizeObserverErr)) {
    return true; // Suppress the error
  }
  return origError ? origError(message, source, lineno, colno, error) : false;
};

// Also handle unhandled rejections that might contain ResizeObserver errors
window.addEventListener("error", (event) => {
  if (event.message?.includes(resizeObserverErr)) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return true;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
