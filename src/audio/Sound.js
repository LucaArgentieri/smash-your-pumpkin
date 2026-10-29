// All audio is synthesised with Web Audio: no files to download.
//
// - Music: a low, driving loop for venting: a distorted bass riff in A minor
//   over a heavy kick and a dark drone. Combo heat brings in double kicks, a
//   snare, distorted power-chord stabs and opens the filter.
// - Voice: a deep announcer calls out each combo rank (pre-rendered lines in
//   public/voice/, made with scripts/build-voice.sh).
// - Hits: a short, clean "thock" (click transient + falling low body), a little
//   different per weapon; every hit in a combo also rings a low note that climbs
//   the A minor pentatonic (the Peggle/Balatro hook). Rank ups, switches,
//   cash-outs and broken combos have their own cues.

const BPM = 112;
const STEP = 60 / BPM / 4; // a sixteenth
const LOOKAHEAD = 0.12;
const STORAGE_KEY = "smash-your-pumpkin:sound";

const A4 = 440;
const hz = (semitones) => A4 * Math.pow(2, semitones / 12);

// Riff roots, one bar each: A, A, F, E (semitones from A4; A1 is -36).
const ROOTS = [-36, -36, -40, -41];
// Sixteenth riff: 0 = root, 12 = octave, 1 = flat second (the menace), null = rest.
const RIFF = [0, null, 0, 0, 12, null, 0, 1, 0, null, 0, 0, 12, 0, 1, 0];
const PENTATONIC = [0, 3, 5, 7, 10];
// Combo notes start at D2 and climb from there: low, felt more than heard.
const COMBO_BASE = -31;
// Announcer lines for the combo ranks (public/voice/<rank>.mp3).
const VOICE_LINES = ["wicked", "grim", "ghastly", "unholy", "damned", "apocalyptic"];

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
      this.loadVoices();
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
    this.master.gain.value = this.enabled ? 0.75 : 0;
    this.master.connect(compressor).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);

    // Music bus with a lowpass that opens as the combo heats up.
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 900;
    this.music = ctx.createGain();
    this.music.gain.value = 0.34;
    this.music.connect(this.musicFilter).connect(this.master);

    // Grit for the bass riff and the stabs: soft-clipping into a lowpass.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    shaper.curve = curve;
    shaper.oversample = "2x";
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1400;
    this.dirt = ctx.createGain();
    this.dirt.gain.value = 0.6;
    this.dirt.connect(shaper).connect(tone).connect(this.music);

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

  /** Fetches and decodes the announcer lines in the background. */
  loadVoices() {
    this.voices = {};
    for (const name of VOICE_LINES) {
      fetch(`${import.meta.env.BASE_URL}voice/${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => (this.voices[name] = buffer))
        .catch(() => {});
    }
  }

  /** Deep announcer voice for a combo rank; the music ducks under it. */
  announce(rank, t = this.now) {
    const buffer = this.ready && this.voices?.[rank?.toLowerCase()];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 1.1;
    src.connect(gain).connect(this.master);
    src.start(t);
    const duck = this.music.gain;
    duck.cancelScheduledValues(t);
    duck.setTargetAtTime(0.12, t, 0.04);
    duck.setTargetAtTime(0.34, t + Math.min(buffer.duration, 1.4), 0.3);
  }

  // Cues take `t = this.now` as a default argument, evaluated before their
  // ready check, so this must not throw while audio is still locked.
  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  get ready() {
    return Boolean(this.ctx) && this.enabled;
  }

  toggle() {
    this.enabled = !this.enabled;
    writeEnabled(this.enabled);
    if (!this.ctx) return this.enabled;
    this.master.gain.setTargetAtTime(this.enabled ? 0.75 : 0, this.now, 0.05);
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
    if (this.ctx) this.musicFilter.frequency.setTargetAtTime(900 + heat * 4500, this.now, 0.3);
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

  /**
   * Impact on swing: a short, clean "thock". A tiny click for the attack, then
   * a low sine body that drops in pitch; each weapon shifts the weight. The
   * splat on pumpkin is kept short and dark so repeated hits stay crisp.
   */
  hit(toolId, { onPumpkin = true, t = this.now } = {}) {
    if (!this.ready) return;
    const body = { fist: [190, 70, 0.08, 0.7], mallet: [130, 42, 0.16, 0.95], axe: [240, 90, 0.07, 0.6] }[toolId];
    const [from, to, dur, gain] = body ?? [180, 60, 0.1, 0.7];
    this.noise({ filter: "highpass", freq: 3500, dur: 0.012, gain: 0.35, t });
    this.tone({ freq: from, to, dur, gain, attack: 0.002, t });
    this.tone({ type: "triangle", freq: from * 0.5, to: to * 0.5, dur: dur * 1.2, gain: gain * 0.35, attack: 0.002, t });
    if (toolId === "axe") this.tone({ type: "triangle", freq: 1200, to: 1100, dur: 0.05, gain: 0.04, t });
    if (onPumpkin) this.noise({ filter: "lowpass", freq: 900, to: 250, dur: 0.07, gain: 0.25, t: t + 0.008 });
  }

  /** Pumpkin bursts open. */
  burst(t = this.now) {
    if (!this.ready) return;
    this.tone({ freq: 85, to: 26, dur: 0.45, gain: 0.85, attack: 0.002, t });
    this.tone({ type: "triangle", freq: 55, to: 30, dur: 0.4, gain: 0.35, t });
    this.noise({ filter: "lowpass", freq: 1600, to: 150, dur: 0.32, gain: 0.5, t });
    for (let i = 0; i < 3; i++) this.noise({ filter: "lowpass", freq: 900, dur: 0.04, gain: 0.18, t: t + 0.05 + i * 0.05 });
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

  /** Every combo step rings the next note up the pentatonic scale, low and round. */
  comboUp(combo, { rankUp = false, switched = false, rank = null, t = this.now } = {}) {
    if (!this.ready || combo < 2) return;
    // Two octaves of climb at most, so even long combos stay low.
    const i = Math.min(combo - 2, 9);
    const semis = COMBO_BASE + PENTATONIC[i % 5] + 12 * Math.floor(i / 5);
    this.tone({ type: "triangle", freq: hz(semis), dur: 0.22, gain: 0.3, t, echo: 0.2 });
    this.tone({ type: "sine", freq: hz(semis + 12), dur: 0.12, gain: 0.08, t });
    if (switched) {
      this.tone({ type: "square", freq: hz(semis + 7), dur: 0.07, gain: 0.05, t: t + 0.05 });
      this.tone({ type: "square", freq: hz(semis + 12), dur: 0.1, gain: 0.05, t: t + 0.1 });
    }
    if (rankUp) {
      [0, 3, 7, 12, 15].forEach((s, n) =>
        this.tone({ type: "square", freq: hz(semis + s), dur: 0.22, gain: 0.05, t: t + 0.06 + n * 0.05, echo: 0.4 }),
      );
      this.announce(rank, t + 0.08);
      this.noise({ filter: "highpass", freq: 2000, to: 8000, dur: 0.35, gain: 0.08, t });
    }
  }

  /** Combo banked: a cascade of coins climbing to a chord. */
  cashOut(combo, t = this.now) {
    if (!this.ready) return;
    const notes = Math.min(4 + Math.floor(combo / 4), 10);
    for (let n = 0; n < notes; n++) {
      const semis = COMBO_BASE + PENTATONIC[n % 5] + 12 * Math.floor(n / 5);
      this.tone({ type: "triangle", freq: hz(semis), dur: 0.14, gain: 0.2, t: t + n * 0.045, echo: 0.2 });
    }
    // Lands on a big low power chord through the grit.
    const end = t + notes * 0.045;
    [0, 7, 12].forEach((s) => this.tone({ type: "sawtooth", freq: hz(-24 + s), dur: 0.9, gain: 0.12, t: end, out: this.dirt }));
    this.tone({ freq: 70, to: 30, dur: 0.5, gain: 0.6, t: end });
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
    const root = ROOTS[Math.floor(step / 16) % ROOTS.length];
    const s = step % 16;
    const heat = this.heat;
    const out = this.music;

    if (s === 0) {
      // Dark drone under everything: root and fifth, slow swell.
      [root + 12, root + 19].forEach((n) =>
        this.tone({ type: "sawtooth", freq: hz(n), dur: STEP * 16, gain: 0.03, attack: STEP * 6, out, t }),
      );
    }

    // Distorted bass riff, chugging harder as the combo heats up.
    const note = RIFF[s];
    if (note !== null && (s % 2 === 0 || heat > 0.25)) {
      this.tone({ type: "sawtooth", freq: hz(root + 12 + note), dur: STEP * 0.9, gain: 0.22, attack: 0.003, out: this.dirt, t });
      this.tone({ type: "sine", freq: hz(root + note), dur: STEP * 0.9, gain: 0.25, attack: 0.003, out, t });
    }

    // Heavy kick: on the beat, doubled with heat.
    const kick = s % 4 === 0 || (heat > 0.4 && (s === 3 || s === 11)) || (heat > 0.75 && s % 2 === 0);
    if (kick) this.tone({ freq: 120, to: 38, dur: 0.18, gain: 0.6, attack: 0.002, out, t });

    if (heat > 0.2 && (s === 4 || s === 12)) {
      this.noise({ freq: 1400, q: 0.8, dur: 0.14, gain: 0.25, out, t });
      this.tone({ type: "triangle", freq: 190, to: 150, dur: 0.08, gain: 0.15, out, t });
    }
    if (heat > 0.1 && s % 2 === 1) this.noise({ filter: "highpass", freq: 6500, dur: 0.025, gain: 0.03 + heat * 0.04, out, t });

    // Power-chord stabs at high heat.
    if (heat > 0.55 && (s === 0 || s === 6 || s === 10)) {
      [0, 7, 12].forEach((n) => this.tone({ type: "sawtooth", freq: hz(root + 24 + n), dur: STEP * 1.6, gain: 0.07, out: this.dirt, t }));
    }
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
