import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";

export class EntranceState extends BaseCharacterState {
  #onComplete?: () => void;

  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.ENTRANCE_STATE, gameObject);
  }

  public onEnter(args: unknown[]): void {
    const onComplete = args[0] as (() => void) | undefined;
    this.#onComplete = onComplete;

    // 입력 잠금
    this._gameObject.controls.isMovementLocked = true;

    // 캐릭터를 화면 위에서 시작하도록 설정
    const startY = this._gameObject.y - this._gameObject.scene.scale.height;
    this._gameObject.setY(startY);

    // 첫 번째 계단 위치 계산
    const targetY = this._gameObject.scene.scale.height;

    this.#createEntranceAnimation(targetY);
  }

  #createEntranceAnimation(targetY: number): void {
    this._gameObject.animationComponent.playAnimation("HURT_LEFT");

    // 1단계: 자유낙하 (가속) + 회전 효과
    const fallDistance = targetY + 10; // 착지점보다 조금 더 아래로 (landingOffset)
    const freeFallDuration = 500; // ANIMATION_CONFIG.entrance.freeFallDuration

    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      y: fallDistance,
      rotation: Math.PI * 2, // 360도 회전 (ANIMATION_CONFIG.entrance.rotation)
      duration: freeFallDuration,
      ease: "Power2.easeIn", // ANIMATION_CONFIG.entrance.easing.freeFall
      onComplete: () => {
        this.#startBounceAnimation(targetY);
      },
    });
  }

  #startBounceAnimation(targetY: number): void {
    this._gameObject.animationComponent.playAnimation("ANGRY_LEFT");

    // 2단계: 바운스 효과 (약간 위로 튀어올랐다가)
    const bounceHeight = 30; // ANIMATION_CONFIG.entrance.bounceHeight
    const bounceUpDuration = 50; // ANIMATION_CONFIG.entrance.bounceUpDuration

    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      y: targetY - bounceHeight,
      duration: bounceUpDuration,
      ease: "Power1.easeOut", // ANIMATION_CONFIG.entrance.easing.bounceUp
      onComplete: () => {
        this.#startLandingAnimation(targetY);
      },
    });
  }

  #startLandingAnimation(targetY: number): void {
    // 3단계: 최종 착지
    const landingDuration = 100; // ANIMATION_CONFIG.entrance.landingDuration

    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      y: targetY,
      rotation: 0, // 회전 리셋
      duration: landingDuration,
      ease: "Power1.easeIn", // ANIMATION_CONFIG.entrance.easing.landing
      onComplete: () => {
        this.#onEntranceComplete();
      },
    });
  }

  #onEntranceComplete(): void {
    // 착지 후 idle 애니메이션으로 변경
    this._gameObject.animationComponent.playAnimation("IDLE_LEFT");

    // 입력 잠금 해제
    this._gameObject.controls.isMovementLocked = false;

    // 화면 흔들림 효과 (착지 임팩트)
    this._gameObject.scene.cameras.main.shake(200, 0.005);

    // IDLE 상태로 전환
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);

    // 완료 콜백 호출
    if (this.#onComplete) {
      this.#onComplete();
    }
  }
}
