-- MerchantNote packet (internal per-merchant admin notes; owner-gated, create-only).
-- UNAPPLIED: ships to a shared DB only in the owner's bundled migration window,
-- alongside AdminCapabilityGrant (main, unapplied), MerchantLead (main, unapplied),
-- and MerchantAgreementRecord/D65 (unbuilt). Do not `migrate deploy` this ahead of
-- that window. Purely additive: MerchantNote references Merchant and
-- MerchantNoteEvent references MerchantNote (both leaf tables), so no existing
-- table is altered. authorAdminId / retractedById / actorAdminId are plain admin
-- id columns (no FK, matching the MerchantLead / AdminApproval bare-id precedent).

-- CreateEnum
CREATE TYPE "MerchantNoteStatus" AS ENUM ('ACTIVE', 'RETRACTED');

-- CreateEnum
CREATE TYPE "MerchantNoteAction" AS ENUM ('ADDED', 'EDITED', 'RETRACTED');

-- CreateTable
CREATE TABLE "MerchantNote" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "authorAdminId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MerchantNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "editedAt" TIMESTAMP(3),
    "retractedById" TEXT,
    "retractedAt" TIMESTAMP(3),
    "retractedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantNoteEvent" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "action" "MerchantNoteAction" NOT NULL,
    "actorAdminId" TEXT NOT NULL,
    "priorBody" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantNoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantNote_merchantId_createdAt_idx" ON "MerchantNote"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "MerchantNoteEvent_noteId_createdAt_idx" ON "MerchantNoteEvent"("noteId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchantNote" ADD CONSTRAINT "MerchantNote_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantNoteEvent" ADD CONSTRAINT "MerchantNoteEvent_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MerchantNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
