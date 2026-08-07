-- 客戶／員工主檔改為與三順記帳系統共用。
-- 兩個欄位都是可加欄位（有預設值／可為空），對現有資料無破壞性。

-- 記帳系統匯入應收帳款時自動補建的客戶只有名稱與編號，沒有地址與縣市。
-- 標記起來讓配送相關畫面排除，避免無法定位的資料混進路線規劃。
ALTER TABLE "Customer" ADD COLUMN "unconfirmed" BOOLEAN NOT NULL DEFAULT false;

-- 記帳系統用 Google 登入，只拿得到 email；靠這個欄位對到同一位員工。
ALTER TABLE "Staff" ADD COLUMN "email" TEXT;

-- 唯一索引允許多筆 NULL（Postgres 的行為），所以沒設 email 的人不會互相衝突。
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");
