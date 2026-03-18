import { UI_CONFIG } from "../../lib/config";

export type HealthUIConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
  showDecayRate?: boolean;
  borderRadius?: number; // Add optional border radius
};

export class HealthUIComponent {
  #scene: Phaser.Scene;
  #config: HealthUIConfig;

  // UI 요소들 - Graphics로 변경
  #healthBarBg!: Phaser.GameObjects.Graphics;
  #healthBar!: Phaser.GameObjects.Graphics;
  #healthText!: Phaser.GameObjects.Text;
  #decayRateText!: Phaser.GameObjects.Text;

  // 애니메이션 효과
  #lastHealth: number = 100;
  #pulseAnimation?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, config: HealthUIConfig) {
    this.#scene = scene;
    this.#config = {
      borderRadius: 8, // Default border radius
      ...config,
    };
    this.#createUI();
  }

  #createUI(): void {
    const { x, y, width, height, borderRadius } = this.#config;

    // 체력바 배경 (둥근 모서리)
    this.#healthBarBg = this.#scene.add.graphics();
    this.#healthBarBg.fillStyle(0x333333);
    this.#healthBarBg.fillRoundedRect(x, y, width, height, borderRadius!);
    this.#healthBarBg.setScrollFactor(0);
    this.#healthBarBg.setDepth(100);

    // 체력바 (둥근 모서리)
    this.#healthBar = this.#scene.add.graphics();
    this.#healthBar.setScrollFactor(0);
    this.#healthBar.setDepth(101);

    // Initial health bar drawing
    this.#drawHealthBar(1.0, 0x00ff00); // Full health, green color

    // 체력 텍스트
    this.#healthText = this.#scene.add.text(x + width + 10, y + height / 2, "100/100", {
      fontSize: UI_CONFIG.fonts.sizes.medium,
      color: UI_CONFIG.colors.light,
      stroke: UI_CONFIG.colors.background,
      strokeThickness: 4,
      fontFamily: UI_CONFIG.fonts.family.default,
    });
    this.#healthText.setOrigin(0, 0.5);
    this.#healthText.setScrollFactor(0);
    this.#healthText.setDepth(102);

    // 체력 감소율 텍스트 (옵션)
    if (this.#config.showDecayRate) {
      this.#decayRateText = this.#scene.add.text(x, y - 25, "Decay: 0/s", {
        fontSize: UI_CONFIG.fonts.sizes.small,
        color: UI_CONFIG.colors.warning,
        stroke: UI_CONFIG.colors.background,
        strokeThickness: 4,
        fontFamily: UI_CONFIG.fonts.family.default,
      });
      this.#decayRateText.setOrigin(0, 0);
      this.#decayRateText.setScrollFactor(0);
      this.#decayRateText.setDepth(102);
    }
  }

  #drawHealthBar(healthPercent: number, color: number): void {
    const { x, y, width, height, borderRadius } = this.#config;
    const padding = 2;
    const barWidth = (width - padding * 2) * healthPercent;
    const barHeight = height - padding * 2;

    // Clear previous drawing
    this.#healthBar.clear();

    // Only draw if there's health remaining
    if (healthPercent > 0) {
      this.#healthBar.fillStyle(color);

      // Calculate the radius for the health bar (smaller than background)
      const healthBarRadius = Math.min(borderRadius! - 1, barHeight / 2, barWidth / 2);

      this.#healthBar.fillRoundedRect(x + padding, y + padding, barWidth, barHeight, healthBarRadius);
    }
  }

  public updateHealth(currentHealth: number, maxHealth: number, decayRate?: number): void {
    const healthPercent = currentHealth / maxHealth;

    // 체력바 색상 변경 (체력에 따라)
    let barColor = 0x00ff00; // 초록
    if (healthPercent <= 0.2) {
      barColor = 0xff0000; // 빨강 (위험)
    } else if (healthPercent <= 0.5) {
      barColor = 0xff8800; // 주황 (경고)
    } else if (healthPercent <= 0.7) {
      barColor = 0xffff00; // 노랑 (주의)
    }

    // 체력바 다시 그리기
    this.#drawHealthBar(healthPercent, barColor);

    // 체력 텍스트 업데이트
    this.#healthText.setText(`${Math.ceil(currentHealth)}/${maxHealth}`);

    // 체력 감소율 텍스트 업데이트
    if (this.#config.showDecayRate && this.#decayRateText && decayRate !== undefined) {
      this.#decayRateText.setText(`Decay: ${decayRate.toFixed(1)}/s`);
    }

    // 경고 효과
    if (healthPercent <= 0.3) {
      this.#createWarningEffect();
    } else {
      this.#stopWarningEffect();
    }

    // 체력 회복 효과
    if (currentHealth > this.#lastHealth) {
      this.#createHealthRestoreEffect();
    }

    this.#lastHealth = currentHealth;
  }

  #createWarningEffect(): void {
    // Stop any existing pulse animation
    if (this.#pulseAnimation) {
      this.#pulseAnimation.stop();
    }

    // Create pulsing effect for low health
    this.#pulseAnimation = this.#scene.tweens.add({
      targets: this.#healthBar,
      alpha: 0.6,
      duration: 500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  #stopWarningEffect(): void {
    if (this.#pulseAnimation) {
      this.#pulseAnimation.stop();
      this.#healthBar.setAlpha(1);
    }
  }

  #createHealthRestoreEffect(): void {
    // 체력 회복 시 둥근 모서리 플래시 효과
    const { x, y, width, height, borderRadius } = this.#config;

    const flash = this.#scene.add.graphics();
    flash.fillStyle(0x00ff88, 0.5);
    flash.fillRoundedRect(x, y, width, height, borderRadius!);
    flash.setScrollFactor(0);
    flash.setDepth(103);

    this.#scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 200,
      ease: "Power2",
      onComplete: () => {
        flash.destroy();
      },
    });
  }

  public destroy(): void {
    this.#healthBarBg?.destroy();
    this.#healthBar?.destroy();
    this.#healthText?.destroy();
    this.#decayRateText?.destroy();
    this.#pulseAnimation?.stop();
  }
}
