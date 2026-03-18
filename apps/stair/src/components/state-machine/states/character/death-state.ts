import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";
import { PLAYER_DEFAULT_SCALE } from "../../../../lib/config";
import { playDeathSound } from "../../../../lib/sound-utils";

export class DeathState extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.DEATH_STATE, gameObject);
  }

  public onEnter(): void {
    this._gameObject.setShadowVisibility(false, 500);
    this.#createDeathAnimation();
  }

  #createDeathAnimation(): void {
    playDeathSound(this._gameObject.scene);

    // Stop any existing movement
    this._gameObject.scene.tweens.killTweensOf(this._gameObject);

    // Reset scale and rotation
    this._gameObject.setScale(PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
    this._gameObject.setRotation(0);

    // Play death animation
    this._gameObject.animationComponent.playAnimation("DIE_LEFT");

    // Death animation - fade out and sink down slightly
    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      alpha: 0.3,
      scaleX: PLAYER_DEFAULT_SCALE * 0.8,
      scaleY: PLAYER_DEFAULT_SCALE * 0.8,
      duration: 500,
      ease: "Power2.easeOut",
      onComplete: () => {
        this.#onDeathComplete();
      },
    });

    // Add a slight rotation wobble
    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      rotation: 0.1,
      duration: 100,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
  }

  #onDeathComplete(): void {
    // Could trigger game over screen or restart
    // For now, we'll just log - the game scene should handle the actual game over
  }
}
