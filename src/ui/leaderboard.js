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
    this.letters = [0, 1, 2].map(() => add(new UIText({ text: "A", font: "body", size: 84, width: 100 })));
    this.ups = [0, 1, 2].map(() => add(new UIText({ text: "▲", size: 30, width: 80, ...VIOLET })));
    this.downs = [0, 1, 2].map(() => add(new UIText({ text: "▼", size: 30, width: 80, ...VIOLET })));
    this.ok = add(new UIText({ text: TEXT.ok, font: "title", size: 60, wobble: 0.03 }));
    this.skip = add(new UIText({ text: TEXT.skip, size: 18, ...VIOLET }));
    this.status = add(new UIText({ text: "", size: 20, width: 600, ...VIOLET }));
    this.name = ["A", "A", "A"];
    this.active = 0;
  }

  get elements() {
    return [...this.letters, ...this.ups, ...this.downs, this.ok, this.skip, this.status];
  }

  layout(place, { k, bottom }) {
    const y = bottom + 175 * k;
    this.letters.forEach((el, i) => place(el, (i - 1) * 96 * k, y));
    this.ups.forEach((el, i) => place(el, (i - 1) * 96 * k, y + 68 * k));
    this.downs.forEach((el, i) => place(el, (i - 1) * 96 * k, y - 64 * k));
    place(this.ok, 0, bottom + 66 * k);
    place(this.skip, 0, bottom + 24 * k);
    place(this.status, 0, bottom + 66 * k);
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
    if (this.ok.contains(x, y, 18)) return { type: "nameOk" };
    if (this.skip.contains(x, y, 14)) return { type: "nameSkip" };
    return null;
  }
}

/** The top ten (and the player's own row, if they placed lower). */
export class Board {
  constructor(add) {
    this.title = add(new UIText({ text: TEXT.boardTitle, font: "title", size: 66, width: 980, wobble: 0.01 }));
    const row = () => ({
      rank: add(new UIText({ text: "", font: "numbers", size: 34, anchor: "right", width: 110 })),
      name: add(new UIText({ text: "", font: "body", size: 32, anchor: "left", width: 150 })),
      score: add(new UIText({ text: "", font: "numbers", size: 34, anchor: "right", width: 240 })),
    });
    this.rows = Array.from({ length: ROWS }, row);
    this.you = row();
    this.status = add(new UIText({ text: "", size: 22, width: 640, ...VIOLET }));
  }

  get elements() {
    return [this.title, ...[...this.rows, this.you].flatMap((r) => [r.rank, r.name, r.score]), this.status];
  }

  layout(place, { k, top, fitWidth }) {
    place(this.title, 0, top - 100 * k);
    const column = Math.min(440 * k, fitWidth);
    const lay = (r, y) => {
      place(r.rank, -column / 2 + 70 * k, y, column * 0.25);
      place(r.name, -column / 2 + 95 * k, y, column * 0.3);
      place(r.score, column / 2, y, column * 0.45);
    };
    this.rows.forEach((r, i) => lay(r, top - 175 * k - i * 36 * k));
    lay(this.you, top - 175 * k - ROWS * 36 * k - 16 * k);
    place(this.status, 0, top - 300 * k);
  }

  /** `you`: { name, score, rank } for the run just played (rank may be null). */
  show(entries, you, delay = 0) {
    this.title.show({ duration: 1, delay });
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
    const fill = (r, position, entry, highlight, at) => {
      r.rank.setText(`${position}.`);
      r.name.setText(entry.name);
      r.score.setText(String(entry.score));
      for (const el of [r.rank, r.name, r.score]) {
        el.u.intensity.value = highlight ? 2.8 : 1.4;
        el.u.wobble.value = highlight ? 0.04 : 0;
        el.show({ duration: 0.5, delay: at });
      }
    };
    entries.slice(0, ROWS).forEach((entry, i) => fill(this.rows[i], i + 1, entry, you?.rank === i + 1, delay + 0.4 + i * 0.07));
    if (you?.rank && you.rank > ROWS) {
      fill(this.you, you.rank, you, true, delay + 0.4 + ROWS * 0.07);
    }
  }

  hide() {
    this.elements.forEach((el) => el.hide({ duration: 0.4 }));
  }
}
