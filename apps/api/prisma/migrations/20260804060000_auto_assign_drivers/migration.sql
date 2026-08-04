-- 派遣單匯入後直接指派給送貨人員（不再經過物流管理勾選）所需的兩個欄位。

-- 送貨人員負責的配送縣市，逗號分隔。空值／空字串＝後備，接收其他所有縣市。
ALTER TABLE "Staff" ADD COLUMN "dispatchCities" TEXT;

-- 送貨人員取消勾選「這趟不送」的單子：留在名單上但不排進路線
ALTER TABLE "DispatchOrder" ADD COLUMN "inRoute" BOOLEAN NOT NULL DEFAULT true;

-- 目前的分工（使用者 2026-08-04 指定）：台北市由李恭戎送，其餘由邱炫誠送。
-- 空字串代表後備，與「還沒設定」的 NULL 意義相同，但寫出來比較清楚是刻意的。
-- 之後要改分工不必動程式，從內勤後台「人員」編輯配送縣市即可。
UPDATE "Staff" SET "dispatchCities" = '台北市' WHERE "name" = '李恭戎';
UPDATE "Staff" SET "dispatchCities" = ''       WHERE "name" = '邱炫誠';
