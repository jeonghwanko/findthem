import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "../character/base-character";
import { ENEMY_STATES } from "../character/_states";

export class EnemyIdleState extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(ENEMY_STATES.IDLE_STATE, gameObject);
  }

  public onEnter(): void {
    // Enemy just stays idle
    this._gameObject.animationComponent.playAnimation("IDLE_LEFT");

    // Reset velocity (though enemies shouldn't move)
    this._resetObjectVelocity();
  }

  public onUpdate(): void {
    // Enemies don't respond to input or move
    // They just stay in idle state until destroyed
  }
}
