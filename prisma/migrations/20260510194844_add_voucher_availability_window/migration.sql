-- CreateTable
CREATE TABLE "VoucherAvailabilityWindow" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,

    CONSTRAINT "VoucherAvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoucherAvailabilityWindow_voucherId_idx" ON "VoucherAvailabilityWindow"("voucherId");

-- AddForeignKey
ALTER TABLE "VoucherAvailabilityWindow" ADD CONSTRAINT "VoucherAvailabilityWindow_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
