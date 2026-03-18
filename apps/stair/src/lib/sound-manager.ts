/**
 * Global sound manager for controlling game audio
 */
export class SoundManager {
  private static instance: SoundManager;
  private isMuted: boolean = false;
  private bgmInstance: Phaser.Sound.BaseSound | null = null;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  /**
   * Initialize BGM instance for control
   */
  public setBgmInstance(bgm: Phaser.Sound.BaseSound): void {
    this.bgmInstance = bgm;
  }

  /**
   * Get current mute state
   */
  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Toggle mute state
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.applyMuteState();
    return this.isMuted;
  }

  /**
   * Set mute state
   */
  public setMute(muted: boolean): void {
    this.isMuted = muted;
    this.applyMuteState();
  }

  /**
   * Apply mute state to all audio
   */
  private applyMuteState(): void {
    if (this.bgmInstance) {
      if (this.isMuted) {
        this.bgmInstance.pause();
      } else {
        this.bgmInstance.resume();
      }
    }
  }

  /**
   * Play sound effect (respects mute state)
   */
  public playSoundEffect(scene: Phaser.Scene, key: string, volume: number = 0.3): void {
    if (!this.isMuted) {
      try {
        scene.sound.play(key, { volume });
      } catch (error) {
        console.warn(`Failed to play sound effect: ${key}`, error);
      }
    }
  }
}
