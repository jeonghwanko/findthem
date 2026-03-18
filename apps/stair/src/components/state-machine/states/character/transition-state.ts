import { CHARACTER_ANIMATIONS } from "../../../../lib/assets";
import { type CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";

export class TransitionState extends BaseCharacterState {
  #callback?: () => void;

  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.TRANSITION_STATE, gameObject);
  }

  public onEnter(args: unknown[]): void {
    this._gameObject.controls.isMovementLocked = true;
    const [onComplete] = args;

    if (typeof onComplete === "function") {
      this.#callback = onComplete as () => void;
    }

    // 1단계: 준비 애니메이션
    this._gameObject.animationComponent.playAnimation(CHARACTER_ANIMATIONS.TRANSITION_READY);

    // 2단계: 지정된 시간(ms) 후에 점프 애니메이션과 트윈 시작
    const JUMP_DELAY = 250;
    this._gameObject.scene.time.delayedCall(JUMP_DELAY, () => {
      this._gameObject.animationComponent.playAnimation(CHARACTER_ANIMATIONS.TRANSITION_JUMP);

      this._gameObject.scene.tweens.add({
        targets: this._gameObject,
        y: this._gameObject.y - this._gameObject.scene.scale.height,
        rotation: 5,
        ease: "power2In",
        duration: 300,
        onComplete: this.#callback,
      });
    });
  }
}
