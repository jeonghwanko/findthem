import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";
import { StairTrackingComponent } from "../../../game-object/stair-tracking-component";
import { StairComponent } from "../../../game-object/stair-component";
import { type Direction } from "../../../../lib/types";
import { PLAYER_DEFAULT_SCALE } from "../../../../lib/config";
import { playAttackSound } from "../../../../lib/sound-utils";

export type AttackTarget = {
  destroy: () => void;
  takeDamage: (attackDirection?: Direction) => void;
  attack: () => void;
  x: number;
  y: number;
};

export class AttackState extends BaseCharacterState {
  #onAttackComplete?: (target?: AttackTarget) => void;

  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.ATTACK_STATE, gameObject);
  }

  public onEnter(args: unknown[]): void {
    const onAttackComplete = args[0] as ((target?: AttackTarget) => void) | undefined;
    this.#onAttackComplete = onAttackComplete;

    // Lock movement during attack
    this._gameObject.controls.isMovementLocked = true;

    // Determine attack direction based on current facing
    const direction = this._gameObject.direction;
    this.#performAttack(direction);
  }

  #performAttack(direction: Direction): void {
    // Play attack sound effect
    playAttackSound(this._gameObject.scene);

    // Play attack animation (but don't wait for completion)
    this._gameObject.animationComponent.playAnimation(`ATTACK_${direction}`);

    // Add attack effects immediately
    this.#createAttackEffects(direction);

    // Complete attack after fixed delay instead of waiting for animation
    this._gameObject.scene.time.delayedCall(150, () => {
      this.#onAttackAnimationComplete(direction);
    });
  }

  #createAttackEffects(direction: Direction): void {
    try {
      const scene = this._gameObject.scene;
      if (!scene) return;

      // 1. Character power-up effect
      this.#createCharacterPowerEffect(scene, direction);

      // 2. Impact lines effect
      this.#createImpactLines(scene, direction);

      // 3. Energy burst effect
      this.#createEnergyBurst(scene, direction);

      // 4. Screen shake for impact
      this.#createScreenShake(scene);
    } catch (error) {
      console.warn("Failed to create attack effects:", error);
    }
  }

  #createCharacterPowerEffect(scene: Phaser.Scene, direction: Direction): void {
    try {
      // Scale boost for power feeling
      const scaleMultiplier = 1.15;
      scene.tweens.add({
        targets: this._gameObject,
        scaleX:
          direction === "RIGHT" ? -PLAYER_DEFAULT_SCALE * scaleMultiplier : PLAYER_DEFAULT_SCALE * scaleMultiplier,
        scaleY: PLAYER_DEFAULT_SCALE * scaleMultiplier,
        duration: 80,
        ease: "Back.easeOut",
        yoyo: true,
        onComplete: () => {
          // Reset to normal scale
          if (direction === "RIGHT") {
            this._gameObject.setScale(-PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
          } else {
            this._gameObject.setScale(PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
          }
        },
      });

      // Flash effect
      const phaserGameObject = this._gameObject as Phaser.GameObjects.GameObject & {
        setTint?: (tint: number) => void;
        clearTint?: () => void;
      };
      if (typeof phaserGameObject.setTint === "function") {
        phaserGameObject.setTint(0xffffff);
        scene.time.delayedCall(60, () => {
          if (this._gameObject && this._gameObject.active) {
            if (typeof phaserGameObject.setTint === "function") {
              phaserGameObject.setTint(0xffffff);
            }
          }
        });
        scene.time.delayedCall(120, () => {
          if (this._gameObject && this._gameObject.active) {
            if (typeof phaserGameObject.clearTint === "function") {
              phaserGameObject.clearTint();
            }
          }
        });
      }
    } catch (error) {
      console.warn("Failed to create character power effect:", error);
    }
  }

  #createImpactLines(scene: Phaser.Scene, direction: Direction): void {
    try {
      const characterX = this._gameObject.x;
      const characterY = this._gameObject.y;

      // Attack direction and position offset
      const attackDirectionX = direction === "RIGHT" ? 1 : -1;
      const frontOffset = 70; // Distance in front of character
      const upOffset = -15; // Slightly above character (negative Y is up)

      // Base position for attack effects (in front of character)
      const attackX = characterX + attackDirectionX * frontOffset;
      const attackY = characterY + upOffset;

      // Create multiple impact lines
      const lineCount = 8 + Math.floor(Math.random() * 4); // 8-11 lines

      for (let i = 0; i < lineCount; i++) {
        const impactLine = scene.add.graphics();

        // Line properties
        const lineLength = 20 + Math.random() * 30; // 20-50 pixels
        const lineWidth = 2 + Math.random() * 3; // 2-5 pixels

        // Natural spreading pattern (like createEnergyBurst)
        const baseAngle = Math.random() * Math.PI * 2; // 360 degrees
        const spreadAngle = baseAngle + attackDirectionX * 0.8 + (Math.random() - 0.5) * 0.6; // Bias toward attack direction

        // Start from attack position with slight randomness
        const randomOffset = 8;
        const startX = attackX + (Math.random() - 0.5) * randomOffset;
        const startY = attackY + (Math.random() - 0.5) * randomOffset;

        // Draw impact line with bright color
        impactLine.lineStyle(lineWidth, 0xfff200, 0.9); // Bright yellow
        impactLine.beginPath();
        impactLine.moveTo(0, 0); // Start from graphics origin
        impactLine.lineTo(Math.cos(spreadAngle) * lineLength, Math.sin(spreadAngle) * lineLength); // Draw relative to origin
        impactLine.strokePath();

        // Position the entire graphics object
        impactLine.setPosition(startX, startY);
        impactLine.setDepth(this._gameObject.depth + 1);

        // Animate the impact line with natural dispersion
        const delay = Math.random() * 40;
        const burstDistance = 25 + Math.random() * 20; // Similar to energy burst distance
        const finalX = startX + Math.cos(spreadAngle) * burstDistance;
        const finalY = startY + Math.sin(spreadAngle) * burstDistance;

        scene.tweens.add({
          targets: impactLine,
          x: finalX,
          y: finalY,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 180 + Math.random() * 80, // Similar timing to energy burst
          delay: delay,
          ease: "Power2.easeOut",
          onComplete: () => {
            impactLine.destroy();
          },
        });
      }
    } catch (error) {
      console.warn("Failed to create impact lines:", error);
    }
  }

  #createEnergyBurst(scene: Phaser.Scene, direction: Direction): void {
    try {
      const characterX = this._gameObject.x;
      const characterY = this._gameObject.y;

      // Attack direction and position offset
      const attackDirectionX = direction === "RIGHT" ? 1 : -1;
      const frontOffset = 55; // Distance in front of character
      const upOffset = -30; // Slightly above character

      // Base position for energy burst (in front of character)
      const attackX = characterX + attackDirectionX * frontOffset;
      const attackY = characterY + upOffset;

      // Create energy particles
      const particleCount = 12 + Math.floor(Math.random() * 6); // 12-17 particles

      for (let i = 0; i < particleCount; i++) {
        const energy = scene.add.graphics();

        // Energy particle properties
        const size = 2 + Math.random() * 3;
        const color = Math.random() > 0.5 ? 0xfff200 : 0xffaa00; // Yellow/Orange mix

        energy.fillStyle(color, 0.8);
        energy.fillCircle(0, 0, size);

        // Position around attack area (in front of character)
        const angle = Math.random() * Math.PI * 2;
        const radius = 5 + Math.random() * 10; // Smaller radius for more focused effect
        const startX = attackX + Math.cos(angle) * radius;
        const startY = attackY + Math.sin(angle) * radius;

        energy.setPosition(startX, startY);
        energy.setDepth(this._gameObject.depth + 1);

        // Calculate burst direction (bias toward attack direction)
        const burstAngle = angle + attackDirectionX * 0.8 + (Math.random() - 0.5) * 0.6;
        const burstDistance = 25 + Math.random() * 20;
        const finalX = startX + Math.cos(burstAngle) * burstDistance;
        const finalY = startY + Math.sin(burstAngle) * burstDistance;

        // Animate energy burst
        const delay = Math.random() * 40;

        scene.tweens.add({
          targets: energy,
          x: finalX,
          y: finalY,
          alpha: 0,
          duration: 180 + Math.random() * 80,
          delay: delay,
          ease: "Power2.easeOut",
          onComplete: () => {
            energy.destroy();
          },
        });

        // Scale animation
        scene.tweens.add({
          targets: energy,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 120 + Math.random() * 60,
          delay: delay,
          ease: "Power1.easeOut",
        });
      }
    } catch (error) {
      console.warn("Failed to create energy burst:", error);
    }
  }

  #createScreenShake(scene: Phaser.Scene): void {
    try {
      // Get main camera and add screen shake
      const camera = scene.cameras.main;
      if (camera) {
        camera.shake(100, 0.008); // 100ms duration, 0.008 intensity
      }
    } catch (error) {
      console.warn("Failed to create screen shake:", error);
    }
  }

  #onAttackAnimationComplete(attackDirection: Direction): void {
    // Check if there's an enemy to attack
    const target = this.#checkForEnemyTarget();

    if (target) {
      // Attack successful - damage enemy with direction info
      target.takeDamage(attackDirection);

      // Create additional hit effect if target was hit
      this.#createHitEffect(target, attackDirection);
    }

    // Unlock movement
    this._gameObject.controls.isMovementLocked = false;

    // Return to idle state
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);

    // Call completion callback
    this.#onAttackComplete?.(target || undefined);
  }

  #createHitEffect(target: AttackTarget, direction: Direction): void {
    try {
      const scene = this._gameObject.scene;
      if (!scene) return;

      // Create hit spark effect at target location (but adjusted for attack direction)
      const attackDirectionX = direction === "RIGHT" ? 1 : -1;
      const hitX = target.x + attackDirectionX * 5; // Slightly in front of target
      const hitY = target.y - 5; // Slightly above target

      const sparkCount = 6 + Math.floor(Math.random() * 4);

      for (let i = 0; i < sparkCount; i++) {
        const spark = scene.add.graphics();

        spark.fillStyle(0xffffff, 0.9);
        spark.fillCircle(0, 0, 1 + Math.random() * 2);

        const angle = Math.random() * Math.PI * 2;
        const distance = 5 + Math.random() * 8;
        spark.setPosition(hitX + Math.cos(angle) * distance, hitY + Math.sin(angle) * distance);

        spark.setDepth(this._gameObject.depth + 2);

        // Animate sparks with directional bias
        scene.tweens.add({
          targets: spark,
          x: spark.x + attackDirectionX * (10 + Math.random() * 15),
          y: spark.y + (Math.random() - 0.5) * 10,
          alpha: 0,
          duration: 150 + Math.random() * 50,
          ease: "Power1.easeOut",
          onComplete: () => {
            spark.destroy();
          },
        });
      }
    } catch (error) {
      console.warn("Failed to create hit effect:", error);
    }
  }

  #checkForEnemyTarget(): AttackTarget | undefined {
    const stairTrackingComponent = StairTrackingComponent.getComponent<StairTrackingComponent>(this._gameObject);
    const stairComponent = StairComponent.getComponent<StairComponent>(this._gameObject);

    if (!stairTrackingComponent || !stairComponent) {
      return undefined;
    }

    // Check next stair for enemy
    const nextStairIndex = stairTrackingComponent.currentStairIndex + 1;
    const nextStairPosition = stairComponent.getNextStairPosition(stairTrackingComponent.currentStairIndex);

    if (!nextStairPosition) {
      return undefined;
    }

    // Get scene and find enemy at next stair position
    const scene = this._gameObject.scene as Phaser.Scene & {
      getEnemiesAtStair?: (stairIndex: number) => AttackTarget[];
    };
    const enemies = scene.getEnemiesAtStair?.(nextStairIndex);

    if (enemies && enemies.length > 0) {
      return enemies[0]; // Return first enemy found
    }

    return undefined;
  }
}
