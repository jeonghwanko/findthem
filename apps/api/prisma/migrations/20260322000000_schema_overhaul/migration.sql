-- UUIDv7 함수 (로그 테이블 시간순 ID 생성)
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  uuid_bytes = set_byte(uuid_bytes, 8, (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$ LANGUAGE plpgsql VOLATILE;

-- PostGIS + pg_trgm 확장 (geography 타입 사용 전에 활성화)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "inquiry_category" AS ENUM ('PAYMENT', 'REPORT', 'GENERAL', 'PARTNERSHIP');

-- CreateEnum
CREATE TYPE "inquiry_status" AS ENUM ('OPEN', 'REPLIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "chat_role" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "reward_type" AS ENUM ('BADGE', 'TITLE', 'EFFECT');

-- CreateEnum
CREATE TYPE "xp_action" AS ENUM ('AD_WATCH', 'SIGHTING', 'COMMUNITY_POST', 'COMMUNITY_COMMENT', 'SHARE', 'REFERRAL', 'SPONSOR', 'GAME');

-- CreateEnum
CREATE TYPE "sponsor_currency" AS ENUM ('KRW', 'USD_CENTS');

-- CreateEnum
CREATE TYPE "outreach_contact_type" AS ENUM ('JOURNALIST', 'YOUTUBER', 'VIDEO');

-- CreateEnum
CREATE TYPE "outreach_source" AS ENUM ('GOOGLE_SEARCH', 'MANUAL', 'YOUTUBE_API', 'VIDEO_SEARCH');

-- CreateEnum
CREATE TYPE "outreach_request_status" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "outreach_channel" AS ENUM ('EMAIL', 'YOUTUBE_COMMENT');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('MATCH_FOUND', 'SIGHTING_RECEIVED', 'REPORT_ANALYZED', 'LEVEL_UP', 'SYSTEM');

-- DropForeignKey
ALTER TABLE "outreach_request" DROP CONSTRAINT "outreach_request_contactId_fkey";

-- DropForeignKey
ALTER TABLE "promotion" DROP CONSTRAINT "promotion_parentId_fkey";

-- DropForeignKey
ALTER TABLE "report_photo" DROP CONSTRAINT "report_photo_reportId_fkey";

-- DropForeignKey
ALTER TABLE "sighting_photo" DROP CONSTRAINT "sighting_photo_sightingId_fkey";

-- DropIndex
DROP INDEX "community_post_deduplicationKey_idx";

-- DropIndex
DROP INDEX "report_lastSeenLat_lastSeenLng_idx";

-- DropIndex
DROP INDEX "sighting_lat_lng_idx";

-- DropIndex
DROP INDEX "sponsor_agentId_idx";

-- DropIndex
DROP INDEX "user_reward_userId_idx";

-- AlterTable
ALTER TABLE "admin_audit_log" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7();

-- AlterTable
ALTER TABLE "agent_decision_log" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7();

-- AlterTable
ALTER TABLE "ai_usage_log" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7();

-- AlterTable
ALTER TABLE "chat_message" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7(),
DROP COLUMN "role",
ADD COLUMN     "role" "chat_role" NOT NULL;

-- AlterTable
ALTER TABLE "game_play" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7();

-- AlterTable
ALTER TABLE "outreach_contact" DROP COLUMN "type",
ADD COLUMN     "type" "outreach_contact_type" NOT NULL,
DROP COLUMN "source",
ADD COLUMN     "source" "outreach_source";

-- AlterTable
ALTER TABLE "outreach_request" DROP COLUMN "channel",
ADD COLUMN     "channel" "outreach_channel" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "outreach_request_status" NOT NULL DEFAULT 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "promotion" DROP COLUMN "parentId";

-- AlterTable
ALTER TABLE "promotion_log" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7();

-- AlterTable
ALTER TABLE "report" ADD COLUMN     "location" geography(Point,4326);

-- AlterTable
ALTER TABLE "sighting" ADD COLUMN     "location" geography(Point,4326),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "sponsor" ADD COLUMN     "quoteId" TEXT,
DROP COLUMN "currency",
ADD COLUMN     "currency" "sponsor_currency" NOT NULL DEFAULT 'KRW',
ALTER COLUMN "orderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "sponsorXp",
DROP COLUMN "sponsorXpLastAt",
DROP COLUMN "userLevel",
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xpLastAt" TIMESTAMP(3),
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "user_reward" DROP COLUMN "rewardType",
ADD COLUMN     "rewardType" "reward_type" NOT NULL;

-- AlterTable
ALTER TABLE "xp_log" ALTER COLUMN "id" SET DEFAULT uuid_generate_v7(),
DROP COLUMN "action",
ADD COLUMN     "action" "xp_action" NOT NULL;

-- DropTable
DROP TABLE "report_photo";

-- DropTable
DROP TABLE "sighting_photo";

-- CreateTable
CREATE TABLE "photo" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "sightingId" TEXT,
    "photoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "aiAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL DEFAULT uuid_generate_v7(),
    "userId" TEXT NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "category" "inquiry_category" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "inquiry_status" NOT NULL DEFAULT 'OPEN',
    "replyContent" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "photo_reportId_isPrimary_idx" ON "photo"("reportId", "isPrimary");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "photo_sightingId_idx" ON "photo"("sightingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_userId_isRead_createdAt_idx" ON "notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_userId_createdAt_idx" ON "notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inquiry_userId_idx" ON "inquiry"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inquiry_status_idx" ON "inquiry"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "game_play_userId_usedAd_playedAt_idx" ON "game_play"("userId", "usedAd", "playedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "match_reportId_idx" ON "match"("reportId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outreach_contact_type_isActive_idx" ON "outreach_contact"("type", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outreach_request_status_idx" ON "outreach_request"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outreach_request_reportId_status_idx" ON "outreach_request"("reportId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outreach_request_channel_sentAt_idx" ON "outreach_request"("channel", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "outreach_request_reportId_contactId_channel_key" ON "outreach_request"("reportId", "contactId", "channel");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "report_createdAt_idx" ON "report"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sighting_userId_idx" ON "sighting"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sighting_createdAt_idx" ON "sighting"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sponsor_txHash_key" ON "sponsor"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sponsor_quoteId_key" ON "sponsor"("quoteId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sponsor_agentId_createdAt_idx" ON "sponsor"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sponsor_crypto_quote_expiresAt_idx" ON "sponsor_crypto_quote"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "xp_log_userId_action_createdAt_idx" ON "xp_log"("userId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_sightingId_fkey" FOREIGN KEY ("sightingId") REFERENCES "sighting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_request" ADD CONSTRAINT "outreach_request_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "outreach_contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor" ADD CONSTRAINT "sponsor_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "sponsor_crypto_quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

