-- CreateTable
CREATE TABLE "game_play" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "character" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_play_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_play_userId_playedAt_idx" ON "game_play"("userId", "playedAt");

-- AddForeignKey
ALTER TABLE "game_play" ADD CONSTRAINT "game_play_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
