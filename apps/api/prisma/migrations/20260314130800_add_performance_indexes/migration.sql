-- CreateIndex
CREATE INDEX "admin_audit_log_source_createdAt_idx" ON "admin_audit_log"("source", "createdAt");

-- CreateIndex
CREATE INDEX "chat_session_platformUserId_platform_status_idx" ON "chat_session"("platformUserId", "platform", "status");

-- CreateIndex
CREATE INDEX "promotion_reportId_status_postedAt_idx" ON "promotion"("reportId", "status", "postedAt");

-- CreateIndex
CREATE INDEX "report_photo_reportId_idx" ON "report_photo"("reportId");

-- CreateIndex
CREATE INDEX "sighting_photo_sightingId_idx" ON "sighting_photo"("sightingId");
