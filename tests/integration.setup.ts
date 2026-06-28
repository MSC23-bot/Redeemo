// PR-G1a1: the integration-project setupFile. Runs BEFORE any `*.integration.test.ts`
// file is evaluated, so a non-loopback (e.g. Neon) database target throws here - before
// any Prisma client or `prisma migrate deploy` connects. This is the ONLY place the pure
// `assertIntegrationDbLoopback` helper is invoked against the live environment.
//
// Wired ONLY into the `integration` vitest project (see vitest.config.ts); the `unit`
// project never loads this file, so mock/no-DB suites are unaffected.
import { assertIntegrationDbLoopback } from './_shared/loopbackGuard'

assertIntegrationDbLoopback(process.env)
