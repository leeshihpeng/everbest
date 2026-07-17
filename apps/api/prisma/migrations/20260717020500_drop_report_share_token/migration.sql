-- 改為以手機系統分享清單直接夾帶 PDF 檔案傳送，不再使用對外公開連結，
-- 因此移除公開連結用的識別碼（公開端點已一併移除）。
DROP INDEX IF EXISTS "InspectionReport_shareToken_key";
ALTER TABLE "InspectionReport" DROP COLUMN "shareToken";
