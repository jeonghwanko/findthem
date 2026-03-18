import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";
import { StairTrackingComponent } from "../../../game-object/stair-tracking-component";
import { MovementComponent } from "../../../game-object/movement-component";
import { StairComponent } from "../../../game-object/stair-component";
import { DirectionComponent } from "../../../game-object/direction-component";
import type { Direction } from "../../../../lib/types";
import type { AttackTarget } from "./attack-state";
import { STAIR_CONFIG } from "../../../../lib/config";

export class HurtState extends BaseCharacterState {
  #onHurtComplete?: () => void;

  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.HURT_STATE, gameObject);
  }

  public onEnter(args: unknown[]): void {
    const onHurtComplete = args[0] as (() => void) | undefined;
    this.#onHurtComplete = onHurtComplete;

    // Lock movement during hurt sequence
    this._gameObject.controls.isMovementLocked = true;

    this.#simulateMovementAttemptAndCollision();
  }

  #simulateMovementAttemptAndCollision(): void {
    const stairTrackingComponent = StairTrackingComponent.getComponent<StairTrackingComponent>(this._gameObject);
    const movementComponent = MovementComponent.getComponent<MovementComponent>(this._gameObject);
    const stairComponent = StairComponent.getComponent<StairComponent>(this._gameObject);
    const directionComponent = DirectionComponent.getComponent<DirectionComponent>(this._gameObject);

    if (!stairTrackingComponent || !movementComponent || !stairComponent || !directionComponent) {
      this.#fallbackHurtAnimation();
      return;
    }

    const currentStairIndex = stairTrackingComponent.currentStairIndex;
    const nextStairIndex = currentStairIndex + 1;
    const attemptDirection = directionComponent.direction;

    // Get next stair position (where player is trying to go)
    const nextPosition = stairComponent.getNextStairPosition(currentStairIndex);
    if (!nextPosition) {
      this.#fallbackHurtAnimation();
      return;
    }

    // Get current position for knockback calculation
    const currentX = this._gameObject.x;
    const currentY = this._gameObject.y;

    // Calculate movement attempt position (20% of the way to next stair)
    const attemptX = currentX + (nextPosition.x - currentX) * 0.5;
    const attemptY = currentY + (nextPosition.y - currentY) * 0.5;

    // 1. Move forward slightly (simulating movement attempt)
    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      x: attemptX,
      y: attemptY,
      duration: 100,
      ease: "Power2.easeOut",
      onComplete: () => {
        // 2. Trigger enemy attack
        this.#triggerEnemyAttack(nextStairIndex);

        // 3. Play hurt animation and knockback simultaneously
        this.#performHurtKnockback(currentX, currentY, attemptDirection);
      },
    });
  }

  #triggerEnemyAttack(stairIndex: number): void {
    // Get enemy at the stair player tried to move to
    const scene = this._gameObject.scene as Phaser.Scene & {
      getEnemiesAtStair?: (stairIndex: number) => AttackTarget[];
    };

    const enemies = scene.getEnemiesAtStair?.(stairIndex);
    if (enemies && enemies.length > 0) {
      const enemy = enemies[0];
      enemy.attack();
    }
  }

  #performHurtKnockback(originalX: number, originalY: number, direction: Direction): void {
    // Play hurt animation
    this._gameObject.animationComponent.playAnimation(`HURT_${direction}`);

    // Add camera shake effect for impact
    const camera = this._gameObject.scene.cameras.main;
    camera.shake(100, 0.01); // 200ms duration, 0.01 intensity

    // Knockback effect - push player back to original position with slight overshoot
    const knockbackX = originalX - (direction === "RIGHT" ? STAIR_CONFIG.width / 10 : -STAIR_CONFIG.width / 10); // Slight overshoot
    const knockbackY = originalY;

    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      x: knockbackX,
      y: knockbackY,
      duration: 50,
      ease: "Power2.easeOut",
      onComplete: () => {
        // Return to exact original position
        this._gameObject.scene.tweens.add({
          targets: this._gameObject,
          x: originalX,
          y: originalY,
          duration: 50,
          ease: "Power2.easeInOut",
          onComplete: () => {
            this.#onHurtAnimationComplete();
          },
        });
      },
    });
  }

  #fallbackHurtAnimation(): void {
    // Fallback to simple hurt animation if components are missing
    const direction = this._gameObject.direction;
    this._gameObject.animationComponent.playAnimation(`HURT_${direction}`, () => {
      this.#onHurtAnimationComplete();
    });
  }

  #onHurtAnimationComplete(): void {
    // Unlock movement
    this._gameObject.controls.isMovementLocked = false;

    // Return to idle state
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);

    // Call completion callback
    this.#onHurtComplete?.();
  }
}
