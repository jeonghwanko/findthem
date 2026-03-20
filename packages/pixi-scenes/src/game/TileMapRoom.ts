/**
 * TileMapRoom — a16z AI Town 타일맵 기반 씬 렌더러
 *
 * gentle-obj.png (1440×1024, 32px 타일) + gentle-map.json (64×48, 2 bg + 2 obj 레이어)
 * 스프라이트 기반 타일 렌더링 (ai-town 방식: Sprite-per-tile, 플러그인 불필요)
 */
import { Container, Sprite, Texture, Rectangle, Assets, Text, TextStyle } from 'pixi.js';

// ── 맵 데이터 타입 ──
interface MapData {
  tileDim: number;
  cols: number;
  rows: number;
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
}

export function tileToPx(tx: number, ty: number, layout: TileRoomLayout): { x: number; y: number } {
  return {
    x: layout.offsetX + tx * layout.tileDim * layout.scale,
    y: layout.offsetY + ty * layout.tileDim * layout.scale,
  };
}

export function tileRoomCenter(roomKey: 'claude' | 'heimi' | 'ali', layout: TileRoomLayout): { x: number; y: number } {
  const room = layout.rooms[roomKey];
  return tileToPx(room.x + room.w / 2, room.y + room.h / 2, layout);
}

function assetPath(path: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: string = (import.meta as any)?.env?.BASE_URL ?? '/';
    return `${base}${path.replace(/^\//, '')}`;
  } catch { return path; }
}

// ── 타일셋 → 개별 텍스처 슬라이싱 ──
function sliceTileset(baseTex: Texture, tileDim: number, pxW: number, pxH: number): Texture[] {
  const cols = Math.floor(pxW / tileDim);
  const rows = Math.floor(pxH / tileDim);
  const textures: Texture[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      textures.push(new Texture({
        source: baseTex.source,
        frame: new Rectangle(c * tileDim, r * tileDim, tileDim, tileDim),
      }));
    }
  }
  return textures;
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

  const { tileDim, cols, rows, tilesetPxW, tilesetPxH, bgTiles, objTiles } = mapData;

  // ── 타일셋 슬라이싱 ──
  const tiles = sliceTileset(tilesetTex, tileDim, tilesetPxW, tilesetPxH);
  const tilesetCols = Math.floor(tilesetPxW / tileDim);

  // ── 뷰포트 (화면에 표시할 영역) ──
  // 전체 맵(64×48)에서 관심 영역만 크롭 — 중앙 부분 사용
  const viewCols = Math.min(cols, 40); // 최대 40열
  const viewRows = Math.min(rows, 30); // 최대 30행
  const cropX = Math.floor((cols - viewCols) / 2); // 중앙 정렬
  const cropY = Math.floor((rows - viewRows) / 2);

  // ── 스케일 계산 ──
  const scale = Math.min(sceneW / (viewCols * tileDim), sceneH / (viewRows * tileDim));
  const offsetX = (sceneW - viewCols * tileDim * scale) / 2;
  const offsetY = (sceneH - viewRows * tileDim * scale) / 2;

  // ── 에이전트 "방" 위치 (크롭 좌표 기준) ──
  // 맵 내 건물/구역을 3개 에이전트에 할당
  const thirdW = Math.floor(viewCols / 3);
  const rooms = {
    claude:  { x: 2,              y: 2,  w: thirdW - 2, h: viewRows - 4 },
    hallway: { x: thirdW,         y: 0,  w: 2,          h: viewRows },
    heimi:   { x: thirdW + 2,     y: 2,  w: thirdW - 2, h: viewRows - 4 },
    ali:     { x: thirdW * 2 + 2, y: 2,  w: viewCols - thirdW * 2 - 4, h: viewRows - 4 },
  };

  const layout: TileRoomLayout = {
    scale, offsetX, offsetY,
    rooms,
    totalW: viewCols,
    totalH: viewRows,
    tileDim,
  };

  // ── 배경 레이어 렌더링 ──
  const bgLayer = new Container();
  container.addChild(bgLayer);

  for (const layer of bgTiles) {
    for (let vx = 0; vx < viewCols; vx++) {
      for (let vy = 0; vy < viewRows; vy++) {
        const mx = cropX + vx; // 원본 맵 좌표
        const my = cropY + vy;
        if (mx >= cols || my >= rows) continue;

        const tileIdx = layer[mx]?.[my];
        if (tileIdx == null || tileIdx < 0) continue;
        if (tileIdx >= tiles.length) continue;

        const sprite = new Sprite(tiles[tileIdx]);
        const pos = tileToPx(vx, vy, layout);
        sprite.position.set(pos.x, pos.y);
        sprite.scale.set(scale);
        bgLayer.addChild(sprite);
      }
    }
  }

  // ── 오브젝트 레이어 렌더링 ──
  const objLayer = new Container();
  container.addChild(objLayer);

  for (const layer of objTiles) {
    for (let vx = 0; vx < viewCols; vx++) {
      for (let vy = 0; vy < viewRows; vy++) {
        const mx = cropX + vx;
        const my = cropY + vy;
        if (mx >= cols || my >= rows) continue;

        const tileIdx = layer[mx]?.[my];
        if (tileIdx == null || tileIdx < 0) continue;
        if (tileIdx >= tiles.length) continue;

        const sprite = new Sprite(tiles[tileIdx]);
        const pos = tileToPx(vx, vy, layout);
        sprite.position.set(pos.x, pos.y);
        sprite.scale.set(scale);
        objLayer.addChild(sprite);
      }
    }
  }

  // ── 라벨 ──
  const labelStyle = new TextStyle({
    fontSize: Math.max(7, tileDim * scale * 0.45),
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
    const pos = tileToPx(room.x + room.w / 2, room.y + room.h - 0.5, layout);
    const label = new Text({ text, style: labelStyle });
    label.anchor.set(0.5, 0.5);
    label.position.set(pos.x, pos.y);
    objLayer.addChild(label);
  }

  return layout;
}
