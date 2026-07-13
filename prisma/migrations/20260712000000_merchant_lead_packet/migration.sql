-- MerchantLead recruitment pipeline packet (owner-gated, create-only).
-- UNAPPLIED: ships to a shared DB only in the owner's bundled migration window,
-- alongside AdminCapabilityGrant (already on main, unapplied), MerchantNote, and
-- MerchantAgreementRecord. Do not `migrate deploy` this ahead of that window.

-- CreateEnum
CREATE TYPE "MerchantSource" AS ENUM ('REP_VISIT', 'INBOUND_ENQUIRY', 'PHONE', 'SOCIAL', 'EMAIL_CAMPAIGN', 'CUSTOMER_REQUEST');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('LEAD', 'CONTACTED', 'VISIT_BOOKED', 'CONVERTED', 'LOST');

-- CreateTable
CREATE TABLE "MerchantLead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "categoryGuess" TEXT,
    "locationHint" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "source" "MerchantSource",
    "stage" "LeadStage" NOT NULL DEFAULT 'LEAD',
    "nextAction" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignedRepId" TEXT,
    "lostReason" TEXT,
    "convertedMerchantId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantLead_stage_idx" ON "MerchantLead"("stage");

-- CreateIndex
CREATE INDEX "MerchantLead_assignedRepId_idx" ON "MerchantLead"("assignedRepId");

-- CreateIndex
CREATE INDEX "MerchantLead_dueDate_idx" ON "MerchantLead"("dueDate");

-- CreateIndex
CREATE INDEX "MerchantLead_anonymisedAt_lastActivityAt_idx" ON "MerchantLead"("anonymisedAt", "lastActivityAt");
