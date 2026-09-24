-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "WorkingHour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BookingVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHour_dayOfWeek_key" ON "WorkingHour"("dayOfWeek");

-- CreateIndex
CREATE INDEX "BookingVerification_phone_createdAt_idx" ON "BookingVerification"("phone", "createdAt");
