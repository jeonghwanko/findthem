import { useState } from 'react';
import { SpinePortrait } from './SpinePortrait';
import type { AgentId } from '../api/client';

interface Props {
  agentId: AgentId;
  skins: readonly string[];
}

/**
 * 에이전트 썸네일을 표시합니다.
 * - 정적 WebP(/agents/{agentId}.webp)가 있으면 즉시 렌더링 (빠름)
 * - 없으면 SpinePortrait로 fallback (Pixi.js + Spine 렌더링)
 */
export function AgentPortrait({ agentId, skins }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      <img
        src={`/agents/${agentId}.webp`}
        alt={agentId}
        width={80}
        height={80}
        style={{ display: 'block', objectFit: 'cover' }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <SpinePortrait skins={skins} animate={false} />;
}
