-- AlterEnum
ALTER TYPE "MerchantStatus" ADD VALUE 'REGISTERED';

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "stripeCouponId" TEXT;
