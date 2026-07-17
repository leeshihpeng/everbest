-- 新增對外公開分享連結用的隨機識別碼。既有資料先逐筆補上隨機值（每筆不同），
-- 再設為 NOT NULL 並加上唯一索引。
ALTER TABLE "InspectionReport" ADD COLUMN "shareToken" TEXT;

UPDATE "InspectionReport"
SET "shareToken" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "shareToken" IS NULL;

ALTER TABLE "InspectionReport" ALTER COLUMN "shareToken" SET NOT NULL;

CREATE UNIQUE INDEX "InspectionReport_shareToken_key" ON "InspectionReport"("shareToken");
