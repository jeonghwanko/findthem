-- ══════════════════════════════════════════════════════════════
-- FindThem DB 성능 최적화 스크립트
-- prisma migrate reset 후 실행: psql $DATABASE_URL -f optimize.sql
-- ══════════════════════════════════════════════════════════════

-- ── 1. UUIDv7 함수 (시간 순서 ID — B-tree 순차 삽입 최적화) ──

CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  -- version 7
  uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  -- variant 10
  uuid_bytes = set_byte(uuid_bytes, 8, (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;

-- ── 2. PostGIS 확장 + geography 컬럼 + GiST 인덱스 ──

CREATE EXTENSION IF NOT EXISTS postgis;

-- Report: location 컬럼 (Prisma Unsupported로 선언됨, 여기서 인덱스 + 트리거 추가)
CREATE INDEX IF NOT EXISTS "report_location_gist_idx"
  ON "report" USING GIST ("location");

-- Sighting: location 컬럼
CREATE INDEX IF NOT EXISTS "sighting_location_gist_idx"
  ON "sighting" USING GIST ("location");

-- Report: lat/lng → location 자동 동기화 트리거
CREATE OR REPLACE FUNCTION sync_report_location() RETURNS trigger AS $$
BEGIN
  IF NEW."lastSeenLat" IS NOT NULL AND NEW."lastSeenLng" IS NOT NULL THEN
    NEW."location" = ST_SetSRID(ST_MakePoint(NEW."lastSeenLng", NEW."lastSeenLat"), 4326)::geography;
  ELSE
    NEW."location" = NULL;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_sync_location ON "report";
CREATE TRIGGER trg_report_sync_location
  BEFORE INSERT OR UPDATE OF "lastSeenLat", "lastSeenLng" ON "report"
  FOR EACH ROW EXECUTE FUNCTION sync_report_location();

-- Sighting: lat/lng → location 자동 동기화 트리거
CREATE OR REPLACE FUNCTION sync_sighting_location() RETURNS trigger AS $$
BEGIN
  IF NEW."lat" IS NOT NULL AND NEW."lng" IS NOT NULL THEN
    NEW."location" = ST_SetSRID(ST_MakePoint(NEW."lng", NEW."lat"), 4326)::geography;
  ELSE
    NEW."location" = NULL;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sighting_sync_location ON "sighting";
CREATE TRIGGER trg_sighting_sync_location
  BEFORE INSERT OR UPDATE OF "lat", "lng" ON "sighting"
  FOR EACH ROW EXECUTE FUNCTION sync_sighting_location();

-- ── 3. Photo partial indexes (NULL 행 제외 → 인덱스 크기 절감) ──

-- Prisma가 생성한 full index를 partial로 교체
DROP INDEX IF EXISTS "photo_report_id_is_primary_idx";
DROP INDEX IF EXISTS "photo_sighting_id_idx";

CREATE INDEX "photo_report_partial_idx"
  ON "photo" ("reportId", "isPrimary") WHERE "reportId" IS NOT NULL;

CREATE INDEX "photo_sighting_partial_idx"
  ON "photo" ("sightingId") WHERE "sightingId" IS NOT NULL;

-- ── 4. pg_trgm + GIN 전문 검색 (커뮤니티 게시글 title + content) ──

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "community_post_search_gin_idx"
  ON "community_post" USING GIN (
    (COALESCE("title", '') || ' ' || COALESCE("content", '')) gin_trgm_ops
  );

-- ── 5. 로그 테이블 retention 함수 (90일 이전 자동 삭제) ──
-- BullMQ cron 또는 pg_cron으로 매일 실행: SELECT cleanup_old_logs();

CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days int DEFAULT 90)
RETURNS TABLE(table_name text, deleted_count bigint) AS $$
DECLARE
  cutoff timestamp := NOW() - (retention_days || ' days')::interval;
  r record;
  cnt bigint;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'ai_usage_log',
      'agent_decision_log',
      'promotion_log',
      'admin_audit_log',
      'xp_log'
    ]) AS tbl
  LOOP
    EXECUTE format('DELETE FROM %I WHERE "createdAt" < $1', r.tbl) USING cutoff;
    GET DIAGNOSTICS cnt = ROW_COUNT;
    table_name := r.tbl;
    deleted_count := cnt;
    RETURN NEXT;
  END LOOP;
END
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════
-- 적용 방법:
--   cd apps/api
--   npx prisma migrate reset    # 스키마 적용 + DB 초기화
--   psql $DATABASE_URL -f prisma/optimize.sql  # 이 스크립트 실행
--
-- 반경 검색 쿼리 예시 (PostGIS):
--   SELECT * FROM "sighting"
--   WHERE ST_DWithin("location", ST_MakePoint(127.0, 37.5)::geography, 50000)
--   -- 50000 = 50km in meters
--
-- 커뮤니티 검색 쿼리 예시 (pg_trgm):
--   SELECT * FROM "community_post"
--   WHERE (COALESCE("title", '') || ' ' || COALESCE("content", '')) ILIKE '%검색어%'
--   -- GIN 인덱스가 ILIKE 패턴 매칭을 가속
--
-- 로그 정리 실행:
--   SELECT * FROM cleanup_old_logs(90);  -- 90일 이전 삭제
-- ══════════════════════════════════════════════════════════════
