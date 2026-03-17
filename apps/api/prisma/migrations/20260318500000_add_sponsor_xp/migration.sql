-- AlterTable: User에 후원 XP & 레벨 필드 추가
ALTER TABLE "user" ADD COLUMN "sponsorXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN "userLevel" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "user" ADD COLUMN "sponsorXpLastAt" TIMESTAMP(3);

-- CreateTable: UserReward
CREATE TABLE "user_reward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardValue" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_reward_userId_idx" ON "user_reward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_reward_userId_level_key" ON "user_reward"("userId", "level");

-- AddForeignKey
ALTER TABLE "user_reward" ADD CONSTRAINT "user_reward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
