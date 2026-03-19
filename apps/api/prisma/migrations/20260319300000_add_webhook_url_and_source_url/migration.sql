-- AlterTable
ALTER TABLE "external_agent" ADD COLUMN "webhookUrl" TEXT;

-- AlterTable
ALTER TABLE "community_post" ADD COLUMN "sourceUrl" TEXT;

-- CreateIndex
CREATE INDEX "community_post_deduplicationKey_idx" ON "community_post"("deduplicationKey");

-- CreateIndex
CREATE INDEX "community_post_sourceUrl_idx" ON "community_post"("sourceUrl");
