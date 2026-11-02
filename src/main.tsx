import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts are bundled so the app works offline. Bricolage's "standard" build carries the width
// axis that the condensed numerals (font-stretch 75-82%) need; the default build has weight only.
import "@fontsource-variable/geist";
import "@fontsource-variable/bricolage-grotesque/standard.css";
import App from "./ui/App";

function render() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// The fonts load from disk in a few milliseconds; waiting for them avoids the hero number
// reflowing on first paint. Never wait long, though.
const fonts = Promise.all([
  document.fonts.load('400 16px "Geist Variable"'),
  document.fonts.load('600 16px "Geist Variable"'),
  document.fonts.load('800 100px "Bricolage Grotesque Variable"'),
]);
const timeout = new Promise((resolve) => setTimeout(resolve, 600));
Promise.race([fonts, timeout]).then(render, render);
