/*
  Warnings:

  - A unique constraint covering the columns `[txHash]` on the table `sponsor` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "community_post_createdAt_idx";

-- AlterTable
ALTER TABLE "outreach_contact" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "community_post_isPinned_createdAt_idx" ON "community_post"("isPinned", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outreach_request_reportId_status_idx" ON "outreach_request"("reportId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "promotion_log_reportId_action_createdAt_idx" ON "promotion_log"("reportId", "action", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "report_userId_idx" ON "report"("userId");

-- sponsor_txHash_key: 이미 20260316_fix_crypto_sponsor_security에서 partial unique index로 생성됨
