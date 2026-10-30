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
// extends it and raises the multiplier; the window tightens as it grows.
// Letting it run out cashes it in (worth combo^2 x cashOut), and so does a
// blow with a charged weapon once the combo reaches cashAt; clicking empty
// table breaks it for nothing.
export const COMBO = {
  window: 1.1, // seconds allowed between hits at the start
  minWindow: 0.55,
  tighten: 0.01, // seconds lost per combo step
  multiplierStep: 0.05,
  maxMultiplier: 3,
  cashOut: 3,
  minCashOut: 5,
  cashAt: 100,
  ranks: [
    [5, "WICKED"],
    [10, "GRIM"],
    [20, "GHASTLY"],
    [35, "UNHOLY"],
    [50, "DAMNED"],
    [80, "APOCALYPTIC"],
  ],
};

// The fist is always in hand and every landed punch charges the other two;
// a charged weapon gives one blow, then it is empty and the fist comes back.
// charge      punches needed to charge it
// scoreMult   multiplies the blow's points (the axe: points now)
// comboBonus  extra combo steps on a landed blow (the mallet: a bigger bank)
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
    comboBonus: 0,
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
    charge: 8,
    method: "voronoi",
    fragmentCount: 8,
    dustRadius: 0.11,
    impulse: 3.4,
    scoreMult: 1,
    comboBonus: 5,
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
    charge: 5,
    method: "slice",
    dustRadius: 0.11,
    impulse: 1.6,
    scoreMult: 3,
    comboBonus: 0,
    shake: 0.3,
    hitStop: 0.03,
    debris: 18,
  },
];

// The PS1 look: the 3D scene is rendered this many pixels across the
// screen's shorter side, whatever the quality tier, and upscaled unfiltered.
export const RETRO = {
  lines: 200,
};

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

// The game's one typeface: Alagard by Hewett Tsoi (free, credit given in
// README; public/fonts/), a bitmap gothic made for games. `FONT.family` is
// mutable so dev builds can preview alternatives (?font=, see Game.js).
export const FONT = { family: '"Alagard", serif' };

/** CSS font shorthand for canvas text. */
export const font = (px) => `${px}px ${FONT.family}`;

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
  bestCombo: "BEST COMBO",
  best: "BEST",
  newBest: "NEW BEST",
  combo: "COMBO",
  broken: "COMBO BROKEN",
  comboRecord: "COMBO RECORD",
  newComboRecord: "NEW COMBO RECORD",
  dust: "DUST!",
  bank: "BANK",
  crush: "CRUSH",
  cleave: "CLEAVE",
  smashing: "SMASHING",
  banked: "COMBOS BANKED",
  ok: "OK",
  skip: "skip",
  saving: "carving your name...",
  boardTitle: "HALL OF THE SMASHED",
  boardButton: "LEADERBOARD",
  back: "BACK",
  boardLoading: "summoning the spirits...",
  boardOffline: "the spirits are silent. no leaderboard tonight.",
  boardEmpty: "no one has smashed here yet. be the first.",
  quality: "QUALITY",
  sound: "SOUND",
};
