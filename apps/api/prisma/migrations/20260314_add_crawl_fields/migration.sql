-- AlterTable: report.userId nullable
ALTER TABLE "report" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable: report에 외부 수집 필드 추가
ALTER TABLE "report" ADD COLUMN "external_id" TEXT;
ALTER TABLE "report" ADD COLUMN "external_source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "report_external_id_external_source_key" ON "report"("external_id", "external_source");
CREATE INDEX "report_external_source_idx" ON "report"("external_source");
