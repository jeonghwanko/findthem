-- AlterEnum
ALTER TYPE "auth_provider" ADD VALUE 'NAVER';
ALTER TYPE "auth_provider" ADD VALUE 'TELEGRAM';

-- CreateIndex (소셜 로그인 유저 조회용 — 레이스 컨디션 방지)
CREATE UNIQUE INDEX "user_provider_providerId_key" ON "user"("provider", "providerId");
