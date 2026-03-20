/**
 * PixelCharacter — LimeZu 16×32 스프라이트 캐릭터
 *
 * 스프라이트시트 구조 (16×32 프레임):
 *   idle_anim: 384×32 = 24프레임(16px 폭) × 1행(32px 높이)
 *   run:       384×32 = 24프레임
 *   sit:       384×32
 *   phone:     144×32 = 9프레임
 *
 * 24프레임 = 6프레임 × 4방향 [down×6, up×6, right×6, left×6]
 * → 단순화: 처음 6프레임(앞방향) + flipX로 좌우 처리
 */
import { Container, Sprite, Texture, Rectangle, Assets } from 'pixi.js';

const FRAME_W = 16;
const FRAME_H = 32;
const SCALE = 2; // 16×32 → 32×64 렌더링

type AnimState = 'idle' | 'run' | 'sit' | 'phone';

/** 캐릭터 이름 (에셋 파일명 기준) */
export type CharacterName = 'Adam' | 'Alex' | 'Amelia' | 'Bob';

interface AnimDef {
  frames: Texture[];
  speed: number; // frames per second
}

function assetPath(path: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: string = (import.meta as any)?.env?.BASE_URL ?? '/';
    return `${base}${path.replace(/^\//, '')}`;
  } catch {
    return path;
  }
}

/** 스프라이트시트에서 프레임 추출 (16×32 프레임) */
function extractFrames(
  tex: Texture,
  startCol: number,
  count: number,
): Texture[] {
  const frames: Texture[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(
      new Texture({
        source: tex.source,
        frame: new Rectangle(
          (startCol + i) * FRAME_W,
          0,
          FRAME_W,
          FRAME_H,
        ),
      }),
    );
  }
  return frames;
}

export class PixelCharacter {
  readonly view: Container;
  private sprite: Sprite;
  private anims: Partial<Record<AnimState, AnimDef>> = {};
  private currentAnim: AnimState = 'idle';
  private frameIndex = 0;
  private elapsed = 0;
  private _flipX = false;

  private constructor() {
    this.view = new Container();
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 1); // 발 기준 정렬
    this.sprite.scale.set(SCALE);
    this.view.addChild(this.sprite);
  }

  /**
   * 캐릭터 생성 (에셋 로드 포함)
   */
  static async create(name: CharacterName): Promise<PixelCharacter> {
    const char = new PixelCharacter();
    const basePath = `/tiles/chars/${name}`;

    // 에셋 로드 (idle_anim은 필수, 나머지는 선택)
    const [idleTex, runTex, sitTex, phoneTex] = await Promise.all([
      Assets.load(assetPath(`${basePath}_idle_anim.png`)) as Promise<Texture>,
      Assets.load(assetPath(`${basePath}_run.png`)).catch(() => null) as Promise<Texture | null>,
      Assets.load(assetPath(`${basePath}_sit.png`)).catch(() => null) as Promise<Texture | null>,
      Assets.load(assetPath(`${basePath}_phone.png`)).catch(() => null) as Promise<Texture | null>,
    ]);

    // idle: 처음 6프레임 (앞방향)
    char.anims.idle = {
      frames: extractFrames(idleTex, 0, 6),
      speed: 6,
    };

    // run
    if (runTex) {
      char.anims.run = {
        frames: extractFrames(runTex, 0, 6),
        speed: 10,
      };
    }

    // sit
    if (sitTex) {
      char.anims.sit = {
        frames: extractFrames(sitTex, 0, 6),
        speed: 4,
      };
    }

    // phone
    if (phoneTex) {
      char.anims.phone = {
        frames: extractFrames(phoneTex, 0, 4),
        speed: 4,
      };
    }

    // 첫 프레임 설정
    char.sprite.texture = char.anims.idle!.frames[0];

    return char;
  }

  /** 매 프레임 호출 */
  tick(dt: number): void {
    const anim = this.anims[this.currentAnim];
    if (!anim || anim.frames.length === 0) return;

    this.elapsed += dt;
    const frameDuration = 1 / anim.speed;

    if (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frameIndex = (this.frameIndex + 1) % anim.frames.length;
      this.sprite.texture = anim.frames[this.frameIndex];
    }
  }

  /** 애니메이션 변경 */
  play(state: AnimState): void {
    if (this.currentAnim === state) return;
    if (!this.anims[state]) return;
    this.currentAnim = state;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.sprite.texture = this.anims[state]!.frames[0];
  }

  /** 위치 설정 */
  setPosition(x: number, y: number): void {
    this.view.position.set(x, y);
  }

  /** 좌우 반전 */
  setFlipX(flip: boolean): void {
    if (this._flipX === flip) return;
    this._flipX = flip;
    this.sprite.scale.x = flip ? -SCALE : SCALE;
  }

  /** 현재 스케일 반환 */
  get scale(): number {
    return SCALE;
  }

  /** 픽셀 높이 (충돌/위치 계산용) */
  get pixelHeight(): number {
    return FRAME_H * SCALE;
  }
}
