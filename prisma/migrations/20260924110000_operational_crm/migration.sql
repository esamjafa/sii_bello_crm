-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE 'RECEPTIONIST';
ALTER TYPE "Role" ADD VALUE 'SALES';
ALTER TYPE "Role" ADD VALUE 'COLLEGE';
ALTER TYPE "Role" ADD VALUE 'TRAINER';
ALTER TYPE "Role" ADD VALUE 'EVENT_MANAGER';
ALTER TYPE "Role" ADD VALUE 'INVENTORY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "careInstructions" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'IL',
ADD COLUMN     "departments" TEXT[] DEFAULT ARRAY['SALON']::TEXT[],
ADD COLUMN     "interestedIn" TEXT,
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "photoConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "department" TEXT NOT NULL DEFAULT 'SALON';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "commissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "department" TEXT NOT NULL DEFAULT 'SALON',
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "sessionNotes" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ILS',
ADD COLUMN     "department" TEXT NOT NULL DEFAULT 'SALON',
ADD COLUMN     "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "originalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CollegeCourse" ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "hours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "includedKit" TEXT,
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'UPCOMING',
ADD COLUMN     "trainerId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "interest" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "interestedCourse" TEXT,
ADD COLUMN     "notRegisteredReason" TEXT,
ADD COLUMN     "objection" TEXT,
ADD COLUMN     "offeredDiscount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "quotedPrice" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StudentEnrollment" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "certificateStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "kitReceivedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'REGISTERED',
ADD COLUMN     "trainerNotes" TEXT;

-- AlterTable
ALTER TABLE "StudentPayment" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'AED',
ADD COLUMN     "depositRequired" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "managerId" TEXT;

-- AlterTable
ALTER TABLE "EventLead" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "attended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificateStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "companion" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'AED',
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "flight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flightDetails" TEXT,
ADD COLUMN     "hotel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hotelName" TEXT,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "nextPaymentAt" TIMESTAMP(3),
ADD COLUMN     "originalPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "roomType" TEXT,
ADD COLUMN     "specialNeeds" TEXT,
ADD COLUMN     "transferDetails" TEXT,
ADD COLUMN     "vip" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LaserPlan" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "price" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LaserSession" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "contraindications" TEXT,
ADD COLUMN     "device" TEXT,
ADD COLUMN     "nextSessionAt" TIMESTAMP(3),
ADD COLUMN     "settings" TEXT,
ADD COLUMN     "skinHairNotes" TEXT;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'PHONE',
    "reason" TEXT NOT NULL,
    "summary" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'NEW',
    "nextAction" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDocument" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PAYMENT',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "receivedById" TEXT,
    "notes" TEXT,
    "receiptDocumentId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "category" TEXT NOT NULL,
    "supplier" TEXT,
    "purchasePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "minimum" INTEGER NOT NULL DEFAULT 0,
    "storageLocation" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'SALE',
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batch" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expectedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "grade" INTEGER,
    "notes" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HairSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "staffId" TEXT,
    "service" TEXT NOT NULL,
    "diagnosis" TEXT,
    "materials" TEXT,
    "quantities" TEXT,
    "result" TEXT,
    "homeCare" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewalAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "HairSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLeave" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "EmployeeLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'SALON',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_ownerId_dueAt_completedAt_idx" ON "Task"("ownerId", "dueAt", "completedAt");

-- CreateIndex
CREATE INDEX "Task_customerId_idx" ON "Task"("customerId");

-- CreateIndex
CREATE INDEX "CustomerDocument_customerId_idx" ON "CustomerDocument"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_paidAt_idx" ON "Payment"("invoiceId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_productId_batch_idx" ON "StockMovement"("productId", "batch");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_enrollmentId_key" ON "Attendance"("sessionId", "enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_taskId_dueAt_key" ON "Reminder"("taskId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_staffId_key" ON "User"("staffId");

-- CreateIndex
CREATE INDEX "Customer_ownerId_archivedAt_idx" ON "Customer"("ownerId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_invoiceId_key" ON "Appointment"("invoiceId");

-- CreateIndex
CREATE INDEX "Student_customerId_idx" ON "Student"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_invoiceId_key" ON "StudentEnrollment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "EventLead_invoiceId_key" ON "EventLead"("invoiceId");

-- CreateIndex
CREATE INDEX "EventLead_customerId_idx" ON "EventLead"("customerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollegeCourse" ADD CONSTRAINT "CollegeCourse_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLead" ADD CONSTRAINT "EventLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLead" ADD CONSTRAINT "EventLead_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CollegeCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HairSession" ADD CONSTRAINT "HairSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HairSession" ADD CONSTRAINT "HairSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeave" ADD CONSTRAINT "EmployeeLeave_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Canonical identities and opening ledger, preserving all legacy rows.
CREATE FUNCTION pg_temp.crm_phone(value text) RETURNS text LANGUAGE SQL IMMUTABLE AS $$
 SELECT CASE WHEN p ~ '^0[2-9][0-9]{7,8}$' THEN '972'||substr(p,2) ELSE p END
 FROM (SELECT regexp_replace(regexp_replace(value,'[^0-9]','','g'),'^00','') p) s;
$$;
-- Duplicate canonical customers must be reconciled explicitly, never silently merged.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "Customer" GROUP BY pg_temp.crm_phone(phone) HAVING count(*)>1) THEN
 RAISE EXCEPTION 'Canonical phone collision: reconcile customer duplicates before migration';
 END IF;
END $$;
UPDATE "Customer" SET phone=pg_temp.crm_phone(phone);
INSERT INTO "Customer" (id,name,phone,email,notes,"createdAt",departments,source)
 SELECT 'crm_student_'||s.id,s.name,pg_temp.crm_phone(s.phone),s.email,s.notes,s."createdAt",ARRAY['COLLEGE'],'OTHER'
 FROM "Student" s WHERE NOT EXISTS(SELECT 1 FROM "Customer" c WHERE c.phone=pg_temp.crm_phone(s.phone))
 ON CONFLICT(phone) DO NOTHING;
INSERT INTO "Customer" (id,name,phone,notes,"createdAt",departments,source)
 SELECT DISTINCT ON(pg_temp.crm_phone(l.phone)) 'crm_event_'||l.id,l.name,pg_temp.crm_phone(l.phone),l.notes,l."createdAt",ARRAY['EVENT'],'OTHER'
 FROM "EventLead" l WHERE NOT EXISTS(SELECT 1 FROM "Customer" c WHERE c.phone=pg_temp.crm_phone(l.phone))
 ORDER BY pg_temp.crm_phone(l.phone),l."createdAt" ON CONFLICT(phone) DO NOTHING;
UPDATE "Student" s SET "customerId"=c.id FROM "Customer" c WHERE c.phone=pg_temp.crm_phone(s.phone);
UPDATE "EventLead" l SET "customerId"=c.id FROM "Customer" c WHERE c.phone=pg_temp.crm_phone(l.phone);
UPDATE "Customer" c SET departments=(SELECT array_agg(DISTINCT d) FROM unnest(c.departments||ARRAY['COLLEGE']) d) WHERE EXISTS(SELECT 1 FROM "Student" s WHERE s."customerId"=c.id);
UPDATE "Customer" c SET departments=(SELECT array_agg(DISTINCT d) FROM unnest(c.departments||ARRAY['EVENT']) d) WHERE EXISTS(SELECT 1 FROM "EventLead" l WHERE l."customerId"=c.id);
UPDATE "Invoice" SET "originalAmount"=amount;
INSERT INTO "Payment" (id,"invoiceId",amount,kind,"paidAt",method,notes,"idempotencyKey")
 SELECT 'opening_'||id,id,"paidAmount",'PAYMENT',"createdAt",'OTHER','Migrated opening balance; original payment method/date unavailable','opening_invoice_'||id FROM "Invoice" WHERE "paidAmount">0;
INSERT INTO "Invoice" (id,"customerId",description,amount,"originalAmount","paidAmount",status,"createdAt",department)
 SELECT 'enrollment_'||e.id,s."customerId",c.title,e.fee,e.fee,COALESCE(p.paid,0),
 (CASE WHEN COALESCE(p.paid,0)>=e.fee THEN 'PAID' WHEN COALESCE(p.paid,0)>0 THEN 'PARTIAL' ELSE 'UNPAID' END)::"InvoiceStatus",e."enrolledAt",'COLLEGE'
 FROM "StudentEnrollment" e JOIN "Student" s ON s.id=e."studentId" JOIN "CollegeCourse" c ON c.id=e."courseId"
 LEFT JOIN (SELECT "enrollmentId",sum(amount) paid FROM "StudentPayment" GROUP BY "enrollmentId") p ON p."enrollmentId"=e.id;
UPDATE "StudentEnrollment" SET "invoiceId"='enrollment_'||id;
INSERT INTO "Payment" (id,"invoiceId",amount,kind,"paidAt",method,notes,"idempotencyKey")
 SELECT 'student_'||p.id,e."invoiceId",p.amount,'PAYMENT',p."paidAt",p.method,p.notes,'legacy_student_'||p.id FROM "StudentPayment" p JOIN "StudentEnrollment" e ON e.id=p."enrollmentId";
-- Legacy event balances had no currency column. Preserve the former app's ILS semantics.
UPDATE "Event" SET currency='ILS';
UPDATE "EventLead" SET currency='ILS',"originalPrice"="agreedAmount";
INSERT INTO "Invoice" (id,"customerId",description,amount,"originalAmount","paidAmount",status,"createdAt",department,currency)
 SELECT 'event_'||l.id,l."customerId",COALESCE(e.name,'Legacy event'),l."agreedAmount",l."agreedAmount",l."paidAmount",
 (CASE WHEN l."paidAmount">=l."agreedAmount" THEN 'PAID' WHEN l."paidAmount">0 THEN 'PARTIAL' ELSE 'UNPAID' END)::"InvoiceStatus",l."createdAt",'EVENT','ILS'
 FROM "EventLead" l LEFT JOIN "Event" e ON e.id=l."eventId";
UPDATE "EventLead" SET "invoiceId"='event_'||id;
INSERT INTO "Payment" (id,"invoiceId",amount,kind,"paidAt",method,notes,"idempotencyKey")
 SELECT 'event_opening_'||id,"invoiceId","paidAmount",'PAYMENT',"createdAt",'OTHER','Migrated opening balance; original payment method/date unavailable','legacy_event_'||id FROM "EventLead" WHERE "paidAmount">0;
INSERT INTO "CustomerDocument" (id,"customerId",filename,"mimeType",content,category,"authorId","createdAt")
 SELECT 'legacy_'||d.id,p."customerId",d.filename,d."mimeType",d.content,'DOCUMENT','MIGRATION',d."createdAt" FROM "LaserDocument" d JOIN "LaserPlan" p ON p.id=d."planId";
-- Preserve legacy contact histories in the unified timeline; actor was not recorded historically.
INSERT INTO "CustomerNote" (id,"customerId",body,"authorId","authorName","createdAt","updatedAt")
 SELECT 'student_contact_'||x.id,s."customerId",concat('[',x.channel,'] ',x.outcome,E'\n',x.notes),'MIGRATION','سجل سابق',x."contactedAt",x."contactedAt" FROM "StudentContact" x JOIN "Student" s ON s.id=x."studentId";
INSERT INTO "CustomerNote" (id,"customerId",body,"authorId","authorName","createdAt","updatedAt")
 SELECT 'event_contact_'||x.id,l."customerId",concat('[',x.channel,'] ',x.outcome,E'\n',x.notes),'MIGRATION','سجل سابق',x."contactedAt",x."contactedAt" FROM "EventContact" x JOIN "EventLead" l ON l.id=x."leadId";
UPDATE "Customer" SET "ownerId"=(SELECT id FROM "User" WHERE role IN ('GOD','ADMIN') AND active ORDER BY CASE WHEN role='GOD' THEN 0 ELSE 1 END,"createdAt" LIMIT 1) WHERE "ownerId" IS NULL;
INSERT INTO "Task" (id,"customerId","ownerId",reason,summary,outcome,"nextAction","dueAt","createdById","updatedAt")
 SELECT 'legacy_followup_'||id,id,"ownerId",'متابعة مرحّلة',notes,'SCHEDULED','التواصل مع العميلة',"followUpAt",'MIGRATION',CURRENT_TIMESTAMP FROM "Customer" WHERE "followUpAt" IS NOT NULL AND "ownerId" IS NOT NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive" CHECK(amount>0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_balanced" CHECK(amount>=0 AND "paidAmount">=0 AND "paidAmount"<=amount);
ALTER TABLE "StockMovement" ADD CONSTRAINT "Stock_nonzero" CHECK(quantity<>0);
ALTER TABLE "CollegeCourse" ADD CONSTRAINT "Course_capacity_positive" CHECK(capacity>0);
ALTER TABLE "Task" ADD CONSTRAINT "Task_followup_required" CHECK(outcome NOT IN ('THINKING','PROMISED_PAYMENT','SCHEDULED','FUTURE','FOLLOW_UP') OR "dueAt" IS NOT NULL);

