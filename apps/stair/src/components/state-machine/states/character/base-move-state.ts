import { type Direction } from "../../../../lib/types";
import { isArcadePhysicsBody } from "../../../../lib/utils";
import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { InputComponent } from "../../../input/input-component";
import { BaseCharacterState } from "./base-character";
import { SpeedComponent } from "../../../game-object/speed-component";
import { PLAYER_DEFAULT_SCALE } from "../../../../lib/config";

export abstract class BaseMoveState extends BaseCharacterState {
  protected _moveAnimationPrefix: "WALK";

  constructor(stateName: string, gameObject: CharacterGameObject, moveAnimationPrefix: "WALK" = "WALK") {
    super(stateName, gameObject);
    this._moveAnimationPrefix = moveAnimationPrefix;
  }

  protected isNoInputMovement(controls: InputComponent): boolean {
    return (
      (!controls.isDownDown && !controls.isUpDown && !controls.isLeftDown && !controls.isRightDown) ||
      controls.isMovementLocked
    );
  }

  protected handleCharacterMovement(): void {
    const controls = this._gameObject.controls;
    const speedComponent = SpeedComponent.getComponent<SpeedComponent>(this._gameObject);
    const speed = speedComponent?.speed || 100; // fallback speed

    // vertical movement
    if (controls.isUpDown) {
      this.updateVelocity(false, -speed);
      this.updateDirection("LEFT");
    } else if (controls.isDownDown) {
      this.updateVelocity(false, speed);
      this.updateDirection("RIGHT");
    } else {
      this.updateVelocity(false, 0);
    }

    const isMovingVertically = controls.isDownDown || controls.isUpDown;
    // horizontal movement
    if (controls.isLeftDown) {
      this.flip(true);
      this.updateVelocity(true, -speed);
      if (!isMovingVertically) {
        this.updateDirection("LEFT");
      }
    } else if (controls.isRightDown) {
      this.flip(false);
      this.updateVelocity(true, speed);
      if (!isMovingVertically) {
        this.updateDirection("RIGHT");
      }
    } else {
      this.updateVelocity(true, 0);
    }

    this.normalizeVelocity();
  }

  protected normalizeVelocity(): void {
    // if the player is moving diagonally, the resultant vector will have a magnitude greater than the defined speed.
    // if we normalize the vector, this will make sure the magnitude matches defined speed
    if (!isArcadePhysicsBody(this._gameObject.body)) {
      return;
    }

    const body = this._gameObject.body;
    const velocity = body.velocity;
    const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

    const speedComponent = SpeedComponent.getComponent<SpeedComponent>(this._gameObject);
    const maxSpeed = speedComponent?.speed || 100;

    if (currentSpeed > maxSpeed) {
      velocity.x = (velocity.x / currentSpeed) * maxSpeed;
      velocity.y = (velocity.y / currentSpeed) * maxSpeed;
    }
  }

  protected flip(value: boolean): void {
    this._gameObject.setScale(value ? -PLAYER_DEFAULT_SCALE : PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
  }

  protected updateVelocity(isX: boolean, value: number): void {
    if (!isArcadePhysicsBody(this._gameObject.body)) {
      return;
    }
    if (isX) {
      this._gameObject.body.velocity.x = value;
      return;
    }
    this._gameObject.body.velocity.y = value;
  }

  protected updateDirection(direction: Direction): void {
    this._gameObject.direction = direction;
    this._gameObject.animationComponent.playAnimation(`${this._moveAnimationPrefix}_${this._gameObject.direction}`);
  }
}
