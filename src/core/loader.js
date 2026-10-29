// Drives the HTML loader in index.html (it is visible before any script runs,
// so there is never a black screen while the game boots): a single line of
// text naming the current stage, with dots ticking after it.

const root = document.getElementById("loader");
const label = root?.querySelector(".label");
const text = root?.querySelector(".text");
let current = 0;

/** Records progress (for assistive tech) and, if given, switches the stage text. */
export function progress(fraction, stage) {
  if (!root) return;
  current = Math.max(current, Math.min(1, fraction));
  root.setAttribute("aria-valuenow", String(Math.round(current * 100)));
  if (stage) {
    // Strip any dots: the ticking dots are drawn by the loader itself.
    stage = stage.replace(/\.+$/, "");
    if (stage === text.textContent) return;
    label.classList.add("swap");
    setTimeout(() => {
      text.textContent = stage;
      label.classList.remove("swap");
    }, 250);
  }
}

/** Fades the loader out over the first rendered frames. */
export function finish() {
  if (!root) return;
  progress(1);
  root.classList.add("done");
  setTimeout(() => root.remove(), 900);
}

/** Shown instead of a stage when the game can't start (e.g. no WebGL). */
export function fail(message) {
  if (!root) return;
  text.textContent = message;
  root.querySelector(".dots")?.remove();
}
