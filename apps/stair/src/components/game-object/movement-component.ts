import { type GameObject } from "../../lib/types";
import { BaseGameObjectComponent } from "./base-game-object-component";
import { CharacterGameObject } from "../../game-objects/common/character-game";

export type MovementConfig = {
  onMoveComplete?: () => void;
  onMoveStart?: () => void;
};

export class MovementComponent extends BaseGameObjectComponent {
  declare protected gameObject: CharacterGameObject;

  #isMoving: boolean = false;
  #config: MovementConfig;

  constructor(gameObject: GameObject, config: MovementConfig = {}) {
    super(gameObject);
    this.#config = config;
  }

  public moveToPosition(x: number, y: number, duration: number = 150): void {
    if (this.#isMoving) return;

    this.#isMoving = true;
    this.#config.onMoveStart?.();

    // Simple tween-based movement
    this.scene.tweens.add({
      targets: this.gameObject,
      x,
      y,
      duration,
      ease: "Power2",
      onComplete: () => {
        this.#isMoving = false;
        this.#config.onMoveComplete?.();
      },
    });
  }

  public get isMoving(): boolean {
    return this.#isMoving;
  }

  public stopMovement(): void {
    this.scene.tweens.killTweensOf(this.gameObject);
    this.#isMoving = false;
  }
}
