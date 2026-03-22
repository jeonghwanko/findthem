import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, MapPin, Clock } from 'lucide-react';
import type { Sighting } from '../api/client';
import { formatTimeAgo } from '@findthem/shared';
import { assetSrc } from '../utils/webOrigin';

interface SightingCardProps {
  sighting: Sighting;
}

export default function SightingCard({ sighting }: SightingCardProps) {
  const { t } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const photo = sighting.photos?.[0];
  const timeAgo = formatTimeAgo(sighting.createdAt, 'ko');
  const linkTo = `/sightings/${sighting.id}`;

  return (
    <Link
      to={linkTo}
      className="group block bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-200 overflow-hidden"
    >
      {/* 이미지 */}
      <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
        {photo && !imgError ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-gray-200 animate-pulse" />}
            <img
              src={assetSrc(photo.thumbnailUrl || photo.photoUrl)}
              alt=""
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300" role="img" aria-label={t('browse.noPhoto')}>
            <Camera className="w-8 h-8" aria-hidden="true" />
          </div>
        )}

        {/* 제보 배지 */}
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          {t('browse.labelSighting')}
        </span>
      </div>

      {/* 텍스트 */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 truncate text-sm leading-snug">
          {sighting.description || t('myReports.sightingNoDesc')}
        </h3>
        <p className="text-xs text-gray-400 mt-1.5 truncate flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0 text-gray-300" aria-hidden="true" />
          <span className="truncate">{sighting.address}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <Clock className="w-3 h-3 shrink-0 text-gray-300" aria-hidden="true" />
          <span>{timeAgo}</span>
        </p>
      </div>
    </Link>
  );
}
