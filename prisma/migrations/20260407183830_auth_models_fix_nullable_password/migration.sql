-- AlterTable
ALTER TABLE "BranchUser" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MerchantAdmin" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "MerchantAdmin_email_idx" ON "MerchantAdmin"("email");
