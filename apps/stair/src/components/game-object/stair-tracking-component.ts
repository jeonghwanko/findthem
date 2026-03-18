import { type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";

export type StairTrackingConfig = {
  onStairChanged?: (newIndex: number, previousIndex: number) => void;
};

export class StairTrackingComponent extends BaseGameObjectComponent {
  #currentStairIndex: number = 0;
  #config: StairTrackingConfig;

  constructor(gameObject: GameObject, config: StairTrackingConfig = {}) {
    super(gameObject);
    this.#config = config;
  }

  public get currentStairIndex(): number {
    return this.#currentStairIndex;
  }

  public set currentStairIndex(value: number) {
    const previousIndex = this.#currentStairIndex;
    this.#currentStairIndex = value;

    if (previousIndex !== value) {
      this.#config.onStairChanged?.(value, previousIndex);
    }
  }

  public incrementStairIndex(): number {
    this.currentStairIndex = this.#currentStairIndex + 1;
    return this.#currentStairIndex;
  }

  public resetStairIndex(): void {
    this.currentStairIndex = 0;
  }
}
