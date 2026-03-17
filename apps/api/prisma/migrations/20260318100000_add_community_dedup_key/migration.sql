-- AlterTable
ALTER TABLE "community_post" ADD COLUMN IF NOT EXISTS "deduplicationKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "community_post_agentId_deduplicationKey_key" ON "community_post"("agentId", "deduplicationKey");
