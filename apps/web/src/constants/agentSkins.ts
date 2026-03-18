import type { AgentId } from '../api/client';

/**
 * 에이전트별 Spine 스킨 목록 — 단일 진실 공급원 (SSOT)
 * TeamPage, CapturePortraitsPage, PixiHeroScene, GamePage 등에서 공유
 */
export const AGENT_SKINS: Record<AgentId, readonly string[]> = {
  'image-matching': ['body_090', 'cos_090', 'hair_090', 'hat_090', 'weapon_090'],
  'promotion':      ['body_102', 'cos_102', 'hair_102', 'hat_102', 'weapon_102'],
  'chatbot-alert':  ['body_043', 'cos_042', 'hair_000', 'hat_042', 'weapon_042'],
};
