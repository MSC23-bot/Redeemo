---
paths:
  - "src/**"
  - "prisma/**"
  - "tests/**"
---

# Backend API rules

- Prisma 7: datasource URL lives in `prisma.config.ts`, NOT `schema.prisma`. Client is
  generated at `generated/prisma/client`; import from there. Driver adapter
  `@prisma/adapter-pg` + `pg` is required.
- Prisma `Decimal` serializes to a JSON STRING. Coerce to `Number` before returning it in
  customer/merchant payloads; clients declare `number` and `.toFixed` crashes otherwise.
- Monthly cycle logic: `getCurrentCycleWindow()` in `src/api/subscription/cycle.ts` is the
  single source of truth. Never re-derive cycle windows; never make correctness depend on
  Stripe webhooks. `cycleAnchorDate` is immutable.
- Redemption: the guard order in `src/api/redemption/service.ts` (subscription → voucher →
  merchant → branch coherence → one-per-cycle → PIN → rate limit) is locked; the atomic
  claim uses a transaction with cross-transaction P2002 retry. Do not reorder or weaken.
- `VoucherRedemption` has NO `merchantId` column; join via `branch.merchantId`.
- Analytics/insights cleanliness: always exclude `isTestData` rows (redemption + branch +
  merchant), QA emails, and `User.status = 'DELETED'`.
- Notifications: `notify()` (and `adminNotify` for admin bell) are the SOLE writers to the
  Notification table. Admin reads are isolated by `recipientType` + `recipientId`.
- Branch PINs are AES-256-GCM encrypted (`Branch.redemptionPin`). Never select or return
  `redemptionPin` in any list/read payload; reveal only via the guarded PIN routes.
- Storage (R2) and email (Resend) are feature-flagged and DARK by default
  (`STORAGE_ENABLED` / `EMAIL_ENABLED`). Never construct clients or send when off.
- Tests: `npm run test:unit` is the CI lane. Most integration suites under `tests/` mutate
  the shared Neon database unless `DATABASE_URL` is overridden to a disposable DB; do not
  run `npx vitest run` (full) casually. The integration project is NOT run in CI.
- Migrations are applied to the local/dev DB only by hand; staging/production apply via
  `prisma migrate deploy` through the deploy runbook, never ad hoc.
