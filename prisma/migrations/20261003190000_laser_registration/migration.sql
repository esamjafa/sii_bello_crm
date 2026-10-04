ALTER TABLE "Customer" ADD COLUMN "gender" TEXT;
ALTER TABLE "Customer" ADD COLUMN "catalogueInterests" JSONB;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_gender_check" CHECK ("gender" IS NULL OR "gender" IN ('FEMALE', 'MALE'));
ALTER TABLE "LaserPlan" ADD COLUMN "registrationKey" TEXT;
ALTER TABLE "LaserPlan" ADD COLUMN "catalogueSelection" JSONB;
CREATE UNIQUE INDEX "LaserPlan_registrationKey_key" ON "LaserPlan"("registrationKey");
