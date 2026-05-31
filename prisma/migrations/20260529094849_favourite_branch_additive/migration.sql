-- CreateTable
CREATE TABLE "FavouriteBranch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavouriteBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavouriteBranch_userId_idx" ON "FavouriteBranch"("userId");

-- CreateIndex
CREATE INDEX "FavouriteBranch_branchId_idx" ON "FavouriteBranch"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "FavouriteBranch_userId_branchId_key" ON "FavouriteBranch"("userId", "branchId");

-- AddForeignKey
ALTER TABLE "FavouriteBranch" ADD CONSTRAINT "FavouriteBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavouriteBranch" ADD CONSTRAINT "FavouriteBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
