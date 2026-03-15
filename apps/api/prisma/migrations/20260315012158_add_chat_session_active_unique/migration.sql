-- RACE-07: ChatSession ACTIVE 세션 중복 방지
-- 동일 사용자+플랫폼 조합에서 ACTIVE 세션이 동시에 여러 개 생성되는 race condition 방지.
-- schema.prisma의 @@unique는 partial index를 지원하지 않으므로 raw SQL 마이그레이션 사용.
-- 이 인덱스는 status = 'ACTIVE'인 행에만 적용되므로 COMPLETED/ABANDONED 세션에는 영향 없음.
CREATE UNIQUE INDEX "chat_session_active_platform_user_unique"
ON "chat_session" ("platformUserId", "platform")
WHERE ("status" = 'ACTIVE');