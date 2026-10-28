// Gameplay tuning and copy live here so balancing never means digging through
// rendering code.

export const GAME = {
  duration: 60,
  fragmentLife: 8,
  dustRadius: 0.11, // shards smaller than this turn to dust instead of breaking
  nextPumpkinDelay: 0.55,
  pieceScore: 10,
  hitScore: 5,
  dustScore: 40,
  breakScore: 100,
};

// The combo is the game for hardcore players. Every hit inside the window
// extends it and raises the multiplier; switching weapon mid-combo feeds it
// extra; the window tightens as it grows. Letting it run out cashes it in
// (worth combo^2 x cashOut), but clicking empty table breaks it for nothing.
export const COMBO = {
  window: 1.1, // seconds allowed between hits at the start
  minWindow: 0.55,
  tighten: 0.01, // seconds lost per combo step
  multiplierStep: 0.05,
  maxMultiplier: 3,
  switchBonus: 2,
  cashOut: 3,
  minCashOut: 5,
  ranks: [
    [5, "WICKED"],
    [10, "GRIM"],
    [20, "GHASTLY"],
    [35, "UNHOLY"],
    [50, "DAMNED"],
    [80, "APOCALYPTIC"],
  ],
};

export const TOOLS = [
  {
    id: "fist",
    name: "FIST",
    icon: "fist",
    damage: 1,
    cooldown: 0.11,
    method: "voronoi",
    fragmentCount: 4,
    dustRadius: 0.2,
    impulse: 1.4,
    scoreMult: 1,
    breakBonus: 1,
    shake: 0.12,
    hitStop: 0,
    debris: 10,
  },
  {
    id: "mallet",
    name: "MALLET",
    icon: "mallet",
    damage: 3,
    cooldown: 0.42,
    method: "voronoi",
    fragmentCount: 8,
    dustRadius: 0.11,
    impulse: 3.4,
    scoreMult: 1,
    breakBonus: 2,
    shake: 0.55,
    hitStop: 0.07,
    debris: 34,
  },
  {
    id: "axe",
    name: "AXE",
    icon: "axe",
    damage: 3,
    cooldown: 0.24,
    method: "slice",
    dustRadius: 0.11,
    impulse: 1.6,
    scoreMult: 2,
    breakBonus: 1,
    shake: 0.3,
    hitStop: 0.03,
    debris: 18,
  },
];

export const PALETTE = {
  night: 0x07030c,
  fog: 0x150820,
  violet: 0x3b1650,
  moon: 0xcdb8ff,
  orange: 0xff7a1a,
  candle: 0xffb347,
  ember: 0xff5a14,
  parchment: "#d8c49a",
  ink: "#1a0d0a",
};

// Titles and words: a gothic face in the spirit of Blasphemous that stays
// legible. Numbers keep the pixel blackletter, which reads fine for digits.
export const FONTS = {
  title: { family: '"Grenze Gotisch", serif', weight: 700 },
  numbers: { family: '"Jacquard 24", "Grenze Gotisch", serif', weight: 400 },
  body: { family: '"Pixelify Sans", monospace', weight: 400 },
};

/** CSS font shorthand for canvas text. */
export const font = (name, px, weight = FONTS[name].weight) => `${weight} ${px}px ${FONTS[name].family}`;

export const TEXT = {
  title: ["SMASH", "YOUR PUMPKIN"],
  tagline: "the cabin is cold. the pumpkins are many.",
  begin: "BEGIN",
  ready: "READY...",
  go: "SMASH!",
  timeUp: "TIME'S UP",
  results: "YOU REALLY SMASHED THEM...",
  again: "AGAIN",
  score: "SCORE",
  pumpkins: "PUMPKINS",
  shards: "SHARDS",
  bestCombo: "BEST COMBO",
  best: "BEST",
  newBest: "NEW BEST",
  combo: "COMBO",
  switched: "SWITCH",
  broken: "COMBO BROKEN",
  comboRecord: "COMBO RECORD",
  newComboRecord: "NEW COMBO RECORD",
  dust: "DUST!",
  loading: "lighting the candles...",
  quality: "QUALITY",
};
