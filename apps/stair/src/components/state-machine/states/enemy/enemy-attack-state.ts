import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "../character/base-character";
import { ENEMY_STATES } from "../character/_states";
import { playAttackSound } from "../../../../lib/sound-utils";

export class EnemyAttackState extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(ENEMY_STATES.ATTACK_STATE, gameObject);
  }

  public onEnter(): void {
    // Play attack sound effect
    playAttackSound(this._gameObject.scene);

    // Play attack animation (enemy faces left by default)
    this._gameObject.animationComponent.playAnimation("ATTACK_LEFT");

    // Add menacing attack effects immediately
    this.#createEnemyAttackEffects();

    // Use a fixed duration for attack instead of waiting for animation
    this._gameObject.scene.time.delayedCall(150, () => {
      this.#onAttackAnimationComplete();
    });
  }

  #createEnemyAttackEffects(): void {
    try {
      const scene = this._gameObject.scene;
      if (!scene) return;

      // 1. Dark energy aura
      this.#createDarkAura(scene);

      // 2. Claw mark effects
      this.#createClawMarks(scene);

      // 3. Shadow particles
      this.#createShadowParticles(scene);

      // 4. Menacing scale effect
      this.#createMenacingEffect(scene);
    } catch (error) {
      console.warn("Failed to create enemy attack effects:", error);
    }
  }

  #createDarkAura(scene: Phaser.Scene): void {
    try {
      const characterX = this._gameObject.x;
      const characterY = this._gameObject.y;

      // Create dark aura rings
      const ringCount = 3;

      for (let ring = 0; ring < ringCount; ring++) {
        const aura = scene.add.graphics();

        const radius = 15 + ring * 8;
        const alpha = 0.4 - ring * 0.1;

        // Draw dark ring
        aura.lineStyle(2 + ring, 0x660066, alpha); // Dark purple
        aura.strokeCircle(0, 0, radius);
        aura.setPosition(characterX, characterY);
        aura.setDepth(this._gameObject.depth - 1);

        // Animate expanding dark aura
        scene.tweens.add({
          targets: aura,
          scaleX: 1.8,
          scaleY: 1.8,
          alpha: 0,
          duration: 200 + ring * 50,
          ease: "Power2.easeOut",
          onComplete: () => {
            aura.destroy();
          },
        });

        // Rotation for menacing effect
        scene.tweens.add({
          targets: aura,
          rotation: Math.PI * 2,
          duration: 300 + ring * 50,
          ease: "Linear",
        });
      }
    } catch (error) {
      console.warn("Failed to create dark aura:", error);
    }
  }

  #createClawMarks(scene: Phaser.Scene): void {
    try {
      const characterX = this._gameObject.x;
      const characterY = this._gameObject.y;

      // Create claw mark slashes
      const slashCount = 4 + Math.floor(Math.random() * 2); // 4-5 slashes

      for (let i = 0; i < slashCount; i++) {
        const slash = scene.add.graphics();

        // Slash properties
        const slashLength = 25 + Math.random() * 15;
        const slashWidth = 3 + Math.random() * 2;

        // Natural spreading pattern (like player attack)
        const baseAngle = Math.random() * Math.PI * 2; // 360 degrees
        const spreadAngle = baseAngle + -1 * 0.8 + (Math.random() - 0.5) * 0.6; // Bias toward left (enemy attack direction)

        // Position for claw attacks with slight randomness
        const randomOffset = 8;
        const startX = characterX + (Math.random() - 0.5) * randomOffset;
        const startY = characterY + (Math.random() - 0.5) * randomOffset;

        // Draw claw mark with dark red color
        slash.lineStyle(slashWidth, 0x990000, 0.8); // Dark red
        slash.beginPath();
        slash.moveTo(0, 0); // Start from graphics origin
        slash.lineTo(Math.cos(spreadAngle) * slashLength, Math.sin(spreadAngle) * slashLength); // Draw relative to origin
        slash.strokePath();

        // Position the entire graphics object
        slash.setPosition(startX, startY);
        slash.setDepth(this._gameObject.depth + 1);

        // Animate slash with natural dispersion
        const delay = i * 15; // Stagger slashes
        const burstDistance = 25 + Math.random() * 20; // Similar to player attack
        const finalX = startX + Math.cos(spreadAngle) * burstDistance;
        const finalY = startY + Math.sin(spreadAngle) * burstDistance;

        scene.tweens.add({
          targets: slash,
          x: finalX,
          y: finalY,
          alpha: 0,
          scaleY: 0.3,
          duration: 180 + Math.random() * 60,
          delay: delay,
          ease: "Power2.easeOut",
          onComplete: () => {
            slash.destroy();
          },
        });
      }
    } catch (error) {
      console.warn("Failed to create claw marks:", error);
    }
  }

  #createShadowParticles(scene: Phaser.Scene): void {
    try {
      const characterX = this._gameObject.x;
      const characterY = this._gameObject.y;

      // Create dark shadow particles
      const particleCount = 15 + Math.floor(Math.random() * 8); // 15-22 particles

      for (let i = 0; i < particleCount; i++) {
        const shadow = scene.add.graphics();

        // Shadow particle properties
        const size = 2 + Math.random() * 3;
        const colors = [0x330033, 0x660000, 0x000066]; // Dark purple, dark red, dark blue
        const color = colors[Math.floor(Math.random() * colors.length)];

        shadow.fillStyle(color, 0.6 + Math.random() * 0.3);
        shadow.fillCircle(0, 0, size);

        // Position around enemy
        const angle = Math.random() * Math.PI * 2;
        const radius = 8 + Math.random() * 12;
        const startX = characterX + Math.cos(angle) * radius;
        const startY = characterY + Math.sin(angle) * radius + (Math.random() - 0.5) * 15;

        shadow.setPosition(startX, startY);
        shadow.setDepth(this._gameObject.depth - 1);

        // Calculate dark dispersal pattern
        const dispersalAngle = angle + (Math.random() - 0.5) * 1.2;
        const dispersalDistance = 20 + Math.random() * 25;
        const finalX = startX + Math.cos(dispersalAngle) * dispersalDistance - 5; // Slight leftward bias
        const finalY = startY + Math.sin(dispersalAngle) * dispersalDistance + Math.random() * 5; // Downward sink

        // Animate shadow particles
        const delay = Math.random() * 50;

        scene.tweens.add({
          targets: shadow,
          x: finalX,
          y: finalY,
          alpha: 0,
          duration: 250 + Math.random() * 150,
          delay: delay,
          ease: "Power2.easeOut",
          onComplete: () => {
            shadow.destroy();
          },
        });

        // Scale animation with sinister effect
        scene.tweens.add({
          targets: shadow,
          scaleX: 0.2,
          scaleY: 0.2,
          duration: 200 + Math.random() * 100,
          delay: delay,
          ease: "Sine.easeIn",
        });

        // Subtle rotation for ominous feel
        scene.tweens.add({
          targets: shadow,
          rotation: (Math.random() - 0.5) * Math.PI,
          duration: 300 + Math.random() * 150,
          delay: delay,
          ease: "Sine.easeInOut",
        });
      }
    } catch (error) {
      console.warn("Failed to create shadow particles:", error);
    }
  }

  #createMenacingEffect(scene: Phaser.Scene): void {
    try {
      // Menacing scale pulse
      scene.tweens.add({
        targets: this._gameObject,
        scaleX: this._gameObject.scaleX * 1.1,
        scaleY: this._gameObject.scaleY * 1.1,
        duration: 100,
        ease: "Back.easeOut",
        yoyo: true,
      });

      // Dark tint effect
      const phaserGameObject = this._gameObject as Phaser.GameObjects.GameObject & {
        setTint?: (tint: number) => void;
        clearTint?: () => void;
      };

      if (typeof phaserGameObject.setTint === "function") {
        phaserGameObject.setTint(0x660000); // Dark red tint
        scene.time.delayedCall(80, () => {
          if (this._gameObject && this._gameObject.active) {
            if (typeof phaserGameObject.setTint === "function") {
              phaserGameObject.setTint(0x330033); // Dark purple tint
            }
          }
        });
        scene.time.delayedCall(150, () => {
          if (this._gameObject && this._gameObject.active) {
            if (typeof phaserGameObject.clearTint === "function") {
              phaserGameObject.clearTint();
            }
          }
        });
      }

      // Subtle screen distortion effect
      const camera = scene.cameras.main;
      if (camera) {
        camera.shake(80, 0.004); // Subtle shake, less than player attack
      }
    } catch (error) {
      console.warn("Failed to create menacing effect:", error);
    }
  }

  #onAttackAnimationComplete(): void {
    // Return to idle state
    this._stateMachine.setState(ENEMY_STATES.IDLE_STATE);
  }
}
