import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "./base-character";
import { CHARACTER_STATES } from "./_states";
import { type Direction } from "../../../../lib/types";
import { PLAYER_DEFAULT_SCALE, STAIR_CONFIG } from "../../../../lib/config";
import { logger } from "../../../../lib/logger";
import { playDeathSound } from "../../../../lib/sound-utils";

export class FallState extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.FALL_STATE, gameObject);
  }

  public onEnter(args: unknown[]): void {
    const direction = args[0] as Direction | undefined;
    const reason = args[1] as string | undefined;

    logger.info("FallState", "onEnter", `Falling ${direction || "LEFT"}: ${reason || "Unknown reason"}`);
    this._gameObject.setShadowVisibility(false, 300);

    if (direction) {
      this.#createFallAnimation(direction);
    } else {
      // If no direction provided, just fall straight down
      this.#createFallAnimation("LEFT");
    }
  }

  #createFallAnimation(direction: Direction): void {
    playDeathSound(this._gameObject.scene);

    // Set falling animation
    this._gameObject.animationComponent.playAnimation("TRANSITION_JUMP");

    // Set character orientation based on wrong direction
    if (direction === "RIGHT") {
      this._gameObject.setScale(-PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
    } else {
      this._gameObject.setScale(PLAYER_DEFAULT_SCALE, PLAYER_DEFAULT_SCALE);
    }

    // Calculate fall parameters
    const currentX = this._gameObject.x;
    const currentY = this._gameObject.y;
    const fallDistance = direction === "RIGHT" ? STAIR_CONFIG.width * 2 : -STAIR_CONFIG.width * 2;
    const upwardJump = STAIR_CONFIG.height * 2; // 위로 점프하는 거리
    const fallDuration1 = 150; // 1단계 점프 지속시간
    const fallDuration2 = 500; // 2단계 낙하 지속시간

    // 1단계: 수평 이동과 함께 약간 위로 (점프하는 느낌)
    this._gameObject.scene.tweens.add({
      targets: this._gameObject,
      x: currentX + fallDistance * 0.3, // 30% 거리만 먼저 이동
      y: currentY - upwardJump, // 약간 위로 점프
      rotation: direction === "RIGHT" ? Math.PI * 0.3 : -Math.PI * 0.3, // 살짝 회전
      duration: fallDuration1,
      ease: "Power2.easeOut", // 위로 갈 때는 감속
      onComplete: () => {
        // 2단계: 중력으로 떨어지면서 계속 이동
        this._gameObject.scene.tweens.add({
          targets: this._gameObject,
          x: currentX + fallDistance * 0.7, // 나머지 70% 거리 이동
          y: currentY + this._gameObject.scene.scale.height / 4, // 화면 아래로 떨어짐
          rotation: direction === "RIGHT" ? Math.PI * 2 : -Math.PI * 2, // 완전히 회전
          scale: 0, // 작아지면서 떨어짐
          duration: fallDuration2,
          ease: "Power2.easeIn", // 아래로 갈 때는 가속
          onComplete: () => {
            this.#onFallComplete();
          },
        });
      },
    });
  }

  #onFallComplete(): void {
    // You can emit an event or call a callback here
    // For now, we'll just log and could transition to game over state
    // Could transition to a game over state or restart
    // this._stateMachine.setState(CHARACTER_STATES.DEATH_STATE);
  }
}
