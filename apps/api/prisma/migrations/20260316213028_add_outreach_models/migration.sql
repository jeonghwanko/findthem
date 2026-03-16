-- CreateTable
CREATE TABLE "outreach_contact" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "youtubeChannelId" TEXT,
    "youtubeChannelUrl" TEXT,
    "organization" TEXT,
    "topics" TEXT[],
    "subscriberCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastContactedAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_request" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "draftSubject" TEXT,
    "draftContent" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "externalId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_contact_email_key" ON "outreach_contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_contact_youtubeChannelId_key" ON "outreach_contact"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "outreach_contact_type_isActive_idx" ON "outreach_contact"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_request_reportId_contactId_channel_key" ON "outreach_request"("reportId", "contactId", "channel");

-- CreateIndex
CREATE INDEX "outreach_request_status_idx" ON "outreach_request"("status");

-- AddForeignKey
ALTER TABLE "outreach_request" ADD CONSTRAINT "outreach_request_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_request" ADD CONSTRAINT "outreach_request_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "outreach_contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
