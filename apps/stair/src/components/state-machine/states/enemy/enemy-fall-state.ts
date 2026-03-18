import { CharacterGameObject } from "../../../../game-objects/common/character-game";
import { BaseCharacterState } from "../character/base-character";
import { ENEMY_STATES } from "../character/_states";
import { type Direction } from "../../../../lib/types";
import { STAIR_CONFIG } from "../../../../lib/config";
import { playEnemyDeathSound } from "../../../../lib/sound-utils";

export class EnemyFallState extends BaseCharacterState {
  #onDestroyed?: () => void;

  constructor(gameObject: CharacterGameObject, onDestroyed?: () => void) {
    super(ENEMY_STATES.FALL_STATE, gameObject);
    this.#onDestroyed = onDestroyed;
  }

  public onEnter(args: unknown[]): void {
    const direction = args[0] as Direction | undefined;

    this._gameObject.setShadowVisibility(false, 300);
    this.#onDestroyed?.();

    if (direction) {
      this.#createFallAnimation(direction);
    } else {
      // If no direction provided, just fall straight down
      this.#createFallAnimation("LEFT");
    }
  }

  #createFallAnimation(direction: Direction): void {
    playEnemyDeathSound(this._gameObject.scene);

    // Set falling animation (same as player)
    this._gameObject.animationComponent.playAnimation("DIE_LEFT");

    // Calculate fall parameters (exactly same as player)
    const currentX = this._gameObject.x;
    const currentY = this._gameObject.y;
    const fallDistance = direction === "LEFT" ? STAIR_CONFIG.width * 2 : -STAIR_CONFIG.width * 2;
    const upwardJump = STAIR_CONFIG.height * 2; // 위로 점프하는 거리
    const fallDuration1 = 150; // 1단계 점프 지속시간
    const fallDuration2 = 500; // 2단계 낙하 지속시간

    // Store references to avoid scope issues
    const gameObject = this._gameObject;
    const scene = this._gameObject.scene;

    // 1단계: 수평 이동과 함께 약간 위로 (점프하는 느낌)
    scene.tweens.add({
      targets: gameObject,
      x: currentX + fallDistance * 0.3, // 30% 거리만 먼저 이동
      y: currentY - upwardJump, // 약간 위로 점프
      rotation: direction === "LEFT" ? Math.PI * 0.3 : -Math.PI * 0.3, // 살짝 회전
      duration: fallDuration1,
      ease: "Power2.easeOut", // 위로 갈 때는 감속
      onComplete: () => {
        // Safety check
        if (!gameObject || !gameObject.scene || gameObject.scene !== scene) {
          console.warn("Enemy destroyed during fall animation");
          return;
        }

        // 2단계: 중력으로 떨어지면서 계속 이동
        scene.tweens.add({
          targets: gameObject,
          x: currentX + fallDistance * 0.7, // 나머지 70% 거리 이동
          y: currentY + scene.scale.height / 4, // 화면 아래로 떨어짐
          rotation: direction === "LEFT" ? Math.PI * 2 : -Math.PI * 2, // 완전히 회전
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
    // Execute callback first (remove from StairManager, scene arrays, etc.)

    // Then destroy the enemy game object
    this._gameObject.destroy();
  }
}
