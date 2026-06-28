// PR-G1a1: the integration-project setupFile. Runs BEFORE any `*.integration.test.ts`
// file is evaluated, so a non-loopback (e.g. Neon) database target throws here, before
// any integration test file or its Prisma client connects. This runs in the vitest setup
// phase, which is AFTER `prisma migrate deploy`; the migration step is protected
// SEPARATELY by the CI/local pre-migrate loopback assertion, not by this setupFile. This
// is the ONLY place the pure `assertIntegrationDbLoopback` helper is invoked against the
// live environment.
//
// Wired ONLY into the `integration` vitest project (see vitest.config.ts); the `unit`
// project never loads this file, so mock/no-DB suites are unaffected.
import { assertIntegrationDbLoopback } from './_shared/loopbackGuard'

assertIntegrationDbLoopback(process.env)
