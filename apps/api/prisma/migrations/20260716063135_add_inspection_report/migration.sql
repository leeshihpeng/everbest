-- CreateTable
CREATE TABLE "InspectionReport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3),
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);
