---
paths:
  - "apps/customer-web/**"
---

# Customer website (Next.js) rules

- Dev port 3001. Requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local` for subscribe.
- The website NEVER supports redemption (business rule 12, fraud prevention). Voucher pages
  say "Redeem in the app"; do not add redemption affordances.
- Account pages are client components: `getAccessToken()` is localStorage-only; 401s
  redirect to `/login?next=<page>`; a flag cookie feeds middleware.
- Discovery still consumes the LEGACY `merchants` field, not `branches`. The branch-first
  migration (§CU.1) is a gated Tier-3 workstream that converges with Plan 4 M5 and the
  Discovery Phase 3b backend cleanup: do not partially migrate this app to `branches`.
- Web-vs-app asymmetry is locked and intentional (do not collapse): DOB/gender/postcode
  optional on web, mandatory in app; phone collected at web register but verified only in
  app; email verification hard-blocks in app but is a soft banner on web;
  `onboardingCompletedAt` + `subscriptionPromptSeenAt` are app-driven only.
- Sequencing (owner, 2026-06-09): customer-web polish is gated except blockers, security,
  build, domain/SEO, or portal-unblocking work; the pre-launch website redesign is deferred
  until Merchant Portal + Admin exist. Check `docs/PROJECT-STATE.md` before starting
  discretionary work here.
- Fonts: Mustica Pro SemiBold (display) + Lato (body), self-hosted.
