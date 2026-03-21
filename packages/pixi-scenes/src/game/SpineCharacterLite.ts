import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  TextureAtlas,
  Spine,
  SpineTexture,
  Skin,
  type SkeletonData,
} from '@esotericsoftware/spine-pixi-v8';
import { Assets, type Texture } from 'pixi.js';
import { assetUrl, IS_NATIVE } from './assetUrl';

const SPINE_BASE = assetUrl('/spine/');
const IMG_EXT = IS_NATIVE ? 'png' : 'webp';
const ATLAS_PAGES = [`human_type.${IMG_EXT}`, `human_type_2.${IMG_EXT}`, `human_type_3.${IMG_EXT}`];
const SKELETON_URL = `${SPINE_BASE}human_type.skel.bytes`;
const ATLAS_URL = `${SPINE_BASE}human_type.atlas.txt`;

// Shared caches
const atlasTextureCache = new Map<string, SpineTexture>();
const textureLoadingPromises = new Map<string, Promise<void>>();
let sharedSkeletonData: SkeletonData | null = null;
let skeletonPromise: Promise<SkeletonData> | null = null;

// Loading progress — 5 steps: 3 textures + atlas text + skeleton binary
const TOTAL_LOAD_STEPS = 5;
type ProgressCallback = (loaded: number, total: number) => void;
let _progressCb: ProgressCallback | null = null;
let _loadedSteps = 0;

function _notifyStep(): void {
  if (!_progressCb) return;
  _loadedSteps = Math.min(_loadedSteps + 1, TOTAL_LOAD_STEPS);
  _progressCb(_loadedSteps, TOTAL_LOAD_STEPS);
}

/** Register a callback to receive loading progress (0–5 / 5).
 *  If assets are already cached, cb is called immediately with (5, 5).
 *  Pass null to unregister. */
export function setSpineLoadProgress(cb: ProgressCallback | null): void {
  _progressCb = cb;
  if (!cb) return;
  if (sharedSkeletonData) {
    cb(TOTAL_LOAD_STEPS, TOTAL_LOAD_STEPS);
    return;
  }
  _loadedSteps = 0;
}

/**
 * Load texture via blob → dataURL → Assets.load (same as pryzm town).
 * This ensures Pixi correctly detects the MIME type from the dataURL prefix.
 */
async function ensureTexture(file: string): Promise<void> {
  if (atlasTextureCache.has(file)) return;

  let loadPromise = textureLoadingPromises.get(file);
  if (!loadPromise) {
    loadPromise = (async () => {
      const url = `${SPINE_BASE}${file}`;

      let pixiTexture: Texture;
      if (IS_NATIVE) {
        // Native: 로컬 파일을 직접 URL로 로드 (blob 변환 시 iOS 이미지 디코더 오류 방지)
        pixiTexture = await Assets.load<Texture>(url);
      } else {
        // Web: blob → dataURL 변환으로 MIME type 감지 보장
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch texture ${file}: ${resp.status}`);
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        pixiTexture = await Assets.load<Texture>(dataUrl);
      }

      atlasTextureCache.set(file, SpineTexture.from(pixiTexture.source));
      _notifyStep(); // step 1 / 2 / 3
    })().finally(() => {
      textureLoadingPromises.delete(file);
    });
    textureLoadingPromises.set(file, loadPromise);
  }
  await loadPromise;
}

async function loadAtlas(): Promise<TextureAtlas> {
  await Promise.all(ATLAS_PAGES.map(ensureTexture));

  const response = await fetch(ATLAS_URL);
  if (!response.ok) throw new Error(`Failed to fetch atlas: ${response.status}`);
  let atlasText = await response.text();
  if (!atlasText) throw new Error('Empty atlas text');
  // Native(Capacitor)에서는 WebP 대신 PNG 사용 — 페이지 이름만 정확히 치환
  if (IS_NATIVE) {
    atlasText = atlasText.replace(/^(human_type(?:_\d+)?)\.webp$/gm, '$1.png');
  }
  _notifyStep(); // step 4

  const atlas = new TextureAtlas(atlasText);
  atlas.pages.forEach((page: { name: string; setTexture: (t: SpineTexture) => void }) => {
    const texture = atlasTextureCache.get(page.name);
    if (!texture) throw new Error(`Missing texture in cache: ${page.name}`);
    page.setTexture(texture);
  });
  return atlas;
}

async function loadSkeletonBinary(): Promise<Uint8Array> {
  const response = await fetch(SKELETON_URL);
  if (!response.ok) throw new Error(`Failed to fetch skeleton: ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error('Empty skeleton binary');
  _notifyStep(); // step 5
  return new Uint8Array(buffer);
}

export class SpineCharacterLite {
  readonly view: Spine;
  private currentBodyAnim: string | null = null;
  private skinSignature = '';
  private disposed = false;
  private isPlayingExpression = false;
  private readonly expressionTrackIndex = 1;

  private constructor(spine: Spine) {
    this.view = spine;
    this.view.state.addListener({
      complete: (entry: { trackIndex: number }) => {
        if (entry.trackIndex === this.expressionTrackIndex) {
          this.isPlayingExpression = false;
        }
      },
    });
  }

  private static async getSkeletonData(): Promise<SkeletonData> {
    if (sharedSkeletonData) return sharedSkeletonData;

    skeletonPromise ??= (async () => {
      try {
        const [atlas, skeletonBytes] = await Promise.all([
          loadAtlas(),
          loadSkeletonBinary(),
        ]);
        const attachmentLoader = new AtlasAttachmentLoader(atlas);
        const binary = new SkeletonBinary(attachmentLoader);
        binary.scale = 1.0;
        sharedSkeletonData = binary.readSkeletonData(skeletonBytes);
        return sharedSkeletonData;
      } catch (e) {
        skeletonPromise = null;
        sharedSkeletonData = null;
        throw e;
      }
    })();

    return skeletonPromise;
  }

  static async create(skinNames: readonly string[] = []): Promise<SpineCharacterLite> {
    const skeletonData = await SpineCharacterLite.getSkeletonData();
    const spine = new Spine({ skeletonData, autoUpdate: false });
    spine.scale.set(1.0);
    spine.state.setAnimation(0, 'idle', true);

    const char = new SpineCharacterLite(spine);
    if (skinNames.length > 0) char.applySkins(skinNames);
    return char;
  }

  static resetCache() {
    sharedSkeletonData = null;
    skeletonPromise = null;
    atlasTextureCache.clear();
    textureLoadingPromises.clear();
  }

  tick(deltaSeconds: number) {
    if (this.disposed) return;
    this.view.update(deltaSeconds);
  }

  setBodyAnimation(name: string, loop = true) {
    if (this.disposed || this.currentBodyAnim === name) return;
    this.view.state.setAnimation(0, name, loop);
    this.currentBodyAnim = name;
  }

  /** 애니메이션이 존재하는 경우에만 재생. 성공 시 true 반환. */
  playBodyAnimSafe(name: string, loop = true): boolean {
    if (this.disposed) return false;
    if (!this.view.skeleton.data.findAnimation(name)) return false;
    this.view.state.setAnimation(0, name, loop);
    this.currentBodyAnim = name;
    return true;
  }

  /** skeleton에 정의된 모든 애니메이션 이름 목록 */
  getAnimationNames(): string[] {
    return this.view.skeleton.data.animations.map((a: { name: string }) => a.name);
  }

  playExpression(name: string): boolean {
    if (this.disposed) return false;
    const anim = this.view.skeleton.data.findAnimation(name);
    if (!anim) return false;
    this.view.state.setAnimation(this.expressionTrackIndex, name, false);
    this.view.state.addEmptyAnimation(this.expressionTrackIndex, 0.2, 0);
    this.isPlayingExpression = true;
    return true;
  }

  cancelExpression() {
    if (!this.isPlayingExpression) return;
    this.view.state.setEmptyAnimation(this.expressionTrackIndex, 0.1);
    this.view.state.addEmptyAnimation(this.expressionTrackIndex, 0, 0);
    this.isPlayingExpression = false;
  }

  isExpressionPlaying() {
    return this.isPlayingExpression;
  }

  applySkins(skinNames: readonly string[]) {
    if (this.disposed) return;
    const normalized = Array.from(new Set(skinNames)).sort();
    const sig = normalized.join('|');
    if (!normalized.length || this.skinSignature === sig) return;
    this.skinSignature = sig;

    const composite = new Skin('composite');
    const base = this.view.skeleton.data.defaultSkin;
    if (base) composite.addSkin(base);
    for (const name of normalized) {
      const skin = this.view.skeleton.data.findSkin(name);
      if (skin) composite.addSkin(skin);
    }
    this.view.skeleton.setSkin(composite);
    this.view.skeleton.setSlotsToSetupPose();
  }

  setPosition(x: number, y: number) {
    if (!this.disposed) this.view.position.set(x, y);
  }

  setScale(s: number) {
    if (!this.disposed) this.view.scale.set(s);
  }

  setFlipX(flip: boolean) {
    if (!this.disposed) {
      const absX = Math.abs(this.view.scale.x);
      this.view.scale.x = flip ? -absX : absX;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.view.state.clearListeners();
    this.view.destroy({ children: true });
  }
}
