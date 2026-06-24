-- CreateEnum
CREATE TYPE "PendingHoursStatus" AS ENUM ('PENDING', 'PROMOTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BranchOpeningHoursPending" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "proposedHours" JSONB NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" "PendingHoursStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "BranchOpeningHoursPending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchOpeningHoursPending_status_effectiveAt_idx" ON "BranchOpeningHoursPending"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "BranchOpeningHoursPending_branchId_status_idx" ON "BranchOpeningHoursPending"("branchId", "status");

-- PartialUniqueIndex (PR-4 §3): at-most-one PENDING row per branch. Prisma cannot
-- express a partial unique in the schema, so it is added here as raw SQL. This is the
-- DB enforcement of the supersede invariant (cancel-then-create in one tx); a racing
-- second stage that tries to create a second PENDING row fails this unique and retries.
CREATE UNIQUE INDEX "BranchOpeningHoursPending_branchId_pending_key" ON "BranchOpeningHoursPending"("branchId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "BranchOpeningHoursPending" ADD CONSTRAINT "BranchOpeningHoursPending_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
