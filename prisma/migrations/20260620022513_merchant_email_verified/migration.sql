-- AlterTable
ALTER TABLE "MerchantAdmin" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- M1 Slice R backfill (owner-approved): pre-verify every EXISTING owner that has a
-- passwordHash (claimed owners + the dev seed) so the new login emailVerified gate
-- cannot lock them out. Unclaimed shell drafts (passwordHash IS NULL) stay false but
-- cannot log in anyway. Future self-registered owners are created emailVerified=false
-- by registerMerchant and flip true only on email-verify.
UPDATE "MerchantAdmin" SET "emailVerified" = true WHERE "passwordHash" IS NOT NULL;
