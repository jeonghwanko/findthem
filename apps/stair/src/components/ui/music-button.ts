import { SoundManager } from "../../lib/sound-manager";
import { addClickSoundToObject } from "../../lib/sound-utils";

/**
 * Reusable music button component for toggling audio on/off
 */
export class MusicButton {
  private scene: Phaser.Scene;
  private button: Phaser.GameObjects.Image;
  private soundManager: SoundManager;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.soundManager = SoundManager.getInstance();
    this.button = this.createButton(x, y);
    this.updateButtonAppearance();
  }

  private createButton(x: number, y: number): Phaser.GameObjects.Image {
    const button = this.scene.add.image(x, y, "music_button");

    // Set button properties
    button.setInteractive({ useHandCursor: true });
    button.setDepth(1000); // High depth to appear above other elements
    button.setScale(0.3);

    // Add click event with scale animation (matching ui-scene style)
    button.on("pointerdown", () => {
      this.handleClick();
      this.playButtonTween();
    });

    // Add hover effects (matching ui-scene style)
    button.on("pointerover", () => {
      // Only apply hover tint if not muted (to maintain mute visual state)
      if (!this.soundManager.getIsMuted()) {
        button.setTint(0xcccccc);
      }
    });

    button.on("pointerout", () => {
      // Restore proper state based on mute status
      this.updateButtonAppearance();
    });

    // Add click sound using the same pattern as ui-scene
    addClickSoundToObject(button, this.scene);

    return button;
  }

  private playButtonTween(): void {
    // Scale animation matching ui-scene button style
    this.scene.tweens.add({
      targets: this.button,
      scaleX: 0.35, // Slightly smaller than current scale (0.4)
      scaleY: 0.35,
      duration: 50,
      yoyo: true,
      ease: "Power1",
    });
  }

  private handleClick(): void {
    // Toggle mute state
    const isMuted = this.soundManager.toggleMute();

    // Update button appearance
    this.updateButtonAppearance();

    console.log(`Music ${isMuted ? "muted" : "unmuted"}`);
  }

  private updateButtonAppearance(): void {
    const isMuted = this.soundManager.getIsMuted();

    if (isMuted) {
      // Muted state: darker and more transparent
      this.button.setTint(0x666666); // Dark gray tint
      this.button.setAlpha(0.6); // More transparent
    } else {
      // Unmuted state: normal appearance
      this.button.clearTint();
      this.button.setAlpha(1.0);
    }
  }

  /**
   * Get the button game object (for positioning, etc.)
   */
  public getButton(): Phaser.GameObjects.Image {
    return this.button;
  }

  /**
   * Update button position
   */
  public setPosition(x: number, y: number): void {
    this.button.setPosition(x, y);
  }

  /**
   * Destroy the button
   */
  public destroy(): void {
    if (this.button) {
      this.button.destroy();
    }
  }
}
