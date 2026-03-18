import { AUDIO_ASSETS, FONT_ASSETS, IMAGE_ASSETS, SPINE_ASSETS } from "../lib/assets";
import { ENABLE_LOGGING, SCENE_CONFIG } from "../lib/config";
import { SoundManager } from "../lib/sound-manager";
import { SCENE_KEYS } from "./_scene-keys";

export class PreloadScene extends Phaser.Scene {
  #barGraphics!: Phaser.GameObjects.Graphics;
  #dotTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super(SCENE_KEYS.PRELOAD_SCENE);
  }

  preload() {
    this.#createLoadingUI();
    this.#setupLoadingEvents();
    this.#loadAssets();
  }

  create() {
    this.#dotTimers.forEach((t) => t.remove());
    this.#startBackgroundMusic();
    this.scene.start(SCENE_KEYS.TITLE_SCENE);
  }

  #startBackgroundMusic(): void {
    try {
      const bgm = this.sound.add("bgm");
      bgm.play({ loop: true, volume: 0.2 });
      SoundManager.getInstance().setBgmInstance(bgm);
      if (ENABLE_LOGGING) console.log("Background music started");
    } catch (error) {
      console.warn("Failed to start background music:", error);
    }
  }

  #createLoadingUI(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;

    // ── 배경 그라데이션 (상단 어둡게 → 하단 약간 밝게)
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d1b2a, 0x0d1b2a, 0x1a3a5c, 0x1a3a5c, 1);
    bg.fillRect(0, 0, W, H);

    // ── 별 파티클 (간단한 점들)
    const stars = this.add.graphics();
    stars.fillStyle(0xffffff, 0.6);
    for (let i = 0; i < 60; i++) {
      const sx = Math.random() * W;
      const sy = Math.random() * H * 0.7;
      const sr = Math.random() * 1.5 + 0.3;
      stars.fillCircle(sx, sy, sr);
    }

    // ── 게임 타이틀
    this.add
      .text(cx, cy - 120, '찾아가는 계단', {
        fontFamily: 'netmarble_b, sans-serif',
        fontSize: `${Math.round(SCENE_CONFIG.height * 0.045)}px`,
        color: '#e0f0ff',
        stroke: '#0a1628',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 4, color: '#6366f1', blur: 12, fill: true },
      })
      .setOrigin(0.5);

    // ── 로딩 서브텍스트
    const loadingText = this.add
      .text(cx, cy - 60, 'Loading', {
        fontFamily: 'netmarble_b, sans-serif',
        fontSize: `${Math.round(SCENE_CONFIG.height * 0.022)}px`,
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    // 점 애니메이션
    let dots = 0;
    this.#dotTimers.push(
      this.time.addEvent({
        delay: 400,
        loop: true,
        callback: () => {
          dots = (dots + 1) % 4;
          loadingText.setText('Loading' + '.'.repeat(dots));
        },
      }),
    );

    // ── 트랙 (배경 바)
    const barW = W * 0.72;
    const barH = 8;
    const barX = cx - barW / 2;
    const barY = cy - 10;
    const radius = barH / 2;

    const track = this.add.graphics();
    track.fillStyle(0x1e3a5c, 1);
    track.fillRoundedRect(barX, barY, barW, barH, radius);
    track.lineStyle(1, 0x2d5a8a, 1);
    track.strokeRoundedRect(barX, barY, barW, barH, radius);

    // ── 진행 바 (fillRoundedRect를 직접 그림)
    this.#barGraphics = this.add.graphics();
    this.#barGraphics.setData('barX', barX);
    this.#barGraphics.setData('barW', barW);
    this.#barGraphics.setData('barH', barH);
    this.#barGraphics.setData('barY', barY);
    this.#barGraphics.setData('radius', radius);

    // ── 퍼센트 텍스트
    const pctText = this.add
      .text(cx, barY + barH + 16, '0%', {
        fontFamily: 'netmarble_b, sans-serif',
        fontSize: `${Math.round(SCENE_CONFIG.height * 0.018)}px`,
        color: '#6366f1',
      })
      .setOrigin(0.5);

    this.#barGraphics.setData('pctText', pctText);
  }

  #setupLoadingEvents(): void {
    this.load.on('progress', (progress: number) => {
      const g = this.#barGraphics;
      const barX = g.getData('barX') as number;
      const barW = g.getData('barW') as number;
      const barH = g.getData('barH') as number;
      const barY = g.getData('barY') as number;
      const radius = g.getData('radius') as number;
      const pctText = g.getData('pctText') as Phaser.GameObjects.Text;

      g.clear();
      const fillW = Math.max(radius * 2, barW * progress);

      // 글로우 레이어
      g.fillStyle(0x818cf8, 0.25);
      g.fillRoundedRect(barX - 2, barY - 2, fillW + 4, barH + 4, radius + 1);

      // 메인 컬러 (인디고 → 퍼플 그라데이션 느낌)
      g.fillGradientStyle(0x6366f1, 0x8b5cf6, 0x6366f1, 0x8b5cf6, 1);
      g.fillRoundedRect(barX, barY, fillW, barH, radius);

      // 하이라이트 (상단 얇은 흰색 선)
      g.fillStyle(0xffffff, 0.3);
      g.fillRoundedRect(barX + 2, barY + 1, fillW - 4, barH * 0.35, radius * 0.5);

      pctText.setText(`${Math.round(progress * 100)}%`);
    });

    if (ENABLE_LOGGING) {
      this.load.on('fileprogress', (file: Phaser.Loader.File) => {
        console.log('Loading:', file.key);
      });
    }
  }

  #loadAssets(): void {
    Object.values(FONT_ASSETS).forEach((asset) => {
      this.load.font(asset.key, asset.path);
    });
    Object.values(IMAGE_ASSETS).forEach((asset) => {
      this.load.image(asset.key, asset.path);
    });
    Object.values(AUDIO_ASSETS).forEach((asset) => {
      this.load.audio(asset.key, asset.path);
    });
    Object.values(SPINE_ASSETS).forEach((asset) => {
      this.load.spineJson(asset.dataKey, asset.jsonPath);
      this.load.spineAtlas(asset.atlasKey, asset.atlasPath);
    });
  }
}
