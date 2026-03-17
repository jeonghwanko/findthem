import { api } from './client.js';

export interface GameStatus {
  freePlaysToday: number;
  adPlaysToday: number;
  maxFreePlays: number;
  maxAdPlays: number;
  remainingFree: number;
  remainingAd: number;
}

export async function getGameStatus(): Promise<GameStatus> {
  return api.get<GameStatus>('/game/status');
}

export async function recordGamePlay(
  character: string,
  score: number,
  usedAd: boolean,
): Promise<{ ok: boolean; xpEarned: number }> {
  return api.post('/game/play', { character, score, usedAd });
}
