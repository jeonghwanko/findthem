import Phaser from "phaser";
import type { Stair } from "../game-objects/objects/stair";

export const EVENT_BUS = new Phaser.Events.EventEmitter();

export const CUSTOM_EVENTS = {
  OPENED_CHEST: "OPENED_CHEST",
  ENEMY_DESTROYED: "ENEMY_DESTROYED",
  PLAYER_DEFEATED: "PLAYER_DEFEATED",
  PLAYER_HEALTH_UPDATED: "PLAYER_HEALTH_UPDATED",
  SHOW_DIALOG: "SHOW_DIALOG",
  DIALOG_CLOSED: "DIALOG_CLOSED",
  BOSS_DEFEATED: "BOSS_DEFEATED",
  REQUEST_STAIR_DATA: "REQUEST_STAIR_DATA",

  // Game State Events
  GAME_STARTED: "GAME_STARTED",
  GAME_OVER: "GAME_OVER",
  GAME_RESTART_REQUESTED: "GAME_RESTART_REQUESTED",

  // Score Events
  SCORE_CHANGED: "SCORE_CHANGED",
  STAIR_LANDED: "STAIR_LANDED",

  // Health System Events
  HEALTH_CHANGED: "HEALTH_CHANGED",
  HEALTH_DEPLETED: "HEALTH_DEPLETED",
  HEALTH_RESTORED: "HEALTH_RESTORED",
  KEY_PRESSED: "KEY_PRESSED",
} as const;

export const PLAYER_HEALTH_UPDATE_TYPE = {
  INCREASE: "INCREASE",
  DECREASE: "DECREASE",
} as const;

export type PlayerHealthUpdateType = keyof typeof PLAYER_HEALTH_UPDATE_TYPE;

export type PlayerHealthUpdated = {
  currentHealth: number;
  previousHealth: number;
  type: PlayerHealthUpdateType;
};

export type HealthChanged = {
  health: number;
  maxHealth: number;
  decayRate?: number;
};

export type GameOver = {
  reason?: string;
  score?: number;
};

export type StairDataRequest = {
  onSuccess: (data: { stairs: Stair[]; currentStairIndex: number; isGameActive: boolean }) => void;
  onError: () => void;
};

export type KeyPressed = {
  key: "turn" | "move" | "attack";
};
