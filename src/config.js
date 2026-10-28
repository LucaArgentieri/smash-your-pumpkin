// Gameplay tuning and copy live here so balancing never means digging through
// rendering code.

export const GAME = {
  duration: 60,
  comboWindow: 0.9,
  maxFragments: 220,
  fragmentLife: 8,
  dustRadius: 0.11, // fragments smaller than this turn to dust instead of breaking
  nextPumpkinDelay: 0.55,
  pieceScore: 10,
  hitScore: 5,
  dustScore: 40,
  breakScore: 100,
};

export const TOOLS = [
  {
    id: "fist",
    name: "FIST",
    icon: "fist",
    stats: { power: 1, speed: 3 },
    damage: 1,
    cooldown: 0.11,
    method: "voronoi",
    fragmentCount: 4,
    impulse: 1.4,
    scoreMult: 1,
    shake: 0.12,
    hitStop: 0,
    debris: 10,
  },
  {
    id: "mallet",
    name: "MALLET",
    icon: "mallet",
    stats: { power: 3, speed: 1 },
    damage: 3,
    cooldown: 0.42,
    method: "voronoi",
    fragmentCount: 8,
    impulse: 3.4,
    scoreMult: 1,
    shake: 0.55,
    hitStop: 0.07,
    debris: 34,
  },
  {
    id: "axe",
    name: "AXE",
    icon: "axe",
    stats: { power: 2, speed: 2 },
    damage: 3,
    cooldown: 0.24,
    method: "slice",
    impulse: 1.6,
    scoreMult: 1.5,
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

export const FONTS = {
  title: '"Jacquard 24", "Pixelify Sans", serif',
  body: '"Pixelify Sans", monospace',
};

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
  dust: "DUST!",
  chooseTool: "choose your weapon  1 2 3",
};
