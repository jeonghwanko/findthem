import '@esotericsoftware/spine-pixi-v8';
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  TextureAtlas,
  Spine,
  SpineTexture,
  Skin,
  type SkeletonData,
} from '@esotericsoftware/spine-pixi-v8';
import { Assets, Texture } from 'pixi.js';

const SPINE_BASE = '/spine/';
const ATLAS_PAGES = ['human_type.png', 'human_type_2.png', 'human_type_3.png'];
const SKELETON_URL = `${SPINE_BASE}human_type.skel.bytes`;
const ATLAS_URL = `${SPINE_BASE}human_type.atlas.txt`;

// Shared caches — reused across all instances
const atlasTextureCache = new Map<string, SpineTexture>();
const textureLoadingPromises = new Map<string, Promise<void>>();
let sharedSkeletonData: SkeletonData | null = null;
let skeletonPromise: Promise<SkeletonData> | null = null;

async function ensureTexture(file: string): Promise<void> {
  if (atlasTextureCache.has(file)) return;

  let loadPromise = textureLoadingPromises.get(file);
  if (!loadPromise) {
    loadPromise = (async () => {
      const pixiTexture = await Assets.load<Texture>(`${SPINE_BASE}${file}`);
      atlasTextureCache.set(file, SpineTexture.from(pixiTexture.source));
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
  const atlasText = await response.text();
  if (!atlasText) throw new Error('Empty atlas text');

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
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error('Empty skeleton binary');
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

  static async create(skinNames: string[] = []): Promise<SpineCharacterLite> {
    const skeletonData = await SpineCharacterLite.getSkeletonData();
    const spine = new Spine({ skeletonData, autoUpdate: false });
    spine.state.setAnimation(0, 'idle', true);

    const char = new SpineCharacterLite(spine);
    if (skinNames.length > 0) char.applySkins(skinNames);
    return char;
  }

  /** Call when completely leaving the scene to free memory. */
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

  applySkins(skinNames: string[]) {
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
    this.view.destroy({ children: true });
  }
}
