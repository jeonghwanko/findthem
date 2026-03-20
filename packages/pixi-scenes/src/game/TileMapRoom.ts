/**
 * TileMapRoom — LimeZu Modern Interiors 2D 배열 타일맵 사무실
 *
 * 모든 셀을 명시적으로 지정. 24열 × 12행 = 3개 방(8×12) + 복도
 * Room_Builder_free_48x48.png (17col×23row) — 바닥
 * Interiors_free_48x48.png   (16col×89row) — 가구
 */
import { Container, Sprite, Texture, Rectangle, Assets, Graphics, Text, TextStyle } from 'pixi.js';

const T = 48;

// ── 텍스처 캐시 ──
const texCache = new Map<string, Texture>();
function getTex(base: Texture, col: number, row: number): Texture {
  const key = `${base.uid}_${col}_${row}`;
  let tex = texCache.get(key);
  if (!tex) {
    tex = new Texture({ source: base.source, frame: new Rectangle(col * T, row * T, T, T) });
    texCache.set(key, tex);
  }
  return tex;
}

function assetPath(path: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: string = (import.meta as any)?.env?.BASE_URL ?? '/';
    return `${base}${path.replace(/^\//, '')}`;
  } catch { return path; }
}

// ═══════════════════════════════════════
// 타일 ID — 0 = 빈 칸
// ═══════════════════════════════════════

// 바닥 (Room_Builder)
const F = {
  H1: 1, H2: 2,       // 헤링본 나무
  W1: 3, W2: 4,       // 따뜻한 나무 A
  W3: 5, W4: 6,       // 따뜻한 나무 B
  C1: 7, C2: 8,       // 크림 체크 A
  C3: 9, C4: 10,      // 크림 체크 B
  T1: 11, T2: 12,     // 청록 패턴 A
  T3: 13, T4: 14,     // 청록 패턴 B
  G1: 15, G2: 16,     // 회색 돌
} as const;

// 가구 (Interiors) — 3/4뷰 기준
const I = {
  // ── PC 데스크 (일체형: 모니터 내장 책상, L=왼쪽 R=오른쪽) ──
  PC_T1: 101, PC_B1: 102, // 밝은 나무 왼쪽
  PC_T1R:105, PC_B1R:106, // 밝은 나무 오른쪽 (2타일 너비용)
  PC_T2: 103, PC_B2: 104, // 어두운 나무 왼쪽
  PC_T2R:107, PC_B2R:108, // 어두운 나무 오른쪽
  // ── 의자 ──
  CH1: 120, CH2: 121, CH3: 122, CH4: 123,
  // ── 초록 캐비닛 ──
  CB_L: 140, CB_R: 141,
  // ── 청록 장롱 ──
  CW_1: 144, CW_2: 145, CW_3: 146,
  // ── 카운터 ──
  CT1: 150, CT2: 151, CT3: 152, CT4: 153,
  // ── 칠판 (교실 스타일) ──
  BD_L: 160, BD_R: 161,
  // ── 소파 ──
  SF_L: 170, SF_R: 171,
  // ── 원형 테이블 ──
  TBL: 175,
  // ── 액자 ──
  PT1: 180, PT2: 181,
  // ── 글로브 ──
  GLB: 185,
  // ── 화분 ──
  PL1: 190, PL2: 191, PL3: 192,
  // ── 파란 러그 ──
  RG_TL: 200, RG_TR: 201, RG_BL: 202, RG_BR: 203,
  // ── 소파2 ──
  SF2_L: 210, SF2_R: 211,
  // ── 베이지 러그 ──
  RR_TL: 220, RR_TR: 221, RR_BL: 222, RR_BR: 223,
  // ── 책장 (2×2) ──
  BK_TL: 230, BK_TR: 231, BK_BL: 232, BK_BR: 233,
  // ── 교탁+책 (교실 책상) ──
  DSK1: 240, DSK2: 241,
} as const;

// ═══════════════════════════════════════
// 타일 레지스트리: ID → (sheet, col, row)
// ═══════════════════════════════════════
type TE = { s: 'r' | 'i'; c: number; r: number };
const REG: Record<number, TE> = {
  // 바닥 (Room_Builder)
  [F.H1]: { s: 'r', c: 11, r: 13 }, [F.H2]: { s: 'r', c: 12, r: 13 },
  [F.W1]: { s: 'r', c: 0, r: 11 },  [F.W2]: { s: 'r', c: 1, r: 11 },
  [F.W3]: { s: 'r', c: 0, r: 12 },  [F.W4]: { s: 'r', c: 1, r: 12 },
  [F.C1]: { s: 'r', c: 7, r: 7 },   [F.C2]: { s: 'r', c: 8, r: 7 },
  [F.C3]: { s: 'r', c: 7, r: 8 },   [F.C4]: { s: 'r', c: 8, r: 8 },
  [F.T1]: { s: 'r', c: 11, r: 9 },  [F.T2]: { s: 'r', c: 12, r: 9 },
  [F.T3]: { s: 'r', c: 11, r: 10 }, [F.T4]: { s: 'r', c: 12, r: 10 },
  [F.G1]: { s: 'r', c: 14, r: 4 },  [F.G2]: { s: 'r', c: 15, r: 4 },
  // 가구 (Interiors) — 3/4뷰 기준
  // PC 데스크 일체형 (L/R = 2타일 너비 쌍)
  [I.PC_T1]:{ s: 'i', c: 4, r: 32 }, [I.PC_B1]:{ s: 'i', c: 4, r: 33 },
  [I.PC_T1R]:{s:'i', c: 5, r: 32 }, [I.PC_B1R]:{s:'i', c: 5, r: 33 },
  [I.PC_T2]:{ s: 'i', c: 6, r: 32 }, [I.PC_B2]:{ s: 'i', c: 6, r: 33 },
  [I.PC_T2R]:{s:'i', c: 7, r: 32 }, [I.PC_B2R]:{s:'i', c: 7, r: 33 },
  // 의자
  [I.CH1]:  { s: 'i', c: 4, r: 31 }, [I.CH2]:  { s: 'i', c: 5, r: 31 },
  [I.CH3]:  { s: 'i', c: 6, r: 31 }, [I.CH4]:  { s: 'i', c: 7, r: 31 },
  // 캐비닛/장롱
  [I.CB_L]: { s: 'i', c: 1, r: 0 },  [I.CB_R]: { s: 'i', c: 2, r: 0 },
  [I.CW_1]: { s: 'i', c: 10, r: 0 }, [I.CW_2]: { s: 'i', c: 11, r: 0 },
  [I.CW_3]: { s: 'i', c: 12, r: 0 },
  // 카운터
  [I.CT1]:  { s: 'i', c: 0, r: 33 }, [I.CT2]:  { s: 'i', c: 1, r: 33 },
  [I.CT3]:  { s: 'i', c: 8, r: 33 }, [I.CT4]:  { s: 'i', c: 9, r: 33 },
  // 칠판 (본체)
  [I.BD_L]: { s: 'i', c: 10, r: 36 },[I.BD_R]: { s: 'i', c: 11, r: 36 },
  // 소파/테이블
  [I.SF_L]: { s: 'i', c: 5, r: 10 }, [I.SF_R]: { s: 'i', c: 6, r: 10 },
  [I.TBL]:  { s: 'i', c: 4, r: 10 },
  [I.SF2_L]:{ s: 'i', c: 7, r: 10 }, [I.SF2_R]:{ s: 'i', c: 8, r: 10 },
  // 액자
  [I.PT1]:  { s: 'i', c: 0, r: 21 }, [I.PT2]:  { s: 'i', c: 1, r: 21 },
  // 글로브
  [I.GLB]:  { s: 'i', c: 12, r: 36 },
  // 화분
  [I.PL1]:  { s: 'i', c: 4, r: 46 }, [I.PL2]:  { s: 'i', c: 5, r: 46 },
  [I.PL3]:  { s: 'i', c: 6, r: 46 },
  // 파란 러그
  [I.RG_TL]:{ s: 'i', c: 13, r: 13 },[I.RG_TR]:{ s: 'i', c: 14, r: 13 },
  [I.RG_BL]:{ s: 'i', c: 13, r: 14 },[I.RG_BR]:{ s: 'i', c: 14, r: 14 },
  // 베이지 러그 (상/하 동일 패턴 반복)
  [I.RR_TL]:{ s: 'i', c: 0, r: 43 }, [I.RR_TR]:{ s: 'i', c: 1, r: 43 },
  [I.RR_BL]:{ s: 'i', c: 0, r: 43 }, [I.RR_BR]:{ s: 'i', c: 1, r: 43 },
  // 책장 (2×2)
  [I.BK_TL]:{ s: 'i', c: 5, r: 16 }, [I.BK_TR]:{ s: 'i', c: 6, r: 16 },
  [I.BK_BL]:{ s: 'i', c: 5, r: 17 }, [I.BK_BR]:{ s: 'i', c: 6, r: 17 },
  // 교탁+책 (1타일 교실 책상)
  [I.DSK1]: { s: 'i', c: 1, r: 36 }, [I.DSK2]: { s: 'i', c: 2, r: 36 },
};

// ═══════════════════════════════════════
// 방 레이아웃 — 24열 × 12행
// ═══════════════════════════════════════
const _ = 0;
const COLS = 24;
const ROWS = 12;

// Claude(0-7)=8칸 | Hall(8-9)=2칸 | Heimi(10-17)=8칸 | Ali(18-23)=6칸 → 수정 필요

// 다시 계산: 너비 여유를 두고
// Claude(0-6)=7 | Hall(7-8)=2 | Heimi(9-15)=7 | Hall2(16-17)=2 | Ali(18-23)=6
// 총 = 7+2+7+2+6 = 24 ✓

// 바닥 레이어 (24×12)
const h=F.H1, H=F.H2;
const w=F.W1, W=F.W2, w2=F.W3, W2=F.W4;
const c=F.C1, C=F.C2, c2=F.C3, C2=F.C4;
const t=F.T1, T_=F.T2, t2=F.T3, T2=F.T4;
const g=F.G1, G=F.G2;

const FLOOR: number[][] = [
  //  Claude(0-6)         H(7-8)   Heimi(9-15)            H2(16-17)  Ali(18-23)
  [h, H, h, H, h, H, h,  t, T_,   w, W, w, W, w, W, w,   t, T_,    c, C, c, C, c, C],
  [H, h, H, h, H, h, H,  T_,t,    W, w, W, w, W, w, W,   T_,t,     C, c, C, c, C, c],
  [h, H, h, H, h, H, h,  t2,T2,   w2,W2,w2,W2,w2,W2,w2,  t2,T2,    c2,C2,c2,C2,c2,C2],
  [H, h, H, h, H, h, H,  t, T_,   w, W, w, W, w, W, w,   t, T_,    c, C, c, C, c, C],
  [h, H, h, H, h, H, h,  T_,t,    W, w, W, w, W, w, W,   T_,t,     C, c, C, c, C, c],
  [H, h, H, h, H, h, H,  t2,T2,   w2,W2,w2,W2,w2,W2,w2,  t2,T2,    c2,C2,c2,C2,c2,C2],
  [h, H, h, H, h, H, h,  t, T_,   w, W, w, W, w, W, w,   t, T_,    c, C, c, C, c, C],
  [H, h, H, h, H, h, H,  T_,t,    W, w, W, w, W, w, W,   T_,t,     C, c, C, c, C, c],
  [h, H, h, H, h, H, h,  t2,T2,   w2,W2,w2,W2,w2,W2,w2,  t2,T2,    c2,C2,c2,C2,c2,C2],
  [H, h, H, h, H, h, H,  t, T_,   w, W, w, W, w, W, w,   t, T_,    c, C, c, C, c, C],
  [h, H, h, H, h, H, h,  T_,t,    W, w, W, w, W, w, W,   T_,t,     C, c, C, c, C, c],
  [H, h, H, h, H, h, H,  t2,T2,   w2,W2,w2,W2,w2,W2,w2,  t2,T2,    c2,C2,c2,C2,c2,C2],
];

// 가구 레이어 (24×12)
// Claude 분석실(0-6) | 복도(7-8) | Heimi 홍보실(9-15) | 복도(16-17) | Ali 안내(18-23)
// 3/4뷰 배치: 뒷벽(row0) → 벽가구(row1) → 책상(row2-3) → 의자(row4) → 바닥(row5-6) → 라운지(row7-9) → 장식(row10-11)
// Claude(0-6) | Hall(7-8) | Heimi(9-15) | Hall(16-17) | Ali(18-23)
// 문 영역: Hall cols 7-8,16-17의 row 2-4, row 8-9는 비워야 함
const FURN: number[][] = [
  // row 0 — 뒷벽: 대형 벽 가구
  [I.CB_L, I.CB_R, I.BK_TL,I.BK_TR,I.CW_1, I.CW_2, I.CW_3,  _, _,  I.BD_L, I.BD_R, _,      I.PT1,  I.CW_1, I.CW_2, I.CW_3,  _, _,  I.CT1,  I.CT2,  I.CT3,  I.CT4,  I.CB_L, I.CB_R],
  // row 1 — 벽가구 하단 + 그림
  [_,      _,      I.BK_BL,I.BK_BR,_,      _,      I.PT1,   _, _,  _,      _,      _,      _,      _,      _,      _,       _, _,  _,      _,      _,      _,      _,      _     ],
  // row 2 — PC 데스크 상단 (2타일 너비 = L+R 쌍) [문 영역]
  [_,      I.PC_T2,I.PC_T2R,_,     I.PC_T2,I.PC_T2R,_,      _, _,  _,      I.PC_T1,I.PC_T1R,_,     I.PC_T1,I.PC_T1R,_,      _, _,  _,      I.PC_T1,I.PC_T1R,_,     _,      _     ],
  // row 3 — PC 데스크 하단 (서랍 패널) [문 영역]
  [_,      I.PC_B2,I.PC_B2R,_,     I.PC_B2,I.PC_B2R,_,      _, _,  _,      I.PC_B1,I.PC_B1R,_,     I.PC_B1,I.PC_B1R,_,      _, _,  _,      I.PC_B1,I.PC_B1R,_,     _,      _     ],
  // row 4 — 의자 (책상 앞 좌석)
  [_,      I.CH1,  I.CH3,  _,      I.CH2,  I.CH4,  _,       _, _,  _,      I.CH2,  I.CH4,  _,      I.CH1,  I.CH3,  _,       _, _,  _,      I.CH4,  I.CH2,  _,      _,      _     ],
  // row 5 — 중앙 러그 + 열린 공간
  [_,      _,      I.RG_TL,I.RG_TR,_,      _,      _,       _,I.PL1, _,     _,      I.RG_TL,I.RG_TR,_,      _,      _,       _, _,  _,      _,      I.RR_TL,I.RR_TR,_,      _     ],
  // row 6 — 러그 하단 + 장식
  [I.PL2,  _,      I.RG_BL,I.RG_BR,_,      _,      _,       _, _,  I.PL3,  _,      I.RG_BL,I.RG_BR,_,      _,      _,       _, _,  I.PT1,  _,      I.RR_BL,I.RR_BR,_,      I.PL2 ],
  // row 7 — 라운지: 러그/소파 구역
  [_,      _,      _,      I.RR_TL,I.RR_TR,_,      _,       _, _,  _,      _,      I.RR_TL,I.RR_TR,_,      I.SF_L, I.SF_R,  _, _,  _,      _,      _,      _,      I.CW_1, I.CW_2],
  // row 8 — 라운지 [문 영역]
  [_,      _,      _,      I.RR_BL,I.RR_BR,_,      _,       _, _,  _,      _,      I.RR_BL,I.RR_BR,_,      _,      _,       _, _,  _,      _,      _,      _,      _,      _     ],
  // row 9 — 소파+테이블
  [_,      _,      I.TBL,  I.SF_L, I.SF_R, _,      _,       _,I.PL3, _,     _,      _,      I.TBL,  I.SF2_L,I.SF2_R,_,       _, _,  _,      _,      I.GLB,  I.TBL,  I.SF_L, I.SF_R],
  // row 10 — 하단 벽 장식
  [I.PT2,  _,      _,      _,      _,      _,      _,       _, _,  I.PT2,  _,      _,      _,      _,      _,      I.PT1,   _, _,  I.PT2,  _,      _,      _,      _,      _     ],
  // row 11 — 맨 아래: 식물
  [_,      _,      _,      _,      _,      _,      I.PL1,   _, _,  _,      I.PL2,  _,      _,      _,      I.PL3,  _,       I.PL3,_, I.PL1,  _,      _,      _,      _,      I.PL3 ],
];

// ═══════════════════════════════════════
// 레이아웃 + 렌더링
// ═══════════════════════════════════════
interface RoomRect { x: number; y: number; w: number; h: number }

export interface TileRoomLayout {
  scale: number; offsetX: number; offsetY: number;
  rooms: { claude: RoomRect; hallway: RoomRect; heimi: RoomRect; ali: RoomRect };
  totalW: number; totalH: number;
}

export function tileToPx(tx: number, ty: number, layout: TileRoomLayout): { x: number; y: number } {
  return { x: layout.offsetX + tx * T * layout.scale, y: layout.offsetY + ty * T * layout.scale };
}

export function tileRoomCenter(roomKey: 'claude' | 'heimi' | 'ali', layout: TileRoomLayout): { x: number; y: number } {
  const room = layout.rooms[roomKey];
  return tileToPx(room.x + room.w / 2, room.y + room.h / 2, layout);
}

export async function drawTileScene(container: Container, sceneW: number, sceneH: number): Promise<TileRoomLayout> {
  const [roomTex, interiorTex] = await Promise.all([
    Assets.load(assetPath('/tiles/Room_Builder_free_48x48.png')) as Promise<Texture>,
    Assets.load(assetPath('/tiles/Interiors_free_48x48.png')) as Promise<Texture>,
  ]);
  const sheets = { r: roomTex, i: interiorTex };

  const rooms = {
    claude:  { x: 0,  y: 0, w: 7,  h: ROWS },
    hallway: { x: 7,  y: 0, w: 2,  h: ROWS },
    heimi:   { x: 9,  y: 0, w: 7,  h: ROWS },
    ali:     { x: 18, y: 0, w: 6,  h: ROWS },
  };

  const scale = Math.min(sceneW / (COLS * T), sceneH / (ROWS * T));
  const offsetX = (sceneW - COLS * T * scale) / 2;
  const offsetY = (sceneH - ROWS * T * scale) / 2;
  const layout: TileRoomLayout = { scale, offsetX, offsetY, rooms, totalW: COLS, totalH: ROWS };

  // ── 바닥 ──
  const floorLayer = new Container();
  container.addChild(floorLayer);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = FLOOR[row]?.[col];
      if (!id) continue;
      const entry = REG[id];
      if (!entry) continue;
      const sprite = new Sprite(getTex(sheets[entry.s], entry.c, entry.r));
      const pos = tileToPx(col, row, layout);
      sprite.position.set(pos.x, pos.y);
      sprite.scale.set(scale);
      floorLayer.addChild(sprite);
    }
  }

  // ── 벽 ──
  const wallG = new Graphics();
  container.addChild(wallG);
  const wc = 0x5a4a3a;
  const wt = Math.max(2, 3 * scale);
  const ox = offsetX, oy = offsetY;
  const pw = COLS * T * scale, ph = ROWS * T * scale;

  wallG.rect(ox, oy, pw, wt).fill(wc);
  wallG.rect(ox, oy + ph - wt, pw, wt).fill(wc);
  wallG.rect(ox, oy, wt, ph).fill(wc);
  wallG.rect(ox + pw - wt, oy, wt, ph).fill(wc);

  // 방 칸막이 (문 2개씩)
  for (const tileX of [7, 9, 16, 18]) {
    const px = offsetX + tileX * T * scale;
    const d1Top = oy + 2 * T * scale, d1Bot = oy + 5 * T * scale;
    const d2Top = oy + 8 * T * scale, d2Bot = oy + 10 * T * scale;
    // 상단 문
    wallG.rect(px - wt/2, oy, wt, d1Top - oy).fill(wc);
    wallG.rect(px - wt/2, d1Bot, wt, d2Top - d1Bot).fill(wc);
    // 하단 문
    wallG.rect(px - wt/2, d2Bot, wt, oy + ph - d2Bot).fill(wc);
  }

  // ── 가구 ──
  const furnLayer = new Container();
  container.addChild(furnLayer);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = FURN[row]?.[col];
      if (!id) continue;
      const entry = REG[id];
      if (!entry) continue;
      const sprite = new Sprite(getTex(sheets[entry.s], entry.c, entry.r));
      const pos = tileToPx(col, row, layout);
      sprite.position.set(pos.x, pos.y);
      sprite.scale.set(scale);
      furnLayer.addChild(sprite);
    }
  }

  // ── 라벨 ──
  const labelStyle = new TextStyle({
    fontSize: Math.max(7, T * scale * 0.45),
    fontFamily: '"Press Start 2P", monospace',
    fill: 0x554433,
    align: 'center',
  });
  const labels: { text: string; room: RoomRect }[] = [
    { text: '🔍 Analysis', room: rooms.claude },
    { text: '📣 Promo', room: rooms.heimi },
    { text: '📋 Guide', room: rooms.ali },
  ];
  for (const { text, room } of labels) {
    const pos = tileToPx(room.x + room.w / 2, room.y + room.h - 0.4, layout);
    const label = new Text({ text, style: labelStyle });
    label.anchor.set(0.5, 0.5);
    label.position.set(pos.x, pos.y);
    furnLayer.addChild(label);
  }

  return layout;
}
