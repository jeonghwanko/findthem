import { type Direction, type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";
import { StairManager, type StairValidationResult } from "../../managers/stair-manager";

export type StairComponentConfig = {
  onStairLanded: (stairIndex: number) => void;
  onMissedStair: (reason: string) => void;
  stairManager: StairManager;
};

export class StairComponent extends BaseGameObjectComponent {
  #config: StairComponentConfig;

  constructor(gameObject: GameObject, config: StairComponentConfig) {
    super(gameObject);
    this.#config = config;
  }

  public validateStairMove(direction: Direction, currentStairIndex: number): StairValidationResult {
    return this.#config.stairManager.canMoveToNextStair(direction, currentStairIndex);
  }

  public getNextStairPosition(currentStairIndex: number) {
    return this.#config.stairManager.getNextStairPosition(currentStairIndex);
  }

  public notifyStairLanded(stairIndex: number): void {
    this.#config.onStairLanded(stairIndex);
  }

  public notifyMissedStair(reason: string): void {
    this.#config.onMissedStair(reason);
  }
}
