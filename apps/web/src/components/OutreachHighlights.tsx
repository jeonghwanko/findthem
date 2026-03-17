import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { YT_VIDEO_ID_RE } from '@findthem/shared';
import { api } from '../api/client';

interface OutreachHighlight {
  videoId: string;
  videoTitle: string;
  channelName: string;
  reportId: string;
}

interface OutreachHighlightsResponse {
  items: OutreachHighlight[];
}

const SET_SIZE = 5;
const PAUSE_MS = 5000;     // 5초간 정지
const SLIDE_MS = 600;      // 슬라이드 애니메이션 시간

function SkeletonCard() {
  return (
    <div className="shrink-0 w-48 rounded-xl overflow-hidden border border-gray-100 bg-white">
      <div className="w-full aspect-video bg-gray-200 animate-pulse" />
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

export default function OutreachHighlights() {
  const { t } = useTranslation();
  const [items, setItems] = useState<OutreachHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [setIndex, setSetIndex] = useState(0);
  const [sliding, setSliding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .get<OutreachHighlightsResponse>('/outreach/highlights')
      .then((data) => {
        const safe = (data.items ?? []).filter((i) => YT_VIDEO_ID_RE.test(i.videoId));
        setItems(safe);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const totalSets = Math.ceil(items.length / SET_SIZE);

  const scheduleNext = useCallback(() => {
    if (totalSets <= 1) return;
    timerRef.current = setTimeout(() => {
      // 슬라이드 시작
      setSliding(true);
      // 슬라이드 완료 후 인덱스 변경 + 위치 리셋
      setTimeout(() => {
        setSetIndex((prev) => (prev + 1) % totalSets);
        setSliding(false);
      }, SLIDE_MS);
    }, PAUSE_MS);
  }, [totalSets]);

  useEffect(() => {
    if (totalSets <= 1) return;
    scheduleNext();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [totalSets, setIndex, scheduleNext]);

  if (!loading && items.length === 0) return null;

  const currentItems = items.slice(setIndex * SET_SIZE, setIndex * SET_SIZE + SET_SIZE);

  return (
    <div className="bg-white border-b border-gray-100 py-5 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {t('home.outreachTitle')}
          </p>

          {!loading && totalSets > 1 && (
            <div className="flex gap-1">
              {Array.from({ length: totalSets }).map((_, i) => (
                <span
                  key={i}
                  className={`inline-block h-1.5 rounded-full transition-all duration-300 ${
                    i === setIndex ? 'w-4 bg-primary-400' : 'w-1.5 bg-gray-200'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden">
          <div
            className="flex gap-3"
            style={{
              transform: sliding ? 'translateX(-105%)' : 'translateX(0)',
              transition: sliding ? `transform ${SLIDE_MS}ms ease-in-out` : 'none',
            }}
          >
            {loading
              ? Array.from({ length: SET_SIZE }).map((_, i) => <SkeletonCard key={i} />)
              : currentItems.map((item) => (
                  <a
                    key={item.videoId}
                    href={`https://www.youtube.com/watch?v=${item.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 w-48 rounded-xl overflow-hidden border border-gray-100 bg-white hover:border-primary-200 hover:shadow-md transition-all group"
                  >
                    <div className="relative w-full aspect-video overflow-hidden bg-gray-100">
                      <img
                        src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                        alt={item.videoTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                        <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                          <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4 ml-0.5">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5">
                      <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight mb-1">
                        {item.videoTitle}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{item.channelName}</p>
                    </div>
                  </a>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
