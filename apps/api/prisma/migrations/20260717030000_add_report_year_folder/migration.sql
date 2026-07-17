-- 年份目錄（可為空目錄，供最高權限者先建立再上傳報告）
CREATE TABLE "ReportYear" (
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportYear_pkey" PRIMARY KEY ("year")
);

-- 既有報告的年份補建目錄，避免現有 2026 目錄消失
INSERT INTO "ReportYear" ("year")
SELECT DISTINCT "year" FROM "InspectionReport"
ON CONFLICT ("year") DO NOTHING;
