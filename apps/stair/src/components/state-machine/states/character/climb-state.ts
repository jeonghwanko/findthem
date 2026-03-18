import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";
import { MovementComponent } from "../../../game-object/movement-component";
import { StairTrackingComponent } from "../../../game-object/stair-tracking-component";
import { StairComponent } from "../../../game-object/stair-component";
import { type Direction } from "../../../../lib/types";
import { PLAYER_DEFAULT_SCALE } from "../../../../lib/config";
import { playClimbSound } from "../../../../lib/sound-utils";
import { LanguageManager, type TranslationKey } from "../../../../lib/language-manager";

export class ClimbState extends BaseCharacterState {
  private movementTween: Phaser.Tweens.Tween | null = null;
  private lang = LanguageManager.getInstance();

  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.CLIMB_STATE, gameObject);
  }

  public onEnter(args: unknown[]): void {
    const direction = args[0] as Direction | undefined;
    if (!direction) {
      this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      return;
    }

    this.#attemptClimb(direction);
  }

  public onUpdate(): void {
    const movementComponent = MovementComponent.getComponent<MovementComponent>(this._gameObject);

    // Simple check: if not moving, return to idle
    if (!movementComponent || !movementComponent.isMoving) {
      this.#clearMovementEffects();
      this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
    }
  }

  public onExit(): void {
    this.#clearMovementEffects();
  }

  #attemptClimb(direction: Direction): void {
    const movementComponent = MovementComponent.getComponent<MovementComponent>(this._gameObject);
    const stairTrackingComponent = StairTrackingComponent.getComponent<StairTrackingComponent>(this._gameObject);
    const stairComponent = StairComponent.getComponent<StairComponent>(this._gameObject);

    if (!movementComponent || !stairTrackingComponent || !stairComponent) {
      this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
      return;
    }

    // Validate move
    const validation = stairComponent.validateStairMove(direction, stairTrackingComponent.currentStairIndex);

    if (!validation.isValid) {
      // Check if blocked by enemy
      if (validation.hasEnemy) {
        // Transition to hurt state when hitting enemy
        this._stateMachine.setState(CHARACTER_STATES.HURT_STATE);
        return;
      }

      // Handle other failed moves - transition to fall state
      const translatedReason = validation.reasonKey
        ? this.lang.t(validation.reasonKey as TranslationKey)
        : "Unknown error";
      stairComponent.notifyMissedStair(translatedReason);
      this._stateMachine.setState(CHARACTER_STATES.FALL_STATE, direction, translatedReason);
      return;
    }

    // Get next position
    const nextPosition = stairComponent.getNextStairPosition(stairTrackingComponent.currentStairIndex);

    if (!nextPosition) {
      const noPositionReason = this.lang.t("noNextStairAvailable");
      stairComponent.notifyMissedStair(noPositionReason);
      this._stateMachine.setState(CHARACTER_STATES.FALL_STATE, direction, noPositionReason);
      return;
    }

    // Start movement with enhanced effects
    this.#startClimbAnimation(direction);

    // Play climb sound effect
    playClimbSound(this._gameObject.scene);

    movementComponent.moveToPosition(nextPosition.x, nextPosition.y);

    // Update stair index
    stairTrackingComponent.incrementStairIndex();
    stairComponent.notifyStairLanded(stairTrackingComponent.currentStairIndex);
  }

  #startClimbAnimation(direction: Direction): void {
    // Set character orientation
    if (direction === "RIGHT") {
      this._gameObject.setScale(-PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
    } else {
      this._gameObject.setScale(PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
    }

    // Play movement animation
    const animationKey = direction === "LEFT" ? "WALK_LEFT" : "WALK_RIGHT";
    this._gameObject.animationComponent.playAnimation(animationKey);

    // Add movement effects for "swooshing" feel
    this.#addMovementEffects(direction);
  }

  #addMovementEffects(direction: Direction): void {
    // Clear any existing effects first
    this.#clearMovementEffects();

    try {
      const scene = this._gameObject.scene;
      if (!scene) return;

      // 1. Create smoke/vapor dispersal effect
      this.#createSmokeEffect(scene, direction);

      // 2. Create wind line effects (keeping the previous effect)
      this.#createWindLines(scene, direction);

      // 3. Add scale tween for "pop" effect when starting movement
      if (scene.tweens) {
        this.movementTween = scene.tweens.add({
          targets: this._gameObject,
          scaleX: direction === "RIGHT" ? -PLAYER_DEFAULT_SCALE * 1.05 : PLAYER_DEFAULT_SCALE * 1.05,
          scaleY: PLAYER_DEFAULT_SCALE * 1.05,
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
      }
    } catch (error) {
      console.warn("Failed to add movement effects:", error);
    }
  }

  #createSmokeEffect(scene: Phaser.Scene, direction: Direction): void {
    try {
      const characterX = this._gameObject.x;
      const characterY = this._gameObject.y;

      // Determine smoke drift direction (opposite to movement)
      const driftDirectionX = direction === "RIGHT" ? -1 : 1;

      // Create multiple smoke clusters
      const clusterCount = 2 + Math.floor(Math.random() * 2); // 2-3 clusters

      for (let cluster = 0; cluster < clusterCount; cluster++) {
        // Each cluster starts at a slightly different position
        const clusterOffsetX = (Math.random() - 0.5) * 20;
        const clusterOffsetY = 10 + Math.random() * 10; // Below character
        const baseX = characterX + clusterOffsetX;
        const baseY = characterY + clusterOffsetY;

        // Create particles for this cluster
        const particlesPerCluster = 8 + Math.floor(Math.random() * 6); // 8-13 particles per cluster

        for (let i = 0; i < particlesPerCluster; i++) {
          const smoke = scene.add.graphics();

          // Initial particle properties
          const initialSize = 3 + Math.random() * 4; // 3-7 pixels
          const finalSize = initialSize * (1.5 + Math.random() * 1); // Expand as it disperses

          // Start tightly clustered
          const initialSpread = 5;
          const startX = baseX + (Math.random() - 0.5) * initialSpread;
          const startY = baseY + (Math.random() - 0.5) * initialSpread;

          // Draw circular smoke particle
          const grayValue = 0.1 + Math.random() * 0.3; // 0.1-0.4 alpha
          smoke.fillStyle(0xe8e8e8, grayValue); // Light gray
          smoke.fillCircle(0, 0, initialSize);
          smoke.setPosition(startX, startY);
          smoke.setDepth(this._gameObject.depth - 2);

          // Calculate dispersal pattern - biased towards opposite direction
          const baseAngle = driftDirectionX > 0 ? 0 : Math.PI; // Base direction opposite to movement
          const angleSpread = Math.PI * 0.7; // 70% of a semicircle spread
          const dispersalAngle = baseAngle + (Math.random() - 0.5) * angleSpread;

          // Add some randomness but bias toward the drift direction
          const dispersalDistance = 20 + Math.random() * 30; // How far particles spread
          const driftBias = 10 + Math.random() * 15; // Extra push in drift direction

          const finalX = startX + Math.cos(dispersalAngle) * dispersalDistance + driftDirectionX * driftBias;
          const finalY = startY + Math.sin(dispersalAngle) * dispersalDistance - (2 + Math.random() * 8); // More upward drift

          // Main dispersal animation
          const duration = 400 + Math.random() * 300; // 400-700ms
          const delay = cluster * 50 + Math.random() * 100; // Stagger clusters

          scene.tweens.add({
            targets: smoke,
            x: finalX,
            y: finalY,
            alpha: 0,
            duration: duration,
            delay: delay,
            ease: "Power2.easeOut",
            onComplete: () => {
              smoke.destroy();
            },
          });

          // Scale animation (particles grow as they disperse)
          scene.tweens.add({
            targets: smoke,
            scaleX: finalSize / initialSize,
            scaleY: finalSize / initialSize,
            duration: duration * 0.7, // Finish growing before fully faded
            delay: delay,
            ease: "Sine.easeOut",
          });

          // Slight rotation for more natural movement
          scene.tweens.add({
            targets: smoke,
            rotation: (Math.random() - 0.5) * 0.4,
            duration: duration,
            delay: delay,
            ease: "Sine.easeInOut",
          });

          // Add secondary drift animation for more realistic wind effect
          scene.tweens.add({
            targets: smoke,
            x: smoke.x + driftDirectionX * (5 + Math.random() * 10), // Additional drift
            duration: duration,
            delay: delay + duration * 0.3, // Start after initial movement
            ease: "Power1.easeOut",
          });
        }
      }
    } catch (error) {
      console.warn("Failed to create smoke effect:", error);
    }
  }

  #createWindLines(scene: Phaser.Scene, direction: Direction): void {
    try {
      const characterX = this._gameObject.x;
      const characterY = this._gameObject.y;

      // Reduce wind lines to complement smoke effect
      const lineCount = 3 + Math.floor(Math.random() * 2); // 3-4 lines (reduced)

      for (let i = 0; i < lineCount; i++) {
        // Create a graphics object for each line
        const windLine = scene.add.graphics();

        // Random line properties
        const lineLength = 10 + Math.random() * 15; // Shorter lines (10-25 pixels)
        const lineWidth = 1 + Math.random() * 1.5; // 1-2.5 pixels
        const startAngle = (Math.random() - 0.5) * Math.PI * 0.4; // Smaller spread

        // Calculate starting position around character
        const startRadius = 8 + Math.random() * 10; // 8-18 pixels from character
        const startX = characterX + Math.cos(startAngle) * startRadius;
        const startY = characterY + Math.sin(startAngle) * startRadius + (Math.random() - 0.5) * 15;

        // Calculate wind direction (opposite to movement direction)
        const windDirectionX = direction === "RIGHT" ? -1 : 1;
        const windAngle = startAngle + windDirectionX * 0.3 + (Math.random() - 0.5) * 0.3;

        const endX = startX + Math.cos(windAngle) * lineLength;
        const endY = startY + Math.sin(windAngle) * lineLength;

        // Draw the line - lighter and more subtle
        windLine.lineStyle(lineWidth, 0xf0f8ff, 0.6); // Very light blue-white, lower alpha
        windLine.beginPath();
        windLine.moveTo(startX, startY);
        windLine.lineTo(endX, endY);
        windLine.strokePath();

        // Set depth behind character but above smoke
        windLine.setDepth(this._gameObject.depth - 1);

        // Animate the wind line - faster and more subtle
        const delay = Math.random() * 30;

        scene.tweens.add({
          targets: windLine,
          x: windLine.x + windDirectionX * (20 + Math.random() * 10),
          y: windLine.y + (Math.random() - 0.5) * 5,
          alpha: 0,
          scaleX: 0.4,
          scaleY: 0.4,
          duration: 150 + Math.random() * 50,
          delay: delay,
          ease: "Power1.easeOut",
          onComplete: () => {
            windLine.destroy();
          },
        });
      }
    } catch (error) {
      console.warn("Failed to create wind lines:", error);
    }
  }

  #clearMovementEffects(): void {
    try {
      // Stop scale tween
      if (this.movementTween) {
        this.movementTween.stop();
        this.movementTween = null;
      }

      // Reset alpha
      if (this._gameObject && this._gameObject.active) {
        this._gameObject.setAlpha(1);
      }

      // Note: Wind lines and particles will auto-destroy themselves via their animations
    } catch (error) {
      console.warn("Failed to clear movement effects:", error);
    }
  }
}
