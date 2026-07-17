-- 輸入許可證：依產品項目分類，不分年份
CREATE TABLE "ImportPermit" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileDate" TIMESTAMP(3) NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportPermit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportPermit_category_idx" ON "ImportPermit"("category");
