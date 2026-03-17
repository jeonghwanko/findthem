-- CreateTable
CREATE TABLE "community_post" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_post_createdAt_idx" ON "community_post"("createdAt");
CREATE INDEX "community_post_userId_idx" ON "community_post"("userId");
CREATE INDEX "community_post_agentId_idx" ON "community_post"("agentId");

-- CreateIndex
CREATE INDEX "community_comment_postId_createdAt_idx" ON "community_comment"("postId", "createdAt");
CREATE INDEX "community_comment_userId_idx" ON "community_comment"("userId");

-- AddForeignKey
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_comment" ADD CONSTRAINT "community_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
