-- D65 personalised-agreement: reviewed-body + PDF integrity binding (create-only).
-- UNAPPLIED: purely additive columns on MerchantAgreementRecord (itself created by the
-- unapplied 20260714000000_d65_merchant_agreement_record migration and still EMPTY: no
-- rows exist, so the three NOT NULL ADD COLUMNs are safe with no default and no backfill).
-- This is a SEPARATE additive migration; the merged D65 migration is never edited
-- (append-never-mutate). It ships to a shared DB only in the owner's bundled migration
-- window, alongside AdminCapabilityGrant / MerchantLead / MerchantNote / the base D65
-- table (all main, unapplied). Do NOT `migrate deploy` this ahead of that owner-gated
-- window.
--
-- Columns (decision doc 2026-07-15-d65-legal-object §5/§6/§17):
--   reviewedContentHash : sha256 of the personalised reviewed body (server-authoritative).
--   reviewedBody        : the EXACT immutable UTF-8 pre-image of reviewedContentHash (the
--                         legally accepted object; reconstructs it without mutable code).
--   pdfHash             : sha256 of the exact stored PDF bytes (artifact-integrity link).
-- All three are written by BOTH v2+ lanes (assisted ceremony + self-serve); the legacy v1
-- path stays OUTSIDE this table (MerchantContract only). Immutability (no UPDATE/DELETE) is
-- an application-level contract enforced in the service layer + a guard test.

-- AlterTable
ALTER TABLE "MerchantAgreementRecord" ADD COLUMN "reviewedContentHash" TEXT NOT NULL;
ALTER TABLE "MerchantAgreementRecord" ADD COLUMN "reviewedBody" TEXT NOT NULL;
ALTER TABLE "MerchantAgreementRecord" ADD COLUMN "pdfHash" TEXT NOT NULL;
