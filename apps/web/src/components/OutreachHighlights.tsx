import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { YT_VIDEO_ID_RE } from '@findthem/shared';
import { api } from '../api/client';

interface OutreachHighlight {
  videoId: string | null;
  channelId: string | null;
  channelUrl: string | null;
  videoTitle: string;
  channelName: string;
  reportId: string;
}

interface OutreachHighlightsResponse {
  items: OutreachHighlight[];
}

const DESKTOP_PAGE = 5;
const MOBILE_PAGE = 2;
const PAUSE_MS = 8000;     // 8초간 정지
const SLIDE_MS = 1200;     // 슬라이드 애니메이션 시간

function SkeletonCard({ fill }: { fill?: boolean }) {
  return (
    <div className={`shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-white ${fill ? 'flex-1' : 'w-48'}`}>
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
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    api
      .get<OutreachHighlightsResponse>('/outreach/highlights')
      .then((data) => {
        const safe = (data.items ?? []).filter(
          (i) => (i.videoId ? YT_VIDEO_ID_RE.test(i.videoId) : true) && (i.videoId ?? i.channelId),
        );
        setItems(safe);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const pageSize = isMobile ? MOBILE_PAGE : DESKTOP_PAGE;
  const totalSets = Math.ceil(items.length / pageSize);

  const scheduleNext = useCallback(() => {
    if (totalSets <= 1) return;
    timerRef.current = setTimeout(() => {
      setSliding(true);
      setTimeout(() => {
        setSetIndex((prev) => (prev + 1) % totalSets);
        setSliding(false);
      }, SLIDE_MS);
    }, PAUSE_MS);
  }, [totalSets]);

  // pageSize 변경 시 setIndex 리셋
  useEffect(() => {
    setSetIndex(0);
  }, [pageSize]);

  useEffect(() => {
    if (totalSets <= 1) return;
    scheduleNext();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [totalSets, setIndex, scheduleNext]);

  if (!loading && items.length === 0) return null;

  const currentItems = items.slice(setIndex * pageSize, setIndex * pageSize + pageSize);

  return (
    <div className="bg-white border-b border-gray-100 py-5 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <Link to="/team" className="text-pink-500 font-bold hover:underline">
              {t('home.heroAgent.promo.name')}
            </Link>
            {t('home.outreachTitleSuffix')}
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
              ? Array.from({ length: pageSize }).map((_, i) => <SkeletonCard key={i} fill={isMobile} />)
              : currentItems.map((item) => (
                  <a
                    key={item.videoId ?? item.channelId}
                    href={
                      item.videoId
                        ? `https://www.youtube.com/watch?v=${item.videoId}`
                        : (item.channelUrl ?? `https://www.youtube.com/channel/${item.channelId}`)
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-white hover:border-primary-200 hover:shadow-md transition-all group ${isMobile ? 'flex-1' : 'w-48'}`}
                  >
                    <div className="relative w-full aspect-video overflow-hidden bg-gray-100">
                      {item.videoId ? (
                        <img
                          src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                          alt={item.videoTitle}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-red-600 flex items-center justify-center">
                          <svg viewBox="0 0 90 63" fill="white" className="w-16 h-12">
                            <path d="M88.1 9.9C87 5.8 83.8 2.6 79.7 1.5 72.8 0 45 0 45 0S17.2 0 10.3 1.5C6.2 2.6 3 5.8 1.9 9.9 0 16.8 0 31.5 0 31.5s0 14.7 1.9 21.6c1.1 4.1 4.3 7.3 8.4 8.4C17.2 63 45 63 45 63s27.8 0 34.7-1.5c4.1-1.1 7.3-4.3 8.4-8.4C90 46.2 90 31.5 90 31.5s0-14.7-1.9-21.6z" />
                            <path d="M36 45l24-13.5L36 18v27z" fill="red" />
                          </svg>
                        </div>
                      )}
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
