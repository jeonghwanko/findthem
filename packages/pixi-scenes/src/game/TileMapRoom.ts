/**
 * TileMapRoom — LimeZu Modern Interiors 타일셋 기반 사무실 렌더러
 *
 * Room_Builder_free_48x48.png (816×1104, 17col×23row) — 바닥/벽
 * Interiors_free_48x48.png   (768×4272, 16col×89row) — 가구
 *
 * 3개 방: 분석실(Claude) + 복도 + 홍보실(Heimi) + 안내데스크(Ali)
 */
import { Container, Sprite, Texture, Rectangle, Assets, Graphics, Text, TextStyle } from 'pixi.js';

const T = 48; // 타일 크기 (px)

// ── 스프라이트시트에서 타일 추출 ──

function tile(base: Texture, col: number, row: number, w = 1, h = 1): Texture {
  return new Texture({
    source: base.source,
    frame: new Rectangle(col * T, row * T, w * T, h * T),
  });
}

function placeTile(
  container: Container,
  tex: Texture,
  px: number,
  py: number,
  scale: number,
): Sprite {
  const s = new Sprite(tex);
  s.position.set(px, py);
  s.scale.set(scale);
  return container.addChild(s);
}

// ── Room_Builder 바닥 타일 좌표 (col, row) ──
// 각 바닥 타입은 2행 짝. "plain" 버전 = cols 6-8.
const FLOORS = {
  // 나무 바닥 (진한 갈색 나무)
  wood_dark: [
    [6, 10], [7, 10], [8, 10],
    [6, 11], [7, 11], [8, 11],
  ],
  // 나무 바닥 (중간 갈색)
  wood_medium: [
    [6, 12], [7, 12], [8, 12],
    [6, 13], [7, 13], [8, 13],
  ],
  // 크림/노란 바닥
  cream: [
    [6, 6], [7, 6], [8, 6],
    [6, 7], [7, 7], [8, 7],
  ],
  // 민트/청록 바닥
  mint: [
    [6, 8], [7, 8], [8, 8],
    [6, 9], [7, 9], [8, 9],
  ],
  // 베이지 바닥
  beige: [
    [6, 18], [7, 18], [8, 18],
    [6, 19], [7, 19], [8, 19],
  ],
  // 라벤더/회색
  lavender: [
    [6, 16], [7, 16], [8, 16],
    [6, 17], [7, 17], [8, 17],
  ],
  // 회색 돌
  gray_stone: [
    [14, 4], [15, 4], [16, 4],
    [14, 5], [15, 5], [16, 5],
  ],
} as const;

// ── Interiors 가구 좌표 (col, row, width, height) ──
// 48px 기준 좌표. Interiors_free_48x48.png (16col×89row)
const FURNITURE = {
  // 책상 (나무, 2×1)
  desk_wood: { col: 0, row: 6, w: 2, h: 1 },
  // 책상 위 모니터 (1×1)
  monitor: { col: 4, row: 8, w: 1, h: 1 },
  // 키보드 (1×1)
  keyboard: { col: 5, row: 8, w: 1, h: 1 },
  // 책장 (2×2)
  bookshelf_large: { col: 0, row: 10, w: 2, h: 2 },
  // 책장 작은 (1×2)
  bookshelf_small: { col: 2, row: 10, w: 1, h: 2 },
  // 의자 (1×1)
  chair_front: { col: 0, row: 19, w: 1, h: 1 },
  chair_side: { col: 1, row: 19, w: 1, h: 1 },
  // 칠판/화이트보드 (2×1)
  chalkboard: { col: 0, row: 22, w: 2, h: 1 },
  // 소파 (2×1)
  sofa: { col: 0, row: 23, w: 2, h: 1 },
  // 화분 (1×1)
  plant_pot: { col: 0, row: 25, w: 1, h: 1 },
  plant_tall: { col: 1, row: 25, w: 1, h: 2 },
  // 카운터 (2×1)
  counter: { col: 0, row: 17, w: 2, h: 1 },
  // 카운터 (3×1)
  counter_long: { col: 0, row: 17, w: 3, h: 1 },
  // 러그 (2×2)
  rug: { col: 6, row: 8, w: 2, h: 2 },
  // 액자 (1×1)
  painting: { col: 0, row: 13, w: 1, h: 1 },
  painting2: { col: 1, row: 13, w: 1, h: 1 },
  // 문 (1×2)
  door: { col: 6, row: 16, w: 1, h: 2 },
  // 글로브 (1×1)
  globe: { col: 7, row: 21, w: 1, h: 1 },
  // 테이블 램프 (1×1)
  lamp: { col: 0, row: 28, w: 1, h: 1 },
} as const;

// ── 방 정의 ──

export interface TileRoomLayout {
  /** 렌더링 스케일 */
  scale: number;
  /** 렌더링 오프셋 X */
  offsetX: number;
  /** 렌더링 오프셋 Y */
  offsetY: number;
  /** 방 영역 (타일 단위) */
  rooms: {
    claude: RoomRect;
    hallway: RoomRect;
    heimi: RoomRect;
    ali: RoomRect;
  };
  /** 총 타일 수 */
  totalW: number;
  totalH: number;
}

interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 타일 좌표 → 픽셀 좌표 변환
 */
export function tileToPx(
  tx: number,
  ty: number,
  layout: TileRoomLayout,
): { x: number; y: number } {
  return {
    x: layout.offsetX + tx * T * layout.scale,
    y: layout.offsetY + ty * T * layout.scale,
  };
}

/**
 * 방 중앙 픽셀 좌표 (에이전트 위치용)
 */
export function tileRoomCenter(
  roomKey: 'claude' | 'heimi' | 'ali',
  layout: TileRoomLayout,
): { x: number; y: number } {
  const room = layout.rooms[roomKey];
  return tileToPx(room.x + room.w / 2, room.y + room.h / 2, layout);
}

/**
 * 타일맵 기반 사무실 씬 렌더링
 */
export async function drawTileScene(
  container: Container,
  sceneW: number,
  sceneH: number,
): Promise<TileRoomLayout> {
  // 스프라이트시트 로드
  const [roomTex, interiorTex] = await Promise.all([
    Assets.load('/tiles/Room_Builder_free_48x48.png') as Promise<Texture>,
    Assets.load('/tiles/Interiors_free_48x48.png') as Promise<Texture>,
  ]);

  // 방 레이아웃 (타일 단위)
  const rooms = {
    claude: { x: 0, y: 0, w: 7, h: 7 },
    hallway: { x: 7, y: 0, w: 3, h: 7 },
    heimi: { x: 10, y: 0, w: 7, h: 7 },
    ali: { x: 17, y: 0, w: 7, h: 7 },
  };

  const totalW = 24;
  const totalH = 7;

  // 씬에 맞게 스케일 계산
  const scale = Math.min(sceneW / (totalW * T), sceneH / (totalH * T));
  const offsetX = (sceneW - totalW * T * scale) / 2;
  const offsetY = (sceneH - totalH * T * scale) / 2;

  const layout: TileRoomLayout = { scale, offsetX, offsetY, rooms, totalW, totalH };

  // ── 바닥 렌더링 ──
  const floorLayer = new Container();
  container.addChild(floorLayer);

  const drawFloor = (room: RoomRect, floorTiles: readonly (readonly [number, number])[]) => {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        // 체커보드 패턴으로 타일 선택
        const tileIdx = ((dx % 3) + (dy % 2) * 3) % floorTiles.length;
        const [col, row] = floorTiles[tileIdx];
        const tex = tile(roomTex, col, row);
        const pos = tileToPx(room.x + dx, room.y + dy, layout);
        placeTile(floorLayer, tex, pos.x, pos.y, scale);
      }
    }
  };

  drawFloor(rooms.claude, FLOORS.wood_dark);
  drawFloor(rooms.hallway, FLOORS.lavender);
  drawFloor(rooms.heimi, FLOORS.cream);
  drawFloor(rooms.ali, FLOORS.beige);

  // ── 벽 경계 (Graphics) ──
  const wallLayer = new Container();
  container.addChild(wallLayer);
  const wallG = new Graphics();
  wallLayer.addChild(wallG);

  const wallColor = 0x5a4a3a;
  const wallThick = 3 * scale;

  // 외곽 벽
  const ox = offsetX;
  const oy = offsetY;
  const pw = totalW * T * scale;
  const ph = totalH * T * scale;

  wallG.rect(ox, oy, pw, wallThick).fill(wallColor); // 상단
  wallG.rect(ox, oy + ph - wallThick, pw, wallThick).fill(wallColor); // 하단
  wallG.rect(ox, oy, wallThick, ph).fill(wallColor); // 좌측
  wallG.rect(ox + pw - wallThick, oy, wallThick, ph).fill(wallColor); // 우측

  // 방 사이 벽 (문 포함)
  const drawRoomDivider = (tileX: number) => {
    const px = offsetX + tileX * T * scale;
    const doorStartY = oy + 2.5 * T * scale;
    const doorEndY = oy + 4.5 * T * scale;

    // 문 위쪽 벽
    wallG.rect(px - wallThick / 2, oy, wallThick, doorStartY - oy).fill(wallColor);
    // 문 아래쪽 벽
    wallG.rect(px - wallThick / 2, doorEndY, wallThick, oy + ph - doorEndY).fill(wallColor);
  };

  drawRoomDivider(rooms.hallway.x); // claude ↔ hallway
  drawRoomDivider(rooms.heimi.x);   // hallway ↔ heimi
  drawRoomDivider(rooms.ali.x);     // heimi ↔ ali

  // ── 가구 배치 ──
  const furnitureLayer = new Container();
  container.addChild(furnitureLayer);

  const placeFurniture = (
    key: keyof typeof FURNITURE,
    roomX: number,
    roomY: number,
    flipX = false,
  ) => {
    const f = FURNITURE[key];
    const tex = tile(interiorTex, f.col, f.row, f.w, f.h);
    const pos = tileToPx(roomX, roomY, layout);
    const s = new Sprite(tex);
    s.position.set(pos.x, pos.y);
    s.scale.set(flipX ? -scale : scale, scale);
    if (flipX) s.position.x += f.w * T * scale;
    furnitureLayer.addChild(s);
  };

  // ── 클로드 분석실 ──
  // 책상 + 모니터 (상단)
  placeFurniture('desk_wood', 1.5, 1);
  placeFurniture('monitor', 1.5, 0.5);
  placeFurniture('monitor', 3, 0.5);
  // 책장 (좌측 벽)
  placeFurniture('bookshelf_small', 0, 0);
  // 의자
  placeFurniture('chair_front', 2.5, 2);
  // 램프
  placeFurniture('lamp', 5.5, 0.5);

  // ── 헤르미 홍보실 ──
  // 칠판/보드 (상단 벽)
  placeFurniture('chalkboard', 12, 0.3);
  // 책상
  placeFurniture('desk_wood', 11.5, 3);
  // 의자
  placeFurniture('chair_front', 12.5, 4);
  // 화분
  placeFurniture('plant_pot', 16, 0.5);
  // 액자
  placeFurniture('painting', 14.5, 0.3);

  // ── 알리 안내데스크 ──
  // 카운터 (중앙)
  placeFurniture('counter_long', 18.5, 2.5);
  // 의자 (카운터 뒤)
  placeFurniture('chair_front', 19.5, 1.5);
  // 화분
  placeFurniture('plant_pot', 17.5, 0.5);
  placeFurniture('plant_pot', 23, 0.5);
  // 글로브
  placeFurniture('globe', 22, 5);

  // ── 방 이름 라벨 ──
  const labelStyle = new TextStyle({
    fontSize: Math.max(8, T * scale * 0.55),
    fontFamily: '"Press Start 2P", monospace, sans-serif',
    fill: 0x554433,
    align: 'center',
  });

  const labels: { text: string; room: RoomRect }[] = [
    { text: '🔍 Analysis', room: rooms.claude },
    { text: '📣 Promo', room: rooms.heimi },
    { text: '📋 Guide', room: rooms.ali },
  ];

  for (const { text, room } of labels) {
    const pos = tileToPx(room.x + room.w / 2, room.y + room.h - 0.6, layout);
    const label = new Text({ text, style: labelStyle });
    label.anchor.set(0.5, 0.5);
    label.position.set(pos.x, pos.y);
    furnitureLayer.addChild(label);
  }

  return layout;
}
