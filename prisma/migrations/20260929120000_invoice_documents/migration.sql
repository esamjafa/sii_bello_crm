ALTER TABLE "Invoice" ADD COLUMN "notes" TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
