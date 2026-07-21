-- 新竹／大榮派遣單的出貨編號與重量
ALTER TABLE "DispatchOrder" ADD COLUMN "orderNo" TEXT;
ALTER TABLE "DispatchOrder" ADD COLUMN "weight" DOUBLE PRECISION;
