import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, MapPin } from 'lucide-react';
import type { Sighting } from '../api/client';
import { formatTimeAgo, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@findthem/shared';

interface SightingCardProps {
  sighting: Sighting;
}

export default function SightingCard({ sighting }: SightingCardProps) {
  const { t, i18n } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const photo = sighting.photos?.[0];
  const locale = SUPPORTED_LOCALES.find(l => i18n.language === l || i18n.language.startsWith(`${l}-`) || (l === 'zh-TW' && i18n.language.startsWith('zh'))) ?? DEFAULT_LOCALE;
  const timeAgo = formatTimeAgo(sighting.createdAt, locale);
  const linkTo = sighting.reportId ? `/reports/${sighting.reportId}` : '#';

  return (
    <Link
      to={linkTo}
      className="group block bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all overflow-hidden"
    >
      {/* 이미지 */}
      <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
        {photo && !imgError ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-gray-200 animate-pulse" />}
            <img
              src={photo.thumbnailUrl || photo.photoUrl}
              alt=""
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${imgLoaded ? '' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
            <Camera className="w-8 h-8" />
          </div>
        )}

        {/* 제보 배지 */}
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {t('browse.labelSighting')}
        </span>
      </div>

      {/* 텍스트 */}
      <div className="p-3.5">
        <h3 className="font-semibold text-gray-900 truncate text-sm">
          {sighting.description || t('myReports.sightingNoDesc')}
        </h3>
        <p className="text-xs text-gray-400 mt-1 truncate flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{sighting.address}</span>
        </p>
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 text-xs text-gray-400">
          <span>{timeAgo}</span>
        </div>
      </div>
    </Link>
  );
}
