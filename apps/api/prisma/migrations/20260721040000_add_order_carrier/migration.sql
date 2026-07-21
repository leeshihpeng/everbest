-- 區分自家配送與貨運行配送。既有派遣單全部屬於自家配送，回填為 SELF。
ALTER TABLE "DispatchOrder" ADD COLUMN "carrier" TEXT NOT NULL DEFAULT 'SELF';

DROP INDEX IF EXISTS "DispatchOrder_deliveryDate_status_idx";
CREATE INDEX "DispatchOrder_carrier_deliveryDate_status_idx" ON "DispatchOrder"("carrier", "deliveryDate", "status");
