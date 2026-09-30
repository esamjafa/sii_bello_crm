ALTER TABLE "CustomerNote" ADD COLUMN "department" TEXT NOT NULL DEFAULT 'SALON';
ALTER TABLE "CustomerDocument" ADD COLUMN "department" TEXT NOT NULL DEFAULT 'SALON';
UPDATE "CustomerNote" n SET "department" = CASE WHEN u.role IN ('COLLEGE','TRAINER') THEN 'COLLEGE' WHEN u.role = 'EVENT_MANAGER' THEN 'EVENT' ELSE 'SALON' END FROM "User" u WHERE n."authorId" = u.id;
UPDATE "CustomerDocument" d SET "department" = CASE WHEN d.category = 'RECEIPT' THEN 'FINANCE' WHEN d.category = 'WORK' OR u.role IN ('COLLEGE','TRAINER') THEN 'COLLEGE' WHEN u.role = 'EVENT_MANAGER' THEN 'EVENT' ELSE 'SALON' END FROM "User" u WHERE d."authorId" = u.id;
