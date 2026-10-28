import { Game } from "./game/Game.js";
import "./style.css";

const game = new Game();
game.start();

if (import.meta.env.DEV) window.game = game;
