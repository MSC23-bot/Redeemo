-- AlterTable: make Stripe fields nullable
ALTER TABLE "Subscription" ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL,
ALTER COLUMN "stripeCustomerId" DROP NOT NULL;

-- Add cycleAnchorDate as nullable first so existing rows don't fail
ALTER TABLE "Subscription" ADD COLUMN "cycleAnchorDate" TIMESTAMP(3);

-- Backfill from currentPeriodStart (best available anchor for existing subscriptions)
UPDATE "Subscription" SET "cycleAnchorDate" = "currentPeriodStart";

-- Now enforce NOT NULL
ALTER TABLE "Subscription" ALTER COLUMN "cycleAnchorDate" SET NOT NULL;
