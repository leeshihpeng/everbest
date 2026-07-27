-- 貨單附註：CSV 的「貨單附註」欄，顯示給送貨人員看
ALTER TABLE "DispatchOrder" ADD COLUMN "orderNote" TEXT;
