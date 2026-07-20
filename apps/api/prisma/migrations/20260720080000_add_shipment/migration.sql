-- 貨運追蹤：新竹／大榮託運明細
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "shipDate" TIMESTAMP(3) NOT NULL,
    "seq" INTEGER,
    "trackingNo" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "stationCode" TEXT,
    "recipient" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "cbm" DOUBLE PRECISION,
    "voucher" TEXT,
    "cod" DOUBLE PRECISION,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "orderNo" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shipment_carrier_trackingNo_key" ON "Shipment"("carrier", "trackingNo");
CREATE INDEX "Shipment_carrier_region_idx" ON "Shipment"("carrier", "region");
