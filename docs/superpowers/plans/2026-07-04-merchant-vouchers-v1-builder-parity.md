# Vouchers completion pass - slice V1 (builder parity, eng-autonomous)

**Base:** `origin/main` @ `8c4258ba`. **Branch:** `feature/merchant-vouchers-v1-builder-parity`. **Source:** full discovery cross-check (Sonnet agent, 2026-07-04) verified against prototype + backend + recorded deferrals.

## Independence reasoning (required record)
V1 is safely independent of PR-G1b (#365, unmerged): it is bounded merchant-web builder-UI work with jest coverage, touching `components/vouchers/builder/**` fields the smoke lane does not journey through (the lane asserts only the builder heading via the quick action). No shared files with #365 except none. When #365 merges, a follow-up spec extends the lane with a builder journey.

## In scope (all eng-autonomous, no schema, no backend change)
1. **Image upload in the Day-2 builder (M).** `imageUrl` is modeled in builderModel + accepted by create/update; backend `POST /api/v1/merchant/uploads/photo` EXISTS (M2 B5; voucher-photo kind gated OWNER || canManageVouchers; fails closed STORAGE_NOT_ENABLED when storage is dark). Frontend: reuse `components/ui/file-upload.tsx` + the existing upload client pattern (check onboarding profile logo/banner usage); graceful degrade when storage disabled (keep field optional, surface "Image upload is not available yet" on STORAGE_NOT_ENABLED - no fake affordance).
2. **Structured terms checklist in the Day-2 builder (M).** `lib/voucher/terms.ts` clause/tier system (CORE/FAIR/CAUTION/RESTRICTIVE) is built + unit-tested but bypassed; the builder ships a free-text textarea and `BuilderScore.tsx` hardcodes `customs:[]`. Wire the interactive checklist + custom-term add into the terms step; compose to the plain-string `terms` column (no backend change); feed selections into scoring.
3. **REUSABLE custom interval input (S).** 4 fixed presets today; add "every N [unit]" custom input; backend floor 1800s already server-validated.
4. **TIME_LIMITED quick-start presets + explicit end-date toggle (S).** Presets for common window sets; a labeled "does this end on a date?" toggle wiring the EXISTING generic `expiryDate` field.
5. **Docs hygiene (S).** Roadmap row 44: fill the Missing/gap column with the 4 recorded-deferred detail actions (request-change/end/run-again/withdraw). Day-2 spec §3.3 line 92: correct the stale "per-row redemption totals deferred" line (shipped code renders the count; only the prototype's big-stat treatment is absent). Spec §4.4: annotate the adminProposed windows/cooldown overstatement as the recorded deferral it became.

## Explicitly EXCLUDED (owner-gated / recorded deferrals - do not touch)
- Flagship "Always live" mislabel fix (owner-gated; memory instruction).
- Read-only flagship detail page (recorded v1 deferral).
- Structured concierge windows/cooldown/admin imageUrl (recorded deferral; backend allow-list).
- Request-change/end/run-again/withdraw lanes (schema-gated Tier-3).
- Per-voucher analytics (Insights Tier-3).

## Verification plan
Jest for every new field/interaction (upload success/degrade, checklist compose+score, custom interval validation floor, end-date toggle); full merchant-web gates; extend the Playwright lane with a builder journey ONLY after #365 merges (avoid cross-PR file coupling). Fresh-context Opus review pre-PR; PR left unmerged.
