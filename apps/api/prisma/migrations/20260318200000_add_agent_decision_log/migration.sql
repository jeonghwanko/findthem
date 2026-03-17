-- CreateTable
CREATE TABLE "agent_decision_log" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "selectedAction" TEXT NOT NULL,
    "stayedSilent" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "reportId" TEXT,
    "postId" TEXT,
    "candidateScores" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_decision_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_decision_log_agentId_createdAt_idx" ON "agent_decision_log"("agentId", "createdAt");
