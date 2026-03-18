import { SoundManager } from "./sound-manager";

/**
 * Sound utility functions for playing game audio effects
 */

/**
 * Play click sound effect for UI interactions
 * @param scene - The Phaser scene instance
 * @param volume - Volume level (0.0 - 1.0), defaults to 0.3
 */
export function playClickSound(scene: Phaser.Scene, volume: number = 0.3): void {
  const soundManager = SoundManager.getInstance();
  soundManager.playSoundEffect(scene, "click", volume);
}

/**
 * Play attack sound effect
 * @param scene - The Phaser scene instance
 * @param volume - Volume level (0.0 - 1.0), defaults to 0.4
 */
export function playAttackSound(scene: Phaser.Scene, volume: number = 0.4): void {
  const soundManager = SoundManager.getInstance();
  soundManager.playSoundEffect(scene, "attack", volume);
}

/**
 * Play climb sound effect
 * @param scene - The Phaser scene instance
 * @param volume - Volume level (0.0 - 1.0), defaults to 0.3
 */
export function playClimbSound(scene: Phaser.Scene, volume: number = 0.18): void {
  const soundManager = SoundManager.getInstance();
  soundManager.playSoundEffect(scene, "climb", volume);
}

/**
 * Play death sound effect
 * @param scene - The Phaser scene instance
 * @param volume - Volume level (0.0 - 1.0), defaults to 0.3
 */
export function playDeathSound(scene: Phaser.Scene, volume: number = 0.2): void {
  const soundManager = SoundManager.getInstance();
  soundManager.playSoundEffect(scene, "death", volume);
}

/**
 * Play result sound effect
 * @param scene - The Phaser scene instance
 * @param volume - Volume level (0.0 - 1.0), defaults to 0.3
 */
export function playResultSound(scene: Phaser.Scene, volume: number = 0.25): void {
  const soundManager = SoundManager.getInstance();
  soundManager.playSoundEffect(scene, "result", volume);
}

/**
 * Play enemy death sound effect
 * @param scene - The Phaser scene instance
 * @param volume - Volume level (0.0 - 1.0), defaults to 0.3
 */
export function playEnemyDeathSound(scene: Phaser.Scene, volume: number = 0.3): void {
  const soundManager = SoundManager.getInstance();
  soundManager.playSoundEffect(scene, "enemy_death", volume);
}

/**
 * Add click sound to any interactive Phaser Game Object
 * @param gameObject - The Phaser Game Object to make clickable
 * @param scene - The Phaser scene instance
 * @param volume - Volume level (0.0 - 1.0), defaults to 0.3
 */
export function addClickSoundToObject(
  gameObject: Phaser.GameObjects.GameObject & {
    setInteractive?: () => Phaser.GameObjects.GameObject;
    on?: (event: string, callback: () => void) => Phaser.GameObjects.GameObject;
  },
  scene: Phaser.Scene,
  volume: number = 0.3,
): void {
  try {
    if (typeof gameObject.setInteractive === "function" && typeof gameObject.on === "function") {
      gameObject.setInteractive();
      gameObject.on("pointerdown", () => {
        playClickSound(scene, volume);
      });
    }
  } catch (error) {
    console.warn("Failed to add click sound to object:", error);
  }
}
