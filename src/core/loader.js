// Drives the HTML loader in index.html (it is visible before any script runs,
// so there is never a black screen while the game boots).

const root = document.getElementById("loader");
const fill = root?.querySelector(".fill");
const label = root?.querySelector(".label");
let current = 0;

/** Moves the bar to `fraction` (never backwards) and optionally relabels it. */
export function progress(fraction, text) {
  if (!root) return;
  current = Math.max(current, Math.min(1, fraction));
  fill.style.width = `${Math.round(current * 100)}%`;
  root.setAttribute("aria-valuenow", String(Math.round(current * 100)));
  if (text) label.textContent = text;
}

/** Fades the loader out over the first rendered frames. */
export function finish() {
  if (!root) return;
  progress(1);
  root.classList.add("done");
  setTimeout(() => root.remove(), 900);
}

/** Shown in place of the bar when the game can't start (e.g. no WebGL). */
export function fail(text) {
  if (!root) return;
  label.textContent = text;
  root.querySelector(".bar").style.display = "none";
}
