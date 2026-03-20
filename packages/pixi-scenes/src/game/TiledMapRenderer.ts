/**
 * TiledMapRenderer — Tiled JSON 맵을 Pixi.js로 렌더링
 * generative_agents (Stanford) 마을 맵용 멀티 타일셋 지원.
 */
import { Assets, Container, Sprite, Texture, Rectangle } from 'pixi.js';

// ── Tiled JSON 타입 ──
interface TiledTileset {
  firstgid: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilecount: number;
  columns: number;
  tilewidth?: number;
  tileheight?: number;
}

interface TiledLayer {
  name: string;
  type: string;
  data: number[];
  width: number;
  height: number;
  visible: boolean;
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

export interface TiledSceneLayout {
  world: Container;
  mapW: number;
  mapH: number;
  tileDim: number;
  viewportW: number;
  viewportH: number;
  rooms: Record<string, { x: number; y: number; w: number; h: number }>;
}

/** 렌더링할 레이어 (시각 레이어만) */
const VISUAL_LAYERS = [
  'Bottom Ground',
  'Exterior Ground',
  'Exterior Decoration L1',
  'Exterior Decoration L2',
  'Interior Ground',
  'Wall',
  'Interior Furniture L1',
  'Interior Furniture L2 ',
  'Foreground L1',
  'Foreground L2',
];

/** 이미지 경로를 public URL로 변환 */
function toPublicUrl(imagePath: string): string {
  // "map_assets/v1/Room_Builder_32x32.png" → "/tiles/the_ville/v1/Room_Builder_32x32.png"
  // "map_assets/cute_rpg_word_VXAce/tilesets/X.png" → "/tiles/the_ville/cute_rpg_word_VXAce/tilesets/X.png"
  // "map_assets/blocks/X.png" → "/tiles/the_ville/blocks/X.png"
  return '/tiles/the_ville/' + imagePath.replace('map_assets/', '');
}

/**
 * Tiled JSON 맵을 로드하고 Pixi Container로 렌더링한다.
 */
export async function drawTiledScene(
  parent: Container,
  viewportW: number,
  viewportH: number,
): Promise<TiledSceneLayout> {
  // 맵 JSON 로드
  const res = await fetch('/tiles/the_ville/map.json');
  const map: TiledMap = await res.json() as TiledMap;
  const { width: cols, height: rows, tilewidth: td } = map;

  // 모든 타일셋 이미지 로드
  const tilesetTextures: Map<string, Texture> = new Map();
  const loadPromises = map.tilesets.map(async (ts) => {
    const url = toPublicUrl(ts.image);
    const tex = await Assets.load(url) as Texture;
    tilesetTextures.set(ts.image, tex);
  });
  await Promise.all(loadPromises);

  // 타일셋 lookup 준비 (firstgid 내림차순 정렬)
  const sortedTilesets = [...map.tilesets].sort((a, b) => b.firstgid - a.firstgid);

  // gid → { tileset, localId } 변환
  function resolveTile(gid: number): { ts: TiledTileset; localId: number } | null {
    if (gid === 0) return null;
    // 플래그 제거 (flip bits)
    const tileId = gid & 0x1FFFFFFF;
    for (const ts of sortedTilesets) {
      if (tileId >= ts.firstgid) {
        return { ts, localId: tileId - ts.firstgid };
      }
    }
    return null;
  }

  // 타일 텍스처 캐시
  const texCache: Map<number, Texture> = new Map();

  function getTileTexture(gid: number): Texture | null {
    if (gid === 0) return null;
    const cached = texCache.get(gid & 0x1FFFFFFF);
    if (cached) return cached;

    const resolved = resolveTile(gid);
    if (!resolved) return null;

    const { ts, localId } = resolved;
    const srcTex = tilesetTextures.get(ts.image);
    if (!srcTex) return null;

    const tileCols = ts.columns;
    const sx = (localId % tileCols) * td;
    const sy = Math.floor(localId / tileCols) * td;

    const tex = new Texture({
      source: srcTex.source,
      frame: new Rectangle(sx, sy, td, td),
    });
    texCache.set(gid & 0x1FFFFFFF, tex);
    return tex;
  }

  // 월드 컨테이너
  const world = new Container();
  parent.addChild(world);

  // 시각 레이어 렌더링
  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer') continue;
    if (!VISUAL_LAYERS.includes(layer.name)) continue;
    if (!layer.visible) continue;

    const layerContainer = new Container();

    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (gid === 0) continue;

      const tex = getTileTexture(gid);
      if (!tex) continue;

      const tx = i % cols;
      const ty = Math.floor(i / cols);

      const sprite = new Sprite(tex);
      sprite.position.set(tx * td, ty * td);
      sprite.width = td;
      sprite.height = td;
      layerContainer.addChild(sprite);
    }

    world.addChild(layerContainer);
  }

  // 에이전트 3명을 맵 중앙에 배치 (같은 영역, 약간 오프셋)
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const rooms = {
    claude:  { x: cx - 3, y: cy - 2, w: 6, h: 4 },
    heimi:   { x: cx - 3, y: cy - 2, w: 6, h: 4 },
    ali:     { x: cx - 3, y: cy - 2, w: 6, h: 4 },
  };

  return {
    world,
    mapW: cols,
    mapH: rows,
    tileDim: td,
    viewportW,
    viewportH,
    rooms,
  };
}

/** 타일 좌표 → 픽셀 좌표 */
export function tiledToPx(tx: number, ty: number, td: number): { x: number; y: number } {
  return { x: tx * td, y: ty * td };
}

/** 방 중앙 픽셀 좌표 */
export function tiledRoomCenter(
  roomKey: string,
  layout: TiledSceneLayout,
): { x: number; y: number } {
  const room = layout.rooms[roomKey];
  if (!room) return { x: 0, y: 0 };
  return {
    x: (room.x + room.w / 2) * layout.tileDim,
    y: (room.y + room.h / 2) * layout.tileDim,
  };
}

/** 카메라를 특정 좌표 중앙으로 이동 */
export function centerTiledCamera(
  x: number,
  y: number,
  layout: TiledSceneLayout,
): void {
  const worldPxW = layout.mapW * layout.tileDim;
  const worldPxH = layout.mapH * layout.tileDim;
  const targetX = layout.viewportW / 2 - x;
  const targetY = layout.viewportH / 2 - y;
  layout.world.x = Math.min(0, Math.max(targetX, layout.viewportW - worldPxW));
  layout.world.y = Math.min(0, Math.max(targetY, layout.viewportH - worldPxH));
}

/** 드래그 이동 설정 */
export function setupTiledDrag(
  world: Container,
  layout: TiledSceneLayout,
  stage: Container,
): void {
  const worldPxW = layout.mapW * layout.tileDim;
  const worldPxH = layout.mapH * layout.tileDim;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  stage.eventMode = 'static';
  stage.cursor = 'grab';

  stage.on('pointerdown', (e) => {
    dragging = true;
    lastX = e.global.x;
    lastY = e.global.y;
    stage.cursor = 'grabbing';
  });
  stage.on('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.global.x - lastX;
    const dy = e.global.y - lastY;
    lastX = e.global.x;
    lastY = e.global.y;
    world.x = Math.min(0, Math.max(world.x + dx, layout.viewportW - worldPxW));
    world.y = Math.min(0, Math.max(world.y + dy, layout.viewportH - worldPxH));
  });
  stage.on('pointerup', () => { dragging = false; stage.cursor = 'grab'; });
  stage.on('pointerupoutside', () => { dragging = false; stage.cursor = 'grab'; });
}
