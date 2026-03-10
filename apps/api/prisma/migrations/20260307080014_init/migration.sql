-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('LOCAL', 'KAKAO');

-- CreateEnum
CREATE TYPE "subject_type" AS ENUM ('PERSON', 'DOG', 'CAT');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('ACTIVE', 'FOUND', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "sighting_source" AS ENUM ('WEB', 'KAKAO_CHATBOT', 'ADMIN');

-- CreateEnum
CREATE TYPE "sighting_status" AS ENUM ('PENDING', 'ANALYZED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'NOTIFIED');

-- CreateEnum
CREATE TYPE "promo_platform" AS ENUM ('KAKAO_CHANNEL', 'TWITTER');

-- CreateEnum
CREATE TYPE "promo_status" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "chat_platform" AS ENUM ('WEB', 'KAKAO');

-- CreateEnum
CREATE TYPE "chat_status" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "provider" "auth_provider" NOT NULL DEFAULT 'LOCAL',
    "providerId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectType" "subject_type" NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "species" TEXT,
    "gender" "gender",
    "age" TEXT,
    "weight" TEXT,
    "height" TEXT,
    "color" TEXT,
    "features" TEXT NOT NULL,
    "clothingDesc" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAddress" TEXT NOT NULL,
    "lastSeenLat" DOUBLE PRECISION,
    "lastSeenLng" DOUBLE PRECISION,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "reward" TEXT,
    "aiDescription" TEXT,
    "aiPromoText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_photo" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "aiAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sighting" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "userId" TEXT,
    "source" "sighting_source" NOT NULL DEFAULT 'WEB',
    "description" TEXT NOT NULL,
    "sightedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "tipsterPhone" TEXT,
    "tipsterName" TEXT,
    "aiAnalysis" JSONB,
    "status" "sighting_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sighting_photo" (
    "id" TEXT NOT NULL,
    "sightingId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "aiAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sighting_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sightingId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "aiReasoning" TEXT NOT NULL,
    "status" "match_status" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "platform" "promo_platform" NOT NULL,
    "postId" TEXT,
    "postUrl" TEXT,
    "content" TEXT NOT NULL,
    "imageUrls" TEXT[],
    "status" "promo_status" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "reportId" TEXT,
    "platform" "chat_platform" NOT NULL,
    "platformUserId" TEXT,
    "state" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "status" "chat_status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE INDEX "report_status_idx" ON "report"("status");

-- CreateIndex
CREATE INDEX "report_subjectType_status_idx" ON "report"("subjectType", "status");

-- CreateIndex
CREATE INDEX "sighting_reportId_idx" ON "sighting"("reportId");

-- CreateIndex
CREATE INDEX "sighting_status_idx" ON "sighting"("status");

-- CreateIndex
CREATE INDEX "match_reportId_confidence_idx" ON "match"("reportId", "confidence");

-- CreateIndex
CREATE INDEX "match_status_idx" ON "match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "match_reportId_sightingId_key" ON "match"("reportId", "sightingId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_reportId_platform_key" ON "promotion"("reportId", "platform");

-- CreateIndex
CREATE INDEX "chat_session_platformUserId_platform_idx" ON "chat_session"("platformUserId", "platform");

-- CreateIndex
CREATE INDEX "chat_message_sessionId_createdAt_idx" ON "chat_message"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_photo" ADD CONSTRAINT "report_photo_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sighting" ADD CONSTRAINT "sighting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sighting_photo" ADD CONSTRAINT "sighting_photo_sightingId_fkey" FOREIGN KEY ("sightingId") REFERENCES "sighting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_sightingId_fkey" FOREIGN KEY ("sightingId") REFERENCES "sighting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
