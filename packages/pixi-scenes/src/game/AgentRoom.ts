/**
 * AgentRoom — 픽셀아트 스타일 탑다운 방 렌더러
 * HumanoidAgents 스타일의 그리드 기반 사무실을 Pixi Graphics로 그린다.
 */
import { Graphics, Container, Text, TextStyle } from 'pixi.js';

// ── 색상 팔레트 (HumanoidAgents 스타일) ──
const COLORS = {
  floorLight: 0xe8e0d0,
  floorDark: 0xddd4c2,
  wall: 0x8b7355,
  wallInner: 0xa08b6e,
  desk: 0x6b5b4a,
  deskTop: 0x8b7d6b,
  monitor: 0x2c3e50,
  monitorScreen: 0x5dade2,
  board: 0xd4a574,
  boardFrame: 0x8b6914,
  counter: 0x5c4033,
  counterTop: 0x8b6f47,
  hallway: 0xd2c9b6,
  doorway: 0xc8bf9f,
  carpet: {
    claude: 0xbfc8d9,
    heimi: 0xd9c5bf,
    ali: 0xc2d9bf,
  },
} as const;

const TILE = 16; // 논리 타일 크기 (확대해서 표시)

export interface RoomLayout {
  /** 전체 씬 너비 (px) */
  sceneW: number;
  /** 전체 씬 높이 (px) */
  sceneH: number;
  /** 타일 확대 배율 */
  scale: number;
  /** 각 방 영역 (타일 좌표) */
  rooms: {
    claude: { x: number; y: number; w: number; h: number };
    hallway: { x: number; y: number; w: number; h: number };
    heimi: { x: number; y: number; w: number; h: number };
    ali: { x: number; y: number; w: number; h: number };
  };
}

/**
 * 씬 크기에 맞게 방 레이아웃을 계산한다.
 */
export function computeLayout(sceneW: number, sceneH: number): RoomLayout {
  // 높이 기준으로 스케일 계산 (7타일 높이에 맞춤)
  const roomH = 7;
  const scale = Math.floor(sceneH / (roomH * TILE));
  const roomW = 6;
  const hallwayW = 3;
  const totalTilesW = roomW + hallwayW + roomW + roomW; // claude + hallway + heimi + ali = 21

  return {
    sceneW,
    sceneH,
    scale,
    rooms: {
      claude: { x: 0, y: 0, w: roomW, h: roomH },
      hallway: { x: roomW, y: 0, w: hallwayW, h: roomH },
      heimi: { x: roomW + hallwayW, y: 0, w: roomW, h: roomH },
      ali: { x: roomW + hallwayW + roomW, y: 0, w: roomW, h: roomH },
    },
  };
}

/**
 * 타일 좌표를 픽셀 좌표로 변환한다.
 */
export function tileToPixel(
  tx: number,
  ty: number,
  layout: RoomLayout,
): { x: number; y: number } {
  const s = layout.scale * TILE;
  // 씬 중앙에 정렬
  const totalW = 21 * s; // 21 타일 너비
  const offsetX = (layout.sceneW - totalW) / 2;
  const offsetY = (layout.sceneH - 7 * s) / 2;
  return { x: offsetX + tx * s, y: offsetY + ty * s };
}

/**
 * 방 중앙의 픽셀 좌표 (에이전트 위치용)
 */
export function roomCenter(
  roomKey: 'claude' | 'heimi' | 'ali',
  layout: RoomLayout,
): { x: number; y: number } {
  const room = layout.rooms[roomKey];
  return tileToPixel(room.x + room.w / 2, room.y + room.h / 2 + 0.5, layout);
}

/**
 * 전체 씬 배경을 그린다 (바닥 + 벽 + 가구).
 */
export function drawScene(container: Container, layout: RoomLayout): void {
  const s = layout.scale * TILE;
  const g = new Graphics();

  const drawFloor = (
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    carpetColor?: number,
  ) => {
    const { x: ox, y: oy } = tileToPixel(rx, ry, layout);
    for (let ty = 0; ty < rh; ty++) {
      for (let tx = 0; tx < rw; tx++) {
        const px = ox + tx * s;
        const py = oy + ty * s;
        const isCheckerDark = (tx + ty) % 2 === 1;
        const baseColor = carpetColor ?? (isCheckerDark ? COLORS.floorDark : COLORS.floorLight);
        g.rect(px, py, s, s).fill(baseColor);
        // 타일 테두리 (얇게)
        g.rect(px, py, s, s).stroke({ color: 0x00000010, width: 0.5 });
      }
    }
  };

  const drawWalls = (rx: number, ry: number, rw: number, rh: number, hasDoorLeft: boolean, hasDoorRight: boolean) => {
    const { x: ox, y: oy } = tileToPixel(rx, ry, layout);
    const wallThick = s * 0.25;
    const pw = rw * s;
    const ph = rh * s;

    // 상단 벽
    g.rect(ox, oy - wallThick, pw, wallThick).fill(COLORS.wall);
    // 하단 벽
    g.rect(ox, oy + ph, pw, wallThick).fill(COLORS.wall);

    // 좌측 벽 (문 제외)
    if (!hasDoorLeft) {
      g.rect(ox - wallThick, oy - wallThick, wallThick, ph + wallThick * 2).fill(COLORS.wall);
    } else {
      // 위 + 아래 반벽
      g.rect(ox - wallThick, oy - wallThick, wallThick, s * 2).fill(COLORS.wall);
      g.rect(ox - wallThick, oy + ph - s * 2, wallThick, s * 2 + wallThick).fill(COLORS.wall);
    }

    // 우측 벽 (문 제외)
    if (!hasDoorRight) {
      g.rect(ox + pw, oy - wallThick, wallThick, ph + wallThick * 2).fill(COLORS.wall);
    } else {
      g.rect(ox + pw, oy - wallThick, wallThick, s * 2).fill(COLORS.wall);
      g.rect(ox + pw, oy + ph - s * 2, wallThick, s * 2 + wallThick).fill(COLORS.wall);
    }
  };

  // ── 바닥 그리기 ──
  const { claude, hallway, heimi, ali } = layout.rooms;
  drawFloor(claude.x, claude.y, claude.w, claude.h, COLORS.carpet.claude);
  drawFloor(hallway.x, hallway.y, hallway.w, hallway.h);
  drawFloor(heimi.x, heimi.y, heimi.w, heimi.h, COLORS.carpet.heimi);
  drawFloor(ali.x, ali.y, ali.w, ali.h, COLORS.carpet.ali);

  // ── 벽 그리기 ──
  drawWalls(claude.x, claude.y, claude.w, claude.h, false, true);
  // 복도는 벽 없이 바닥만 (문 역할)
  drawWalls(heimi.x, heimi.y, heimi.w, heimi.h, true, true);
  drawWalls(ali.x, ali.y, ali.w, ali.h, true, false);

  // ── 가구: 클로드 분석실 — 모니터 + 책상 ──
  const claudeDesk = tileToPixel(claude.x + 1, claude.y + 1, layout);
  g.rect(claudeDesk.x, claudeDesk.y, s * 3, s * 1.2).fill(COLORS.desk);
  g.rect(claudeDesk.x + s * 0.3, claudeDesk.y - s * 0.3, s * 0.8, s * 0.6).fill(COLORS.monitor);
  g.rect(claudeDesk.x + s * 0.4, claudeDesk.y - s * 0.2, s * 0.6, s * 0.35).fill(COLORS.monitorScreen);
  g.rect(claudeDesk.x + s * 1.5, claudeDesk.y - s * 0.3, s * 0.8, s * 0.6).fill(COLORS.monitor);
  g.rect(claudeDesk.x + s * 1.6, claudeDesk.y - s * 0.2, s * 0.6, s * 0.35).fill(COLORS.monitorScreen);

  // ── 가구: 헤르미 홍보실 — SNS 보드 ──
  const heimiBoard = tileToPixel(heimi.x + 1, heimi.y + 0.5, layout);
  g.rect(heimiBoard.x, heimiBoard.y, s * 4, s * 0.3).fill(COLORS.boardFrame);
  g.rect(heimiBoard.x + s * 0.15, heimiBoard.y + s * 0.05, s * 3.7, s * 0.2).fill(COLORS.board);
  // 작은 카드들 (SNS 포스트 표현)
  for (let i = 0; i < 4; i++) {
    g.rect(heimiBoard.x + s * 0.3 + i * s * 0.9, heimiBoard.y + s * 0.07, s * 0.6, s * 0.15)
      .fill(i % 2 === 0 ? 0xe8d5c4 : 0xd5e8c4);
  }

  // ── 가구: 알리 안내 데스크 — 접수대 ──
  const aliCounter = tileToPixel(ali.x + 0.5, ali.y + 1.5, layout);
  g.rect(aliCounter.x, aliCounter.y, s * 5, s * 0.8).fill(COLORS.counter);
  g.rect(aliCounter.x, aliCounter.y, s * 5, s * 0.15).fill(COLORS.counterTop);

  container.addChild(g);

  // ── 방 이름 텍스트 ──
  const labelStyle = new TextStyle({
    fontSize: Math.max(8, s * 0.6),
    fontFamily: '"Press Start 2P", monospace, sans-serif',
    fill: 0x665544,
    align: 'center',
  });

  const labels = [
    { text: '🔍 Analysis', room: claude },
    { text: '📣 Promo', room: heimi },
    { text: '📋 Guide', room: ali },
  ];

  for (const { text, room } of labels) {
    const pos = tileToPixel(room.x + room.w / 2, room.y + room.h - 0.8, layout);
    const label = new Text({ text, style: labelStyle });
    label.anchor.set(0.5, 0.5);
    label.position.set(pos.x, pos.y);
    container.addChild(label);
  }
}
