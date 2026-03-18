import { PLAYER_START_MAX_HEALTH } from "./config";
import { PLAYER_SKIN_LIST } from "./assets";
import {
  CUSTOM_EVENTS,
  EVENT_BUS,
  PLAYER_HEALTH_UPDATE_TYPE,
  type PlayerHealthUpdated,
  type PlayerHealthUpdateType,
} from "./event-bus";
import type { Stair } from "../game-objects/objects/stair";
import type { PlayerSkin } from "./types";

export type PlayerData = {
  score: number;
  maxHealth: number;
  currentHealth: number;
  skin: PlayerSkin;
};

export type GameData = {
  stairs: Stair[];
  currentStairIndex: number;
  isGameActive: boolean;
  score: number;
};

export class DataManager {
  static #instance: DataManager;

  #playerData: PlayerData;
  #gameData: GameData;

  private constructor() {
    this.#playerData = {
      currentHealth: PLAYER_START_MAX_HEALTH,
      maxHealth: PLAYER_START_MAX_HEALTH,
      score: 0,
      skin: PLAYER_SKIN_LIST[6],
    };

    this.#gameData = {
      stairs: [],
      currentStairIndex: 0,
      isGameActive: false,
      score: 0,
    };
  }

  public static get instance(): DataManager {
    if (!DataManager.#instance) {
      DataManager.#instance = new DataManager();
    }
    return DataManager.#instance;
  }

  get playerData(): PlayerData {
    return { ...this.#playerData };
  }

  set playerData(data: PlayerData) {
    this.#playerData = { ...data };
  }

  get gameData(): GameData {
    return { ...this.#gameData };
  }

  // Game state management methods
  public updateGameState(updates: Partial<GameData>): void {
    this.#gameData = { ...this.#gameData, ...updates };
  }

  public setStairs(stairs: Stair[]): void {
    this.#gameData.stairs = [...stairs];
  }

  public setCurrentStairIndex(index: number): void {
    this.#gameData.currentStairIndex = index;
  }

  public setGameActive(isActive: boolean): void {
    this.#gameData.isGameActive = isActive;
  }

  public updatePlayerHealth(health: number) {
    const previousHealth = this.#playerData.currentHealth;
    this.#playerData.currentHealth = health;
    let healthUpdateType: PlayerHealthUpdateType = PLAYER_HEALTH_UPDATE_TYPE.DECREASE;
    if (health > previousHealth) {
      healthUpdateType = PLAYER_HEALTH_UPDATE_TYPE.INCREASE;
    }

    const dataToPass: PlayerHealthUpdated = {
      previousHealth,
      currentHealth: health,
      type: healthUpdateType,
    };

    EVENT_BUS.emit(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, dataToPass);
  }

  public updatePlayerSkin(skin: PlayerSkin): void {
    this.#playerData.skin = skin;
  }

  public reset(): void {
    const skin = this.#playerData.skin;
    this.#playerData = {
      currentHealth: PLAYER_START_MAX_HEALTH,
      maxHealth: PLAYER_START_MAX_HEALTH,
      score: 0,
      skin: skin,
    };

    this.#gameData = {
      stairs: [],
      currentStairIndex: 0,
      isGameActive: false,
      score: 0,
    };
  }

  // Legacy compatibility
  get data(): PlayerData {
    return this.playerData;
  }

  set data(data: PlayerData) {
    this.playerData = data;
  }
}
