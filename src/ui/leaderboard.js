import { TEXT } from "../config.js";
import { UIText } from "./elements.js";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const VIOLET = { colors: ["#e3d6ff", "#9b7bff"], glow: "#4a1f8a", intensity: 1.25 };
const ROWS = 10;

/**
 * Arcade-style three letter name entry: arrows above and below each letter
 * (tap or click), or type on a keyboard (letters, Backspace, arrows, Enter).
 */
export class NameEntry {
  constructor(add) {
    this.letters = [0, 1, 2].map(() => add(new UIText({ text: "A", size: 84, width: 100 })));
    this.ups = [0, 1, 2].map(() => add(new UIText({ text: "▲", size: 30, width: 80, ...VIOLET })));
    this.downs = [0, 1, 2].map(() => add(new UIText({ text: "▼", size: 30, width: 80, ...VIOLET })));
    this.ok = add(new UIText({ text: TEXT.ok, size: 56, wobble: 0.03 }));
    this.skip = add(new UIText({ text: TEXT.skip, size: 26, ...VIOLET }));
    this.status = add(new UIText({ text: "", size: 20, width: 600, ...VIOLET }));
    this.name = ["A", "A", "A"];
    this.active = 0;
  }

  get elements() {
    return [...this.letters, ...this.ups, ...this.downs, this.ok, this.skip, this.status];
  }

  layout(place, { k, bottom }) {
    // Letters with their arrows, then OK with SKIP beside it. Spacing
    // is capped so on big screens the block stays under the results text.
    k = Math.min(k, 0.85);
    const y = bottom + 232 * k;
    this.letters.forEach((el, i) => place(el, (i - 1) * 96 * k, y));
    this.ups.forEach((el, i) => place(el, (i - 1) * 96 * k, y + 68 * k));
    this.downs.forEach((el, i) => place(el, (i - 1) * 96 * k, y - 64 * k));
    // OK centred under the letters, SKIP off to its side on the same line.
    place(this.ok, 0, bottom + 92 * k);
    place(this.skip, 190 * k, bottom + 92 * k);
    place(this.status, 0, bottom + 92 * k);
  }

  get value() {
    return this.name.join("");
  }

  show(name, delay = 0) {
    this.name = [...name];
    this.active = 0;
    this.refresh();
    [...this.ups, ...this.letters, ...this.downs, this.ok, this.skip].forEach((el, i) =>
      el.show({ duration: 0.6, delay: delay + i * 0.04 }),
    );
  }

  hide() {
    this.elements.forEach((el) => el.hide({ duration: 0.4 }));
  }

  setStatus(text) {
    this.ok.hide({ duration: 0.2 });
    this.skip.hide({ duration: 0.2 });
    this.status.setText(text);
    this.status.show({ duration: 0.4 });
  }

  refresh() {
    this.letters.forEach((el, i) => {
      el.setText(this.name[i]);
      el.u.intensity.value = i === this.active ? 2.6 : 1.3;
      el.u.wobble.value = i === this.active ? 0.05 : 0;
    });
  }

  select(index) {
    this.active = Math.max(0, Math.min(2, index));
    this.refresh();
  }

  cycle(index, step) {
    const at = CHARSET.indexOf(this.name[index]);
    this.name[index] = CHARSET[(at + step + CHARSET.length) % CHARSET.length];
    this.active = index;
    this.refresh();
    this.letters[index].punch = 0.5;
  }

  type(char) {
    if (!CHARSET.includes(char)) return;
    this.name[this.active] = char;
    this.letters[this.active].punch = 0.5;
    this.active = Math.min(2, this.active + 1);
    this.refresh();
  }

  backspace() {
    this.active = Math.max(0, this.active - 1);
    this.refresh();
  }

  pick(x, y) {
    for (let i = 0; i < 3; i++) {
      if (this.ups[i].contains(x, y, 14)) return { type: "nameUp", index: i };
      if (this.downs[i].contains(x, y, 14)) return { type: "nameDown", index: i };
      if (this.letters[i].contains(x, y, 4)) return { type: "nameLetter", index: i };
    }
    if (this.ok.contains(x, y, 10)) return { type: "nameOk" };
    if (this.skip.contains(x, y, 16)) return { type: "nameSkip" };
    return null;
  }
}

/**
 * The top 100, ten rows per page: arrows (or wheel, arrow keys, swipe) page
 * through it, and it opens on the page holding the player's own entry. A run
 * that missed the top 100 is shown on an extra row below.
 */
export class Board {
  constructor(add) {
    this.title = add(new UIText({ text: TEXT.boardTitle, size: 66, width: 980, wobble: 0.01 }));
    const row = () => ({
      rank: add(new UIText({ text: "", size: 34, anchor: "right", width: 110 })),
      name: add(new UIText({ text: "", size: 32, anchor: "left", width: 150 })),
      // Best combo in the blood red of the in-game multiplier.
      combo: add(new UIText({ text: "", size: 30, anchor: "right", width: 130, colors: ["#ffb08a", "#ff2a10"], glow: "#ff1a00" })),
      score: add(new UIText({ text: "", size: 34, anchor: "right", width: 220 })),
    });
    this.rows = Array.from({ length: ROWS }, row);
    this.you = row();
    this.status = add(new UIText({ text: "", size: 22, width: 640, ...VIOLET }));
    this.up = add(new UIText({ text: "▲", size: 30, width: 90, ...VIOLET }));
    this.down = add(new UIText({ text: "▼", size: 30, width: 90, ...VIOLET }));
    this.pageLabel = add(new UIText({ text: "", size: 22, width: 220, ...VIOLET }));
    this.entries = [];
    this.page = 0;
    this.open = false;
  }

  get pages() {
    return Math.max(1, Math.ceil(this.entries.length / ROWS));
  }

  get elements() {
    return [
      this.title,
      ...[...this.rows, this.you].flatMap((r) => [r.rank, r.name, r.combo, r.score]),
      this.status,
      this.up,
      this.down,
      this.pageLabel,
    ];
  }

  layout(place, { k, top, fitWidth }) {
    place(this.title, 0, top - 100 * k);
    // rank | name | best combo | score
    const column = Math.min(520 * k, fitWidth);
    const lay = (r, y) => {
      place(r.rank, -column / 2 + 0.12 * column, y, column * 0.24);
      place(r.name, -column / 2 + 0.17 * column, y, column * 0.3);
      place(r.combo, column * 0.12, y, column * 0.22);
      place(r.score, column / 2, y, column * 0.36);
    };
    const first = top - 185 * k;
    this.rows.forEach((r, i) => lay(r, first - i * 36 * k));
    place(this.status, 0, top - 300 * k);
    // Pager under the rows: ▲  31–40 / 100  ▼
    const pager = first - ROWS * 36 * k - 4 * k;
    const gap = Math.min(150 * k, fitWidth / 2 - 30);
    place(this.up, -gap, pager);
    place(this.pageLabel, 0, pager);
    place(this.down, gap, pager);
    // A run outside the top 100 sits below the pager.
    lay(this.you, pager - 46 * k);
  }

  loading() {
    this.title.show({ duration: 1 });
    this.status.setText(TEXT.boardLoading);
    this.status.show({ duration: 0.6, delay: 0.3 });
  }

  /** `you`: { name, score, rank } for the run just played (rank may be null). */
  show(entries, you, delay = 0) {
    this.title.show({ duration: 1, delay });
    this.status.hide({ duration: 0.3 });
    this.entries = entries ?? [];
    this.yourRun = you;
    this.page = you?.rank ? Math.min(Math.floor((you.rank - 1) / ROWS), this.pages - 1) : 0;
    this.open = Boolean(entries?.length);
    if (!entries) {
      this.status.setText(TEXT.boardOffline);
      this.status.show({ duration: 0.6, delay: delay + 0.4 });
      return;
    }
    if (entries.length === 0) {
      this.status.setText(TEXT.boardEmpty);
      this.status.show({ duration: 0.6, delay: delay + 0.4 });
      return;
    }
    this.render(delay + 0.4);
    // Outside the top 100: still show the player's run under the list.
    if (you && !you.rank) this.fill(this.you, "–", you, true, delay + 0.4 + ROWS * 0.07);
  }

  fill(r, position, entry, highlight, at) {
    r.rank.setText(`${position}.`);
    r.name.setText(entry.name);
    r.score.setText(String(entry.score));
    r.combo.setText(entry.best_combo ? `x${entry.best_combo}` : "");
    for (const el of [r.rank, r.name, r.combo, r.score]) {
      el.u.intensity.value = highlight ? 2.8 : 1.4;
      el.u.wobble.value = highlight ? 0.04 : 0;
      el.show({ duration: 0.4, delay: at });
    }
  }

  /** Draws the current page; rows burn in one after another. */
  render(delay = 0) {
    const start = this.page * ROWS;
    const yourRank = this.yourRun?.rank;
    this.rows.forEach((r, i) => {
      const entry = this.entries[start + i];
      if (entry) this.fill(r, start + i + 1, entry, yourRank === start + i + 1, delay + i * 0.05);
      else for (const el of [r.rank, r.name, r.combo, r.score]) el.hide({ duration: 0.2 });
    });
    const paged = this.pages > 1;
    this.pageLabel.setText(`${start + 1}–${Math.min(start + ROWS, this.entries.length)} / ${this.entries.length}`);
    for (const el of [this.pageLabel, this.up, this.down]) {
      if (paged) el.show({ duration: 0.4, delay });
      else el.hide({ duration: 0.2 });
    }
    this.up.u.intensity.value = this.page > 0 ? 1.6 : 0.35;
    this.down.u.intensity.value = this.page < this.pages - 1 ? 1.6 : 0.35;
  }

  /** Moves `step` pages; returns whether the page changed. */
  turn(step) {
    if (!this.open) return false;
    const page = Math.max(0, Math.min(this.pages - 1, this.page + step));
    if (page === this.page) return false;
    this.page = page;
    this.render();
    return true;
  }

  pick(x, y) {
    if (!this.open) return null;
    if (this.up.contains(x, y, 18)) return { type: "boardPage", step: -1 };
    if (this.down.contains(x, y, 18)) return { type: "boardPage", step: 1 };
    return null;
  }

  hide() {
    this.open = false;
    this.elements.forEach((el) => el.hide({ duration: 0.4 }));
  }
}
