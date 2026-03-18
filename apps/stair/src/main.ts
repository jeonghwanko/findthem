import Phaser from "phaser";
import { SpinePlugin } from "@esotericsoftware/spine-phaser-v3";
import { PreloadScene } from "./scenes/preload";
import { ENABLE_LOGGING, SCENE_CONFIG } from "./lib/config";
import { TitleScene } from "./scenes/title";
import { GameScene } from "./scenes/game";
import { UIScene } from "./scenes/ui-scene";

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  backgroundColor: "#87ceeb",
  antialias: true,
  scale: {
    parent: "app",
    width: SCENE_CONFIG.width,
    height: SCENE_CONFIG.height,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    mode: Phaser.Scale.FIT,
  },
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
    powerPreference: "high-performance",
    antialiasGL: true,
    transparent: false,
    clearBeforeRender: true,
    premultipliedAlpha: true,
    failIfMajorPerformanceCaveat: false,
    autoMobilePipeline: true,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: ENABLE_LOGGING,
    },
  },
  plugins: {
    scene: [
      {
        key: SCENE_CONFIG.spinePlugin,
        plugin: SpinePlugin,
        mapping: "spine",
      },
    ],
  },
  scene: [PreloadScene, TitleScene, GameScene, UIScene],
};

document.addEventListener("DOMContentLoaded", () => {
  new Phaser.Game(gameConfig);
});
