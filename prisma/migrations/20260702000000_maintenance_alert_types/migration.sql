-- Neon CU-burn PR-C: additive NotificationType values for maintenance-sweep
-- health alerts (ADMIN_MAINTENANCE_DEGRADED / ADMIN_MAINTENANCE_RECOVERED).
-- Additive-only: no table, column, or index change. Applied to disposable
-- loopback CI/integration Postgres via `prisma migrate deploy`; provider
-- (Neon/staging/production) application is a separately owner-gated step.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MAINTENANCE_DEGRADED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MAINTENANCE_RECOVERED';
