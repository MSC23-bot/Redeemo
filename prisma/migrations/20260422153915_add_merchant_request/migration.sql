-- CreateTable
CREATE TABLE "MerchantRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MerchantRequest" ADD CONSTRAINT "MerchantRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "MerchantRequest_userId_idx" ON "MerchantRequest"("userId");
