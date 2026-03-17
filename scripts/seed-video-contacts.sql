-- ============================================================
-- VIDEO 아웃리치 컨택 시드 데이터 (로컬 dev → 실서버 마이그레이션)
-- 실서버에서: psql -d union -f seed-video-contacts.sql
-- ============================================================

BEGIN;

-- 1. outreach_contact upsert (videoId 키)
INSERT INTO outreach_contact (id, type, name, "youtubeChannelId", "youtubeChannelUrl", "videoId", "videoTitle", topics, "subscriberCount", "viewCount", "isActive", source, "createdAt")
VALUES
  ('oc-001','VIDEO','고양이탐정',NULL,NULL,'dQw4w9WgXcQ','길고양이 실종 사건 추적기',ARRAY['고양이','실종','반려동물']::text[],NULL,NULL,true,NULL,'2026-03-17 11:42:54.461'),
  ('oc-002','VIDEO','멍냥이TV',NULL,NULL,'jNQXAC9IVRw','우리 강아지가 사라졌어요',ARRAY['강아지','실종','반려동물']::text[],NULL,NULL,true,NULL,'2026-03-17 11:42:54.461'),
  ('oc-003','VIDEO','동물보호채널',NULL,NULL,'M7lc1UVf-VE','유기동물 입양 캠페인 현장',ARRAY['유기동물','입양','보호']::text[],NULL,NULL,true,NULL,'2026-03-17 11:42:54.461'),
  ('oc-004','VIDEO','반려동물뉴스',NULL,NULL,'9bZkp7q19f0','반려동물 실종 대처법 완벽 가이드',ARRAY['실종','대처','반려동물']::text[],NULL,NULL,true,NULL,'2026-03-17 11:42:54.461'),
  ('oc-005','VIDEO','냥이탐정단',NULL,NULL,'kJQP7kiw5Fk','고양이 실종 3일 만에 찾았습니다',ARRAY['고양이','실종','성공사례']::text[],NULL,NULL,true,NULL,'2026-03-17 11:42:54.461'),
  ('oc-006','VIDEO','강아지찾기TV',NULL,NULL,'RgKAFK5djSk','실종견 목격 제보 시스템 소개',ARRAY['강아지','제보','AI']::text[],NULL,NULL,true,NULL,'2026-03-17 11:42:54.461')
ON CONFLICT ("videoId") DO UPDATE SET
  name         = EXCLUDED.name,
  "videoTitle" = EXCLUDED."videoTitle",
  "viewCount"  = EXCLUDED."viewCount",
  "isActive"   = EXCLUDED."isActive";

-- 2. outreach_request: 실서버의 첫 번째 ACTIVE 신고에 연결
--    reportId가 없으면 건너뜀
DO $$
DECLARE
  v_report_id text;
BEGIN
  SELECT id INTO v_report_id FROM report WHERE status = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 1;

  IF v_report_id IS NULL THEN
    RAISE NOTICE 'ACTIVE 신고 없음 — outreach_request 생성 스킵';
    RETURN;
  END IF;

  INSERT INTO outreach_request (id, "reportId", "contactId", channel, status, "draftContent", "createdAt")
  SELECT
    'or-seed-' || oc.id,
    v_report_id,
    oc.id,
    'YOUTUBE_COMMENT',
    'PENDING_APPROVAL',
    '',
    now()
  FROM outreach_contact oc
  WHERE oc.id IN ('oc-001','oc-002','oc-003','oc-004','oc-005','oc-006')
  ON CONFLICT ("reportId", "contactId", channel) DO NOTHING;

  RAISE NOTICE '연결된 reportId: %', v_report_id;
END $$;

COMMIT;

-- 확인 쿼리
SELECT oc."videoId", oc.name, oc."videoTitle", r.status
FROM outreach_contact oc
LEFT JOIN outreach_request orq ON orq."contactId" = oc.id
LEFT JOIN report r ON r.id = orq."reportId"
WHERE oc.type = 'VIDEO'
ORDER BY oc."createdAt";
