-- Customer invite + referral packet (2026-07-14). Create-only, additive.
-- UNAPPLIED until the owner-scheduled window; MUST apply AFTER
-- 20260712000000_merchant_lead_packet (invite service writes MerchantLead).
-- Built offline via prisma migrate diff (no database contact).
-- CreateEnum
CREATE TYPE "MerchantInviteStatus" AS ENUM ('PENDING_CONFIRM', 'ACTIVE', 'HELD_REVIEW');

-- CreateEnum
CREATE TYPE "InviteRewardGrantStatus" AS ENUM ('PENDING', 'ISSUED', 'CONSUMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BusinessSuppressionReason" AS ENUM ('OPT_OUT', 'IGNORED', 'MANUAL');

-- CreateTable
CREATE TABLE "MerchantInvite" (
    "id" TEXT NOT NULL,
    "inviterUserId" TEXT,
    "inviterEmailNorm" TEXT NOT NULL,
    "placeKey" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "businessNameRaw" TEXT NOT NULL,
    "localityRaw" TEXT,
    "note" TEXT,
    "consentShareName" BOOLEAN NOT NULL DEFAULT false,
    "status" "MerchantInviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "rewardEligible" BOOLEAN NOT NULL DEFAULT false,
    "countableAt" TIMESTAMP(3),
    "leadId" TEXT,
    "ipHash" TEXT,
    "anonymisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteRewardGrant" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "entitlementMonths" INTEGER NOT NULL DEFAULT 1,
    "status" "InviteRewardGrantStatus" NOT NULL DEFAULT 'PENDING',
    "voidReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteRewardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSuppression" (
    "id" TEXT NOT NULL,
    "placeKey" TEXT NOT NULL,
    "reason" "BusinessSuppressionReason" NOT NULL,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantInvite_placeKey_idx" ON "MerchantInvite"("placeKey");

-- CreateIndex
CREATE INDEX "MerchantInvite_leadId_idx" ON "MerchantInvite"("leadId");

-- CreateIndex
CREATE INDEX "MerchantInvite_status_idx" ON "MerchantInvite"("status");

-- CreateIndex
CREATE INDEX "MerchantInvite_inviterUserId_idx" ON "MerchantInvite"("inviterUserId");

-- CreateIndex
CREATE INDEX "MerchantInvite_anonymisedAt_createdAt_idx" ON "MerchantInvite"("anonymisedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantInvite_inviterEmailNorm_placeKey_key" ON "MerchantInvite"("inviterEmailNorm", "placeKey");

-- CreateIndex
CREATE UNIQUE INDEX "InviteRewardGrant_inviteId_key" ON "InviteRewardGrant"("inviteId");

-- CreateIndex
CREATE INDEX "InviteRewardGrant_userId_idx" ON "InviteRewardGrant"("userId");

-- CreateIndex
CREATE INDEX "InviteRewardGrant_merchantId_idx" ON "InviteRewardGrant"("merchantId");

-- CreateIndex
CREATE INDEX "InviteRewardGrant_status_idx" ON "InviteRewardGrant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSuppression_placeKey_key" ON "BusinessSuppression"("placeKey");

