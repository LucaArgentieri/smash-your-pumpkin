import { fail } from "./core/loader.js";
import { Game } from "./game/Game.js";
import "./style.css";

const game = new Game();
game.start().catch((error) => {
  console.error(error);
  fail("the candles won't light: this browser can't run the game (WebGL is needed).");
});

if (import.meta.env.DEV) window.game = game;
