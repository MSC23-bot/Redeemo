# Google Places — Setup Checklist (Phase 1 merchant-pin)

Owner-run setup. Done once per environment.

## What this key is for

Used by `prisma/suggest-branch-pin.ts` to suggest a merchant branch's exact
storefront pin via Google Places Text Search. The CLI requires explicit owner
confirmation before flipping the branch's `locationConfidence` to
`MANUALLY_CONFIRMED`. See:

- Spec: `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md`
- Plan: `docs/superpowers/plans/2026-05-14-merchant-exact-pin-confirmation.md`

## What this key is NOT for

- NOT a customer-facing API call.
- NOT used during postcode preview, PC2 onboarding, customer discovery, search,
  map, or merchant profile.
- NOT cached or pre-fetched in bulk.
- NOT used to import opening hours / photos / ratings / phone / website.

## Setup steps

1. Create / reuse a Google Cloud project.
2. Enable the **Places API (New)** (NOT the legacy Places API).
3. Generate an API key. Restrict to "Places API (New)" only.
4. Apply server / IP restriction when practical.
5. Set a **daily quota cap** in Google Cloud Console — `100 requests/day` is
   plenty for trial volume.
6. Set a **billing alert** at `$5/month`.
7. Save to `.env` as `GOOGLE_MAPS_API_KEY=...`. NEVER commit.
8. Verify with a single suggest call:

   ```
   npx tsx prisma/suggest-branch-pin.ts tax-branch-karaara-001
   ```

   You should see Google candidates printed; no DB write occurs.

## Expected cost (Phase 1) — assumed at spec time; verify current pricing before live use

Pricing here is the spec's working assumption — confirm against
<https://mapsplatform.google.com/pricing/> before invoking live calls.

| Volume | Calls | Cost |
| --- | --- | --- |
| Huddersfield trial (~30 branches × 1 suggest + 1 confirm) | 60 | $0 (within $200/month free credit) |
| Worst case re-suggest all monthly | ~720/year | $0 |
| Bug-loop of 1000/day | 1000 | ~$30, capped by daily quota |

## When to rotate this key

- If the key leaks (committed accidentally, posted in a screenshot, etc.).
- If a new admin / dev needs access (give them a new key, not the existing one).
- Annually as good hygiene.
