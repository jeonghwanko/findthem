export interface CurrentTimeResult {
  iso: string;
  formatted: string;
}

export function getCurrentTime(): CurrentTimeResult {
  const now = new Date();
  const iso = now.toISOString();

  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hours = String(kst.getUTCHours()).padStart(2, '0');
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');

  const formatted = `${year}년 ${month}월 ${day}일 ${hours}시 ${minutes}분`;

  return { iso, formatted };
}
