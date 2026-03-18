import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";
import type { Direction } from "../../../../lib/types";

export class MoveState extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.MOVE_STATE, gameObject);
  }

  public onUpdate(): void {
    const controls = this._gameObject.controls;

    if (controls.isMovementLocked) {
      this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      return;
    }

    // Check for attack input first (highest priority)
    if (controls.isAttackKeyJustDown) {
      this._stateMachine.setState(CHARACTER_STATES.ATTACK_STATE);
      return;
    }

    // Check for movement input (stair jumping)
    if (controls.isLeftDown || controls.isRightDown) {
      const direction: Direction = controls.isLeftDown ? "LEFT" : "RIGHT";
      this._stateMachine.setState(CHARACTER_STATES.CLIMB_STATE, direction);
      return;
    }

    // If no input, return to idle
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
  }
}
