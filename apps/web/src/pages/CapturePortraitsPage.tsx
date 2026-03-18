import { useRef, useState } from 'react';
import { SpinePortrait } from '../components/SpinePortrait';
import { AGENT_SKINS } from '../constants/agentSkins';
import type { AgentId } from '../api/client';

interface AgentCapture {
  id: AgentId;
  label: string;
}

const AGENTS: AgentCapture[] = [
  { id: 'image-matching', label: '탐정 클로드' },
  { id: 'promotion',      label: '홍보왕 헤르미' },
  { id: 'chatbot-alert',  label: '안내봇 알리' },
];

function AgentCaptureCard({ agent }: { agent: AgentCapture }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = () => {
    const canvas = wrapperRef.current?.querySelector('canvas');
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${agent.id}.webp`;
        a.click();
        URL.revokeObjectURL(url);
        setDownloaded(true);
      },
      'image/webp',
      0.92,
    );
  };

  return (
    <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
      <p className="font-semibold text-gray-800">{agent.label}</p>
      <div ref={wrapperRef} className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
        <SpinePortrait skins={AGENT_SKINS[agent.id]} animate={false} enableCapture />
      </div>
      <p className="text-xs text-gray-400 font-mono">{agent.id}.webp</p>
      <button
        onClick={handleDownload}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          downloaded
            ? 'bg-green-100 text-green-700'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {downloaded ? '✓ 다운로드됨' : 'WebP 다운로드'}
      </button>
    </div>
  );
}

export default function CapturePortraitsPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-800">에이전트 썸네일 캡처</h1>
        <p className="text-sm text-gray-500 mt-1">
          Spine 렌더링 후 WebP로 다운로드 → <code className="bg-gray-100 px-1 rounded">public/agents/</code>에 넣으세요
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {AGENTS.map((agent) => (
          <AgentCaptureCard key={agent.id} agent={agent} />
        ))}
      </div>

      <div className="text-xs text-gray-400 bg-white border border-gray-200 rounded-lg p-4 max-w-md text-center">
        ⚠️ 다운로드 버튼은 Spine 포즈가 안정된 후(약 200ms) 클릭하세요.
        <br />
        파일을 <code className="bg-gray-100 px-1 rounded">apps/web/public/agents/</code>에 복사하면
        팀 페이지에서 정적 이미지로 서빙됩니다.
      </div>
    </div>
  );
}
