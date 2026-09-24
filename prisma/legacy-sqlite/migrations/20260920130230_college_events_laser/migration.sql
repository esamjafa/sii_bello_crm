-- CreateTable
CREATE TABLE "CollegeCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'COSMETIC',
    "fee" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "followUpAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StudentEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "fee" DECIMAL NOT NULL,
    "enrolledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "StudentEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "CollegeCourse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    CONSTRAINT "StudentPayment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "contactedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'PHONE',
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "nextFollowUpAt" DATETIME,
    CONSTRAINT "StudentContact_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "startsAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EventPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "EventPackage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT,
    "packageId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'LOCAL',
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "agreedAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "followUpAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventLead_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EventLead_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "EventPackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "contactedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'PHONE',
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "nextFollowUpAt" DATETIME,
    CONSTRAINT "EventContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "EventLead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaserPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "consentNotes" TEXT,
    "followUpAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaserPlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "staffId" TEXT,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "LaserSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LaserPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LaserSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaserDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "content" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaserDocument_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LaserPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "followUpAt" DATETIME,
    "lastVisitAt" DATETIME,
    "relationshipStatus" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Customer" ("createdAt", "email", "id", "name", "notes", "phone") SELECT "createdAt", "email", "id", "name", "notes", "phone" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Student_phone_key" ON "Student"("phone");

-- CreateIndex
CREATE INDEX "StudentEnrollment_studentId_idx" ON "StudentEnrollment"("studentId");

-- CreateIndex
CREATE INDEX "StudentPayment_enrollmentId_idx" ON "StudentPayment"("enrollmentId");

-- CreateIndex
CREATE INDEX "StudentContact_studentId_idx" ON "StudentContact"("studentId");

-- CreateIndex
CREATE INDEX "EventLead_region_stage_idx" ON "EventLead"("region", "stage");

-- CreateIndex
CREATE INDEX "EventContact_leadId_idx" ON "EventContact"("leadId");

-- CreateIndex
CREATE INDEX "LaserPlan_customerId_idx" ON "LaserPlan"("customerId");

-- CreateIndex
CREATE INDEX "LaserSession_planId_idx" ON "LaserSession"("planId");

-- CreateIndex
CREATE INDEX "LaserDocument_planId_idx" ON "LaserDocument"("planId");
