-- Make Stripe-specific fields nullable so the Subscription model can support
-- non-Stripe payment sources (admin-grant, Apple IAP, Google Play).
-- Existing rows are unaffected — they already have values.

ALTER TABLE "Subscription" ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "stripeCustomerId" DROP NOT NULL;
