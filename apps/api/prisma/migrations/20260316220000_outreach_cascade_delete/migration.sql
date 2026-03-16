-- DropForeignKey
ALTER TABLE "outreach_request" DROP CONSTRAINT "outreach_request_reportId_fkey";

-- AddForeignKey
ALTER TABLE "outreach_request" ADD CONSTRAINT "outreach_request_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
