import type { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { CHARACTER_STATES } from "./_states";
import { BaseCharacterState } from "./base-character";
import { DirectionComponent } from "../../../game-object/direction-component";
import { DIRECTION } from "../../../../lib/consts";

export class IdleState extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.IDLE_STATE, gameObject);
  }

  public onEnter(): void {
    // play idle animation based on game object direction
    this._gameObject.animationComponent.playAnimation(`IDLE_${this._gameObject.direction}`);

    // reset game object velocity
    this._resetObjectVelocity();
  }

  public onUpdate(): void {
    const controls = this._gameObject.controls;

    if (controls.isMovementLocked) {
      return;
    }

    // Check for turn+move input (A key) - highest priority
    if (controls.isTurnKeyJustDown) {
      this.#handleTurnAndMove();
      return;
    }

    // Check for move input (S key) - move in current direction without turning
    if (controls.isMoveKeyJustDown) {
      this._stateMachine.setState(CHARACTER_STATES.CLIMB_STATE, this._gameObject.direction);
      return;
    }

    // Check for attack input (D key)
    if (controls.isAttackKeyJustDown) {
      this._stateMachine.setState(CHARACTER_STATES.ATTACK_STATE);
      return;
    }
  }

  #handleTurnAndMove(): void {
    const directionComponent = DirectionComponent.getComponent<DirectionComponent>(this._gameObject);

    if (!directionComponent) {
      console.warn("DirectionComponent not found on character");
      return;
    }

    // Toggle direction: LEFT ↔ RIGHT
    const newDirection = directionComponent.direction === DIRECTION.LEFT ? DIRECTION.RIGHT : DIRECTION.LEFT;
    directionComponent.direction = newDirection;

    // Update animation to reflect new direction
    this._gameObject.animationComponent.playAnimation(`IDLE_${newDirection}`);

    // After turning, immediately move in the new direction
    this._stateMachine.setState(CHARACTER_STATES.CLIMB_STATE, newDirection);
  }
}
