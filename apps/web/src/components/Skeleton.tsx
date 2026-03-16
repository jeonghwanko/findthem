/** Reusable skeleton primitives for loading states. */

interface SkeletonProps {
  className?: string;
}

/** Generic pulsing block — pass any Tailwind size/shape classes. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

/** Skeleton matching ReportCard layout (aspect-[4/3] image + text lines). */
export function ReportCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="aspect-[4/3] bg-gray-200 animate-pulse" />
      <div className="p-3.5 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse" />
        <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
        <div className="flex justify-between pt-2.5 mt-2.5 border-t border-gray-100">
          <div className="h-3 bg-gray-200 rounded w-16 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for ReportDetailPage (photo gallery + info card). */
export function ReportDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Status badges */}
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      {/* Title */}
      <Skeleton className="h-9 w-2/3 mb-6" />
      {/* Main photo */}
      <div className="mb-6">
        <div className="aspect-[4/3] bg-gray-200 rounded-xl animate-pulse mb-3" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-16 h-16 rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      {/* Contact */}
      <div className="bg-primary-50 rounded-xl p-6 mb-6">
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      {/* Buttons */}
      <div className="flex gap-3 mb-8">
        <Skeleton className="flex-1 h-12 rounded-xl" />
        <Skeleton className="flex-1 h-12 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton for a single sponsor list item. */
export function SponsorItemSkeleton() {
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
      <Skeleton className="h-3 w-16 shrink-0 mt-1" />
    </li>
  );
}

/** Skeleton for agent total amount in card. */
export function AgentTotalSkeleton() {
  return (
    <div className="text-center py-2 px-3 bg-primary-50 rounded-lg">
      <Skeleton className="h-3 w-16 mx-auto mb-1" />
      <Skeleton className="h-6 w-24 mx-auto" />
    </div>
  );
}
