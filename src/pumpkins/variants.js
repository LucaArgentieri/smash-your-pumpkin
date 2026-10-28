// The fixed set of pumpkins. Every round deals them from a shuffled deck, so
// everyone smashes the same family.
//
// model         GLB in public/pumpkins/ (placeholders: scripts/build-placeholders.mjs)
// size          horizontal radius in world units; the model is scaled to it
// rotationY     optional, radians, if the model's face doesn't look down +Z
// glow          colour of the candle light inside (flesh tint, face fallback)
// glowFromAlbedo  for models without an emissive map: make very bright albedo
//                 (a painted glowing face) emissive
// flesh         optional [light, dark] colours of the flesh revealed by cuts
// bonus         score multiplier when this pumpkin breaks

export const VARIANTS = [
  { name: "Jack", model: "/pumpkins/jack.glb", size: 0.95, glow: "#ffb347", bonus: 1 },
  { name: "Big Bertha", model: "/pumpkins/bertha.glb", size: 1.15, glow: "#ff9a3c", bonus: 1.2 },
  { name: "Spindle", model: "/pumpkins/spindle.glb", size: 0.78, glow: "#ffd36a", bonus: 1 },
  { name: "The Pale One", model: "/pumpkins/pale.glb", size: 0.9, glow: "#b46bff", bonus: 1.5, flesh: [0xf3e2b0, 0xc9a25a] },
  { name: "Rotten Tom", model: "/pumpkins/rotten.glb", size: 0.88, glow: "#c6ff5a", bonus: 1.3, flesh: [0xd9b04a, 0x7a5a18] },
  { name: "Pip", model: "/pumpkins/pip.glb", size: 0.6, glow: "#ffe08a", bonus: 2 },
];
