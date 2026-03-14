-- CreateEnum
CREATE TYPE "promo_urgency" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "admin_action_source" AS ENUM ('DASHBOARD', 'AGENT', 'API');

-- DropIndex
DROP INDEX "promotion_reportId_platform_key";

-- AlterTable
ALTER TABLE "chat_session" ADD COLUMN     "engineVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'ko';

-- AlterTable
ALTER TABLE "promotion" ADD COLUMN     "metrics" JSONB,
ADD COLUMN     "metricsAt" TIMESTAMP(3),
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "sighting" ADD COLUMN     "subjectType" "subject_type";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'ko';

-- CreateTable
CREATE TABLE "promotion_strategy" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "urgency" "promo_urgency" NOT NULL DEFAULT 'MEDIUM',
    "targetPlatforms" "promo_platform"[],
    "repostIntervalH" INTEGER NOT NULL DEFAULT 72,
    "maxReposts" INTEGER NOT NULL DEFAULT 3,
    "keywords" TEXT[],
    "hashtags" TEXT[],
    "aiReasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_log" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" JSONB,
    "source" "admin_action_source" NOT NULL,
    "agentSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_agent_session" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_agent_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotion_strategy_reportId_key" ON "promotion_strategy"("reportId");

-- CreateIndex
CREATE INDEX "promotion_log_reportId_createdAt_idx" ON "promotion_log"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_log_targetType_targetId_idx" ON "admin_audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "admin_audit_log_createdAt_idx" ON "admin_audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_reportId_platform_key" ON "promotion"("reportId", "platform");

-- CreateIndex
CREATE INDEX "promotion_status_idx" ON "promotion"("status");

-- AddForeignKey
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_strategy" ADD CONSTRAINT "promotion_strategy_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_log" ADD CONSTRAINT "promotion_log_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
