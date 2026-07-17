-- 新增報告年份分類。既有 13 筆皆為 2026 檢驗報告，先以 DEFAULT 2026 回填，
-- 再移除預設值，之後新增報告一律須明確指定年份。
ALTER TABLE "InspectionReport" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 2026;
ALTER TABLE "InspectionReport" ALTER COLUMN "year" DROP DEFAULT;

-- 依年份查詢用
CREATE INDEX "InspectionReport_year_idx" ON "InspectionReport"("year");
