-- DropForeignKey (recreate with ON DELETE SET NULL)
ALTER TABLE "report" DROP CONSTRAINT "report_userId_fkey";

-- DropIndex (snake_case → camelCase)
DROP INDEX "report_external_id_external_source_key";
DROP INDEX "report_external_source_idx";

-- AlterTable: Fix report columns (snake_case → camelCase)
ALTER TABLE "report" DROP COLUMN "external_id",
DROP COLUMN "external_source",
ADD COLUMN "externalId" TEXT,
ADD COLUMN "externalSource" TEXT;

-- CreateIndex
CREATE INDEX "report_externalSource_idx" ON "report"("externalSource");
CREATE UNIQUE INDEX "report_externalId_externalSource_key" ON "report"("externalId", "externalSource");

-- AddForeignKey (nullable)
ALTER TABLE "report" ADD CONSTRAINT "report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
