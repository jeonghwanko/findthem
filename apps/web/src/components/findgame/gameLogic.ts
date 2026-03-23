import { FIND_GAME_ROUND_SECS, FIND_GAME_TARGET_COUNT, FIND_GAME_MAX_TARGETS } from '@findthem/shared';

export interface TargetInfo {
  charId: number;
  tileX: number;
  tileY: number;
  found: boolean;
}

export interface RoundConfig {
  targets: TargetInfo[];
  decoyCount: number;
  timeSecs: number;
}

// Playable zone boundaries (tile coords, avoid map edges)
const ZONE_MIN_X = 10;
const ZONE_MAX_X = 130;
const ZONE_MIN_Y = 10;
const ZONE_MAX_Y = 90;

/** Minimum distance (tiles) between targets */
const TARGET_MIN_DIST = 15;

/** Minimum distance (tiles) from any target to a decoy */
const DECOY_MIN_TARGET_DIST = 5;

function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function randomTileInZone(mapW: number, mapH: number): { tileX: number; tileY: number } {
  const maxX = Math.min(ZONE_MAX_X, mapW - 1);
  const maxY = Math.min(ZONE_MAX_Y, mapH - 1);
  return {
    tileX: ZONE_MIN_X + Math.floor(Math.random() * (maxX - ZONE_MIN_X + 1)),
    tileY: ZONE_MIN_Y + Math.floor(Math.random() * (maxY - ZONE_MIN_Y + 1)),
  };
}

export function generateRound(
  roundNumber: number,
  mapW: number,
  mapH: number,
): RoundConfig {
  const targetCount = Math.min(
    FIND_GAME_TARGET_COUNT + Math.floor(roundNumber / 2),
    FIND_GAME_MAX_TARGETS,
  );
  const decoyCount = Math.min(8 + roundNumber * 2, 20);

  // Shuffle charIds 1-8, pick first targetCount without duplicates
  const charPool = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = charPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [charPool[i], charPool[j]] = [charPool[j], charPool[i]];
  }

  const targets: TargetInfo[] = [];
  const MAX_ATTEMPTS = 500;

  for (let t = 0; t < targetCount; t++) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { tileX, tileY } = randomTileInZone(mapW, mapH);

      const tooClose = targets.some(
        (existing) => tileDistance(tileX, tileY, existing.tileX, existing.tileY) < TARGET_MIN_DIST,
      );
      if (tooClose) continue;

      targets.push({ charId: charPool[t], tileX, tileY, found: false });
      placed = true;
      break;
    }

    // Fallback: place anywhere in zone without distance check if attempts exhausted
    if (!placed) {
      const { tileX, tileY } = randomTileInZone(mapW, mapH);
      targets.push({ charId: charPool[t], tileX, tileY, found: false });
    }
  }

  return {
    targets,
    decoyCount,
    timeSecs: FIND_GAME_ROUND_SECS,
  };
}

export function generateDecoyPositions(
  targets: TargetInfo[],
  count: number,
  mapW: number,
  mapH: number,
): Array<{ charId: number; tileX: number; tileY: number }> {
  const decoys: Array<{ charId: number; tileX: number; tileY: number }> = [];
  const MAX_ATTEMPTS = 300;

  // Decoy는 target과 다른 charId만 사용 (시각적 혼동 방지)
  const targetCharIds = new Set(targets.map((t) => t.charId));
  const decoyCharPool = [1, 2, 3, 4, 5, 6, 7, 8].filter((id) => !targetCharIds.has(id));
  // 풀이 비어있으면 전체 사용 (target이 5개 이상일 때 fallback)
  const pool = decoyCharPool.length > 0 ? decoyCharPool : [1, 2, 3, 4, 5, 6, 7, 8];

  for (let d = 0; d < count; d++) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { tileX, tileY } = randomTileInZone(mapW, mapH);

      const tooCloseToTarget = targets.some(
        (t) => tileDistance(tileX, tileY, t.tileX, t.tileY) < DECOY_MIN_TARGET_DIST,
      );
      if (tooCloseToTarget) continue;

      const charId = pool[Math.floor(Math.random() * pool.length)];
      decoys.push({ charId, tileX, tileY });
      placed = true;
      break;
    }

    // Fallback: place without constraint
    if (!placed) {
      const { tileX, tileY } = randomTileInZone(mapW, mapH);
      decoys.push({ charId: pool[Math.floor(Math.random() * pool.length)], tileX, tileY });
    }
  }

  return decoys;
}

export function calculateScore(found: number, total: number, timeRemaining: number): number {
  return 100 * found + Math.floor(50 * timeRemaining);
}

export function isNearTarget(
  worldX: number,
  worldY: number,
  target: TargetInfo,
  tileDim: number,
  hitRadius: number,
): boolean {
  // Target center in world pixels (tile origin is top-left; sprite anchor is bottom-center,
  // so visually the character stands with feet at tileY*tileDim + tileDim.
  // We use the sprite's visual center: x = tileX*tileDim + tileDim/2, y = tileY*tileDim + tileDim/2)
  const cx = target.tileX * tileDim + tileDim / 2;
  const cy = target.tileY * tileDim + tileDim / 2;
  const dx = worldX - cx;
  const dy = worldY - cy;
  return dx * dx + dy * dy <= hitRadius * hitRadius;
}
