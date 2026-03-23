-- AlterTable: Add gameType column with default 'stair'
ALTER TABLE "game_play" ADD COLUMN "gameType" TEXT NOT NULL DEFAULT 'stair';

-- CreateIndex
CREATE INDEX "game_play_userId_gameType_playedAt_idx" ON "game_play"("userId", "gameType", "playedAt");
