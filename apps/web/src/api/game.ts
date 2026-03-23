import { api } from './client.js';
import type { GameType } from '@findthem/shared';

export interface GameStatus {
  freePlaysToday: number;
  adPlaysToday: number;
  maxFreePlays: number;
  maxAdPlays: number;
  remainingFree: number;
  remainingAd: number;
}

export async function getGameStatus(gameType: GameType = 'stair'): Promise<GameStatus> {
  return api.get<GameStatus>(`/game/status?gameType=${gameType}`);
}

export async function recordGamePlay(
  character: string,
  score: number,
  usedAd: boolean,
  gameType: GameType = 'stair',
): Promise<{ ok: boolean; xpEarned: number }> {
  return api.post('/game/play', { character, score, usedAd, gameType });
}

interface AdRewardResult {
  xpGained: number;
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
}

export async function claimAdReward(): Promise<AdRewardResult> {
  return api.post<AdRewardResult>('/users/me/ad-reward');
}
