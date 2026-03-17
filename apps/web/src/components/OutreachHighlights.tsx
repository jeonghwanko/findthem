import { useState, useEffect } from 'react';
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
  const [items, setItems] = useState<OutreachHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<OutreachHighlightsResponse>('/outreach/highlights')
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <div className="bg-white border-b border-gray-100 py-5 px-4">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          우리가 연락한 유튜버들
        </p>

        <div
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'thin' }}
        >
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            : items.map((item) => (
                <a
                  key={item.videoId}
                  href={`https://www.youtube.com/watch?v=${item.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 w-48 rounded-xl overflow-hidden border border-gray-100 bg-white hover:border-primary-200 hover:shadow-md transition-all snap-start group"
                >
                  <div className="relative w-full aspect-video overflow-hidden bg-gray-100">
                    <img
                      src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                      alt={item.videoTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                      <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                        <svg
                          viewBox="0 0 24 24"
                          fill="white"
                          className="w-4 h-4 ml-0.5"
                        >
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
  );
}
