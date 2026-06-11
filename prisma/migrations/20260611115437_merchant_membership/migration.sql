-- CreateEnum
CREATE TYPE "MerchantRole" AS ENUM ('OWNER', 'BRANCH_MANAGER', 'STAFF');

-- CreateTable
CREATE TABLE "MerchantMembership" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantAdminId" TEXT NOT NULL,
    "role" "MerchantRole" NOT NULL,
    "allBranches" BOOLEAN NOT NULL DEFAULT true,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantMembershipBranch" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantMembershipBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantMembership_merchantId_idx" ON "MerchantMembership"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantMembership_merchantAdminId_idx" ON "MerchantMembership"("merchantAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantMembership_merchantId_merchantAdminId_key" ON "MerchantMembership"("merchantId", "merchantAdminId");

-- CreateIndex
CREATE INDEX "MerchantMembershipBranch_branchId_idx" ON "MerchantMembershipBranch"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantMembershipBranch_membershipId_branchId_key" ON "MerchantMembershipBranch"("membershipId", "branchId");

-- AddForeignKey
ALTER TABLE "MerchantMembership" ADD CONSTRAINT "MerchantMembership_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMembership" ADD CONSTRAINT "MerchantMembership_merchantAdminId_fkey" FOREIGN KEY ("merchantAdminId") REFERENCES "MerchantAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMembershipBranch" ADD CONSTRAINT "MerchantMembershipBranch_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "MerchantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantMembershipBranch" ADD CONSTRAINT "MerchantMembershipBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (Phase 2 Slice 1 M1 — D-1 expand + backfill, additive):
-- one ACTIVE OWNER membership per existing MerchantAdmin. allBranches=true means
-- the OWNER spans every branch, so no MerchantMembershipBranch rows are created.
-- gen_random_uuid() is built-in on PostgreSQL 13+ (Neon is PG16). The
-- ON CONFLICT guard makes this re-runnable and a no-op for any admin that
-- already has a membership. MerchantAdmin.merchantId is KEPT (M1 is additive);
-- it is dropped later in M6 after the auth/branch-user reads are rerouted.
INSERT INTO "MerchantMembership" ("id", "merchantId", "merchantAdminId", "role", "allBranches", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "merchantId", "id", 'OWNER'::"MerchantRole", true, 'ACTIVE'::"UserStatus", now(), now()
FROM "MerchantAdmin"
ON CONFLICT ("merchantId", "merchantAdminId") DO NOTHING;
