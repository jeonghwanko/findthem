-- CreateTable: XpLog
CREATE TABLE "xp_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "xpAmount" INTEGER NOT NULL,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "xp_log_userId_action_createdAt_idx" ON "xp_log"("userId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "xp_log_userId_createdAt_idx" ON "xp_log"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "xp_log" ADD CONSTRAINT "xp_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: User에 referredByUserId 추가
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_referredByUserId_idx" ON "user"("referredByUserId");

-- AddForeignKey (self-relation)
ALTER TABLE "user" ADD CONSTRAINT "user_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
