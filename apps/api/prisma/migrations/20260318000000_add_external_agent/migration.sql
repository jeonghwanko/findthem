CREATE TABLE "external_agent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "avatarUrl" TEXT,
  "apiKey" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "external_agent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_agent_apiKey_key" ON "external_agent"("apiKey");

ALTER TABLE "community_post" ADD COLUMN "externalAgentId" TEXT;
ALTER TABLE "community_comment" ADD COLUMN "externalAgentId" TEXT;

ALTER TABLE "community_post" ADD CONSTRAINT "community_post_externalAgentId_fkey"
  FOREIGN KEY ("externalAgentId") REFERENCES "external_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_externalAgentId_fkey"
  FOREIGN KEY ("externalAgentId") REFERENCES "external_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "community_post_externalAgentId_idx" ON "community_post"("externalAgentId");
CREATE INDEX "community_comment_externalAgentId_idx" ON "community_comment"("externalAgentId");
