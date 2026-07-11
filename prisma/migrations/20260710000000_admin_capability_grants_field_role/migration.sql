-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'FIELD';

-- CreateTable
CREATE TABLE "AdminCapabilityGrant" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "AdminCapabilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminCapabilityGrant_adminUserId_revokedAt_idx" ON "AdminCapabilityGrant"("adminUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "AdminCapabilityGrant_capability_idx" ON "AdminCapabilityGrant"("capability");

-- AddForeignKey
ALTER TABLE "AdminCapabilityGrant" ADD CONSTRAINT "AdminCapabilityGrant_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
