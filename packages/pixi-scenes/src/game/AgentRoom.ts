/**
 * AgentRoom — 모던 오피스 스타일 탑다운 방 렌더러
 * Pixi Graphics로 오피스 인테리어를 그린다.
 */
import { Graphics, Container, Text, TextStyle } from 'pixi.js';

// ── 색상 팔레트 (모던 오피스) ──
const COLORS = {
  // 바닥
  floorLight: 0xf0ece4,    // 밝은 우드
  floorDark: 0xe6e0d6,     // 어두운 우드
  carpet: {
    claude: 0xc8d0e0,      // 블루그레이 (분석실)
    heimi: 0xe0cdd5,       // 핑크그레이 (홍보실)
    ali: 0xc8ddd0,         // 민트그레이 (안내데스크)
  },

  // 벽
  wall: 0x6b7b8d,          // 슬레이트 블루
  wallInner: 0x8899aa,     // 밝은 슬레이트
  wallAccent: 0x4a5d6e,    // 짙은 악센트

  // 가구
  desk: 0xb8a088,          // 밝은 우드 데스크
  deskTop: 0xd4c4a8,       // 데스크 상판
  monitor: 0x2d3436,       // 모니터 프레임
  monitorScreen: 0x74b9ff, // 모니터 화면 (블루)
  monitorScreenAlt: 0xa8e6cf, // 화면 (그린)
  keyboard: 0x636e72,      // 키보드
  chair: 0x4a4a4a,         // 의자
  chairSeat: 0x5c5c5c,     // 의자 시트

  // 오피스 소품
  whiteboard: 0xf5f5f5,    // 화이트보드
  whiteboardFrame: 0x999999, // 화이트보드 프레임
  bookshelf: 0x8b6f47,     // 책장
  book1: 0x3498db,         // 책1 (파랑)
  book2: 0xe74c3c,         // 책2 (빨강)
  book3: 0x2ecc71,         // 책3 (초록)
  book4: 0xf39c12,         // 책4 (노랑)
  plant: 0x27ae60,         // 화분 식물
  plantPot: 0xc0935e,      // 화분
  coffeeMachine: 0x555555, // 커피머신
  waterCooler: 0xd6eaf8,   // 정수기

  // 복도
  hallway: 0xded6c8,
  doorway: 0xd4ccb8,

  // 접수대
  counter: 0x5c6a78,       // 접수대 (모던 그레이)
  counterTop: 0x7f8c9a,    // 접수대 상판
  divider: 0xc0c8d0,       // 파티션
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

  // ── 바닥 그리기 ──
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
        g.rect(px, py, s, s).stroke({ color: 0x00000008, width: 0.5 });
      }
    }
  };

  // ── 벽 그리기 ──
  const drawWalls = (rx: number, ry: number, rw: number, rh: number, hasDoorLeft: boolean, hasDoorRight: boolean) => {
    const { x: ox, y: oy } = tileToPixel(rx, ry, layout);
    const wallThick = s * 0.3;
    const pw = rw * s;
    const ph = rh * s;

    // 상단 벽 (두꺼운 악센트)
    g.rect(ox, oy - wallThick, pw, wallThick).fill(COLORS.wallAccent);
    g.rect(ox, oy - wallThick, pw, wallThick * 0.4).fill(COLORS.wall);
    // 하단 벽
    g.rect(ox, oy + ph, pw, wallThick).fill(COLORS.wall);

    // 좌측 벽
    if (!hasDoorLeft) {
      g.rect(ox - wallThick, oy - wallThick, wallThick, ph + wallThick * 2).fill(COLORS.wall);
    } else {
      g.rect(ox - wallThick, oy - wallThick, wallThick, s * 2).fill(COLORS.wall);
      g.rect(ox - wallThick, oy + ph - s * 2, wallThick, s * 2 + wallThick).fill(COLORS.wall);
    }

    // 우측 벽
    if (!hasDoorRight) {
      g.rect(ox + pw, oy - wallThick, wallThick, ph + wallThick * 2).fill(COLORS.wall);
    } else {
      g.rect(ox + pw, oy - wallThick, wallThick, s * 2).fill(COLORS.wall);
      g.rect(ox + pw, oy + ph - s * 2, wallThick, s * 2 + wallThick).fill(COLORS.wall);
    }
  };

  const { claude, hallway, heimi, ali } = layout.rooms;
  drawFloor(claude.x, claude.y, claude.w, claude.h, COLORS.carpet.claude);
  drawFloor(hallway.x, hallway.y, hallway.w, hallway.h);
  drawFloor(heimi.x, heimi.y, heimi.w, heimi.h, COLORS.carpet.heimi);
  drawFloor(ali.x, ali.y, ali.w, ali.h, COLORS.carpet.ali);

  drawWalls(claude.x, claude.y, claude.w, claude.h, false, true);
  drawWalls(heimi.x, heimi.y, heimi.w, heimi.h, true, true);
  drawWalls(ali.x, ali.y, ali.w, ali.h, true, false);

  // ════════════════════════════════════════
  // 가구: 클로드 분석실 (AI 분석 + 연구)
  // ════════════════════════════════════════

  // L자 데스크 (상단 벽 따라)
  const cd = tileToPixel(claude.x + 0.6, claude.y + 0.5, layout);
  g.rect(cd.x, cd.y, s * 4.2, s * 1.0).fill(COLORS.desk);
  g.rect(cd.x, cd.y, s * 4.2, s * 0.15).fill(COLORS.deskTop);
  // 사이드 데스크
  g.rect(cd.x, cd.y, s * 1.0, s * 2.0).fill(COLORS.desk);
  g.rect(cd.x, cd.y, s * 0.15, s * 2.0).fill(COLORS.deskTop);

  // 듀얼 모니터
  g.rect(cd.x + s * 1.2, cd.y + s * 0.2, s * 0.9, s * 0.6).fill(COLORS.monitor);
  g.rect(cd.x + s * 1.28, cd.y + s * 0.25, s * 0.74, s * 0.4).fill(COLORS.monitorScreen);
  g.rect(cd.x + s * 2.3, cd.y + s * 0.2, s * 0.9, s * 0.6).fill(COLORS.monitor);
  g.rect(cd.x + s * 2.38, cd.y + s * 0.25, s * 0.74, s * 0.4).fill(COLORS.monitorScreenAlt);

  // 키보드
  g.rect(cd.x + s * 1.5, cd.y + s * 0.85, s * 1.4, s * 0.12).fill(COLORS.keyboard);

  // 의자
  g.rect(cd.x + s * 1.8, cd.y + s * 1.3, s * 0.8, s * 0.7).fill(COLORS.chair);
  g.rect(cd.x + s * 1.85, cd.y + s * 1.35, s * 0.7, s * 0.5).fill(COLORS.chairSeat);

  // 책장 (하단 벽 따라)
  const cShelf = tileToPixel(claude.x + 0.6, claude.y + 5.2, layout);
  g.rect(cShelf.x, cShelf.y, s * 2.5, s * 1.2).fill(COLORS.bookshelf);
  // 책들
  const books = [COLORS.book1, COLORS.book2, COLORS.book3, COLORS.book4, COLORS.book1, COLORS.book3];
  for (let i = 0; i < books.length; i++) {
    g.rect(cShelf.x + s * 0.15 + i * s * 0.38, cShelf.y + s * 0.15, s * 0.28, s * 0.4).fill(books[i]);
  }
  // 하단 칸
  for (let i = 0; i < 4; i++) {
    g.rect(cShelf.x + s * 0.15 + i * s * 0.55, cShelf.y + s * 0.7, s * 0.42, s * 0.35).fill(books[(i + 2) % books.length]);
  }

  // 화분 (우측 하단 코너)
  const cPlant = tileToPixel(claude.x + 4.5, claude.y + 5.5, layout);
  g.rect(cPlant.x, cPlant.y + s * 0.4, s * 0.6, s * 0.5).fill(COLORS.plantPot);
  g.circle(cPlant.x + s * 0.3, cPlant.y + s * 0.25, s * 0.4).fill(COLORS.plant);

  // ════════════════════════════════════════
  // 복도: 정수기 + 커피머신
  // ════════════════════════════════════════
  const hw = tileToPixel(hallway.x + 0.8, hallway.y + 0.5, layout);
  // 정수기
  g.rect(hw.x, hw.y, s * 0.6, s * 0.5).fill(COLORS.waterCooler);
  g.rect(hw.x + s * 0.1, hw.y + s * 0.05, s * 0.4, s * 0.25).fill(0xaed6f1);
  // 커피머신
  g.rect(hw.x + s * 0.9, hw.y, s * 0.6, s * 0.5).fill(COLORS.coffeeMachine);
  g.rect(hw.x + s * 1.05, hw.y + s * 0.08, s * 0.3, s * 0.2).fill(0x884422);

  // ════════════════════════════════════════
  // 가구: 헤르미 홍보실 (SNS + 크리에이티브)
  // ════════════════════════════════════════

  // 화이트보드 (상단 벽)
  const hb = tileToPixel(heimi.x + 0.8, heimi.y + 0.3, layout);
  g.rect(hb.x, hb.y, s * 3.5, s * 0.15).fill(COLORS.whiteboardFrame);
  g.rect(hb.x, hb.y + s * 0.15, s * 3.5, s * 1.0).fill(COLORS.whiteboard);
  g.rect(hb.x, hb.y + s * 1.15, s * 3.5, s * 0.1).fill(COLORS.whiteboardFrame);
  // 보드 위 포스트잇들
  const postItColors = [0xfff176, 0xff8a80, 0x80cbc4, 0xb39ddb];
  for (let i = 0; i < 4; i++) {
    g.rect(hb.x + s * 0.25 + i * s * 0.85, hb.y + s * 0.3, s * 0.6, s * 0.5)
      .fill(postItColors[i]);
  }

  // 원형 미팅 테이블 (중앙)
  const hTable = tileToPixel(heimi.x + 2.0, heimi.y + 3.2, layout);
  g.circle(hTable.x + s * 1.0, hTable.y + s * 0.8, s * 1.0).fill(COLORS.desk);
  g.circle(hTable.x + s * 1.0, hTable.y + s * 0.8, s * 0.85).fill(COLORS.deskTop);

  // 의자들 (원탁 주변 4개)
  const chairPositions = [
    { dx: -0.3, dy: 0.5 },
    { dx: 2.0, dy: 0.5 },
    { dx: 0.5, dy: -0.5 },
    { dx: 0.5, dy: 1.8 },
  ];
  for (const cp of chairPositions) {
    g.rect(hTable.x + cp.dx * s, hTable.y + cp.dy * s, s * 0.6, s * 0.5).fill(COLORS.chair);
    g.rect(hTable.x + cp.dx * s + s * 0.05, hTable.y + cp.dy * s + s * 0.05, s * 0.5, s * 0.35).fill(COLORS.chairSeat);
  }

  // 노트북 (테이블 위)
  g.rect(hTable.x + s * 0.6, hTable.y + s * 0.5, s * 0.7, s * 0.5).fill(COLORS.monitor);
  g.rect(hTable.x + s * 0.65, hTable.y + s * 0.53, s * 0.6, s * 0.3).fill(0xffab91);

  // 화분 (우측 하단)
  const hPlant = tileToPixel(heimi.x + 4.8, heimi.y + 5.5, layout);
  g.rect(hPlant.x, hPlant.y + s * 0.4, s * 0.6, s * 0.5).fill(COLORS.plantPot);
  g.circle(hPlant.x + s * 0.3, hPlant.y + s * 0.2, s * 0.45).fill(COLORS.plant);

  // ════════════════════════════════════════
  // 가구: 알리 안내데스크 (접수 + 상담)
  // ════════════════════════════════════════

  // 접수 카운터 (L자형)
  const ac = tileToPixel(ali.x + 0.5, ali.y + 1.8, layout);
  g.rect(ac.x, ac.y, s * 4.5, s * 0.9).fill(COLORS.counter);
  g.rect(ac.x, ac.y, s * 4.5, s * 0.15).fill(COLORS.counterTop);
  // 카운터 사이드
  g.rect(ac.x + s * 4.0, ac.y - s * 0.8, s * 0.9, s * 1.7).fill(COLORS.counter);
  g.rect(ac.x + s * 4.0, ac.y - s * 0.8, s * 0.15, s * 1.7).fill(COLORS.counterTop);

  // 카운터 위 모니터
  g.rect(ac.x + s * 1.0, ac.y - s * 0.5, s * 0.7, s * 0.5).fill(COLORS.monitor);
  g.rect(ac.x + s * 1.07, ac.y - s * 0.45, s * 0.56, s * 0.32).fill(COLORS.monitorScreen);

  // 의자 (카운터 뒤)
  g.rect(ac.x + s * 1.5, ac.y + s * 1.2, s * 0.7, s * 0.6).fill(COLORS.chair);
  g.rect(ac.x + s * 1.55, ac.y + s * 1.25, s * 0.6, s * 0.4).fill(COLORS.chairSeat);

  // 파티션 (우측)
  const aDivider = tileToPixel(ali.x + 4.8, ali.y + 3.5, layout);
  g.rect(aDivider.x, aDivider.y, s * 0.15, s * 2.5).fill(COLORS.divider);

  // 대기석 의자들 (카운터 앞)
  for (let i = 0; i < 3; i++) {
    const wc = tileToPixel(ali.x + 0.8 + i * 1.4, ali.y + 4.5, layout);
    g.rect(wc.x, wc.y, s * 0.8, s * 0.6).fill(COLORS.chair);
    g.rect(wc.x + s * 0.05, wc.y + s * 0.05, s * 0.7, s * 0.4).fill(COLORS.chairSeat);
  }

  // 화분 (좌측 상단)
  const aPlant = tileToPixel(ali.x + 0.5, ali.y + 0.5, layout);
  g.rect(aPlant.x, aPlant.y + s * 0.4, s * 0.6, s * 0.5).fill(COLORS.plantPot);
  g.circle(aPlant.x + s * 0.3, aPlant.y + s * 0.2, s * 0.4).fill(COLORS.plant);

  container.addChild(g);

  // ── 방 이름 텍스트 ──
  const labelStyle = new TextStyle({
    fontSize: Math.max(8, s * 0.55),
    fontFamily: '"Press Start 2P", monospace, sans-serif',
    fill: 0x556677,
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
