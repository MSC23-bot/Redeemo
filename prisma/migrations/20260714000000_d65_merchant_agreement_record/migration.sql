-- D65 in-person signing ceremony: the immutable agreement evidence ledger (create-only).
-- UNAPPLIED: ships to a shared DB only in the owner's bundled migration window,
-- alongside AdminCapabilityGrant (main, unapplied), MerchantLead (main, unapplied),
-- and MerchantNote (main, unapplied). Do not `migrate deploy` this ahead of that
-- owner-gated window. Purely additive: MerchantAgreementRecord references Merchant
-- (a leaf table beside MerchantContract), so no existing table is altered.
-- actorAdminId is a plain admin id column (NO FK, matching the MerchantLead /
-- AdminApproval / MerchantNote bare-id precedent). witnessName / witnessEmail hold the
-- authenticated rep identity (server-side AdminUser lookup, not client text; NULL on
-- self-serve). Immutability (no UPDATE/DELETE)
-- is an APPLICATION-LEVEL contract enforced in the service layer + a guard test;
-- this migration adds no DB-level append-only trigger (spec §4.1 leaves that as an
-- open solicitor question).

-- CreateEnum
CREATE TYPE "AgreementSignMethod" AS ENUM ('IN_PERSON_ASSISTED', 'SELF_SERVE_CLICK');

-- CreateTable
CREATE TABLE "MerchantAgreementRecord" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "agreementVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRoleConfirmation" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "witnessName" TEXT,
    "witnessEmail" TEXT,
    "method" "AgreementSignMethod" NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "pdfKey" TEXT NOT NULL,
    "drawnSignatureKey" TEXT,

    CONSTRAINT "MerchantAgreementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantAgreementRecord_merchantId_idx" ON "MerchantAgreementRecord"("merchantId");

-- AddForeignKey
ALTER TABLE "MerchantAgreementRecord" ADD CONSTRAINT "MerchantAgreementRecord_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
