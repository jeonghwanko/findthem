/**
 * TileMapRoom — a16z AI Town 타일맵 + 뷰포트(카메라) 렌더러
 *
 * gentle-obj.png (1440×1024, 32px 타일) + gentle-map.json (64×48, 2 bg + 2 obj 레이어)
 * - 전체 맵을 고정 배율(2×)로 렌더 → 월드 컨테이너에 배치
 * - 뷰포트(캔버스 크기)가 월드의 일부만 표시
 * - 드래그로 카메라 이동, 모바일 터치 지원
 */
import { Container, Sprite, Texture, Rectangle, Assets, Text, TextStyle, FederatedPointerEvent, SCALE_MODES } from 'pixi.js';

// ── 맵 데이터 타입 ──
interface MapData {
  tileDim: number;
  tilesetPxW: number;
  tilesetPxH: number;
  bgTiles: number[][][];  // [layer][x][y] = tileIndex (-1 = empty)
  objTiles: number[][][]; // same format, collision layer
}

// ── 레이아웃 ──
interface RoomRect { x: number; y: number; w: number; h: number }

export interface TileRoomLayout {
  scale: number; offsetX: number; offsetY: number;
  rooms: { claude: RoomRect; hallway: RoomRect; heimi: RoomRect; ali: RoomRect };
  totalW: number; totalH: number;
  tileDim: number;
  /** 월드 컨테이너 (드래그 이동 대상) */
  world: Container;
  /** 월드 전체 픽셀 크기 */
  worldPxW: number;
  worldPxH: number;
  /** 뷰포트(캔버스) 크기 */
  viewportW: number;
  viewportH: number;
}

/** 타일 좌표 → 월드 픽셀 좌표 (world 내부 기준) */
export function tileToPx(tx: number, ty: number, layout: TileRoomLayout): { x: number; y: number } {
  const s = layout.tileDim * layout.scale;
  return { x: tx * s, y: ty * s };
}

export function tileRoomCenter(roomKey: 'claude' | 'heimi' | 'ali', layout: TileRoomLayout): { x: number; y: number } {
  const room = layout.rooms[roomKey];
  return tileToPx(room.x + room.w / 2, room.y + room.h / 2, layout);
}

/** 카메라를 월드 좌표(px)에 중심 맞추기 */
export function centerCamera(worldX: number, worldY: number, layout: TileRoomLayout) {
  const { world, worldPxW, worldPxH, viewportW, viewportH } = layout;
  const targetX = -worldX + viewportW / 2;
  const targetY = -worldY + viewportH / 2;
  // 클램프: 월드 밖으로 넘어가지 않도록
  world.x = Math.min(0, Math.max(targetX, viewportW - worldPxW));
  world.y = Math.min(0, Math.max(targetY, viewportH - worldPxH));
}

function assetPath(path: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: string = (import.meta as any)?.env?.BASE_URL ?? '/';
    return `${base}${path.replace(/^\//, '')}`;
  } catch { return path; }
}

// ── 타일셋 → 개별 텍스처 lazy 캐시 ──
function createTileCache(baseTex: Texture, tileDim: number, pxW: number): (idx: number) => Texture | undefined {
  const tilesetCols = Math.floor(pxW / tileDim);
  const cache = new Map<number, Texture>();
  return (idx: number) => {
    let tex = cache.get(idx);
    if (!tex) {
      const c = idx % tilesetCols;
      const r = Math.floor(idx / tilesetCols);
      tex = new Texture({
        source: baseTex.source,
        frame: new Rectangle(c * tileDim, r * tileDim, tileDim, tileDim),
      });
      cache.set(idx, tex);
    }
    return tex;
  };
}

// ── 드래그 핸들러 설정 ──
function setupDrag(world: Container, layout: TileRoomLayout) {
  const stage = world.parent;
  if (!stage) return;

  stage.eventMode = 'static';
  stage.hitArea = { contains: () => true };

  let dragging = false;
  let lastX = 0, lastY = 0;

  stage.on('pointerdown', (e: FederatedPointerEvent) => {
    dragging = true;
    lastX = e.globalX;
    lastY = e.globalY;
  });
  stage.on('pointermove', (e: FederatedPointerEvent) => {
    if (!dragging) return;
    const dx = e.globalX - lastX;
    const dy = e.globalY - lastY;
    lastX = e.globalX;
    lastY = e.globalY;

    const { worldPxW, worldPxH, viewportW, viewportH } = layout;
    world.x = Math.min(0, Math.max(world.x + dx, viewportW - worldPxW));
    world.y = Math.min(0, Math.max(world.y + dy, viewportH - worldPxH));
  });
  stage.on('pointerup', () => { dragging = false; });
  stage.on('pointerupoutside', () => { dragging = false; });
}

// ═══════════════════════════════════════
// 메인 렌더링
// ═══════════════════════════════════════
export async function drawTileScene(
  container: Container,
  sceneW: number,
  sceneH: number,
): Promise<TileRoomLayout> {
  // ── 에셋 로드 ──
  const [tilesetTex, mapData] = await Promise.all([
    Assets.load(assetPath('/tiles/gentle-obj.png')) as Promise<Texture>,
    fetch(assetPath('/tiles/gentle-map.json')).then(r => r.json()) as Promise<MapData>,
  ]);

  const { tileDim, tilesetPxW, bgTiles, objTiles } = mapData;

  // 픽셀아트 선명하게 (NEAREST 스케일링)
  tilesetTex.source.scaleMode = SCALE_MODES.NEAREST;

  // column-major: [layer][x][y]
  const cols = bgTiles[0]?.length ?? 0;
  const rows = bgTiles[0]?.[0]?.length ?? 0;

  // ── 타일셋 lazy 캐시 ──
  const getTile = createTileCache(tilesetTex, tileDim, tilesetPxW);

  // ── 스케일: 원본 크기 (32px 타일, 선명한 픽셀아트) ──
  const scale = 1;
  const tileSize = tileDim * scale; // 64px
  const worldPxW = cols * tileSize;
  const worldPxH = rows * tileSize;

  // ── 월드 컨테이너 (전체 맵 + 캐릭터가 들어감) ──
  const world = new Container();
  container.addChild(world);

  // ── 에이전트 "방" 위치 (타일 좌표) ──
  // 맵 내 건물/구역을 3개 에이전트에 할당
  const thirdW = Math.floor(cols / 3);
  const rooms = {
    claude:  { x: 2,              y: 2,  w: thirdW - 2, h: rows - 4 },
    hallway: { x: thirdW,         y: 0,  w: 2,          h: rows },
    heimi:   { x: thirdW + 2,     y: 2,  w: thirdW - 2, h: rows - 4 },
    ali:     { x: thirdW * 2 + 2, y: 2,  w: cols - thirdW * 2 - 4, h: rows - 4 },
  };

  const layout: TileRoomLayout = {
    scale, offsetX: 0, offsetY: 0,
    rooms,
    totalW: cols, totalH: rows,
    tileDim,
    world, worldPxW, worldPxH,
    viewportW: sceneW, viewportH: sceneH,
  };

  // ── 배경 + 오브젝트 레이어 렌더링 ──
  const allLayers = [...bgTiles, ...objTiles];
  for (const layer of allLayers) {
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const tileIdx = layer[x]?.[y];
        if (tileIdx == null || tileIdx < 0) continue;
        const tex = getTile(tileIdx);
        if (!tex) continue;

        const sprite = new Sprite(tex);
        sprite.position.set(x * tileSize, y * tileSize);
        sprite.scale.set(scale);
        world.addChild(sprite);
      }
    }
  }

  // ── 라벨 ──
  const labelStyle = new TextStyle({
    fontSize: Math.max(10, tileSize * 0.4),
    fontFamily: '"Press Start 2P", monospace',
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 2 },
    align: 'center',
  });
  const labels: { text: string; room: RoomRect }[] = [
    { text: '🔍 Analysis', room: rooms.claude },
    { text: '📣 Promo', room: rooms.heimi },
    { text: '📋 Guide', room: rooms.ali },
  ];
  for (const { text, room } of labels) {
    const px = (room.x + room.w / 2) * tileSize;
    const py = (room.y + room.h - 0.5) * tileSize;
    const label = new Text({ text, style: labelStyle });
    label.anchor.set(0.5, 0.5);
    label.position.set(px, py);
    world.addChild(label);
  }

  // ── 카메라 초기 위치: 맵 중앙 ──
  centerCamera(worldPxW / 2, worldPxH / 2, layout);

  // ── 드래그 이동 설정 ──
  setupDrag(world, layout);

  return layout;
}
