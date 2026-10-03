ALTER TABLE "Service" ADD COLUMN "imageUrl" TEXT,
 ADD COLUMN "onlineBookable" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "resourceKey" TEXT,
 ADD COLUMN "configuration" JSONB;
ALTER TABLE "Appointment" ADD COLUMN "serviceDetails" JSONB,
 ADD COLUMN "priceSnapshot" JSONB,
 ADD COLUMN "resourceKey" TEXT,
 ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Appointment_resourceKey_startsAt_idx" ON "Appointment"("resourceKey", "startsAt");
ALTER TABLE "Product" ADD COLUMN "sku" TEXT, ADD COLUMN "onlineVisible" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
ALTER TABLE "CustomerDocument" ADD COLUMN "appointmentId" TEXT;
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ConsentRecord" (
 "id" TEXT NOT NULL PRIMARY KEY, "customerId" TEXT NOT NULL,
 "purpose" TEXT NOT NULL, "granted" BOOLEAN NOT NULL,
 "actorId" TEXT NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "note" TEXT NOT NULL,
 CONSTRAINT "ConsentRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ConsentRecord_customerId_purpose_recordedAt_idx" ON "ConsentRecord"("customerId", "purpose", "recordedAt");
ALTER TABLE "Customer" ADD COLUMN "preferredServiceId" TEXT, ADD COLUMN "servicePreferences" JSONB;
