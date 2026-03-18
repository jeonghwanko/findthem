import type { SpineGameObject } from "@esotericsoftware/spine-phaser-v3";
import type { DIRECTION } from "./consts";
import type { CHARACTER_ANIMATIONS, PLAYER_SKIN_LIST } from "./assets";

export type Position = {
  x: number;
  y: number;
};

export type GameObject = (SpineGameObject | Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) & {
  [key: `_${string}`]: unknown;
};

export interface CustomGameObject {
  enableObject(): void;
  disableObject(): void;
}

export type CharacterAnimation = keyof typeof CHARACTER_ANIMATIONS;

export type Direction = keyof typeof DIRECTION;

export type PlayerSkin = (typeof PLAYER_SKIN_LIST)[number];
