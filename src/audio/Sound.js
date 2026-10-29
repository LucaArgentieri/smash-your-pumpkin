// All audio is synthesised with Web Audio: no files to download.
//
// - Music: a creepy music-box loop in A harmonic minor over a bass and a soft
//   pad. Combo heat adds hats, kick and snare and opens the filter.
// - Hits: one body per weapon plus a wet pumpkin "splat"; every hit in a combo
//   also rings a note that climbs the A minor pentatonic (the Peggle/Balatro
//   hook). Rank ups, switches, cash-outs and broken combos have their own cues.

const BPM = 100;
const STEP = 60 / BPM / 4; // a sixteenth
const LOOKAHEAD = 0.12;
const STORAGE_KEY = "smash-your-pumpkin:sound";

const A4 = 440;
const hz = (semitones) => A4 * Math.pow(2, semitones / 12);

// Am, F, Dm, E: the E major chord's G# gives the harmonic-minor creep.
const CHORDS = [
  [-12, -9, -5], // A3 C4 E4
  [-16, -12, -9], // F3 A3 C4
  [-19, -16, -12], // D3 F3 A3
  [-17, -13, -10], // E3 G#3 B3
];
// Music-box arpeggio over the chord tones (index into tones across octaves).
const ARP = [0, 2, 4, 2, 3, 5, 4, 2, 0, 2, 4, 5, 6, 5, 4, 2];
const PENTATONIC = [0, 3, 5, 7, 10];

export class Sound {
  constructor() {
    this.enabled = readEnabled();
    this.ctx = null;
    this.heat = 0;
  }

  /** Must run inside a user gesture (browser autoplay rules). */
  unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.init(new Context());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.ctx.suspend();
        else if (this.enabled) this.ctx.resume();
      });
    }
    if (this.enabled && this.ctx.state !== "running") this.ctx.resume();
    if (this.enabled) this.startMusic();
  }

  /** Builds the mixer on `ctx` (an OfflineAudioContext works too). */
  init(ctx) {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(compressor).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);

    // Music bus with a lowpass that opens as the combo heats up.
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 1800;
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.musicFilter).connect(this.master);

    // Echo for the music box and the combo notes.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.echo.connect(feedback).connect(this.echo);
    this.echo.connect(wet).connect(this.master);

    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  get now() {
    return this.ctx.currentTime;
  }

  get ready() {
    return Boolean(this.ctx) && this.enabled;
  }

  toggle() {
    this.enabled = !this.enabled;
    writeEnabled(this.enabled);
    if (!this.ctx) return this.enabled;
    this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, this.now, 0.05);
    if (this.enabled) {
      this.ctx.resume();
      this.startMusic();
    }
    return this.enabled;
  }

  /** 0..1, from the combo: drives the music's intensity. */
  setHeat(heat) {
    if (Math.abs(heat - this.heat) < 0.01) return;
    this.heat = heat;
    if (this.ctx) this.musicFilter.frequency.setTargetAtTime(1800 + heat * 6000, this.now, 0.3);
  }

  // --- Voices -------------------------------------------------------------------

  tone({ type = "sine", freq, to = freq, t = this.now, dur = 0.2, gain = 0.3, attack = 0.004, out = this.sfx, echo = 0 }) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(out);
    if (echo) {
      const send = this.ctx.createGain();
      send.gain.value = echo;
      env.connect(send).connect(this.echo);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ t = this.now, dur = 0.1, gain = 0.3, filter = "bandpass", freq = 1000, to = freq, q = 1, out = this.sfx }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(freq, t);
    if (to !== freq) bq.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq).connect(env).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // --- Game cues ----------------------------------------------------------------

  /** Impact on swing. `onPumpkin` adds the wet splat. */
  hit(toolId, { onPumpkin = true, t = this.now } = {}) {
    if (!this.ready) return;
    if (toolId === "fist") {
      this.tone({ freq: 170, to: 55, dur: 0.09, gain: 0.55, t });
      this.noise({ freq: 1400, dur: 0.04, gain: 0.35, q: 0.8, t });
    } else if (toolId === "mallet") {
      this.tone({ freq: 120, to: 32, dur: 0.22, gain: 0.8, t });
      this.tone({ type: "triangle", freq: 70, to: 40, dur: 0.18, gain: 0.35, t });
      this.noise({ filter: "lowpass", freq: 900, to: 200, dur: 0.18, gain: 0.5, t });
    } else {
      // Axe: a bright metallic shing over a short chop.
      this.noise({ filter: "highpass", freq: 5000, to: 2500, dur: 0.12, gain: 0.3, t });
      this.tone({ type: "square", freq: 1650, to: 1500, dur: 0.07, gain: 0.05, t });
      this.tone({ freq: 210, to: 70, dur: 0.08, gain: 0.45, t });
    }
    if (onPumpkin) this.noise({ freq: 950, to: 260, q: 2.5, dur: 0.13, gain: 0.4, t: t + 0.01 });
  }

  /** Pumpkin bursts open. */
  burst(t = this.now) {
    if (!this.ready) return;
    this.tone({ freq: 90, to: 28, dur: 0.4, gain: 0.7, t });
    this.noise({ filter: "lowpass", freq: 2400, to: 180, dur: 0.38, gain: 0.55, t });
    this.noise({ freq: 700, to: 200, q: 3, dur: 0.25, gain: 0.45, t: t + 0.03 });
    for (let i = 0; i < 4; i++) this.noise({ freq: 1500 + Math.random() * 1500, q: 6, dur: 0.05, gain: 0.15, t: t + 0.06 + i * 0.045 });
  }

  /** A shard ground to dust: a little sparkle. */
  dust(t = this.now) {
    if (!this.ready) return;
    [0, 4, 7].forEach((s, i) => this.tone({ type: "triangle", freq: hz(24 + s), dur: 0.18, gain: 0.08, t: t + i * 0.035, echo: 0.3 }));
  }

  /** A swing at nothing. */
  whiff(t = this.now) {
    if (!this.ready) return;
    this.noise({ freq: 600, to: 1800, q: 1.2, dur: 0.16, gain: 0.12, t });
  }

  /** Every combo step rings the next note up the pentatonic scale. */
  comboUp(combo, { rankUp = false, switched = false, t = this.now } = {}) {
    if (!this.ready || combo < 2) return;
    const i = Math.min(combo - 2, 14);
    const semis = PENTATONIC[i % 5] + 12 * Math.floor(i / 5);
    this.tone({ type: "triangle", freq: hz(semis), dur: 0.16, gain: 0.16, t, echo: 0.25 });
    this.tone({ type: "sine", freq: hz(semis + 12), dur: 0.08, gain: 0.05, t });
    if (switched) {
      this.tone({ type: "square", freq: hz(semis + 7), dur: 0.07, gain: 0.05, t: t + 0.05 });
      this.tone({ type: "square", freq: hz(semis + 12), dur: 0.1, gain: 0.05, t: t + 0.1 });
    }
    if (rankUp) {
      [0, 3, 7, 12, 15].forEach((s, n) =>
        this.tone({ type: "square", freq: hz(semis + s), dur: 0.22, gain: 0.06, t: t + 0.06 + n * 0.05, echo: 0.4 }),
      );
      this.noise({ filter: "highpass", freq: 2000, to: 8000, dur: 0.35, gain: 0.08, t });
    }
  }

  /** Combo banked: a cascade of coins climbing to a chord. */
  cashOut(combo, t = this.now) {
    if (!this.ready) return;
    const notes = Math.min(4 + Math.floor(combo / 4), 14);
    for (let n = 0; n < notes; n++) {
      const semis = PENTATONIC[n % 5] + 12 * Math.floor(n / 5);
      this.tone({ type: "square", freq: hz(semis), dur: 0.12, gain: 0.05, t: t + n * 0.045, echo: 0.2 });
    }
    const end = t + notes * 0.045;
    [0, 3, 7, 12].forEach((s) => this.tone({ type: "triangle", freq: hz(s + 12), dur: 0.7, gain: 0.08, t: end, echo: 0.4 }));
  }

  /** Combo lost: a sad descending wah-wah. */
  broken(t = this.now) {
    if (!this.ready) return;
    [0, -1, -2, -6].forEach((s, n) =>
      this.tone({ type: "sawtooth", freq: hz(s - 12), to: hz(s - 13), dur: n === 3 ? 0.5 : 0.18, gain: 0.07, t: t + n * 0.2 }),
    );
  }

  /** Switching weapon outside a combo. */
  select(index, t = this.now) {
    if (!this.ready) return;
    this.tone({ type: "triangle", freq: hz(-5 + index * 4), dur: 0.06, gain: 0.1, t });
  }

  /** UI taps (name entry and buttons). */
  blip(t = this.now) {
    if (!this.ready) return;
    this.tone({ type: "square", freq: 660, dur: 0.05, gain: 0.04, t });
  }

  /** Clock tick in the last ten seconds, more urgent as it nears zero. */
  tick(seconds, t = this.now) {
    if (!this.ready) return;
    this.tone({ type: "square", freq: seconds <= 3 ? 1320 : 990, dur: 0.04, gain: 0.07, t });
    this.noise({ filter: "highpass", freq: 4000, dur: 0.02, gain: 0.1, t });
  }

  stinger(kind, t = this.now) {
    if (!this.ready) return;
    if (kind === "ready") {
      this.tone({ freq: 70, to: 45, dur: 0.6, gain: 0.5, t });
      [-12, -9, -5].forEach((s) => this.tone({ type: "triangle", freq: hz(s), dur: 0.8, gain: 0.07, t, echo: 0.3 }));
    } else if (kind === "go") {
      this.tone({ freq: 110, to: 30, dur: 0.5, gain: 0.8, t });
      this.noise({ filter: "lowpass", freq: 3000, to: 300, dur: 0.5, gain: 0.4, t });
      [0, 3, 7].forEach((s) => this.tone({ type: "sawtooth", freq: hz(s - 12), dur: 0.5, gain: 0.06, t }));
    } else {
      // Time's up: a low tolling bell.
      [0, 0.55].forEach((d) => {
        this.tone({ freq: hz(-21), dur: 1.8, gain: 0.4, t: t + d });
        this.tone({ freq: hz(-21) * 2.76, dur: 1.2, gain: 0.08, t: t + d });
      });
    }
  }

  // --- Music --------------------------------------------------------------------

  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.step = 0;
    this.nextStep = this.now + 0.1;
    this.musicTimer = setInterval(() => {
      if (this.ctx.state !== "running") return;
      // Don't try to catch up after the tab was hidden.
      if (this.nextStep < this.now) this.nextStep = this.now + 0.05;
      while (this.nextStep < this.now + LOOKAHEAD) {
        this.playStep(this.step++, this.nextStep);
        this.nextStep += STEP;
      }
    }, 25);
  }

  /** One sixteenth of the loop at time `t` (also used for offline renders). */
  playStep(step, t) {
    const bar = Math.floor(step / 16) % CHORDS.length;
    const s = step % 16;
    const chord = CHORDS[bar];
    const heat = this.heat;
    const out = this.music;

    if (s === 0) {
      // Pad: a soft, slowly swelling chord for the whole bar.
      chord.forEach((n) =>
        this.tone({ type: "sawtooth", freq: hz(n), dur: STEP * 16, gain: 0.025, attack: STEP * 4, out, t }),
      );
    }
    if (s === 0 || s === 8 || (heat > 0.5 && s === 14)) {
      this.tone({ type: "triangle", freq: hz(chord[0] - 12), dur: STEP * 6, gain: 0.32, out, t });
    }
    // Music box: eighths when calm, sixteenths once the combo heats up.
    if (s % 2 === 0 || heat > 0.3) {
      const index = ARP[s];
      const note = chord[index % 3] + 12 * (Math.floor(index / 3) + 1);
      this.tone({ type: "triangle", freq: hz(note), dur: STEP * 3, gain: s % 2 ? 0.05 : 0.09, out, echo: 0.35, t });
      this.tone({ type: "sine", freq: hz(note) * 3, dur: STEP, gain: 0.012, out, t });
    }
    if (heat > 0.12 && s % 2 === 1) this.noise({ filter: "highpass", freq: 7000, dur: 0.03, gain: 0.05 + heat * 0.06, out, t });
    if (heat > 0.35 && (s === 0 || s === 8 || s === 10)) this.tone({ freq: 140, to: 40, dur: 0.16, gain: 0.5, out, t });
    if (heat > 0.6 && (s === 4 || s === 12)) this.noise({ freq: 1800, q: 0.7, dur: 0.12, gain: 0.22, out, t });
  }
}

function readEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Not remembered in private mode.
  }
}
