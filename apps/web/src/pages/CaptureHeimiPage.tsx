/**
 * Dev tool: /dev/capture-heimi
 * 헤르미(promotion) 캐릭터를 각 사이즈별로 렌더링하여 WebP 파일로 다운로드
 * Playwright 자동화: scripts/capture-heimi.mjs
 */
import { SpinePortrait } from '../components/SpinePortrait';
import { AGENT_SKINS } from '../constants/agentSkins';

const HEIMI_SKINS = AGENT_SKINS['promotion'];

/** size, filename, label */
const SIZES = [
  { size: 32,  filename: 'heimi-32.webp',  label: 'Favicon 32×32' },
  { size: 180, filename: 'heimi-180.webp', label: 'Apple Touch 180×180' },
  { size: 630, filename: 'heimi-630.webp', label: 'OG / Twitter 630×630' },
] as const;

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const dataUrl = canvas.toDataURL('image/webp', 0.92);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export default function CaptureHeimiPage() {
  return (
    <div style={{ padding: 32, background: '#fff', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: 32, fontFamily: 'sans-serif' }}>Heimi Capture Tool</h1>
      <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {SIZES.map(({ size, filename, label }) => (
          <div key={size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#555', margin: 0 }}>{label}</p>
            <SpinePortrait
              skins={HEIMI_SKINS}
              size={size}
              animate={false}
              enableCapture
              className={`heimi-${size}`}
            />
            <button
              onClick={() => {
                const canvas = document.querySelector<HTMLCanvasElement>(`.heimi-${size}`);
                if (canvas) downloadCanvas(canvas, filename);
              }}
              style={{ padding: '4px 12px', fontFamily: 'sans-serif', fontSize: 12, cursor: 'pointer' }}
            >
              Download {filename}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
