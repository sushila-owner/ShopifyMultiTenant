import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Filter out benign ResizeObserver errors that trigger false positive runtime error overlays
// This is a known browser behavior, not an actual error in our code
const resizeObserverErr = "ResizeObserver loop";

// Suppress ResizeObserver errors in window.onerror
const origError = window.onerror;
window.onerror = function (message, source, lineno, colno, error) {
  if (typeof message === "string" && message.includes(resizeObserverErr)) {
    return true;
  }
  if (error?.message?.includes(resizeObserverErr)) {
    return true;
  }
  return origError ? origError(message, source, lineno, colno, error) : false;
};

// Suppress ResizeObserver errors in error events (captures them before other handlers)
window.addEventListener("error", (event) => {
  if (event.message?.includes(resizeObserverErr) || 
      event.error?.message?.includes(resizeObserverErr)) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return true;
  }
}, true);

// Override console.error to filter ResizeObserver messages
const origConsoleError = console.error;
console.error = (...args) => {
  const message = args.join(" ");
  if (message.includes(resizeObserverErr)) {
    return;
  }
  origConsoleError.apply(console, args);
};

createRoot(document.getElementById("root")!).render(<App />);
