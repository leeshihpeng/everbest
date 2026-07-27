-- 送貨人員自行調整送貨順序後的標記；為 true 時照 routeSequence 走，不再自動重新排序
ALTER TABLE "DispatchOrder" ADD COLUMN "routeOrderManual" BOOLEAN NOT NULL DEFAULT false;
