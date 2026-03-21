/**
 * FolkCharacter — a16z AI Town 32×32 캐릭터 스프라이트
 *
 * 32x32folk.png 스프라이트시트에서 8명 캐릭터 지원.
 * 각 캐릭터: 96×128 영역 (3프레임 × 4방향, 32px 타일)
 *   Row 0: down (3 frames)
 *   Row 1: left (3 frames)
 *   Row 2: right (3 frames)
 *   Row 3: up (3 frames)
 */
import { Container, Sprite, Texture, Rectangle, Assets, SCALE_MODES } from 'pixi.js';
import { assetUrl } from './assetUrl';

const TILE = 32;
const FRAMES_PER_DIR = 3;

// 캐릭터 ID (1-8) → 스프라이트시트 내 오프셋
const CHAR_OFFSETS: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 96, y: 0 },
  3: { x: 192, y: 0 },
  4: { x: 288, y: 0 },
  5: { x: 0, y: 128 },
  6: { x: 96, y: 128 },
  7: { x: 192, y: 128 },
  8: { x: 288, y: 128 },
};

// 방향 → 행 오프셋
const DIR_ROW: Record<string, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

type AnimState = 'idle' | 'run' | 'sit';

export class FolkCharacter {
  readonly view = new Container();
  readonly pixelHeight = TILE;

  private sprite: Sprite;
  private frames: Record<string, Texture[]> = {};
  private currentDir = 'down';
  private currentState: AnimState = 'idle';
  private frameIndex = 0;
  private elapsed = 0;
  private animSpeed = 6; // fps

  // idle 애니메이션: 호흡 + 고개 돌리기
  private idleTime = 0;
  private breathBaseY = 0;
  private lookTimer = 0;
  private lookDir = 'down';
  private readonly LOOK_DIRS = ['down', 'left', 'right', 'down'];

  private constructor(sprite: Sprite, frames: Record<string, Texture[]>) {
    this.sprite = sprite;
    this.frames = frames;
    this.sprite.anchor.set(0.5, 1);
    this.view.addChild(this.sprite);
    this.sprite.texture = frames['down'][0];
  }

  // 정적 텍스처 캐시 — 같은 charId로 재생성해도 Texture 누수 없음
  private static frameCache = new Map<number, Record<string, Texture[]>>();

  static async create(charId: number): Promise<FolkCharacter> {
    let frames = FolkCharacter.frameCache.get(charId);
    if (!frames) {
      const tex = await Assets.load(assetUrl('/tiles/32x32folk.png')) as Texture;
      tex.source.scaleMode = SCALE_MODES.NEAREST;

      const offset = CHAR_OFFSETS[charId] ?? CHAR_OFFSETS[1];
      frames = {};

      for (const [dir, row] of Object.entries(DIR_ROW)) {
        frames[dir] = [];
        for (let f = 0; f < FRAMES_PER_DIR; f++) {
          frames[dir].push(new Texture({
            source: tex.source,
            frame: new Rectangle(
              offset.x + f * TILE,
              offset.y + row * TILE,
              TILE, TILE,
            ),
          }));
        }
      }
      FolkCharacter.frameCache.set(charId, frames);
    }

    const sprite = new Sprite(frames['down'][0]);
    return new FolkCharacter(sprite, frames);
  }

  dispose() {
    this.view.destroy({ children: true });
  }

  setPosition(x: number, y: number) {
    this.view.position.set(x, y);
  }

  setFlipX(flip: boolean) {
    this.currentDir = flip ? 'left' : 'right';
  }

  play(state: AnimState) {
    if (this.currentState === state) return;
    this.currentState = state;
    this.frameIndex = 0;
    this.elapsed = 0;

    if (state === 'idle' || state === 'sit') {
      this.currentDir = 'down';
      this.sprite.texture = this.frames['down'][0];
      this.idleTime = 0;
      this.lookTimer = 2 + Math.random() * 3;
      this.lookDir = 'down';
      this.sprite.y = 0;
    }
  }

  tick(dt: number) {
    if (this.currentState === 'run') {
      this.elapsed += dt;
      const frameDuration = 1 / this.animSpeed;
      while (this.elapsed >= frameDuration) {
        this.elapsed -= frameDuration;
        const dirFrames = this.frames[this.currentDir] ?? this.frames['down'];
        this.frameIndex = (this.frameIndex + 1) % dirFrames.length;
        this.sprite.texture = dirFrames[this.frameIndex];
      }
      return;
    }

    // idle 애니메이션
    if (this.currentState === 'idle') {
      this.idleTime += dt;

      // 호흡: sin 곡선으로 y 1px 상하 흔들림
      this.sprite.y = Math.sin(this.idleTime * 2.5) * 1;

      // 고개 돌리기: 3~6초마다 랜덤 방향
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTimer = 3 + Math.random() * 3;
        const nextDir = this.LOOK_DIRS[Math.floor(Math.random() * this.LOOK_DIRS.length)];
        this.lookDir = nextDir;
        this.sprite.texture = this.frames[nextDir][0];
      }
    }
  }
}
