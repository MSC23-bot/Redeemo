-- Phase 2 Slice 1 M6b (D-1): drop the transitional MerchantAdmin.merchantId link.
--
-- MerchantMembership is now the sole source of truth for the admin -> merchant
-- relationship (M1 backfilled an ACTIVE OWNER membership for every MerchantAdmin,
-- and every write path now creates one). The merchant-auth flow (login / OTP /
-- refresh / reactivate) and branch-user management were rerouted off this column
-- in M6b step 1 before this drop.
--
-- This is the one NON-ADDITIVE migration in the slice. It is safe because no
-- production merchants exist yet and M1's backfill ran first.
--
-- DOWN-PATH (manual — Prisma migrations are forward-only):
--   ALTER TABLE "MerchantAdmin" ADD COLUMN "merchantId" TEXT;
--   UPDATE "MerchantAdmin" ma SET "merchantId" = (
--     SELECT mm."merchantId" FROM "MerchantMembership" mm
--     WHERE mm."merchantAdminId" = ma."id"
--       AND mm."role" = 'OWNER' AND mm."status" = 'ACTIVE'
--     LIMIT 1);
--   ALTER TABLE "MerchantAdmin" ALTER COLUMN "merchantId" SET NOT NULL;
--   CREATE UNIQUE INDEX "MerchantAdmin_merchantId_key" ON "MerchantAdmin"("merchantId");
--   ALTER TABLE "MerchantAdmin" ADD CONSTRAINT "MerchantAdmin_merchantId_fkey"
--     FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
--     ON DELETE RESTRICT ON UPDATE CASCADE;

-- Pre-flight guard: refuse the drop if any MerchantAdmin lacks an ACTIVE OWNER
-- membership, so no admin is left with no link to a merchant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MerchantAdmin" ma
    WHERE NOT EXISTS (
      SELECT 1 FROM "MerchantMembership" mm
      WHERE mm."merchantAdminId" = ma."id"
        AND mm."role" = 'OWNER'
        AND mm."status" = 'ACTIVE'
    )
  ) THEN
    RAISE EXCEPTION 'M6b D-1 drop blocked: a MerchantAdmin has no ACTIVE OWNER MerchantMembership';
  END IF;
END $$;

-- Drop the FK constraint, the unique index, then the column.
ALTER TABLE "MerchantAdmin" DROP CONSTRAINT "MerchantAdmin_merchantId_fkey";
DROP INDEX "MerchantAdmin_merchantId_key";
ALTER TABLE "MerchantAdmin" DROP COLUMN "merchantId";
