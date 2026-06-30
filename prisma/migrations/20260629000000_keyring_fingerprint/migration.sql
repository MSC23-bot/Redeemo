-- Encryption key-rotation R1 (spec §5; Amendment R3-#1).
-- Additive-only: a new KeyringFingerprint table that each service (web + worker)
-- upserts its canonical keyring fingerprint into at boot. R1 both publishes AND
-- gate-checks these rows, so the table must exist before the R1 image deploys
-- (apply via `prisma migrate deploy` on the Neon DIRECT endpoint first, else the
-- boot fingerprint publish throws relation-does-not-exist). No Branch change.

-- CreateTable
CREATE TABLE "KeyringFingerprint" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "codeCapability" TEXT NOT NULL,
    "bootedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyringFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeyringFingerprint_service_key" ON "KeyringFingerprint"("service");
