-- 產品報價單（永遠只保留一份）
CREATE TABLE "QuoteSheet" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "QuoteSheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "validDate" TEXT NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteItem_sheetId_sortOrder_idx" ON "QuoteItem"("sheetId", "sortOrder");

ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "QuoteSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
