-- AlterTable: OutreachContact에 VIDEO 타입 지원 필드 추가
ALTER TABLE "outreach_contact" ADD COLUMN IF NOT EXISTS "videoId" TEXT;
ALTER TABLE "outreach_contact" ADD COLUMN IF NOT EXISTS "videoTitle" TEXT;
ALTER TABLE "outreach_contact" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "outreach_contact_videoId_key" ON "outreach_contact"("videoId");
